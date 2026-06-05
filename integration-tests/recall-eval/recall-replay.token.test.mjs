import test from "node:test"
import assert from "node:assert/strict"

import {
	loadReplayMatrix,
	validateReplayMatrix,
	selectEnabledProviders,
	assembleEphemeralAgent,
	buildReplayQueueFixture,
} from "../../skills/recall-evaluator/scripts/replay-matrix.mjs"

// ───────────────────────────────────────────────────────────────────────────
// Token 套件:provider 矩阵回放(需要真实密钥)
//
// 本套件刻意被排除在默认回归(`npm run iitest`)之外，只有显式执行
// `npm run iitest:token:recall-replay` 才会运行;即便运行，也会在「矩阵里没有
// 任何可达且带 key 的真实 provider」时自动跳过(self-skip)。
//
// 整个 agent 完全在进程内组装:读取矩阵 → 对每个启用的 provider 跑内置 recall
// fixture → 断言 clean-context 策略被回显 → 退出。全程不写磁盘、无需清理。
//
// 用例采用 BDD(场景 / 给定 / 当 / 那么)注释。
// ───────────────────────────────────────────────────────────────────────────

// 按 expected 给一条回答打分:命中禁止词→0;缺必备词→0;否则命中应含词→2，未命中→1。
function scoreAnswer(expected, answer) {
	const text = String(answer ?? "")
	const includesAll = (list) =>
		(list ?? []).every((needle) => text.includes(needle))
	const includesNone = (list) =>
		(list ?? []).every((needle) => !text.includes(needle))
	if (!includesNone(expected.must_not_include)) {
		return 0
	}
	if (!includesAll(expected.must_include)) {
		return 0
	}
	return includesAll(expected.should_include) ? 2 : 1
}

// 场景:provider 矩阵回放遵守 clean-context 策略
//   给定 一份可发现的 provider 矩阵(否则自动跳过)
//         且其中至少有一个启用、带 key 的真实(非 echo)provider(否则自动跳过)
//   当   用临时 agent 对内置 recall fixture 逐个 case 运行
//   那么 每个 provider 都回显 clean-context 策略 id，且对每个 case 打满分(2)
test("provider-matrix replay honours the clean-context policy", async (t) => {
	// 给定:尝试按「仓库根发现规则」加载矩阵;加载不到则视为未配置，直接跳过。
	let loaded
	try {
		loaded = loadReplayMatrix()
	} catch (error) {
		t.skip(`no provider matrix available: ${error.message}`)
		return
	}

	// 给定:矩阵结构必须合法。
	const { matrix } = loaded
	const { ok, errors } = validateReplayMatrix(matrix)
	assert.ok(ok, `invalid provider matrix: ${errors.join("; ")}`)

	// 给定:筛掉 echo，只保留启用且带 key 的真实 provider;一个都没有则跳过。
	const providers = selectEnabledProviders(matrix).filter(
		(provider) => provider.api !== "echo",
	)
	if (providers.length === 0) {
		t.skip("no token-bearing providers are enabled")
		return
	}

	const fixture = buildReplayQueueFixture()
	for (const provider of providers) {
		await t.test(`provider ${provider.id}`, async () => {
			// 当:用该 provider 组装临时 agent 并逐个 case 运行。
			const agent = assembleEphemeralAgent({ matrix, provider })
			for (const caseReport of fixture.cases) {
				const result = await agent.run(caseReport)
				// 那么:provider 必须回显 clean-context 策略 id。
				assert.equal(
					result.policyEcho,
					matrix.context_policy.id,
					"provider did not echo the clean-context policy id",
				)
				// 那么:回答必须命中必备事实并避开禁止词(满分 2)。
				const score = scoreAnswer(caseReport.expected, result.answer)
				assert.equal(
					score,
					2,
					`provider ${provider.id} scored ${score} on ${caseReport.id}`,
				)
			}
		})
	}
})
