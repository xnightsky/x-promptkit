---
name: claude-p
description: Use when the user explicitly wants a task wrapped as a single `claude -p` command, wants that command executed directly, or wants the current task handed off unchanged to an external Claude CLI non-interactive agent
interface:
  display_name: "Claude -p"
  short_description: "生成并执行单条 Claude -p 命令"
  default_prompt: "Use $claude-p to compose a precise claude -p command for the current task."
policy:
  allow_implicit_invocation: false
---

# Claude -p

## Overview

Construct exactly one `claude -p` command for the requested task. Keep the user's scope tight, preserve the original Chinese meaning, and add only the minimum escaping needed for a runnable shell command.

Use [EXAMPLES.md](./EXAMPLES.md) for canonical command shapes, execution-result summaries, and anti-patterns.

## Workflow

Process requests in this order:

1. Confirm the target working directory.
2. Compress the user's task into one goal.
3. Construct the command.
4. Apply only the required shell escaping.
5. Either return the command or execute it, depending on the user's request.

## Working Directory

- If the user already gave a directory, use it directly.
- Otherwise use the current repository directory.
- Keep the directory decision explicit in the command shape rather than implying it from prose.

## Task Compression

- Reduce the user request to a single goal.
- Do not broaden the scope.
- Do not add extra phases, extra stop conditions, or implementation suggestions the user did not ask for.
- When the user wants the current task handed off to an external agent, keep the task semantically unchanged apart from minimal compression needed to make it a single runnable instruction.

## Command Template

Default command template:

```bash
cd <workdir> && claude -p "<task>"
```

Rules:

- Keep the outer double quotes.
- If the user already provided a complete `claude -p` command, make only the minimum correction needed for quoting, escaping, or the working-directory prelude.
- Do not rewrite the task text just to make it look cleaner.
- Do not add any skill-loading prefix, slash-command syntax, or extra CLI flags unless the user explicitly asked for them.

## Shell Escaping

Apply only the minimum escaping needed for the command to survive shell parsing.

- Escape double quotes inside the task text as `\"`.
- Escape bare `$` inside the task text as `\$`.
- Do not rewrite the surrounding Chinese wording.
- Do not introduce extra quoting layers unless the existing command is otherwise invalid.

## Return Mode

If the user only asked for the command:

- return only the command
- do not add explanation

If the user asked to execute directly:

- run the command
- report only the key result
- do not dump intermediate polling noise unless the user asks for it

## Execution Observation Policy

Treat `claude -p` as a one-shot non-interactive command.

- After launch, the default report is a single "started" style update.
- If the host requires waiting to determine completion, use `600000 ms` by default.
- Automatic waiting must never use less than `300000 ms`.
- Without an explicit request for ongoing monitoring, auto-check at most once.
- After a timeout, stop polling unless the user asked for continued monitoring.
- With continued monitoring, use `600000 ms` intervals.
- Repeated "still running" or timeout updates should be emitted at most once every 30 minutes.
- Exit, crash, error, or a direct user request to inspect status should be reported immediately.

## Restrictions

- Do not automatically add skill-loading prefixes.
- Do not automatically add slash-command syntax.
- Do not automatically add extra CLI flags.
- Do not automatically add extra stop conditions.
- Do not automatically add implementation advice.
- Do not narrate every wait cycle back to the user.
- Do not silently expand a task into a multi-stage workflow.
