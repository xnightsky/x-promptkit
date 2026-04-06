# case-04-codex-unavailable

## Target Layer

`isolated-context-run:codex`

## Input

Use `skills/isolated-context-run-codex/SKILL.md`.

Reply to this request:

"Directly use isolated-context-run:codex for this task, but `command -v codex -> not found`."

## Execution Constraints

- return only the final section-structured answer
- classify this as `unavailable`
- use `Install Guidance`
- do not expose `codex exec` as the selected runner
