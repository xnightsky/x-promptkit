import test from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

import {
	SUPPORTED_PROVIDER_APIS,
	SUPPORTED_MEMORY_MODES,
	PROVIDER_CONFIG_FILENAMES,
	DEFAULT_PROVIDER_CONFIG_ENV,
	parseProviderConfig,
	loadProviderConfig,
	validateProviderConfig,
	selectEnabledProviders,
	buildReplayMessages,
	extractPolicyEcho,
	assembleEphemeralAgent,
	buildReplayQueueFixture,
	discoverProviderConfigPath,
	providerConfigSearchDirs,
} from "../skills-def/recall-eval/lib/replay-engine.mjs"
import { callModel } from "../skills-def/_shared/model-runner.mjs"

// ───────────────────────────────────────────────────────────────────────────
// 离线单元测试:provider 矩阵回放助手
//
// 本套件不触发任何真实网络。覆盖「矩阵发现 → 解析 → 结构校验 → provider 选择
// → 协议分发 → echo 打分」整条链路，每条用例采用 BDD(场景 / 给定 / 当 / 那么)注释。
//
// 两类用例的文件系统策略刻意不同:
// - 发现类用例(discoverProviderConfigPath / providerConfigSearchDirs / loadProviderConfig
//   的路径发现部分)在 os.tmpdir() 沙箱里搭真实目录树，用生产默认的 existsSync
//   端到端验证。不用「字符串集合模拟文件系统」，因为那会隐含平台分隔符假设
//   (POSIX 夹具在 win32 上与 join() 产出的反斜杠路径错配)，且绕过真实文件探测。
// - 解析 / 校验 / 打分类用例保持纯离线，用注入的 fetch / fileReader，不碰磁盘。
// ───────────────────────────────────────────────────────────────────────────

const SAMPLE_CONFIG = `
version: 2
defaults:
  api: echo
  temperature: 0
  maxTokens: 256
memory:
  mode: in-process
  namespace: recall-replay
context_policy:
  id: clean-context-v1
  assert_echo: true
providers:
  echo-local:
    enabled: true
    api: echo
  openai-prod:
    enabled: true
    api: openai-chat
    baseUrl: https://api.openai.com/v1
    apiKey: OPENAI_API_KEY
    models:
      - id: gpt-4o-mini
  disabled-anthropic:
    enabled: false
    api: anthropic-messages
    baseUrl: https://api.anthropic.com/v1
    apiKey: ANTHROPIC_API_KEY
    models:
      - id: claude-3-5-sonnet
`

// 为发现类用例在系统临时目录搭一棵真实目录树。路径全部用 path.join 构造，
// 与生产代码走同一路径库，因此无论平台分隔符是 / 还是 \ 都天然一致。
//
//   <sandbox>/
//   ├── work/.git/        ← cwd=work 的用例在本层收敛仓库根
//   ├── work/repo/.git/   ← cwd=sub 的用例向上命中这里,验证「向上找仓库根」
//   ├── work/repo/sub/
//   ├── skill/scripts/    ← 注入为 skillDir
//   └── home/             ← 注入为 homeDir(隔离真实 home,避免本机provider config 文件干扰)
//
// 两个 .git 标记都始终创建:findRepoRoot 从 cwd 向上走,任一用例若在沙箱内
// 找不到 .git,会一路越出沙箱、可能意外命中宿主机的真实仓库或provider config 文件。
function makeSandbox(t) {
	const root = mkdtempSync(join(tmpdir(), "recall-replay-"))
	t.after(() => rmSync(root, { recursive: true, force: true }))
	const work = join(root, "work")
	const repo = join(work, "repo")
	const sub = join(repo, "sub")
	const skillDir = join(root, "skill", "scripts")
	const homeDir = join(root, "home")
	for (const dir of [sub, join(work, ".git"), join(repo, ".git"), skillDir, homeDir]) {
		mkdirSync(dir, { recursive: true })
	}
	return { root, work, repo, sub, skillDir, homeDir }
}

// 场景:解析矩阵时为每个 provider 套用顶层 defaults
//   给定 一份带 defaults 与三个 provider 的矩阵
//   当   调用 parseProviderConfig
//   那么 每个 provider 都继承 defaults(如 temperature / max_tokens)
test("parseProviderConfig applies defaults to providers", () => {
	const config = parseProviderConfig(SAMPLE_CONFIG)
	assert.equal(config.version, 2)
	assert.equal(config.providers.length, 3)
	const echo = config.providers.find((p) => p.id === "echo-local")
	assert.equal(echo.temperature, 0)
	assert.equal(echo.max_tokens, 256)
})

// 场景:校验一份结构正确的矩阵
//   给定 一份字段齐全、策略 id 正确的矩阵
//   当   调用 validateProviderConfig
//   那么 ok 为 true 且 errors 为空
test("validateProviderConfig accepts a well-formed config", () => {
	const config = parseProviderConfig(SAMPLE_CONFIG)
	const { ok, errors } = validateProviderConfig(config)
	assert.deepEqual(errors, [])
	assert.equal(ok, true)
})

// 场景:真实 provider 缺少 apikey 时校验失败
//   给定 一个 openai-chat provider 既无 apikey 也无旧字段 key/key_env
//   当   调用 validateProviderConfig
//   那么 校验失败，报 missing apiKey
test("validateProviderConfig rejects providers without apiKey", () => {
	const config = parseProviderConfig(`
version: 2
memory:
  mode: in-process
context_policy:
  id: clean-context-v1
providers:
  bad:
    api: openai-chat
    baseUrl: https://api.openai.com/v1
    models:
      - id: gpt-4o-mini
`)
	const { ok, errors } = validateProviderConfig(config)
	assert.equal(ok, false)
	assert.ok(errors.some((e) => e.includes("missing apiKey")))
})

// 场景:按「启用标记 + key 可用性」筛选 provider
//   给定 同一份矩阵
//   当   分别在「无 key」与「有 OPENAI_API_KEY」两种环境下筛选
//   那么 无 key 时只剩 echo-local;有 key 时再加上 openai-prod
test("selectEnabledProviders honours enabled flag and key availability", () => {
	const config = parseProviderConfig(SAMPLE_CONFIG)
	const withoutKeys = selectEnabledProviders(config, { env: {} })
	assert.deepEqual(
		withoutKeys.map((p) => p.id),
		["echo-local"],
	)
	const withKeys = selectEnabledProviders(config, {
		env: { OPENAI_API_KEY: "sk-test" },
	})
	assert.deepEqual(
		withKeys.map((p) => p.id),
		["echo-local", "openai-prod"],
	)
})

// 场景:构造的消息内嵌 memory 与 clean-context 策略
//   给定 内置 fixture 的第一个 case
//   当   调用 buildReplayMessages
//   那么 policy.id 正确，system 含 memory 关键事实，user 为原始问题
test("buildReplayMessages embeds memory and policy", () => {
	const [caseReport] = buildReplayQueueFixture().cases
	const { system, user, policy } = buildReplayMessages(caseReport)
	assert.equal(policy.id, "clean-context-v1")
	assert.match(system, /8443/)
	assert.match(system, /TLS/)
	assert.equal(user, caseReport.question)
})

// 场景:echo provider 回显策略与 memory 以供打分
//   给定 一个 echo provider 组装的临时 agent
//   当   对内置 case 运行 agent.run
//   那么 回答回显策略 id，含必备事实(8443/TLS)且不含禁止词
test("echo provider round-trips the policy and memory for scoring", async () => {
	const config = parseProviderConfig(SAMPLE_CONFIG)
	const [echo] = selectEnabledProviders(config, { env: {} })
	const agent = assembleEphemeralAgent({ config, provider: echo, env: {} })
	const [caseReport] = buildReplayQueueFixture().cases
	const result = await agent.run(caseReport)
	assert.equal(result.policyEcho, "clean-context-v1")
	assert.match(result.answer, /8443/)
	assert.match(result.answer, /TLS/)
	assert.doesNotMatch(result.answer, /forbidden-token/)
})

// 场景:callModel 通过注入的 fetch 分发 openai-chat 协议
//   给定 一个伪造的 fetch 与一个 openai-chat provider
//   当   调用 callModel
//   那么 命中正确 endpoint，返回文本含必备事实且可抽出策略回显
test("callModel dispatches openai-chat through an injected fetch", async () => {
	const calls = []
	const fakeFetch = async (url, init) => {
		calls.push({ url, init })
		return {
			ok: true,
			status: 200,
			json: async () => ({
				choices: [
					{
						message: {
							content: "policy: clean-context-v1\nport 8443 TLS",
						},
					},
				],
			}),
		}
	}
	const provider = {
		id: "openai-prod",
		api: "openai-chat",
		base_url: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		key: "sk-test",
		timeout_ms: 60000,
	}
	const messages = buildReplayMessages(buildReplayQueueFixture().cases[0])
	const prompt = messages.system + "\n\n---\n\n" + messages.user
	const text = await callModel(provider, prompt, { maxRetries: 0, fetchImpl: fakeFetch })
	assert.equal(calls.length, 1)
	assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions")
	assert.match(text, /8443/)
	assert.equal(extractPolicyEcho(text), "clean-context-v1")
})

// 场景:assembleEphemeralAgent 把 apikey(env 变量名)物化为真实 key
//   给定 一个 apikey 写的是环境变量名的 openai-chat provider 与注入的 env / fetch
//   当   通过临时 agent 运行内置 case
//   那么 实际请求的 authorization 头携带 env 解析后的 key,而不是变量名或 undefined
//   (回归钉:此前 replay 链路不解析 apikey,callModel 以 `Bearer undefined` 发请求稳定 401)
test("assembleEphemeralAgent resolves apikey env names before calling the model", async () => {
	const captured = []
	const fakeFetch = async (url, init) => {
		captured.push(init.headers)
		return {
			ok: true,
			status: 200,
			json: async () => ({
				choices: [{ message: { content: "policy: clean-context-v1\nport 8443 TLS" } }],
			}),
		}
	}
	const config = parseProviderConfig(SAMPLE_CONFIG)
	const provider = config.providers.find((p) => p.id === "openai-prod")
	const agent = assembleEphemeralAgent({
		config,
		provider,
		env: { OPENAI_API_KEY: "sk-resolved-from-env" },
		fetchImpl: fakeFetch,
	})
	await agent.run(buildReplayQueueFixture().cases[0])
	assert.equal(captured.length, 1)
	assert.equal(captured[0].authorization, "Bearer sk-resolved-from-env")
})

// 场景:loadProviderConfig 支持注入的文件读取器
//   给定 显式 path 与一个返回样例矩阵的 fileReader
//   当   调用 loadProviderConfig
//   那么 回显该 path，并解析出 3 个 provider(不触碰真实文件系统)
test("loadProviderConfig reads from an injected file reader", () => {
	const { path, config } = loadProviderConfig({
		path: "virtual.yaml",
		fileReader: () => SAMPLE_CONFIG,
	})
	assert.equal(path, "virtual.yaml")
	assert.equal(config.providers.length, 3)
})

// 场景:RECALL_PROVIDER_CONFIG 显式指定时直接采用，跳过目录发现
//   给定 设置了 RECALL_PROVIDER_CONFIG 环境变量(指向一个并不存在的路径)
//   当   调用 discoverProviderConfigPath
//   那么 直接返回该路径，不理会任何候选目录、也不做存在性检查
test("discoverProviderConfigPath honours the RECALL_PROVIDER_CONFIG override", (t) => {
	const { sub, skillDir, homeDir, root } = makeSandbox(t)
	// 故意不创建该文件:override 必须原样透传,存在性留给后续读取报错
	const override = join(root, "custom-config.yaml")
	const resolved = discoverProviderConfigPath({
		cwd: sub,
		env: { [DEFAULT_PROVIDER_CONFIG_ENV]: override },
		skillDir,
		homeDir,
	})
	assert.equal(resolved, override)
})

// 场景:RECALL_PROVIDER_CONFIG 使用 `~/` 前缀
//   给定 override 写成 ~/custom-config.yaml(shell 之外没人展开 `~`,
//        Windows 上更会被当成字面目录名)
//   当   调用 discoverProviderConfigPath
//   那么 `~` 被展开为注入的 homeDir,而不是原样返回
test("discoverProviderConfigPath expands a ~ prefix override against homeDir", (t) => {
	const { sub, skillDir, homeDir } = makeSandbox(t)
	const resolved = discoverProviderConfigPath({
		cwd: sub,
		env: { [DEFAULT_PROVIDER_CONFIG_ENV]: "~/custom-config.yaml" },
		skillDir,
		homeDir,
	})
	assert.equal(resolved, join(homeDir, "custom-config.yaml"))
})

// 场景:cwd 下存在provider config 文件
//   给定 沙箱中仅 cwd 下有 .recall-replay.env.yaml
//   当   调用 discoverProviderConfigPath(使用真实 existsSync)
//   那么 命中 cwd 下的文件
test("discoverProviderConfigPath discovers a config in the current working directory", (t) => {
	const { work, skillDir, homeDir } = makeSandbox(t)
	const expected = join(work, ".recall-replay.env.yaml")
	writeFileSync(expected, SAMPLE_CONFIG)
	const resolved = discoverProviderConfigPath({
		cwd: work,
		env: {},
		skillDir,
		homeDir,
	})
	assert.equal(resolved, expected)
})

// 场景:cwd / 仓库根都没有，但 skill 目录下有
//   给定 沙箱中仅 skill 目录下有 .recall-replay.env.yml
//   当   调用 discoverProviderConfigPath(使用真实 existsSync)
//   那么 越过空的 cwd / 仓库根，命中 skill 目录下的文件
test("discoverProviderConfigPath discovers a config in the skill directory", (t) => {
	const { work, skillDir, homeDir } = makeSandbox(t)
	const expected = join(skillDir, ".recall-replay.env.yml")
	writeFileSync(expected, SAMPLE_CONFIG)
	const resolved = discoverProviderConfigPath({
		cwd: work,
		env: {},
		skillDir,
		homeDir,
	})
	assert.equal(resolved, expected)
})

// 场景:仅 home 目录下存在provider config 文件
//   给定 沙箱中仅 home 目录下有 .recall-replay.env
//   当   调用 discoverProviderConfigPath(使用真实 existsSync)
//   那么 命中 home 目录下的文件(即 Windows 上 %USERPROFILE% 同样可作放置点)
test("discoverProviderConfigPath discovers a config in the home directory", (t) => {
	const { work, skillDir, homeDir } = makeSandbox(t)
	const expected = join(homeDir, ".recall-replay.env")
	writeFileSync(expected, SAMPLE_CONFIG)
	const resolved = discoverProviderConfigPath({
		cwd: work,
		env: {},
		skillDir,
		homeDir,
	})
	assert.equal(resolved, expected)
})

// 场景:任何候选目录都没有provider config 文件
//   给定 沙箱候选目录里都没有匹配文件(仅有 .git 标记仓库根)
//   当   以仓库子目录为 cwd 调用 discoverProviderConfigPath(使用真实 existsSync)
//   那么 向上找到仓库根，回退到「仓库根 + 主文件名」
test("discoverProviderConfigPath falls back to the repo-root primary filename", (t) => {
	const { repo, sub, skillDir, homeDir } = makeSandbox(t)
	const resolved = discoverProviderConfigPath({
		cwd: sub,
		env: {},
		skillDir,
		homeDir,
	})
	assert.equal(resolved, join(repo, PROVIDER_CONFIG_FILENAMES[0]))
})

// 场景:候选目录顺序与去重
//   给定 cwd 恰好就是仓库根(沙箱中 repo 自带 .git)
//   当   调用 providerConfigSearchDirs(使用真实 existsSync)
//   那么 返回 [cwd, skillDir, homeDir](仓库根与 cwd 去重)
test("providerConfigSearchDirs lists cwd, repo root, skill dir, and home dir without duplicates", (t) => {
	const { repo, homeDir } = makeSandbox(t)
	// skillDir 放在仓库内部,贴近真实安装形态(skills-def/ 目录随仓库走)
	const skillDir = join(repo, "skills-def", "recall-eval", "scripts")
	mkdirSync(skillDir, { recursive: true })
	const dirs = providerConfigSearchDirs({
		cwd: repo,
		skillDir,
		homeDir,
	})
	assert.deepEqual(dirs, [repo, skillDir, homeDir])
})

// 场景:loadProviderConfig 透传 skillDir / homeDir 给发现逻辑
//   给定 不传 path，沙箱中仅 skill 目录下有真实provider config 文件
//   当   调用 loadProviderConfig(真实 existsSync + 真实 readFileSync,端到端)
//   那么 解析路径为 skill 目录下的provider config 文件，且成功解析出 provider
test("loadProviderConfig forwards skillDir and homeDir to discovery", (t) => {
	const { work, skillDir, homeDir } = makeSandbox(t)
	const expected = join(skillDir, ".recall-replay.env.yaml")
	writeFileSync(expected, SAMPLE_CONFIG)
	const { path, config } = loadProviderConfig({
		cwd: work,
		env: {},
		skillDir,
		homeDir,
	})
	assert.equal(path, expected)
	assert.equal(config.providers.length, 3)
})

// 场景:枚举常量与文档保持同步
//   给定 导出的 API / memory 模式枚举
//   当   读取它们
//   那么 至少包含 echo 与 upstream
test("api and memory enums stay in sync with documentation", () => {
	assert.ok(SUPPORTED_PROVIDER_APIS.includes("echo"))
	assert.ok(SUPPORTED_MEMORY_MODES.includes("upstream"))
})
