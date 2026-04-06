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

Cases in this directory should assert:

- public `Selected Runner` stays `isolated-context-run:codex`
- Codex backend details stay inside `Why`, `Execution Template`, or `Failure Detail`
- parent-routed and direct-sublayer override semantics remain distinct
