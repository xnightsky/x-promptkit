// skills-def/recall-eval/scripts/replay-engine.mjs
//
// recall-eval 技能的「provider 矩阵」回放(replay)助手。
//
// 本模块把一份 ".env" 风格的 provider 矩阵(用 YAML 声明)转换成一个
// 临时的、进程内的 recall agent 运行。它刻意做到对本地零依赖:
//   - 运行过程不向磁盘写任何文件，结束后直接丢弃引用，无需任何清理步骤;
//   - clean-context 策略统一从 lib.mjs 读取，保证「回放路径」与
//     「真实 recall 路径」始终对齐;
//   - 任何可复用的打分 / carrier 策略都应沉淀到上游共享 runtime，而不是这里。

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import {
	DEFAULT_CLEAN_CONTEXT_POLICY,
} from "./lib.mjs"
import { callModel } from "./_shared/model-runner.mjs"
import { expandHomePath } from "./_shared/model-client.mjs"

// 本脚本(replay-engine.mjs)所在目录即「skill 运行时目录」。发现provider config 文件时会把它
// 当作候选目录之一，从而支持把 .recall-replay.env.yaml 放在技能安装目录旁边。
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

// 真实provider config 文件可放在多个位置(cwd / 仓库根 / skill 目录 / home 目录),发现时
// 会在每个候选目录里按下列文件名顺序命中第一个存在的文件。
export const PROVIDER_CONFIG_FILENAMES = Object.freeze([
	".recall-replay.env.yaml",
	".recall-replay.env.yml",
	".recall-replay.env",
])

// 覆盖矩阵路径用的环境变量名。
export const DEFAULT_PROVIDER_CONFIG_ENV = "RECALL_PROVIDER_CONFIG"

// 仅用于文档 / 错误信息展示的「主文件名」(相对某个候选目录)。
export const DEFAULT_PROVIDER_CONFIG_PATH = PROVIDER_CONFIG_FILENAMES[0]

export const SUPPORTED_PROVIDER_APIS = Object.freeze([
	"openai-chat",
	"anthropic-messages",
	"gemini-generate",
	"echo",
])

export const SUPPORTED_MEMORY_MODES = Object.freeze(["in-process", "upstream"])

const DEFAULT_DEFAULTS = Object.freeze({
	api: "echo",
	temperature: 0,
	max_tokens: 512,
	timeout_ms: 60000,
})

// 从 startDir 逐级向上寻找仓库根:命中含 `.git` 的目录即认为是仓库根。
// 若一直走到文件系统根仍未命中，则回退为起点目录，保证行为可预测、可测试。
// fileExists 可注入，便于测试不触碰真实文件系统。
export function findRepoRoot(startDir, options = {}) {
	const { fileExists = (target) => existsSync(target) } = options
	let current = startDir
	while (true) {
		if (fileExists(join(current, ".git"))) {
			return current
		}
		const parent = dirname(current)
		if (parent === current) {
			return startDir
		}
		current = parent
	}
}

// 汇总发现 replay provider config 文件的候选目录，按优先级排序:
//   1) 当前工作目录 cwd;
//   2) 从 cwd 向上找到的仓库根(含 `.git` 的目录);
//   3) skill 运行时目录(本脚本所在目录);
//   4) 用户 home 目录。
// 返回值去重并保持顺序(例如 cwd 本身即仓库根时只保留一份)。
// cwd / skillDir / homeDir / fileExists 均可注入，便于测试不触碰真实文件系统。
export function providerConfigSearchDirs(options = {}) {
	const {
		cwd = process.cwd(),
		skillDir = SCRIPT_DIR,
		homeDir = homedir(),
		fileExists = (target) => existsSync(target),
	} = options
	const repoRoot = findRepoRoot(cwd, { fileExists })
	const ordered = [cwd, repoRoot, skillDir, homeDir]
	const seen = new Set()
	const dirs = []
	for (const dir of ordered) {
		if (typeof dir !== "string" || dir.length === 0) {
			continue
		}
		if (seen.has(dir)) {
			continue
		}
		seen.add(dir)
		dirs.push(dir)
	}
	return dirs
}

// 解析真实provider config 文件路径。优先级:
//   1) RECALL_PROVIDER_CONFIG 环境变量(显式指定，最高优先);
//   2) 在 providerConfigSearchDirs() 的候选目录(cwd / 仓库根 / skill 目录 /
//      home 目录)中，按 PROVIDER_CONFIG_FILENAMES 命中的第一个存在文件;
//   3) 都不存在时回退到「仓库根 + 主文件名」，让后续读取报错时指向最符合直觉的位置。
// cwd / env / fileExists / skillDir / homeDir 均可注入，便于测试。
export function discoverProviderConfigPath(options = {}) {
	const {
		cwd = process.cwd(),
		env = process.env,
		fileExists = (target) => existsSync(target),
		skillDir = SCRIPT_DIR,
		homeDir = homedir(),
	} = options
	const override = env[DEFAULT_PROVIDER_CONFIG_ENV]
	if (typeof override === "string" && override.length > 0) {
		// `~` 前缀展开为 homeDir:shell 之外没人会替我们展开它,
		// 尤其 Windows 上会被当成字面目录名导致 override 静默失效
		return expandHomePath(override, homeDir)
	}
	const searchDirs = providerConfigSearchDirs({
		cwd,
		skillDir,
		homeDir,
		fileExists,
	})
	for (const dir of searchDirs) {
		for (const filename of PROVIDER_CONFIG_FILENAMES) {
			const candidate = join(dir, filename)
			if (fileExists(candidate)) {
				return candidate
			}
		}
	}
	const repoRoot = findRepoRoot(cwd, { fileExists })
	return join(repoRoot, PROVIDER_CONFIG_FILENAMES[0])
}

// 把一份 provider 矩阵 YAML 文本解析为规范化的矩阵对象。
// 支持 v2（map 式，camelCase，对齐 pi models.json）。
// v2 内部归一化到 v1 结构，下游代码无感知。
export function parseProviderConfig(text) {
	if (typeof text !== "string" || text.trim() === "") {
		throw new Error("provider config source is empty")
	}
	const raw = parseYaml(text)
	if (!raw || typeof raw !== "object") {
		throw new Error("provider config must be a YAML mapping")
	}
	const version = raw.version ?? 1
	if (version < 2) {
		throw new Error(
			`unsupported provider config version ${version}. Please migrate to v2 (map-style providers, camelCase fields). See .recall-replay.env.example.yaml for the current format.`,
		)
	}

	// ── 归一化：v2 → v1 内部格式 ──
	let rawDefaults = raw.defaults ?? {}
	let rawRun = raw.run ?? {}

	// v2: camelCase defaults → snake_case
	rawDefaults = {
		api: rawDefaults.api,
		temperature: rawDefaults.temperature,
		max_tokens: rawDefaults.maxTokens,
		timeout_ms: rawDefaults.timeoutMs,
	}
	// v2: providers map → v1 array
	const providerMap = raw.providers ?? {}
	const rawProviders = Object.entries(providerMap).map(([key, p]) => {
		const models = Array.isArray(p.models) ? p.models : []
		const model = models[0] ?? {}
		return {
			id: key,
			enabled: p.enabled,
			api: p.api,
			base_url: p.baseUrl,
			model: model.id,
			models: models.map((m) => m.id),  // 保留完整 model 列表，用于歧义检测
			apikey: p.apiKey,
			headers: model.headers ?? p.headers,
			timeout_ms: p.timeoutMs,
			temperature: p.temperature,
			max_tokens: p.maxTokens,
		}
	})
	// v2: run.models → 内部 run.ids
	// 支持 "provider" 或 "provider/model" 语法，指定非首 model
	const runModels = rawRun.models
	if (Array.isArray(runModels) && runModels.length > 0) {
		const ids = []
		const modelOverrides = {}
		for (const m of runModels) {
			const slash = m.indexOf("/")
			const pid = slash >= 0 ? m.slice(0, slash) : m
			ids.push(pid)
			if (slash >= 0) modelOverrides[pid] = m.slice(slash + 1)
		}
		rawRun = { ids, _modelOverrides: Object.keys(modelOverrides).length > 0 ? modelOverrides : undefined }
	} else {
		rawRun = { ids: [] }
	}
	// 过滤 undefined，避免覆盖 DEFAULT_DEFAULTS
	const cleanDefaults = {}
	for (const [k, v] of Object.entries(rawDefaults)) {
		if (v !== undefined && v !== null) cleanDefaults[k] = v
	}
	const defaults = { ...DEFAULT_DEFAULTS, ...cleanDefaults }

	// 同样过滤 provider 字段中的 undefined
	const providers = rawProviders.map((provider) => {
		const clean = {}
		for (const [k, v] of Object.entries(provider)) {
			if (v !== undefined) clean[k] = v
		}
		return { ...defaults, ...clean }
	})
	const memory = {
		mode: "in-process",
		namespace: "recall-replay",
		ttl_seconds: 0,
		...(raw.memory ?? {}),
	}
	const contextPolicy = {
		id: DEFAULT_CLEAN_CONTEXT_POLICY.id,
		assert_echo: true,
		...(raw.context_policy ?? {}),
	}
	return {
		version: raw.version ?? 1,
		defaults,
		memory,
		context_policy: contextPolicy,
		run: rawRun,
		providers,
	}
}

// 解析矩阵路径(显式 path > 发现规则)并读取解析。文件读取函数可注入，
// 测试因此永不触碰真实文件系统。
export function loadProviderConfig(options = {}) {
	const {
		path,
		cwd = process.cwd(),
		env = process.env,
		fileExists,
		skillDir,
		homeDir,
		fileReader = (target) => readFileSync(target, "utf8"),
	} = options
	const resolved =
		path ??
		discoverProviderConfigPath({ cwd, env, fileExists, skillDir, homeDir })
	const text = fileReader(resolved)
	return { path: resolved, config: parseProviderConfig(text) }
}

// 结构化校验（v2 归一化后的内部格式）。返回 { ok, errors }。
export function validateProviderConfig(config) {
	const errors = []
	if (!config || typeof config !== "object") {
		return { ok: false, errors: ["config must be an object"] }
	}
	if (!SUPPORTED_MEMORY_MODES.includes(config.memory?.mode)) {
		errors.push(
			`memory.mode must be one of ${SUPPORTED_MEMORY_MODES.join(", ")}`,
		)
	}
	if (config.context_policy?.id !== DEFAULT_CLEAN_CONTEXT_POLICY.id) {
		errors.push(
			`context_policy.id must equal "${DEFAULT_CLEAN_CONTEXT_POLICY.id}"`,
		)
	}
	if (!Array.isArray(config.providers) || config.providers.length === 0) {
		errors.push("providers must be a non-empty array")
	}
	for (const provider of config.providers ?? []) {
		const label = provider?.id ?? "(unknown)"
		if (!provider?.id) {
			errors.push(`provider ${label} is missing an id`)
		}
		if (!SUPPORTED_PROVIDER_APIS.includes(provider?.api)) {
			errors.push(`provider ${label} has unsupported api "${provider?.api}"`)
		}
		if (!provider?.model && provider?.api !== "echo") {
			errors.push(`provider ${label} is missing a model`)
		}
		if (provider?.api !== "echo") {
			const key = typeof provider?.apikey === "string" ? provider.apikey.trim() : ""
			if (!key) {
				errors.push(`provider ${label} is missing apiKey`)
			}
		}
	}
	return { ok: errors.length === 0, errors }
}

// 选出「已启用且可达」的 provider。真实 provider 需要其 apikey(或 echo 的内联
// key)存在，这正是 token 套件在没有任何凭据时能自动跳过的原因。
// 如果 run.ids 非空，仅考虑其中列出的 provider id（否则所有 enabled 都参选）。
export function selectEnabledProviders(config, options = {}) {
	const { env = process.env, skipRunFilter = false } = options
	const providers = Array.isArray(config?.providers) ? config.providers : []
	// run.ids 非空时只考虑声明的 id；为空/未设置时所有 enabled 都参选
	// skipRunFilter=true 时跳过此限制（--provider 覆盖场景）
	const runFilter = !skipRunFilter && Array.isArray(config?.run?.ids) && config.run.ids.length > 0
		? new Set(config.run.ids)
		: null
	return providers.filter((provider) => {
		if (provider?.enabled === false) {
			return false
		}
		if (runFilter && !runFilter.has(provider.id)) {
			return false
		}
		if (provider?.api === "echo") {
			return true
		}
		const rawKey = provider?.apikey || provider?.key_env || provider?.key
		if (typeof rawKey === "string" && rawKey.length > 0) {
			// apikey 支持 env 名或 inline key
			const envValue = env[rawKey]
			if (envValue && envValue.length > 0) return true
			// inline key: 以 sk- 开头或长度超过 30 视为直接 key 值
			if (rawKey.startsWith("sk-") || rawKey.length > 30) return true
			// 否则是无法解析的 env 名，不可达
		}
		return false
	})
}

// 为单个 recall case 构造 system / user 消息。clean-context 策略会被写进
// system 提示，且「召回到的 memory」是唯一允许的作答依据。
export function buildReplayMessages(caseReport, options = {}) {
	const policy = { ...DEFAULT_CLEAN_CONTEXT_POLICY, ...(options.policy ?? {}) }
	const memory =
		caseReport?.memory ??
		caseReport?.context ??
		caseReport?.source_text ??
		""
	const lines = [
		`policy: ${policy.id}`,
		`answer_basis: ${policy.answer_basis}`,
		"You may only answer using the memory provided below.",
	]
	// assert_echo 时必须显式要求模型回显策略 id:echo 后端会原样回显整个 prompt
	// 所以"碰巧"通过,但真实模型不会照抄 system 里的声明行——没有这条指令,
	// extractPolicyEcho 对真实 provider 永远拿到 null,token 套件必挂。
	if (policy.assert_echo !== false) {
		lines.push(
			`Begin your reply with this exact line, then answer on the next line: policy: ${policy.id}`,
		)
	}
	lines.push("", "<memory>", memory, "</memory>")
	const system = lines.join("\n")
	return { system, user: caseReport?.question ?? "", policy }
}

// 从模型回答里抽取被回显的 clean-context 策略 id。
export function extractPolicyEcho(text) {
	if (typeof text !== "string") {
		return null
	}
	const match = text.match(/policy:\s*(\S+)/)
	return match ? match[1] : null
}

// 把 provider 的 apiKey(env 变量名或 inline key)物化为实际值。
// callModel 只认 provider.apikey；不在这里解析的话会以 `Bearer undefined` 发请求。
// 解析顺序与 selectEnabledProviders 的可达性判断保持一致:
// 优先同名环境变量,取不到则把字段值本身当 inline key。
export function resolveProviderKey(provider, env = process.env) {
	const rawKey = provider?.apikey || provider?.key_env || provider?.key
	if (typeof rawKey !== "string" || rawKey.length === 0) {
		return ""
	}
	return env[rawKey] || rawKey
}

// 组装一个临时的进程内 agent。它不持有任何持久状态;run() 回答单个 recall case，
// 调用方用完直接丢弃引用即可(无需清理)。
export function assembleEphemeralAgent(options = {}) {
	const {
		config,
		provider,
		env = process.env,
		fetchImpl = globalThis.fetch,
	} = options
	if (!provider) {
		throw new Error("assembleEphemeralAgent requires a provider")
	}
	const policy = {
		...DEFAULT_CLEAN_CONTEXT_POLICY,
		...(config?.context_policy ?? {}),
	}
	// callModel 只认 provider.apikey，这里把 apikey/key_env 物化为实际值
	// 同时透传 headers（伪装头等）给 model-runner
	const effectiveProvider = {
		...provider,
		apikey: resolveProviderKey(provider, env),
		...(provider.headers ? { headers: provider.headers } : {}),
	}
	return {
		id: `recall-replay:${provider.id}`,
		carrier: "direct",
		policy,
		memoryMode: config?.memory?.mode ?? "in-process",
		provider: provider.id,
		async run(caseReport) {
			const messages = buildReplayMessages(caseReport, { policy })
			const prompt = messages.system + "\n\n---\n\n" + messages.user
			const answer = await callModel(effectiveProvider, prompt, { maxRetries: 0, fetchImpl })
			return {
				caseId: caseReport?.id,
				provider: provider.id,
				policyEcho: extractPolicyEcho(answer),
				answer,
			}
		},
	}
}

// 一个内置的极小 recall 队列，离线单测与 token 套件共用。must_not_include 刻意
// 用合成字符串(而非像 "80" 这样的数字)，以免与正常答案内容碰撞。
export function buildReplayQueueFixture() {
	return {
		version: 1,
		fallback_answer: "I don't have that information in memory.",
		scoring: { 0: "fail", 1: "partial", 2: "full" },
		cases: [
			{
				id: "replay.simple_fact",
				question:
					"On which port does the staging gateway listen, and what protocol does it serve?",
				memory:
					"The staging gateway listens on port 8443 and serves TLS traffic.",
				medium: "text",
				carrier: "direct",
				expected: {
					must_include: ["8443"],
					should_include: ["TLS"],
					must_not_include: ["forbidden-token"],
				},
				score_rule: { full: 2, partial: 1, fail: 0 },
				tags: ["replay", "selftest"],
				source_scope: "skill",
				source_ref:
					"skills-def/recall-eval/README.md#live-recall-defaults",
			},
		],
	}
}

// 一站式加载已启用的 provider：发现provider config 文件 → 解析 → 筛选 → 解析 apiKey。
// 返回可直接传给 callModel / createClient 的 provider 对象数组。
// 失败时抛出明确错误，调用方自行决定是否 skip。
export function loadEnabledProviders(options = {}) {
	const { env = process.env } = options
	const { config } = loadProviderConfig(options)
	const enabled = selectEnabledProviders(config, options)
	return enabled.map((p) => ({
		...p,
		apikey: resolveProviderKey(p, env),
	}))
}
