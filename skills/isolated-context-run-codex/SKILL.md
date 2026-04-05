---
name: isolated-context-run:codex
description: Use when isolated work must stay on the Codex host path, so probe, execution, trace, and failure normalization all stay behind the dedicated Codex sublayer
---

# Isolated Context Run: Codex

## Overview

This child skill handles only the Codex host path selected under `isolated-context-run`.

Its job is narrow: keep the external runner identity fixed as `isolated-context-run:codex`, explain how parent routing or direct invocation reached this sublayer, and leave backend execution details to the script layer.

The script/runtime side owns:

- `probe.mjs`
- `run-exec.mjs`
- clean-room preparation
- skill loading
- trace normalization
- failure normalization

## Scope

This skill owns:

- normalizing Codex-host selection into the shared 5-section skeleton
- preserving `isolated-context-run:codex` as the public runner identity
- explaining override semantics for parent-route, explicit-mode, and direct-sublayer entrypoints

This skill does not own:

- shelling out details for `codex exec --json`
- JSONL parsing
- artifact persistence
- clean-room policy implementation
- parent-level runner comparison

## Hard Boundary

Stay inside the Codex sublayer boundary.

Do not:

- rename the selected runner back to `self-cli -> codex exec`
- rename the selected runner to `mode=codex-exec -> codex exec`
- reopen `subagent -> self-cli` comparison inside this child layer
- treat backend names such as `exec-json` as the public runner identity

`codex exec --json` is an internal backend detail, not the external runner name.

## Availability And Failure

Mark this carrier `available` only from concrete Codex-host evidence, such as:

- `command -v codex`
- `codex --version`
- `codex exec --help`
- authoritative caller-provided Codex probe facts

Failure taxonomy:

- `unavailable`: Codex CLI or the requested backend does not exist in the current environment
- `environment failure`: Codex exists, but auth, network, provider, sandbox, approval, or process runtime blocks execution
- `contract failure`: Codex produced evidence, but the v0 contract cannot be normalized
- `runner misconfiguration`: the repository runner failed to prepare clean-room, workspace, or artifact prerequisites

Do not rewrite `environment failure` as install guidance.

## Output Contract

Use the same 5 sections as the parent skill:

1. `Available Runners`
2. `Default Priority`
3. `Selected Runner`
4. `Why`
5. `Override`

Canonical literals:

- `Default Priority`: `subagent -> self-cli`
- `Selected Runner`: `isolated-context-run:codex` or `No runnable selection from this probe.`
- `Override`: `selected by parent frontdoor` | `mode=codex-exec` | `direct sublayer invocation`

Optional extension blocks:

- `Execution Template`
- `Failure Detail`
- `Install Guidance`

Only use `Execution Template` when the caller explicitly wants a runnable Codex command shape.

## Invocation Rules

Parent-routed invocation:

- keep `Selected Runner` as `isolated-context-run:codex`
- set `Override` to `selected by parent frontdoor`
- explain that the parent already chose the Codex path

Explicit `mode=codex-exec`:

- keep `Selected Runner` as `isolated-context-run:codex`
- set `Override` to `mode=codex-exec`
- keep the literal word `explicit` in `Why`

Direct invocation:

- do not reopen parent comparison
- set `Override` to `direct sublayer invocation`

## Restrictions

- Do not expose backend details as the public selected runner.
- Do not silently downgrade to `self-cli`.
- Do not claim clean-room, trace, or skill-loading behavior that the script layer did not actually provide.
- Use [EXAMPLES.md](./EXAMPLES.md) for canonical wording.
