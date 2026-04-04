---
name: isolated-context-run:subagent
description: Use when the current host session already has native subagent capability and the task should be delegated through that native subagent path instead of shelling out to another CLI process
---

# Isolated Context Run: Subagent

## Overview

This skill is the first-stage independent carrier sublayer for `isolated-context-run`.

It only applies when the current host session already exposes native subagent capability.

This sublayer is not a wrapper around `codex exec`, `claude -p`, `opencode run`, `codex app-server`, or any other external re-entry path. It delegates inside the current host session.

Use [EXAMPLES.md](./EXAMPLES.md) as the companion corpus for direct invocation, delegation boundaries, and failure classification.

## Scope

This sublayer only owns:

- probing whether the current host session exposes native subagent capability
- delegating the user task to that native subagent path
- classifying subagent-specific failures
- normalizing the result into the shared 5-section output skeleton

This sublayer does not own:

- parent-level runner comparison
- `self-cli` mapping
- command-install remediation for other runners
- external CLI re-entry or protocol clients

## Hard Boundary

When this skill is selected, stay inside the current host session.

Do not:

- shell out to `codex exec`
- shell out to `claude -p`
- shell out to `opencode run`
- launch `codex app-server`
- re-enter the host through another CLI or protocol bridge
- silently downgrade to `self-cli`

If the current host session lacks native subagent capability, report `unavailable` and let the parent layer decide whether another runner should be selected.

## Availability And Probe Rules

Mark this carrier `available` only when there is concrete evidence that the current host session exposes native subagent capability.

Acceptable evidence includes:

- native subagent tool exposed in the current host session
- host collaboration primitives exposed in the current session
- host docs or help already loaded into the current session showing native subagent support

If that capability is absent in the current host session, mark this carrier `unavailable`.

Do not treat the existence of `codex`, `claude`, or any other shell command as evidence for this sublayer.

## Execution Rules

When available:

1. keep the work in the current host session
2. delegate the task through the native subagent path
3. wait for the delegated work to finish
4. normalize the result without changing the shared output skeleton

When reporting a successful delegation, include compact evidence that the host actually used a subagent path.

Examples of compact evidence:

- `native subagent delegation -> started`
- `native subagent delegation -> completed`
- `child agent path -> present`

## Failure Taxonomy

### `unavailable`

Use only when the current host session does not expose native subagent capability.

Examples:

- no native subagent tool in the current host session
- no host collaboration primitives in the current host session
- current host docs/help show no native subagent support

### environment failure

Use when native subagent capability exists, but delegation fails after startup.

Examples:

- subagent delegation starts but the delegated run fails
- host rejects the delegated run because of auth, network, provider, or sandbox conditions
- the delegated path exists, but the environment blocks completion

Do not rewrite these failures as `unavailable`, install problems, or `self-cli` problems.

## Output Format

Use the same core 5-section structure as the parent skill:

If the caller already provides host-session facts, capability probe outcomes, failure state, or scenario labels, treat those facts as authoritative input for normalization. Do not contradict them with unrelated live-shell probing.

### Available Runners

List the subagent carrier and compact probe evidence.

### Default Priority

Always state:

`subagent -> self-cli`

This skill does not recompute parent routing. It only preserves the shared skeleton.
Keeping this shared skeleton does not authorize a second runner comparison. In direct sublayer invocation, do not reopen `self-cli`, external CLI mappings, or parent fallback logic.

### Selected Runner

State:

- `subagent`
- or `No runnable selection from this probe.`

### Why

State whether:

- the current host session exposes native subagent capability
- or the current host session lacks that capability
- or the capability exists but execution failed in the environment

### Override

State one of:

- `none`
- `selected by parent frontdoor`
- `direct sublayer invocation`

Use these as exact literals:

- direct caller asked for `isolated-context-run:subagent` -> `direct sublayer invocation`
- parent already routed into this child layer -> `selected by parent frontdoor`
- use `none` only when neither of the above applies

Optional extension block:

- `Failure Detail`

Use `Failure Detail` only when the subagent path exists but execution fails in the environment.

Do not emit `Execution Template` or `Install Guidance` from this sublayer.
Do not include startup-trace wording such as `native subagent delegation -> started` in the final normalized answer unless the caller explicitly asked for startup trace details. For failure classification, prefer the normalized evidence literal `native subagent delegation -> failed after startup`.

## Direct Invocation Rules

When the caller directly asks for `isolated-context-run:subagent`:

- do not reopen runner comparison
- do not map to `self-cli`
- probe only for native subagent support in the current host session
- if available, delegate through the native subagent path
- if unavailable, report `unavailable` and stop
- set `Override` to `direct sublayer invocation`

## Multi-Scenario Normalization

When the caller explicitly asks for more than one scenario in a single response:

- preserve the caller's scenario labels, such as `Scenario A` and `Scenario B`
- emit one complete normalized result block per scenario
- keep each scenario inside the child-layer contract
- do not merge the scenarios into one blended explanation block
- keep direct-invocation scenarios on `direct sublayer invocation` unless the caller explicitly says the parent already routed them here

## Canonical Templates

### direct-invocation available template

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The current host session exposes native subagent capability, so this sublayer can delegate without re-entering another CLI path.

Override
`direct sublayer invocation`
```

### parent-routed available template

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The parent frontdoor already selected this child layer, and the current host session exposes native subagent capability, so delegation stays inside the current host session.

Override
`selected by parent frontdoor`
```

### direct-invocation unavailable template

```md
Available Runners
- `subagent`: unavailable
- evidence: `native subagent capability probe -> absent`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The current host session does not expose native subagent capability, so this sublayer cannot run.

Override
`direct sublayer invocation`
```

### direct-invocation environment-failure template

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The current host session exposes native subagent capability, but the delegated run failed after startup. This is an environment failure, not `unavailable`.

Override
`direct sublayer invocation`

Failure Detail
- class: `environment failure`
- evidence: `native subagent delegation -> failed after startup`
- next action: inspect the delegated run failure in the current host session, then retry the same delegation path
```
