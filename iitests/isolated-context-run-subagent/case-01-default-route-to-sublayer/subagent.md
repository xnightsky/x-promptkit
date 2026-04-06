# case-01-default-route-to-sublayer

## Target Layer

`isolated-context-run`

## Input

You are validating the skill contract in `skills/isolated-context-run/SKILL.md`.

Answer the following request using the skill's required result structure:

"Run this task in an isolated context. The current host session already exposes native subagent capability, and the current host CLI also has a non-interactive entrypoint. No explicit mode override is provided."

## Execution Constraints

- follow the parent skill's output contract
- keep the default priority as defined by the skill
- if native subagent capability is available in the current host session, route the selected runner to `isolated-context-run:subagent`
- do not expand child-layer delegation internals
- do not rewrite the selection into `codex exec`, `claude -p`, or `opencode run`
