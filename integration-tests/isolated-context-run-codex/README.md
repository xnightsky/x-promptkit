# isolated-context-run-codex integration-tests

Overview: see [../README.md](../README.md). This directory is the Markdown case integration-test variant for parent-routed and direct child-layer Codex scenarios.

This directory stores Markdown-based integration-tests for the `isolated-context-run` frontdoor when it routes into the dedicated Codex sublayer, plus direct child-layer Codex scenarios.

Each case follows the same two-file contract as the existing subagent integration-tests:

- `subagent.md`
- `main-agent-assert.md`

The main agent should:

1. read the case-local `subagent.md`
2. build one request from `## Input` plus `## Execution Constraints`
3. execute it in an isolated agent run
4. assert the plain-text result against `main-agent-assert.md`

Execution constraints:

- do not send the whole `subagent.md` file as-is
- do not omit `## Execution Constraints`
- do not send `main-agent-assert.md` to the executing agent
- do not place main-agent-only validation rationale, maintainer-side calculation rules, or other assertion-only notes inside `subagent.md`; keep those in `main-agent-assert.md`, usually under `## Assert Notes`
- when executed through an isolated Codex runner, mount only the minimum skill allowlist for the case
- direct child-layer Codex cases should mount only `isolated-context-run:codex`
- parent-route cases should mount only `isolated-context-run` plus `isolated-context-run:codex`
- do not co-mount unrelated repo skills unless the case explicitly tests visibility boundaries

Cases in this directory should assert:

- public `Selected Runner` stays `isolated-context-run:codex`
- Codex backend details stay inside `Why`, `Execution Template`, or `Failure Detail`
- parent-routed and direct-sublayer override semantics remain distinct
