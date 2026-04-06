# case-03-explicit-mode-override

## Target Layer

`isolated-context-run`

## Input

Use `skills/isolated-context-run/SKILL.md`.

Reply to this request:

"Use isolated execution with mode=codex-exec. Assume the current host session already has native subagent capability."

## Execution Constraints

- return only the final section-structured answer
- treat `mode=codex-exec` as a direct override
- keep `Default Priority`
- do not reinterpret `mode=codex-exec` as `self-cli`
