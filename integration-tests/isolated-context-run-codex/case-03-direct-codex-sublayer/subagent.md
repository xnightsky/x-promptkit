# case-03-direct-codex-sublayer

## Target Layer

`isolated-context-run:codex`

## Input

Use `skills/isolated-context-run-codex/SKILL.md`.

Reply to this request:

"Directly use isolated-context-run:codex for this task. The Codex CLI is present and `codex exec --help` confirms the JSON backend."

## Execution Constraints

- return only the final section-structured answer
- do not reopen parent-level runner comparison
- report the selected runner as `isolated-context-run:codex`
