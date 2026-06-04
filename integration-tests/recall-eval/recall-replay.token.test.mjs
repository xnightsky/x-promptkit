import test from "node:test"
import assert from "node:assert/strict"

import {
	loadReplayMatrix,
	validateReplayMatrix,
	selectEnabledProviders,
	assembleEphemeralAgent,
	buildReplayQueueFixture,
} from "../../skills/recall-evaluator/scripts/replay-matrix.mjs"

// This suite is intentionally excluded from the default regression run
// (`npm run iitest`). It only executes when invoked explicitly via
// `npm run iitest:token:recall-replay`, and even then it self-skips unless the
// provider matrix declares at least one reachable, key-bearing provider.
//
// The agent is assembled entirely in-process: it reads the matrix, runs each
// enabled provider against the built-in recall fixture, asserts the clean
// context policy is echoed back, and exits. Nothing is written to disk and no
// clean-up step is required.

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

test("provider-matrix replay honours the clean-context policy", async (t) => {
	let loaded
	try {
		loaded = loadReplayMatrix()
	} catch (error) {
		t.skip(`no provider matrix available: ${error.message}`)
		return
	}

	const { matrix } = loaded
	const { ok, errors } = validateReplayMatrix(matrix)
	assert.ok(ok, `invalid provider matrix: ${errors.join("; ")}`)

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
			const agent = assembleEphemeralAgent({ matrix, provider })
			for (const caseReport of fixture.cases) {
				const result = await agent.run(caseReport)
				assert.equal(
					result.policyEcho,
					matrix.context_policy.id,
					"provider did not echo the clean-context policy id",
				)
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
