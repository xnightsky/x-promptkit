// skills/recall-evaluator/scripts/replay-matrix.mjs
//
// Provider-matrix replay helper for the recall-evaluator skill.
//
// This module turns a ".env"-style provider matrix (declared in YAML) into an
// ephemeral, in-process recall agent run. It is intentionally free of local
// state: nothing is written to disk, no clean-up step is required, and the
// clean-context policy is sourced from the upstream carrier-adapter so the
// replay path and the live recall path stay in lock-step. Any reusable scoring
// or carrier strategy belongs upstream in the shared runtime, not here.

import { readFileSync } from "node:fs"
import { parse as parseYaml } from "yaml"
import {
	SUBAGENT_CARRIER,
	DEFAULT_CLEAN_CONTEXT_POLICY,
} from "./carrier-adapter.mjs"

export const DEFAULT_REPLAY_MATRIX_PATH =
	"skills/recall-evaluator/.recall-replay.env.yaml"
export const DEFAULT_REPLAY_MATRIX_ENV = "RECALL_REPLAY_MATRIX"

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

// Parse a provider-matrix YAML string into a normalized matrix object. Provider
// entries inherit the top-level defaults so callers always see resolved values.
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

// Resolve the matrix path (explicit > env var > default) and parse it. The file
// reader is injectable so tests never touch the real filesystem.
export function loadReplayMatrix(options = {}) {
	const {
		path,
		env = process.env,
		fileReader = (target) => readFileSync(target, "utf8"),
	} = options
	const resolved =
		path ?? env[DEFAULT_REPLAY_MATRIX_ENV] ?? DEFAULT_REPLAY_MATRIX_PATH
	const text = fileReader(resolved)
	return { path: resolved, matrix: parseReplayMatrix(text) }
}

// Structural validation. Returns { ok, errors } rather than throwing so callers
// can surface every problem at once.
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

// Pick providers that are enabled AND reachable. Real providers need their
// key_env (or an inline echo key) present, which is what makes the token suite
// self-skip when no credentials are configured.
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

// Build the system/user messages for one recall case. The clean-context policy
// is echoed in the system prompt and the recalled memory is the only allowed
// answer basis.
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

// Pull the echoed clean-context policy id out of a model response.
export function extractPolicyEcho(text) {
	if (typeof text !== "string") {
		return null
	}
	const match = text.match(/policy:\s*(\S+)/)
	return match ? match[1] : null
}

// Dispatch one request to a provider. The echo backend short-circuits offline;
// real backends go through an injectable fetch implementation.
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

// Assemble an ephemeral in-process agent. It holds no persistent state; its
// run() answers a single recall case and the caller simply drops the reference
// when finished (no clean-up needed).
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

// A tiny built-in recall queue used by both the offline unit test and the
// token suite. The must_not_include token is deliberately a synthetic string
// (not a number like "80") so it cannot collide with answer content.
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
