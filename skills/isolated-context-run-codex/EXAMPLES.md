# Isolated Context Run: Codex Examples

This file is the companion corpus for [SKILL.md](./SKILL.md).

The Codex child layer always preserves the shared 5-section skeleton:

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`

Use `Execution Template`, `Failure Detail`, or `Install Guidance` only when the scenario needs them.

## Case 01: 父层默认路由到 Codex 子层

标准输出样例：

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`
- evidence: `codex exec --help -> contains "--json"`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:codex`

Why
The parent frontdoor already chose the Codex host path after `subagent` was unavailable, so this child layer keeps the public runner identity stable and leaves backend execution details to the runner scripts.

Override
`selected by parent frontdoor`
```

## Case 02: 显式 `mode=codex-exec`

标准输出样例：

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:codex`

Why
This is an explicit override. The caller named `mode=codex-exec`, so the public runner stays `isolated-context-run:codex` while the backend remains a Codex implementation detail.

Override
`mode=codex-exec`
```

## Case 03: 直接调用 Codex 子层

标准输出样例：

```md
Available Runners
- `self-cli`: available
- evidence: `codex --version -> codex 1.2.3`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:codex`

Why
This is a direct sublayer invocation, so the child layer executes only the Codex-host path and does not reopen parent-level runner comparison.

Override
`direct sublayer invocation`
```

## Case 04: Codex 不可用

标准输出样例：

```md
Available Runners
- `self-cli`: unavailable
- evidence: `command -v codex -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The Codex CLI is missing in the current environment, so the Codex child layer is unavailable.

Override
`direct sublayer invocation`

Install Guidance
- missing command: `codex`
- next action: install the Codex CLI, then rerun the same request
```

## Case 05: Codex 运行后环境失败

标准输出样例：

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`
- evidence: `codex exec --help -> contains "--json"`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:codex`

Why
The Codex runner exists, but execution failed after startup. This is an environment failure, not `unavailable`.

Override
`selected by parent frontdoor`

Failure Detail
- class: `authentication failure`
- evidence: `codex exec --json "<task prompt>" -> 401 unauthorized`
- next action: refresh Codex auth and rerun the same request
```
