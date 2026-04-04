# case-06-direct-subagent-unavailable-or-env-failure

## Target Layer

`isolated-context-run:subagent`

## Input

You are validating the skill contract in `/data/projects/x-promptkit/skills/isolated-context-run-subagent/SKILL.md`.

Produce two short result blocks using the child-layer skill's required result structure.

Scenario A:
"Directly use isolated-context-run:subagent for this task, but the current host session does not expose native subagent capability."

Scenario B:
"Directly use isolated-context-run:subagent for this task. The current host session exposes native subagent capability, but the delegated run failed after startup."

## Execution Constraints

- keep both scenarios inside the child-layer contract
- for Scenario A, return no runnable selection from this probe
- for Scenario B, classify the failure as environment failure and include `Failure Detail`
- do not silently downgrade either scenario to `self-cli`
