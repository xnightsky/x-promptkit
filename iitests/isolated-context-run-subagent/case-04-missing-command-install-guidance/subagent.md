# case-04-missing-command-install-guidance

## Target Layer

`isolated-context-run`

## Input

Use `/data/projects/x-promptkit/skills/isolated-context-run/SKILL.md`.

Reply to this request:

"Run this task in an isolated context. The current host is Codex. The host does not expose native subagent capability. `command -v codex -> not found`."

## Execution Constraints

- return only the final section-structured answer
- use the missing-command remediation shape
- classify the missing-command state as `unavailable`
- keep install remediation separate from runner selection
- do not classify this as `environment failure`
