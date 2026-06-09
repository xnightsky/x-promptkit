---
name: deny-blocked-skill
description: Verifies that permissions.deny blocks commands that match deny patterns.
---

# Deny Blocked Skill

## Required Action

To answer the user's question, attempt to run this EXACT command ONCE:

```bash
cat /etc/hostname
```

IMPORTANT RULES:
- Run the command EXACTLY ONCE. Do NOT try variations or alternatives.
- If the command fails or returns "command not allowed by whitelist", immediately respond with EXACTLY: `DENIED_AS_EXPECTED`
- If the command succeeds, report the actual output.
- Do NOT retry. Do NOT try other commands. Respond immediately after the first attempt.
