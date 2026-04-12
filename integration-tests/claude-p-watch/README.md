# claude-p-watch integration-tests

Overview: see [../README.md](../README.md). This directory stores Markdown case assets for `claude-p-watch` user-facing watch behavior and state-reporting rules.

These cases complement the Node integration tests:

- Node tests keep runtime helpers honest for PID discovery and tail capture.
- Markdown cases keep the skill contract honest for launch wording, empty-tail handling, liveness wording, and user-facing state rechecks.

## Purpose

- keep one directory per scenario
- let the main agent exercise one watched `claude -p` request per case
- let the main agent compare the resulting user-facing text with the paired assert file
- keep watch wording stable when runtime evidence is partial

## Execution Protocol

For every `case-*` directory in this directory:

1. Read `subagent.md`.
2. Extract the content under `## Input`.
3. Extract the content under `## Execution Constraints`.
4. Build one execution request by sending `## Input` first and appending `## Execution Constraints` as additional execution rules.
5. Run that request through a subagent in an environment where the `claude-p-watch` skill is available.
6. Read the completed response as plain text.
7. Read `main-agent-assert.md`.
8. Assert the response against:
   - `## Assert Must Include`
   - `## Assert Must Not Include`
   - `## Assert Notes`

Do not send the whole `subagent.md` file as-is.
Do not omit `## Execution Constraints`.
Do not send `main-agent-assert.md` to the executing agent.
Do use a subagent carrier for these Markdown cases; that is sufficient for this directory.
Do not introduce `isolated-context-run:codex` or another extra carrier layer unless a future case explicitly tests that wiring.
Do not accept wording that collapses prompt markers, PID state, and session state into one undifferentiated status.
Do not place main-agent-only validation rationale, watch-count math, or maintainer-side calculation rules inside `subagent.md`; keep those in `main-agent-assert.md`, usually under `## Assert Notes`.

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

- `case-01-direct-for-loop-outer-watch`: 用户要求直接跑一个有限自增 `for` 循环时，必须按单条 `claude -p` 执行，并把 `20` 轮、`10` 秒、`200` 秒这些足够覆盖 3 次 watch 的参数明确说出来
- `case-02-runtime-owns-liveness`: 判活归 runtime 证据，不把 prompt marker 当宿主进程存活证据
- `case-03-both-fds-non-seekable-state-recheck`: `fd1` 和 `fd2` 都 non-seekable 时返回 empty reason，同时单独做状态复核
- `case-04-session-returned-then-pid-recheck`: session 已返回后，立即做一次短暂运行态复核再下结论
- `case-05-watch-establishment-failure`: 当前 harness 不能可靠建立 watch 时，必须显式说明 watch 未建立
- `case-06-fallback-limitation-disclosure`: fallback / 无高级 runtime 证据时，必须显式披露能力边界

## Non-Goals

- not a runtime implementation
- not a replacement for `skills/claude-p-watch/SKILL.md`
- not a replacement for `skills/claude-p-watch/EXAMPLES.md`
