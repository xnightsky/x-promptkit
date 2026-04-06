# case-01-parent-route-to-codex

## Target Layer

`isolated-context-run`

## Input

Use `skills/isolated-context-run/SKILL.md`.

Reply to this request:

"Run this task in an isolated context. The current host is Codex. The current host session does not expose native subagent capability, but the Codex non-interactive path is available."

## Execution Constraints

- return only the final section-structured answer
- keep the parent skill's 5-section skeleton
- route the Codex host path to `isolated-context-run:codex`
- do not expose `codex exec` as the public selected runner
