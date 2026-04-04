---
name: isolated-context-run
description: Use when the user asks to run a task in an isolated context, compare isolated runners, or choose between subagent and current-CLI non-interactive execution
---

# Isolated Context Run

## Overview

Choose an isolated runner by probing what the current environment can actually do, then report the choice in a core 5-section structure with optional extension blocks.

Default selection is only for normal runners. Keep advanced strategies visible but out of the default path.

Use [EXAMPLES.md](./EXAMPLES.md) as the pressure corpus for canonical prompts, outputs, and anti-patterns.

This skill is the parent frontdoor. It owns runner comparison, default priority, override interpretation, and the shared output skeleton.

When the current host session exposes native subagent capability, route subagent execution to [isolated-context-run:subagent](../isolated-context-run-subagent/SKILL.md) instead of expanding carrier-specific execution details in the parent layer.

## Runner Model

### Normal runners

- `subagent`: use the host's native subagent mechanism when it exists. In this repository, the execution details for that path belong to `isolated-context-run:subagent`.
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

## Parent Layer Boundary

The parent layer owns:

- runner comparison
- default priority
- override interpretation
- downgrade explanation
- the shared 5-section result skeleton

The parent layer does not own:

- native subagent delegation internals
- subagent-specific execution failure handling
- external protocol clients for subagent execution

When `subagent` wins in a host session that already exposes native subagent capability, select `isolated-context-run:subagent` as the dedicated carrier sublayer.

Keep `codex`, `claude`, and `opencode` as parent-internal minimal adapters for `self-cli` only. Do not prebuild them as independent child skills.

Only promote another carrier into its own child skill when it has clear independent evolution value beyond the parent layer's minimal adapter boundary.

## Availability And Probe Rules

Only mark a runner `available` when there is concrete evidence from the current environment.

### `subagent`

Evidence should come from the host environment exposing a native subagent capability, such as:

- subagent tool present in the current host
- host help or docs explicitly listing subagent support

When the current session itself is already the host CLI, prefer evidence from that session's native collaboration capability. Do not rewrite native-session subagent into `codex exec`, `claude -p`, `opencode run`, or any external re-entry path.

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

In these cases, say the runner exists but failed in the current environment. Do not rewrite that as a skill-definition problem, `unavailable`, or a missing-install problem.

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

Always answer runner selection in a core 5-section structure with optional extension blocks.

When the caller already provides environment facts, probe results, host identity, missing-command evidence, or explicit runner constraints, treat that information as authoritative input for the response. Do not override those given facts with contradictory live-session probing.

The core 5 sections are always required and stay in this order:

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
- `isolated-context-run:subagent`
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

These `Override` values are canonical literals. Reproduce them exactly. Do not paraphrase them into nearby wording such as "explicit self-cli", "manual override", or "default winner".

The canonical literal values in `Selected Runner`, `Override`, and optional extension block titles are part of the contract. Reuse the exact spellings shown in the templates when a scenario matches one of them.

Optional extension blocks may appear after `Override` when the scenario needs extra execution or remediation detail.

Use only the extension blocks that match the probe result:

- `Execution Template`: add when the caller explicitly wants a runnable command shape such as `self-cli`
- `Install Guidance`: add when a runner is `unavailable` because a required command is missing
- `Failure Detail`: add when the runner exists but failed due to auth, network, provider, or sandbox conditions

Treat `Install Guidance` and `Failure Detail` as mutually exclusive:

- missing capability or missing command -> `Install Guidance`
- capability exists but execution fails in the environment -> `Failure Detail`

Do not treat extension blocks as extra fixed sections. A response without matching extra detail should stop after `Override`.

## Response Rules By User Intent

### "Run in isolated context" or "give me an isolated execution plan"

- list available normal runners
- apply default priority
- show at least one concrete evidence line
- explain downgrade if `subagent` is unavailable
- when `subagent` wins because the current host session has native subagent capability, select `isolated-context-run:subagent`

### "List all isolated context options"

- default view: show only normal runners
- advanced view: additionally show `subagent-wrapper-cli` labeled advanced/optional

### "Do not use subagent, use current CLI non-interactive"

- select `self-cli`
- map it to the current host
- show the host-identification or help-probe evidence
- include an `Execution Template` block
- treat the caller's explicit `self-cli` request as authoritative even if live probing would otherwise favor `subagent`

### explicit `mode=...`

- treat as direct override
- select the named runner even if it is not the default winner
- say the override came from the caller
- preserve the exact override literal in `Override`
- include the literal word `explicit` somewhere in `Why`
- if the input already states the target runner or host assumptions, do not reopen host auto-detection to contradict them

### "Does this count as unavailable?"

- classify missing capability as `unavailable`
- classify auth/network/provider/sandbox breakage as environment failure with capability still present

### "What command is missing?" or "guide me to install it"

- identify the missing command from probe evidence
- state whether it blocks `subagent`, `self-cli`, or an explicit runner
- give one concrete next install action
- say to re-run the same probe after installation

## Canonical Templates

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
`isolated-context-run:subagent`

Why
Higher-priority normal runner is available, so default selection routes to the dedicated subagent sublayer instead of expanding execution details in the parent frontdoor.

Override
`none`
```

### missing-command remediation template

```md
Available Runners
- `subagent`: unavailable
- evidence: `host subagent capability probe -> absent`
- `self-cli`: unavailable
- evidence: `command -v codex -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The required `self-cli` command is missing in the current environment, so no runnable selection is available from this probe. This is `unavailable`, not an environment failure.

Override
`none`

Install Guidance
- missing command: `codex`
- next action: install Codex CLI, then re-run `command -v codex` and `codex --help`
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
This is an explicit override: caller explicitly requested `self-cli`, so host mapping is used instead of default runner selection.

Override
`self-cli requested explicitly`

Execution Template
`codex exec "<task prompt>"`
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
This is an explicit caller override. Even if `subagent` would win by default, explicit runner ids are outside the default fallback chain.

Override
`mode=codex-exec`
```

### environment-failure template

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`
- evidence: `codex exec --help -> exits 0`

Default Priority
`subagent -> self-cli`

Selected Runner
`self-cli -> codex exec`

Why
The runner exists in the current environment, but execution failed after startup. This is an environment failure, not `unavailable`.

Override
`self-cli requested explicitly`

Failure Detail
- class: `authentication failure`
- evidence: `codex exec "<task prompt>" -> 401 unauthorized`
- next action: refresh auth for `codex`, then re-run the same command
```
