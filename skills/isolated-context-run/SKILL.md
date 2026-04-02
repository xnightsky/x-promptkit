---
name: isolated-context-run
description: Use when the user asks to run a task in an isolated context, compare isolated runners, or choose between subagent and current-CLI non-interactive execution
---

# Isolated Context Run

## Overview

Choose an isolated runner by probing what the current environment can actually do, then report the choice in a fixed structure with evidence.

Default selection is only for normal runners. Keep advanced strategies visible but out of the default path.

Use [EXAMPLES.md](/data/projects/x-promptkit/skills/isolated-context-run/EXAMPLES.md) as the pressure corpus for canonical prompts, outputs, and anti-patterns.

## Runner Model

### Normal runners

- `subagent`: use the host's native subagent mechanism when it exists.
- `self-cli`: use the current host CLI's non-interactive entrypoint.

### Advanced runner

- `subagent-wrapper-cli`: launch a wrapper CLI from inside a subagent. This is advanced and optional. Never include it in the default selection chain.

### Explicit runner ids

- `codex-exec`
- `claude-p`
- `opencode-run`

These are direct runner ids for explicit `mode=` overrides. They are not aliases for default auto-selection.

## Default Priority

For normal auto-selection, use this order only:

`subagent -> self-cli`

Rules:

- Probe availability before announcing a runner.
- If `subagent` is available, select it by default.
- If `subagent` is unavailable, explain the downgrade and select `self-cli` when its non-interactive entry exists.
- Do not insert `subagent-wrapper-cli` into the default chain.
- Do not jump straight to `codex exec`, `claude -p`, or `opencode run` unless the user explicitly requested a concrete mode or `self-cli`.

## Availability And Probe Rules

Only mark a runner `available` when there is concrete evidence from the current environment.

### `subagent`

Evidence should come from the host environment exposing a native subagent capability, such as:

- subagent tool present in the current host
- host help or docs explicitly listing subagent support

If that capability is absent, mark `subagent` as `unavailable`.

### `self-cli`

`self-cli` means "the current host CLI's non-interactive entrypoint", not a fixed binary.

Map it by host:

- Codex host -> `codex exec`
- Claude host -> `claude -p`
- OpenCode host -> `opencode run`

Evidence should come from host identification or help probing, such as:

- `command -v codex -> /usr/bin/codex`
- `codex --help -> contains "exec        Run Codex non-interactively"`
- `claude --help -> contains "-p"`
- `opencode --help -> contains "run"`

Do not claim `self-cli` without showing how the host was identified.

## Override Rules

If the caller explicitly sets a `mode`, that override wins.

Rules:

- Treat `mode` as a caller-provided override, not as a hint.
- When `mode=codex-exec`, `mode=claude-p`, or `mode=opencode-run` is present, select that runner directly.
- Do not re-run default priority selection after an explicit mode is present.
- Do not reinterpret explicit runner ids as "keep auto-detecting the host".
- If the explicit mode differs from the default winner, state that it overrides the default chain.

Distinguish these two cases:

- `self-cli`: map to the current host's non-interactive entrypoint.
- explicit runner id: directly select the named runner.

## Failure Taxonomy

Do not collapse all failures into `unavailable`.

### `unavailable`

Use only when the capability does not exist in the current environment, for example:

- `command not found`
- help output shows no matching non-interactive subcommand
- host exposes no subagent capability

### environment failure

Use when the capability exists but the current environment cannot complete execution, for example:

- authentication failure
- network failure
- provider failure
- sandbox denial

In these cases, say the runner exists but failed in the current environment. Do not rewrite that as a skill-definition problem.

## Missing Command Remediation

When a normal runner is `unavailable` because its command is missing, name the missing command and give the user the next installation action.

Rules:

- Report the exact missing command from the probe result.
- Prefer official install docs or the official install command.
- Keep installation guidance separate from runner selection.
- Do not rewrite an auth or network problem as an install problem.

Minimum mapping:

- missing Claude host CLI -> install `claude`
- missing OpenCode host CLI -> install `opencode`
- missing Codex host CLI -> install `codex`

Use compact wording:

`missing command: claude`

`next action: install Claude Code CLI, then re-run the probe`

## Output Format

Always answer runner selection in this fixed 5-part structure:

### Available Runners

List normal runners first. Include evidence lines in compact form:

`probe action -> result`

### Default Priority

Always state:

`subagent -> self-cli`

If advanced view is requested, list `subagent-wrapper-cli` separately as advanced/optional, not inside the default chain.

### Selected Runner

State the selected runner and, when relevant, the resolved command.

Examples:

- `subagent`
- `self-cli -> codex exec`
- `mode=opencode-run -> opencode run`

### Why

State why this runner was selected:

- default winner because higher-priority runner is available
- downgraded because higher-priority runner is unavailable
- explicit override from caller

### Override

State one of:

- `none`
- `self-cli requested explicitly`
- `mode=codex-exec`
- `mode=claude-p`
- `mode=opencode-run`

## Response Rules By User Intent

### "Run in isolated context" or "give me an isolated execution plan"

- list available normal runners
- apply default priority
- show at least one concrete evidence line
- explain downgrade if `subagent` is unavailable

### "List all isolated context options"

- default view: show only normal runners
- advanced view: additionally show `subagent-wrapper-cli` labeled advanced/optional

### "Do not use subagent, use current CLI non-interactive"

- select `self-cli`
- map it to the current host
- show the host-identification or help-probe evidence
- include a minimal command template

### explicit `mode=...`

- treat as direct override
- select the named runner even if it is not the default winner
- say the override came from the caller

### "Does this count as unavailable?"

- classify missing capability as `unavailable`
- classify auth/network/provider/sandbox breakage as environment failure with capability still present

### "What command is missing?" or "guide me to install it"

- identify the missing command from probe evidence
- state whether it blocks `subagent`, `self-cli`, or an explicit runner
- give one concrete next install action
- say to re-run the same probe after installation

### "Provide a default carrier for recall-eval"

- when the current environment has `subagent`, set the default carrier to `isolated-context-run:subagent`
- describe it as the default carrier for `recall-eval`, not as a universal rule for every task
- if the caller explicitly names another carrier, state that the default is overridden

## Minimal Templates

### Default selection template

```md
Available Runners
- `subagent`: available | unavailable
- evidence: `probe action -> result`
- `self-cli`: available | unavailable
- evidence: `probe action -> result`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
Higher-priority normal runner is available, so default selection stops there.

Override
`none`
```

### missing-command remediation template

```md
Available Runners
- `self-cli`: unavailable
- evidence: `command -v claude -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The capability is unavailable because the required command is missing.

Override
`none`

Install Guidance
- missing command: `claude`
- next action: install Claude Code CLI, then re-run `command -v claude` and `claude --help`
```

### `self-cli` template

```md
Available Runners
- `self-cli`: available
- evidence: `host probe -> current host is Codex`
- evidence: `codex --help -> contains "exec        Run Codex non-interactively"`

Default Priority
`subagent -> self-cli`

Selected Runner
`self-cli -> codex exec`

Why
Caller explicitly requested `self-cli`, so host mapping is used instead of default runner selection.

Override
`self-cli requested explicitly`
```

### explicit mode template

```md
Available Runners
- `subagent`: available
- evidence: `probe action -> result`
- `self-cli`: available
- evidence: `probe action -> result`

Default Priority
`subagent -> self-cli`

Selected Runner
`mode=codex-exec -> codex exec`

Why
Caller explicitly overrode the default runner. Explicit runner ids are outside the default fallback chain.

Override
`mode=codex-exec`
```

### `recall-eval` default-carrier template

```md
Available Runners
- `subagent`: available
- evidence: `host subagent capability probe -> present`
- `self-cli`: available
- evidence: `probe action -> result`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:subagent`

Why
`recall-eval` uses `subagent` as its default execution carrier when that capability exists. This default can still be overridden by the caller.

Override
`none`
```
