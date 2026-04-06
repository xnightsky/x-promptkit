---
name: isolated-context-run
description: Use when the user asks to run work in an isolated context, list isolated runners, or force a specific isolated runner such as subagent or the current host CLI's non-interactive mode
---

# Isolated Context Run

## Overview

Choose an isolated runner from concrete environment evidence, then answer with the shared 5-section skeleton.

This parent skill owns runner comparison, default priority, override handling, and downgrade explanation. Keep detailed prompt/output cases in [EXAMPLES.md](./EXAMPLES.md).

If the current host session already has native subagent capability, route that path to [isolated-context-run:subagent](../isolated-context-run-subagent/SKILL.md) instead of expanding subagent internals here.

If the selected host path is Codex, route that path to [isolated-context-run:codex](../isolated-context-run-codex/SKILL.md) instead of exposing `codex exec` as the public runner identity.

## Runner Model

Normal runners:

- `subagent`: native subagent capability exposed by the current host session
- `self-cli`: the current host CLI's non-interactive entrypoint

Advanced runner:

- `subagent-wrapper-cli`: optional strategy only; never part of default auto-selection

Explicit runner ids:

- `codex-exec`
- `claude-p`
- `opencode-run`

`self-cli` is host-relative:

- Codex host -> `codex exec`
- Claude host -> `claude -p`
- OpenCode host -> `opencode run`

## Selection Rules

Default priority is always:

`subagent -> self-cli`

Rules:

- Probe availability before announcing a runner.
- Mark a runner `available` only from concrete evidence in the current environment or authoritative facts already provided by the caller.
- If `subagent` is available, it wins by default.
- If `subagent` is unavailable and `self-cli` exists, explain the downgrade and select `self-cli`.
- Never insert `subagent-wrapper-cli` into the default chain.
- Do not jump straight to `claude -p` or `opencode run` unless the caller explicitly requested `self-cli` or an explicit `mode=...`.
- In a Codex host, parent-level selection still surfaces the public runner as `isolated-context-run:codex`.

When `subagent` wins in a host session with native subagent capability, select `isolated-context-run:subagent`.
When a Codex host path wins, select `isolated-context-run:codex`.

## Availability And Failure

Use compact probe evidence in the form:

`probe action -> result`

Availability:

- `subagent`: only when the current host session exposes native subagent capability
- `self-cli`: only when the current host can be identified and its non-interactive entrypoint is confirmed

Failure taxonomy:

- `unavailable`: capability does not exist in the current environment
- `environment failure`: capability exists, but auth, network, provider, or sandbox conditions block execution

Do not rewrite environment failures as `unavailable` or as install problems.

If a normal runner is unavailable because a command is missing, report the exact missing command and give one next install action. Keep install guidance separate from runner selection.

## Overrides

Caller overrides win.

- `self-cli` means "use the current host CLI's non-interactive entrypoint"
- `mode=codex-exec`, `mode=claude-p`, and `mode=opencode-run` are direct runner ids
- Once an explicit mode is present, do not re-run default selection
- If the override differs from the default winner, say so
- In `mode=...` scenarios, keep the literal word `explicit` in `Why`

## Output Contract

Always answer with these 5 sections in this order:

1. `Available Runners`
2. `Default Priority`
3. `Selected Runner`
4. `Why`
5. `Override`

Canonical literals:

- `Default Priority`: `subagent -> self-cli`
- `Override`: `none` | `self-cli requested explicitly` | `mode=codex-exec` | `mode=claude-p` | `mode=opencode-run`

Common `Selected Runner` literals:

- `subagent`
- `No runnable selection from this probe.`
- `isolated-context-run:codex`
- `self-cli -> claude -p`
- `self-cli -> opencode run`
- `isolated-context-run:subagent`
- `mode=claude-p -> claude -p`
- `mode=opencode-run -> opencode run`

Optional extension blocks after `Override`:

- `Execution Template`: when the caller wants a runnable command shape
- `Install Guidance`: when a runner is unavailable because a command is missing
- `Failure Detail`: when the runner exists but the environment blocks execution

`Install Guidance` and `Failure Detail` are mutually exclusive.

## Restrictions

- Do not contradict caller-provided host facts, probe results, or override constraints.
- Do not treat explicit runner ids as aliases for host auto-detection.
- Do not expand native subagent execution internals in this parent layer.
- Do not expose `codex exec` as the public selected runner; route Codex host work to `isolated-context-run:codex`.
- Do not silently downgrade from an explicit override.
- Use [EXAMPLES.md](./EXAMPLES.md) for canonical scenario shapes and anti-patterns.
