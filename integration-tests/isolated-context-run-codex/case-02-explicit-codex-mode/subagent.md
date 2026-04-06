# case-02-explicit-codex-mode

## Target Layer

`isolated-context-run`

## Input

Use `skills/isolated-context-run/SKILL.md`.

Reply to this request:

"Use isolated execution with mode=codex-exec. Assume the current host is Codex and the non-interactive path is available."

## Execution Constraints

- return only the final section-structured answer
- treat `mode=codex-exec` as an explicit override
- keep `Selected Runner` as `isolated-context-run:codex`
- keep the literal word `explicit` in `Why`
