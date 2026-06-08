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

## Invocation Decision

Use this fixed decision order before writing `Override`:

1. If the caller explicitly says the parent frontdoor already selected this child layer, treat it as parent-routed invocation.
2. If the caller directly names `isolated-context-run:subagent` or asks whether the current host session can run native subagent work, treat it as direct invocation.
3. If both appear in the same prompt, prefer the explicit parent-routing fact.

Canonical mapping:

- direct invocation -> `Override: direct sublayer invocation`
- parent-routed invocation -> `Override: selected by parent frontdoor`

Never emit `Override: none` from this child skill.

## Probe Rubric

Use one compact native-session probe rubric everywhere:

- `native subagent capability probe -> present`
- `native subagent capability probe -> absent`
- `native subagent delegation probe -> started`
- `native subagent delegation probe -> failed after startup`

Accept authoritative caller facts in place of a fresh probe, but normalize them back into the same probe wording.

Probe only these questions:

- does the current host session expose native subagent capability
- did native delegation fail before startup or after startup

Do not mix parent-only evidence such as `codex --help`, `claude -p`, or `opencode run` into this child-layer probe block.

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

Subclasses for maintainer accounting:

- `rate_limited`: upstream returns `429` or equivalent quota / rate-limit wording
- `bridge_stream_closed`: bridge EOF, broken pipe, stream closed, or transport cut after delegation starts
- `thread_limit`: host reports subagent / thread concurrency limit reached
- `environment_failure`: other post-startup environment failures

Default retry budget at the main-agent layer:

- `rate_limited`: retry the same native subagent path up to 2 more times
- `bridge_stream_closed`: retry the same native subagent path once
- `thread_limit`: do not silently fallback; stop, record the saturation, and retry only after capacity is freed
- `environment_failure`: no automatic retry unless the caller gives a host-specific reason

If a retry budget is exhausted, keep the final status as `environment failure` and preserve the subclass in `Failure Detail`.

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
- `Override`: `selected by parent frontdoor` | `direct sublayer invocation`

Optional extension block:

- `Failure Detail`

When `Failure Detail` is present, use this fixed field order:

- `class`
- `subclass`
- `evidence`
- `retry`
- `next action`

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

Live recall or memory-eval style requests:

- if the caller already supplies a clean-context execution policy, preserve it verbatim
- otherwise state that native delegation must stay memory-only: no tools, no web search, no repo reads
- keep that constraint in `Why` or `Failure Detail`; do not reopen parent runner routing to enforce it

## Restrictions

- Do not convert native subagent work into external CLI execution.
- Do not compare `self-cli` again inside this child layer.
- Even if sibling or parent repo skills are visible in the mounted skill view, only use this skill contract plus caller-provided facts.
- Do not include startup-trace wording unless the caller explicitly asks for it.
- Use [EXAMPLES.md](./EXAMPLES.md) for canonical cases and wording.
