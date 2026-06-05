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

// ───────────────────────────────────────────────────────────────────────────
// 离线单元测试:provider 矩阵回放助手
//
// 本套件全程离线:用 echo 后端 + 注入的 fetch / fileReader 覆盖
// 「矩阵解析 → 结构校验 → provider 选择 → 协议分发 → echo 打分」整条链路，
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

// 场景:枚举常量与文档保持同步
//   给定 导出的 API / memory 模式枚举
//   当   读取它们
//   那么 至少包含 echo 与 upstream
test("api and memory enums stay in sync with documentation", () => {
	assert.ok(SUPPORTED_REPLAY_APIS.includes("echo"))
	assert.ok(SUPPORTED_MEMORY_MODES.includes("upstream"))
})
