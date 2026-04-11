---
name: isolated-context-run:subagent
description: Use when the current host session already exposes native subagent capability and isolated work must stay inside that native subagent path instead of re-entering another CLI
---

# Isolated Context Run: Subagent

## Overview

This child skill handles only the native subagent path selected under `isolated-context-run`.

Its job is narrow: verify native subagent capability in the current host session, delegate through that path, classify subagent-specific failure, and normalize the result into the shared 5-section skeleton. Keep concrete cases in [EXAMPLES.md](./EXAMPLES.md).

## Scope

This skill owns:

- probing native subagent capability in the current host session
- delegating through that native path
- classifying subagent-specific failure
- preserving the shared output skeleton

This skill does not own:

- parent-level runner comparison
- `self-cli` mapping
- install guidance for other runners
- any external CLI or protocol re-entry path

## Hard Boundary

Stay inside the current host session.

Do not:

- shell out to `codex exec`
- shell out to `claude -p`
- shell out to `opencode run`
- launch `codex app-server`
- reopen parent fallback logic
- silently downgrade to `self-cli`
- infer parent-only runner choice, fallback, or maintainer-side validation rules from other visible repo skills

If native subagent capability is absent, report `unavailable` and stop. Let the parent layer decide any fallback.

## Availability And Failure

Mark this carrier `available` only from concrete evidence that the current host session exposes native subagent capability.

Acceptable evidence includes:

- native subagent tool present in the session
- host collaboration primitives present in the session
- already-loaded host docs/help showing native subagent support

Do not treat the existence of `codex`, `claude`, or other shell commands as evidence for this child skill.

Failure taxonomy:

- `unavailable`: native subagent capability is absent
- `environment failure`: native subagent capability exists, but delegation fails after startup because of auth, network, provider, or sandbox conditions

Do not rewrite environment failures as install problems, `unavailable`, or `self-cli` issues.

## Output Contract

Use the same 5 sections as the parent skill:

1. `Available Runners`
2. `Default Priority`
3. `Selected Runner`
4. `Why`
5. `Override`

Canonical literals:

- `Default Priority`: `subagent -> self-cli`
- `Selected Runner`: `subagent` or `No runnable selection from this probe.`
- `Override`: `none` | `selected by parent frontdoor` | `direct sublayer invocation`

Optional extension block:

- `Failure Detail`

Do not emit `Execution Template` or `Install Guidance` from this child skill.

## Invocation Rules

Direct invocation:

- probe only native subagent support in the current host session
- if available, delegate through the native path
- if unavailable, stop with `No runnable selection from this probe.`
- set `Override` to `direct sublayer invocation`

Parent-routed invocation:

- do not reopen runner comparison
- keep execution inside the current host session
- set `Override` to `selected by parent frontdoor`

If the caller provides capability facts, failure state, or scenario labels, treat them as authoritative input for normalization.

## Restrictions

- Do not convert native subagent work into external CLI execution.
- Do not compare `self-cli` again inside this child layer.
- Even if sibling or parent repo skills are visible in the mounted skill view, only use this skill contract plus caller-provided facts.
- Do not include startup-trace wording unless the caller explicitly asks for it.
- Use [EXAMPLES.md](./EXAMPLES.md) for canonical cases and wording.
