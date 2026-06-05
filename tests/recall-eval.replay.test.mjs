import test from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"

import {
	SUPPORTED_REPLAY_APIS,
	SUPPORTED_MEMORY_MODES,
	REPLAY_MATRIX_FILENAMES,
	DEFAULT_REPLAY_MATRIX_ENV,
	parseReplayMatrix,
	loadReplayMatrix,
	validateReplayMatrix,
	selectEnabledProviders,
	buildReplayMessages,
	extractPolicyEcho,
	callReplayModel,
	assembleEphemeralAgent,
	buildReplayQueueFixture,
	discoverReplayMatrixPath,
	replayMatrixSearchDirs,
} from "../skills/recall-evaluator/scripts/replay-matrix.mjs"

// ───────────────────────────────────────────────────────────────────────────
// 离线单元测试:provider 矩阵回放助手
//
// 本套件全程离线:用 echo 后端 + 注入的 fetch / fileReader / fileExists 覆盖
// 「矩阵发现 → 解析 → 结构校验 → provider 选择 → 协议分发 → echo 打分」整条链路，
// 不触发真实网络、不读写真实文件。每条用例采用 BDD(场景 / 给定 / 当 / 那么)注释。
// ───────────────────────────────────────────────────────────────────────────

const SAMPLE_MATRIX = `
version: 1
defaults:
  api: echo
  temperature: 0
  max_tokens: 256
memory:
  mode: in-process
  namespace: recall-replay
context_policy:
  id: clean-context-v1
  assert_echo: true
providers:
  - id: echo-local
    enabled: true
    api: echo
  - id: openai-prod
    enabled: true
    api: openai-chat
    base_url: https://api.openai.com/v1
    model: gpt-4o-mini
    key_env: OPENAI_API_KEY
  - id: disabled-anthropic
    enabled: false
    api: anthropic-messages
    base_url: https://api.anthropic.com/v1
    model: claude-3-5-sonnet
    key_env: ANTHROPIC_API_KEY
`

// 场景:解析矩阵时为每个 provider 套用顶层 defaults
//   给定 一份带 defaults 与三个 provider 的矩阵
//   当   调用 parseReplayMatrix
//   那么 每个 provider 都继承 defaults(如 temperature / max_tokens)
test("parseReplayMatrix applies defaults to providers", () => {
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	assert.equal(matrix.version, 1)
	assert.equal(matrix.providers.length, 3)
	const echo = matrix.providers.find((p) => p.id === "echo-local")
	assert.equal(echo.temperature, 0)
	assert.equal(echo.max_tokens, 256)
})

// 场景:校验一份结构正确的矩阵
//   给定 一份字段齐全、策略 id 正确的矩阵
//   当   调用 validateReplayMatrix
//   那么 ok 为 true 且 errors 为空
test("validateReplayMatrix accepts a well-formed matrix", () => {
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	const { ok, errors } = validateReplayMatrix(matrix)
	assert.deepEqual(errors, [])
	assert.equal(ok, true)
})

// 场景:真实 provider 禁止使用内联 key
//   给定 一个 openai-chat provider 直接写了内联 key
//   当   调用 validateReplayMatrix
//   那么 校验失败，且错误信息提示应改用 key_env
test("validateReplayMatrix rejects inline keys for real providers", () => {
	const matrix = parseReplayMatrix(`
version: 1
memory:
  mode: in-process
context_policy:
  id: clean-context-v1
providers:
  - id: bad
    api: openai-chat
    base_url: https://api.openai.com/v1
    model: gpt-4o-mini
    key: sk-inline-secret
`)
	const { ok, errors } = validateReplayMatrix(matrix)
	assert.equal(ok, false)
	assert.ok(errors.some((e) => e.includes("key_env")))
})

// 场景:按「启用标记 + key 可用性」筛选 provider
//   给定 同一份矩阵
//   当   分别在「无 key」与「有 OPENAI_API_KEY」两种环境下筛选
//   那么 无 key 时只剩 echo-local;有 key 时再加上 openai-prod
test("selectEnabledProviders honours enabled flag and key availability", () => {
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	const withoutKeys = selectEnabledProviders(matrix, { env: {} })
	assert.deepEqual(
		withoutKeys.map((p) => p.id),
		["echo-local"],
	)
	const withKeys = selectEnabledProviders(matrix, {
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
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	const [echo] = selectEnabledProviders(matrix, { env: {} })
	const agent = assembleEphemeralAgent({ matrix, provider: echo, env: {} })
	const [caseReport] = buildReplayQueueFixture().cases
	const result = await agent.run(caseReport)
	assert.equal(result.policyEcho, "clean-context-v1")
	assert.match(result.answer, /8443/)
	assert.match(result.answer, /TLS/)
	assert.doesNotMatch(result.answer, /forbidden-token/)
})

// 场景:openai-chat 通过注入的 fetch 分发
//   给定 一个伪造的 fetch 与一个 openai-chat provider
//   当   调用 callReplayModel
//   那么 命中正确 endpoint，返回文本含必备事实且可抽出策略回显
test("callReplayModel dispatches openai-chat through an injected fetch", async () => {
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
		key_env: "OPENAI_API_KEY",
	}
	const messages = buildReplayMessages(buildReplayQueueFixture().cases[0])
	const text = await callReplayModel({
		provider,
		messages,
		fetchImpl: fakeFetch,
		env: { OPENAI_API_KEY: "sk-test" },
	})
	assert.equal(calls.length, 1)
	assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions")
	assert.match(text, /8443/)
	assert.equal(extractPolicyEcho(text), "clean-context-v1")
})

// 场景:loadReplayMatrix 支持注入的文件读取器
//   给定 显式 path 与一个返回样例矩阵的 fileReader
//   当   调用 loadReplayMatrix
//   那么 回显该 path，并解析出 3 个 provider(不触碰真实文件系统)
test("loadReplayMatrix reads from an injected file reader", () => {
	const { path, matrix } = loadReplayMatrix({
		path: "virtual.yaml",
		fileReader: () => SAMPLE_MATRIX,
	})
	assert.equal(path, "virtual.yaml")
	assert.equal(matrix.providers.length, 3)
})

// 场景:RECALL_REPLAY_MATRIX 显式指定时直接采用，跳过目录发现
//   给定 设置了 RECALL_REPLAY_MATRIX 环境变量
//   当   调用 discoverReplayMatrixPath
//   那么 直接返回该路径，不理会任何候选目录
test("discoverReplayMatrixPath honours the RECALL_REPLAY_MATRIX override", () => {
	const resolved = discoverReplayMatrixPath({
		cwd: "/work/repo/sub",
		env: { [DEFAULT_REPLAY_MATRIX_ENV]: "/custom/matrix.yaml" },
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: () => true,
	})
	assert.equal(resolved, "/custom/matrix.yaml")
})

// 场景:cwd 下存在矩阵文件
//   给定 仅 cwd 下有 .recall-replay.env.yaml
//   当   调用 discoverReplayMatrixPath
//   那么 命中 cwd 下的文件
test("discoverReplayMatrixPath discovers a matrix in the current working directory", () => {
	const present = new Set(["/work/.recall-replay.env.yaml"])
	const resolved = discoverReplayMatrixPath({
		cwd: "/work",
		env: {},
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
	})
	assert.equal(resolved, "/work/.recall-replay.env.yaml")
})

// 场景:cwd / 仓库根都没有，但 skill 目录下有
//   给定 仅 skill 目录下有 .recall-replay.env.yml
//   当   调用 discoverReplayMatrixPath
//   那么 命中 skill 目录下的文件
test("discoverReplayMatrixPath discovers a matrix in the skill directory", () => {
	const present = new Set(["/opt/skill/scripts/.recall-replay.env.yml"])
	const resolved = discoverReplayMatrixPath({
		cwd: "/work",
		env: {},
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
	})
	assert.equal(resolved, "/opt/skill/scripts/.recall-replay.env.yml")
})

// 场景:仅 home 目录下存在矩阵文件
//   给定 仅 home 目录下有 .recall-replay.env
//   当   调用 discoverReplayMatrixPath
//   那么 命中 home 目录下的文件
test("discoverReplayMatrixPath discovers a matrix in the home directory", () => {
	const present = new Set(["/home/dev/.recall-replay.env"])
	const resolved = discoverReplayMatrixPath({
		cwd: "/work",
		env: {},
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
	})
	assert.equal(resolved, "/home/dev/.recall-replay.env")
})

// 场景:任何候选目录都没有矩阵文件
//   给定 候选目录里都没有匹配文件(仅有 .git 标记仓库根)
//   当   调用 discoverReplayMatrixPath
//   那么 回退到「仓库根 + 主文件名」
test("discoverReplayMatrixPath falls back to the repo-root primary filename", () => {
	const present = new Set(["/work/repo/.git"])
	const resolved = discoverReplayMatrixPath({
		cwd: "/work/repo/sub",
		env: {},
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
	})
	assert.equal(resolved, join("/work/repo", REPLAY_MATRIX_FILENAMES[0]))
})

// 场景:候选目录顺序与去重
//   给定 cwd 恰好就是仓库根
//   当   调用 replayMatrixSearchDirs
//   那么 返回 [cwd, skillDir, homeDir](仓库根与 cwd 去重)
test("replayMatrixSearchDirs lists cwd, repo root, skill dir, and home dir without duplicates", () => {
	const present = new Set(["/repo/.git"])
	const dirs = replayMatrixSearchDirs({
		cwd: "/repo",
		skillDir: "/repo/skills/recall-evaluator/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
	})
	assert.deepEqual(dirs, [
		"/repo",
		"/repo/skills/recall-evaluator/scripts",
		"/home/dev",
	])
})

// 场景:loadReplayMatrix 透传 skillDir / homeDir 给发现逻辑
//   给定 不传 path，但通过 fileExists 让 skill 目录命中、并注入 fileReader
//   当   调用 loadReplayMatrix
//   那么 解析路径为 skill 目录下的矩阵文件，且成功解析出 provider
test("loadReplayMatrix forwards skillDir and homeDir to discovery", () => {
	const present = new Set(["/opt/skill/scripts/.recall-replay.env.yaml"])
	const { path, matrix } = loadReplayMatrix({
		cwd: "/work",
		env: {},
		skillDir: "/opt/skill/scripts",
		homeDir: "/home/dev",
		fileExists: (target) => present.has(target),
		fileReader: () => SAMPLE_MATRIX,
	})
	assert.equal(path, "/opt/skill/scripts/.recall-replay.env.yaml")
	assert.equal(matrix.providers.length, 3)
})

// 场景:枚举常量与文档保持同步
//   给定 导出的 API / memory 模式枚举
//   当   读取它们
//   那么 至少包含 echo 与 upstream
test("api and memory enums stay in sync with documentation", () => {
	assert.ok(SUPPORTED_REPLAY_APIS.includes("echo"))
	assert.ok(SUPPORTED_MEMORY_MODES.includes("upstream"))
})
