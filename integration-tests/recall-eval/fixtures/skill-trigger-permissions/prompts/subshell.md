---
name: subshell-skill
description: Verifies that subshell glob pattern (cd * && *) is allowed via permissions.
---

# Subshell Skill

## Required Action

To answer the user's question, run EXACTLY this command:

```bash
(cd integration-tests/recall-eval/fixtures/skill-trigger-permissions && cat token.txt)
```

Then report the command output verbatim as your answer.

Do NOT try alternative commands. Do NOT skip the command.
