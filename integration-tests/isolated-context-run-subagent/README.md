# isolated-context-run-subagent integration-tests

Overview: see [../README.md](../README.md). This directory is the Markdown case integration-test variant for the `isolated-context-run` parent layer and the `isolated-context-run:subagent` child layer.

This directory stores independent Markdown-based integration-tests for the `isolated-context-run` parent layer and the `isolated-context-run:subagent` child layer.

These files do not depend on `recall-eval` and follow the repo-root `integration-tests/` convention.

## Purpose

- keep one directory per scenario
- let the main agent build one subagent request from each case-local `subagent.md`
- let the main agent read the subagent result and assert against the paired `main-agent-assert.md`
- default to the minimal prompt that can still produce the required structure

## Execution Protocol

For every `case-*` directory in this directory:

1. Read `subagent.md`.
2. Extract the content under `## Input`.
3. Extract the content under `## Execution Constraints`.
4. Build one subagent request by sending `## Input` first and appending `## Execution Constraints` as additional execution rules.
5. Use a subagent to execute that combined request.
6. Wait for the subagent run to finish.
7. Read the completed subagent response as plain text.
8. Read `main-agent-assert.md`.
9. Assert the response against:
   - `## Assert Must Include`
   - `## Assert Must Not Include`
   - `## Assert Notes`

Example:

- read `integration-tests/isolated-context-run-subagent/case-01-default-route-to-sublayer/subagent.md`
- send its `## Input` plus its `## Execution Constraints` to a subagent
- wait for that subagent to finish
- validate the returned text with `integration-tests/isolated-context-run-subagent/case-01-default-route-to-sublayer/main-agent-assert.md`

Do not send the whole `subagent.md` file as-is.
Do not omit `## Execution Constraints`.
Do not send `main-agent-assert.md` to the subagent.
Do not merge the assert file into the execution request.
Do not accept prefaces, test summaries, or next-step summaries when a case requires the final section structure.

## Assert Matching Rules

- every item under `## Assert Must Include` is a literal fragment that must appear in the subagent result
- every item under `## Assert Must Not Include` is a literal fragment that must not appear in the subagent result
- when line breaks matter, represent the fragment with escaped newlines such as `Selected Runner\n\`subagent\``
- `## Assert Notes` may clarify matching intent, but it does not weaken `Must Include` or `Must Not Include`
- `Default Priority` is part of the shared output skeleton; do not fail a case just because that section contains fallback runner names required by the skill contract
- for child-layer cases, only treat `self-cli` as a failure when it appears as an actual selected runner, actual execution mapping, or an incorrect remediation path

## Prompt Tuning Policy

- try the smallest prompt that can produce the required section structure
- if a case returns explanatory text, coverage text, or a meta-summary, tighten only the missing constraint
- if a case still fails after a minimal pass and one targeted tightening pass, mark it `prompt unresolved`

## Case Directory Contract

Each case directory must contain exactly these files:

- `subagent.md`
- `main-agent-assert.md`

`subagent.md` must use these sections:

- `# Case ID`
- `## Target Layer`
- `## Input`
- `## Execution Constraints`

`main-agent-assert.md` must use these sections:

- `# Case ID`
- `## Purpose`
- `## Environment Assumptions`
- `## Assert Must Include`
- `## Assert Must Not Include`
- `## Assert Notes`

## Cases

- `case-01-default-route-to-sublayer`: 父层默认路由到 `isolated-context-run:subagent`
- `case-02-self-cli-explicit`: 显式 `self-cli` 请求不再走默认链
- `case-03-explicit-mode-override`: 显式 `mode=codex-exec` 直接覆盖默认选择
- `case-04-missing-command-install-guidance`: 缺命令时给 `Install Guidance`
- `case-05-direct-subagent-available`: 子层直接调用且 native subagent 可用
- `case-06-direct-subagent-unavailable-or-env-failure`: 子层 unavailable 与 environment failure 双场景

## Non-Goals

- not the schema source of truth
- not a runner implementation
- not a replacement for `skills/isolated-context-run/EXAMPLES.md`
- not a replacement for `skills/isolated-context-run-subagent/EXAMPLES.md`
