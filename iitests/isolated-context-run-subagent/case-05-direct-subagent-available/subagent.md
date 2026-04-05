# case-05-direct-subagent-available

## Target Layer

`isolated-context-run:subagent`

## Input

Use `skills/isolated-context-run-subagent/SKILL.md`.

Reply to this request:

"Directly use isolated-context-run:subagent for this task. The current host session already exposes native subagent capability."

## Execution Constraints

- return only the final section-structured answer
- do not reopen parent-level runner comparison
- do not map anything to `self-cli`
- stay inside the current host session
- report the selected runner as `subagent`
