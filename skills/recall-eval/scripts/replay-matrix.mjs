// skills/recall-eval/scripts/replay-matrix.mjs
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
	SUBAGENT_CARRIER,
	DEFAULT_CLEAN_CONTEXT_POLICY,
} from "./lib.mjs"
import { callModel } from "../../_shared/model-runner.mjs"
import { expandHomePath } from "../../_shared/model-client.mjs"

// 本脚本(replay-matrix.mjs)所在目录即「skill 运行时目录」。发现矩阵文件时会把它
// 当作候选目录之一，从而支持把 .recall-replay.env.yaml 放在技能安装目录旁边。
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

// 真实矩阵文件可放在多个位置(cwd / 仓库根 / skill 目录 / home 目录),发现时
// 会在每个候选目录里按下列文件名顺序命中第一个存在的文件。
export const REPLAY_MATRIX_FILENAMES = Object.freeze([
	".recall-replay.env.yaml",
	".recall-replay.env.yml",
	".recall-replay.env",
])

// 覆盖矩阵路径用的环境变量名。
export const DEFAULT_REPLAY_MATRIX_ENV = "RECALL_REPLAY_MATRIX"

// 仅用于文档 / 错误信息展示的「主文件名」(相对某个候选目录)。
export const DEFAULT_REPLAY_MATRIX_PATH = REPLAY_MATRIX_FILENAMES[0]

export const SUPPORTED_REPLAY_APIS = Object.freeze([
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

// 汇总发现 replay 矩阵文件的候选目录，按优先级排序:
//   1) 当前工作目录 cwd;
//   2) 从 cwd 向上找到的仓库根(含 `.git` 的目录);
//   3) skill 运行时目录(本脚本所在目录);
//   4) 用户 home 目录。
// 返回值去重并保持顺序(例如 cwd 本身即仓库根时只保留一份)。
// cwd / skillDir / homeDir / fileExists 均可注入，便于测试不触碰真实文件系统。
export function replayMatrixSearchDirs(options = {}) {
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

// 解析真实矩阵文件路径。优先级:
//   1) RECALL_REPLAY_MATRIX 环境变量(显式指定，最高优先);
//   2) 在 replayMatrixSearchDirs() 的候选目录(cwd / 仓库根 / skill 目录 /
//      home 目录)中，按 REPLAY_MATRIX_FILENAMES 命中的第一个存在文件;
//   3) 都不存在时回退到「仓库根 + 主文件名」，让后续读取报错时指向最符合直觉的位置。
// cwd / env / fileExists / skillDir / homeDir 均可注入，便于测试。
export function discoverReplayMatrixPath(options = {}) {
	const {
		cwd = process.cwd(),
		env = process.env,
		fileExists = (target) => existsSync(target),
		skillDir = SCRIPT_DIR,
		homeDir = homedir(),
	} = options
	const override = env[DEFAULT_REPLAY_MATRIX_ENV]
	if (typeof override === "string" && override.length > 0) {
		// `~` 前缀展开为 homeDir:shell 之外没人会替我们展开它,
		// 尤其 Windows 上会被当成字面目录名导致 override 静默失效
		return expandHomePath(override, homeDir)
	}
	const searchDirs = replayMatrixSearchDirs({
		cwd,
		skillDir,
		homeDir,
		fileExists,
	})
	for (const dir of searchDirs) {
		for (const filename of REPLAY_MATRIX_FILENAMES) {
			const candidate = join(dir, filename)
			if (fileExists(candidate)) {
				return candidate
			}
		}
	}
	const repoRoot = findRepoRoot(cwd, { fileExists })
	return join(repoRoot, REPLAY_MATRIX_FILENAMES[0])
}

// 把一份 provider 矩阵 YAML 文本解析为规范化的矩阵对象。每个 provider 都会
// 继承顶层 defaults，因此调用方拿到的永远是解析后的最终值。
export function parseReplayMatrix(text) {
	if (typeof text !== "string" || text.trim() === "") {
		throw new Error("replay matrix source is empty")
	}
	const raw = parseYaml(text)
	if (!raw || typeof raw !== "object") {
		throw new Error("replay matrix must be a YAML mapping")
	}
	const defaults = { ...DEFAULT_DEFAULTS, ...(raw.defaults ?? {}) }
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
	const providers = Array.isArray(raw.providers) ? raw.providers : []
	return {
		version: raw.version ?? 1,
		defaults,
		memory,
		context_policy: contextPolicy,
		run: raw.run ?? {},
		providers: providers.map((provider) => ({ ...defaults, ...provider })),
	}
}

// 解析矩阵路径(显式 path > 发现规则)并读取解析。文件读取函数可注入，
// 测试因此永不触碰真实文件系统。
export function loadReplayMatrix(options = {}) {
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
		discoverReplayMatrixPath({ cwd, env, fileExists, skillDir, homeDir })
	const text = fileReader(resolved)
	return { path: resolved, matrix: parseReplayMatrix(text) }
}

// 结构化校验。返回 { ok, errors } 而非抛错，便于调用方一次性暴露所有问题。
export function validateReplayMatrix(matrix) {
	const errors = []
	if (!matrix || typeof matrix !== "object") {
		return { ok: false, errors: ["matrix must be an object"] }
	}
	if (!SUPPORTED_MEMORY_MODES.includes(matrix.memory?.mode)) {
		errors.push(
			`memory.mode must be one of ${SUPPORTED_MEMORY_MODES.join(", ")}`,
		)
	}
	if (matrix.context_policy?.id !== DEFAULT_CLEAN_CONTEXT_POLICY.id) {
		errors.push(
			`context_policy.id must equal "${DEFAULT_CLEAN_CONTEXT_POLICY.id}"`,
		)
	}
	if (!Array.isArray(matrix.providers) || matrix.providers.length === 0) {
		errors.push("providers must be a non-empty array")
	}
	for (const [index, provider] of (matrix.providers ?? []).entries()) {
		const label = provider?.id ?? `#${index}`
		if (!provider?.id) {
			errors.push(`provider ${label} is missing an id`)
		}
		if (!SUPPORTED_REPLAY_APIS.includes(provider?.api)) {
			errors.push(`provider ${label} has unsupported api "${provider?.api}"`)
		}
		if (!provider?.model && provider?.api !== "echo") {
			errors.push(`provider ${label} is missing a model`)
		}
		const usesInlineKey =
			typeof provider?.apikey === "string" && provider.apikey.length > 0
		const hasLegacyKeyEnv = typeof provider?.key_env === "string" && provider.key_env.length > 0
		if (usesInlineKey && provider?.api !== "echo") {
			// apikey 支持 inline key，不再报错；仅旧字段 key 仍提示
		}
		const hasKey = usesInlineKey || hasLegacyKeyEnv || (typeof provider?.key === "string" && provider.key.length > 0)
		if (provider?.api !== "echo" && !hasKey) {
			errors.push(`provider ${label} is missing apikey`)
		}
	}
	return { ok: errors.length === 0, errors }
}

// 选出「已启用且可达」的 provider。真实 provider 需要其 apikey(或 echo 的内联
// key)存在，这正是 token 套件在没有任何凭据时能自动跳过的原因。
export function selectEnabledProviders(matrix, options = {}) {
	const { env = process.env } = options
	const providers = Array.isArray(matrix?.providers) ? matrix.providers : []
	return providers.filter((provider) => {
		if (provider?.enabled === false) {
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

// 把 provider 的 apikey(env 变量名或 inline key)物化为实际 key 值。
// callModel 只读取 provider.key;若不在这里解析,带 `apikey: SOME_ENV_NAME`
// 的 provider 会以 `Bearer undefined` 发请求,稳定得到 401。
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
		matrix,
		provider,
		env = process.env,
		fetchImpl = globalThis.fetch,
	} = options
	if (!provider) {
		throw new Error("assembleEphemeralAgent requires a provider")
	}
	const policy = {
		...DEFAULT_CLEAN_CONTEXT_POLICY,
		...(matrix?.context_policy ?? {}),
	}
	// callModel 只认 provider.key,这里先把 apikey/key_env 物化为实际 key 值
	const effectiveProvider = { ...provider, key: resolveProviderKey(provider, env) }
	return {
		id: `recall-replay:${provider.id}`,
		carrier: SUBAGENT_CARRIER,
		policy,
		memoryMode: matrix?.memory?.mode ?? "in-process",
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
				carrier: SUBAGENT_CARRIER,
				expected: {
					must_include: ["8443"],
					should_include: ["TLS"],
					must_not_include: ["forbidden-token"],
				},
				score_rule: { full: 2, partial: 1, fail: 0 },
				tags: ["replay", "selftest"],
				source_scope: "skill",
				source_ref:
					"skills/recall-eval/README.md#live-recall-defaults",
			},
		],
	}
}
