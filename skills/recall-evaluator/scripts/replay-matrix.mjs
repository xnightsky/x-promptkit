// skills/recall-evaluator/scripts/replay-matrix.mjs
//
// recall-evaluator 技能的「provider 矩阵」回放(replay)助手。
//
// 本模块把一份 ".env" 风格的 provider 矩阵(用 YAML 声明)转换成一个
// 临时的、进程内的 recall agent 运行。它刻意做到对本地零依赖:
//   - 运行过程不向磁盘写任何文件，结束后直接丢弃引用，无需任何清理步骤;
//   - clean-context 策略统一从上游 carrier-adapter 读取，保证「回放路径」与
//     「真实 recall 路径」始终对齐;
//   - 任何可复用的打分 / carrier 策略都应沉淀到上游共享 runtime，而不是这里。

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parse as parseYaml } from "yaml"
import {
	SUBAGENT_CARRIER,
	DEFAULT_CLEAN_CONTEXT_POLICY,
} from "./carrier-adapter.mjs"

// 真实矩阵文件「默认放在使用方仓库根目录」，而不是技能安装目录。
// 在仓库根按顺序命中下列文件名中的第一个。
export const REPLAY_MATRIX_FILENAMES = Object.freeze([
	".recall-replay.env.yaml",
	".recall-replay.env.yml",
	".recall-replay.env",
])

// 覆盖矩阵路径用的环境变量名。
export const DEFAULT_REPLAY_MATRIX_ENV = "RECALL_REPLAY_MATRIX"

// 仅用于文档 / 错误信息展示的「主文件名」(相对仓库根)。
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

// 解析真实矩阵文件路径。优先级:
//   1) RECALL_REPLAY_MATRIX 环境变量(显式指定，最高优先);
//   2) 从 cwd 向上找到的仓库根下，按 REPLAY_MATRIX_FILENAMES 命中的第一个存在文件;
//   3) 都不存在时回退到「仓库根 + 主文件名」，让后续读取报错时指向正确位置。
// cwd / env / fileExists 均可注入，便于测试。
export function discoverReplayMatrixPath(options = {}) {
	const {
		cwd = process.cwd(),
		env = process.env,
		fileExists = (target) => existsSync(target),
	} = options
	const override = env[DEFAULT_REPLAY_MATRIX_ENV]
	if (typeof override === "string" && override.length > 0) {
		return override
	}
	const repoRoot = findRepoRoot(cwd, { fileExists })
	for (const filename of REPLAY_MATRIX_FILENAMES) {
		const candidate = join(repoRoot, filename)
		if (fileExists(candidate)) {
			return candidate
		}
	}
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
		fileReader = (target) => readFileSync(target, "utf8"),
	} = options
	const resolved = path ?? discoverReplayMatrixPath({ cwd, env, fileExists })
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
			typeof provider?.key === "string" && provider.key.length > 0
		if (usesInlineKey && provider?.api !== "echo") {
			errors.push(
				`provider ${label} must use key_env instead of an inline key`,
			)
		}
		if (provider?.api !== "echo" && !provider?.key_env && !usesInlineKey) {
			errors.push(`provider ${label} is missing key_env`)
		}
	}
	return { ok: errors.length === 0, errors }
}

// 选出「已启用且可达」的 provider。真实 provider 需要其 key_env(或 echo 的内联
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
		const keyEnv = provider?.key_env
		if (keyEnv && typeof env[keyEnv] === "string" && env[keyEnv].length > 0) {
			return true
		}
		return typeof provider?.key === "string" && provider.key.length > 0
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
	const system = [
		`policy: ${policy.id}`,
		`answer_basis: ${policy.answer_basis}`,
		"You may only answer using the memory provided below.",
		"",
		"<memory>",
		memory,
		"</memory>",
	].join("\n")
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

// 向某个 provider 发起一次请求。echo 后端离线短路;真实后端走可注入的 fetch 实现。
export async function callReplayModel(options = {}) {
	const {
		provider,
		messages,
		fetchImpl = globalThis.fetch,
		env = process.env,
	} = options
	if (!provider || typeof provider !== "object") {
		throw new Error("callReplayModel requires a provider")
	}
	const api = provider.api ?? "echo"
	if (api === "echo") {
		return [
			`policy: ${messages.policy?.id ?? DEFAULT_CLEAN_CONTEXT_POLICY.id}`,
			messages.system,
			messages.user,
		].join("\n")
	}
	if (typeof fetchImpl !== "function") {
		throw new Error("callReplayModel requires a fetch implementation")
	}
	const key = (provider.key_env && env[provider.key_env]) || provider.key || ""
	const timeoutMs = provider.timeout_ms ?? DEFAULT_DEFAULTS.timeout_ms
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const request = buildProviderRequest({ provider, messages, key })
		const response = await fetchImpl(request.url, {
			method: "POST",
			headers: request.headers,
			body: JSON.stringify(request.body),
			signal: controller.signal,
		})
		if (!response.ok) {
			throw new Error(`provider responded with status ${response.status}`)
		}
		const payload = await response.json()
		return extractProviderText(api, payload)
	} finally {
		clearTimeout(timer)
	}
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
	return {
		id: `recall-replay:${provider.id}`,
		carrier: SUBAGENT_CARRIER,
		policy,
		memoryMode: matrix?.memory?.mode ?? "in-process",
		provider: provider.id,
		async run(caseReport) {
			const messages = buildReplayMessages(caseReport, { policy })
			const answer = await callReplayModel({
				provider,
				messages,
				fetchImpl,
				env,
			})
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
					"skills/recall-evaluator/README.md#live-recall-defaults",
			},
		],
	}
}

// 按 api 类型构造底层 HTTP 请求(url / headers / body)。
function buildProviderRequest({ provider, messages, key }) {
	const api = provider.api
	const model = provider.model
	const base = (provider.base_url ?? "").replace(/\/+$/, "")
	const temperature = provider.temperature ?? DEFAULT_DEFAULTS.temperature
	const maxTokens = provider.max_tokens ?? DEFAULT_DEFAULTS.max_tokens
	if (api === "openai-chat") {
		return {
			url: `${base}/chat/completions`,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${key}`,
			},
			body: {
				model,
				temperature,
				max_tokens: maxTokens,
				messages: [
					{ role: "system", content: messages.system },
					{ role: "user", content: messages.user },
				],
			},
		}
	}
	if (api === "anthropic-messages") {
		return {
			url: `${base}/messages`,
			headers: {
				"content-type": "application/json",
				"x-api-key": key,
				"anthropic-version": provider.anthropic_version ?? "2023-06-01",
			},
			body: {
				model,
				max_tokens: maxTokens,
				temperature,
				system: messages.system,
				messages: [{ role: "user", content: messages.user }],
			},
		}
	}
	if (api === "gemini-generate") {
		return {
			url: `${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
			headers: { "content-type": "application/json" },
			body: {
				system_instruction: { parts: [{ text: messages.system }] },
				contents: [{ role: "user", parts: [{ text: messages.user }] }],
				generationConfig: {
					temperature,
					maxOutputTokens: maxTokens,
				},
			},
		}
	}
	throw new Error(`unsupported api "${api}"`)
}

// 从不同 api 的响应体里抽取纯文本答案。
function extractProviderText(api, payload) {
	if (api === "openai-chat") {
		return payload?.choices?.[0]?.message?.content ?? ""
	}
	if (api === "anthropic-messages") {
		const blocks = Array.isArray(payload?.content) ? payload.content : []
		return blocks.map((block) => block?.text ?? "").join("")
	}
	if (api === "gemini-generate") {
		const parts = payload?.candidates?.[0]?.content?.parts
		return Array.isArray(parts)
			? parts.map((part) => part?.text ?? "").join("")
			: ""
	}
	return ""
}
