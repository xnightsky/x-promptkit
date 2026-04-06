# case-02-self-cli-explicit

## Target Layer

`isolated-context-run`

## Input

Use `skills/isolated-context-run/SKILL.md`.

Reply to this request:

"Do not use subagent. Use the current CLI non-interactive runner."

## Execution Constraints

- return only the final section-structured answer
- treat `self-cli` as an explicit caller request
- map `self-cli` to the current host's non-interactive entrypoint
- include `Execution Template`
