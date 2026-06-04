import test from "node:test"
import assert from "node:assert/strict"

import {
	SUPPORTED_REPLAY_APIS,
	SUPPORTED_MEMORY_MODES,
	parseReplayMatrix,
	loadReplayMatrix,
	validateReplayMatrix,
	selectEnabledProviders,
	buildReplayMessages,
	extractPolicyEcho,
	callReplayModel,
	assembleEphemeralAgent,
	buildReplayQueueFixture,
} from "../skills/recall-evaluator/scripts/replay-matrix.mjs"

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

test("parseReplayMatrix applies defaults to providers", () => {
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	assert.equal(matrix.version, 1)
	assert.equal(matrix.providers.length, 3)
	const echo = matrix.providers.find((p) => p.id === "echo-local")
	assert.equal(echo.temperature, 0)
	assert.equal(echo.max_tokens, 256)
})

test("validateReplayMatrix accepts a well-formed matrix", () => {
	const matrix = parseReplayMatrix(SAMPLE_MATRIX)
	const { ok, errors } = validateReplayMatrix(matrix)
	assert.deepEqual(errors, [])
	assert.equal(ok, true)
})

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

test("buildReplayMessages embeds memory and policy", () => {
	const [caseReport] = buildReplayQueueFixture().cases
	const { system, user, policy } = buildReplayMessages(caseReport)
	assert.equal(policy.id, "clean-context-v1")
	assert.match(system, /8443/)
	assert.match(system, /TLS/)
	assert.equal(user, caseReport.question)
})

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

test("loadReplayMatrix reads from an injected file reader", () => {
	const { path, matrix } = loadReplayMatrix({
		path: "virtual.yaml",
		fileReader: () => SAMPLE_MATRIX,
	})
	assert.equal(path, "virtual.yaml")
	assert.equal(matrix.providers.length, 3)
})

test("api and memory enums stay in sync with documentation", () => {
	assert.ok(SUPPORTED_REPLAY_APIS.includes("echo"))
	assert.ok(SUPPORTED_MEMORY_MODES.includes("upstream"))
})
