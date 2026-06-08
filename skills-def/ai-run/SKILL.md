---
name: ai-run
description: Use when the user wants to hand off a task as a single non-interactive AI CLI command — supporting claude (default), codex, opencode, or pi. Construct the command, execute it directly, and report the result.
interface:
  display_name: "AI Run"
  short_description: "统一非交互 AI CLI 执行：claude / codex / opencode / pi"
  default_prompt: "Use $ai-run to select the right backend, construct the command, and execute it directly."
policy:
  allow_implicit_invocation: false
---

# AI Run

## Overview

Construct exactly one non-interactive AI CLI command for the requested task, pick the right backend, and execute it directly.

Supported backends: **claude**（默认）、**codex**、**opencode**、**pi**。

Use [EXAMPLES.md](./EXAMPLES.md) for canonical command shapes, backend-selection walkthroughs, and anti-patterns.

## Workflow

Process requests in this order:

1. Confirm the target working directory.
2. Compress the user's task into one goal.
3. Select the backend（see Backend Selection）.
4. Construct the command using the backend's canonical template.
5. Apply only the required shell escaping.
6. Execute directly through the host run tool.
7. Report the result.

## Working Directory

- If the user already gave a directory, use it directly.
- Otherwise use the current repository directory.
- Keep the directory decision explicit in the command shape rather than implying it from prose.

## Task Compression

- Reduce the user request to a single goal.
- Do not broaden the scope.
- Do not add extra phases, extra stop conditions, or implementation suggestions the user did not ask for.
- When the user wants the current task handed off to an external agent, keep the task semantically unchanged apart from minimal compression needed to make it a single runnable instruction.

## Backend Selection

Determine the backend from the user's explicit signal. When no signal is given, default to **claude**.

| Signal | Backend | Rationale |
|--------|---------|-----------|
| "用 claude" / "claude -p" / "code" | **claude** | |
| "用 codex" / "codex exec" / "codex exec --json" | **codex** | |
| "用 opencode" / "opencode run" | **opencode** | |
| "用 pi" / "pi -p" | **pi** | |
| No explicit signal | **claude** | 默认后端 |

Rules:

- Match the **first** explicit signal in the user's request. Do not switch backends mid-task.
- If the user names a backend not in this table, report the unsupported backend and ask the user to choose from the supported list.
- Do not guess a backend based on task content alone. The user's explicit signal is the only trigger.

## Command Templates

### Claude（默认）

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"
```

Rules:

- Keep the outer double quotes.
- `IS_SANDBOX=1` and `--dangerously-skip-permissions` are part of the default command shape, not retry-only add-ons.
- Keep `-p` after `--dangerously-skip-permissions`. Do not reorder.
- Do not add `--verbose`, `--output-format stream-json`, or any other extra flags.
- Do not invent non-existent flag names（e.g. `dangerouslyDisableSandbox`）.

### Codex

```bash
cd <workdir> && codex exec --json "<task>"
```

Rules:

- Keep the outer double quotes.
- `--json` enables machine-readable output.
- Do not add `--agent` or any agent-specific flags unless the user explicitly asked for them.
- Do not add any skill-loading prefix or slash-command syntax.

### OpenCode

```bash
cd <workdir> && opencode run "<task>"
```

Rules:

- Keep the outer double quotes.
- Do not add `use skill tool to load ...` or any superpowers prefix unless the user explicitly asked for it.

### Pi

```bash
cd <workdir> && pi -p "<task>"
```

Rules:

- Keep the outer double quotes.
- Do not add any extra flags or prefixes unless the user explicitly asked for them.

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

Treat all backends as one-shot non-interactive commands.

- After launch, the default report is a single "started" style update.
- If the host requires waiting to determine completion, default wait times per backend:
  - **claude**: `1800000 ms`
  - **codex**: `600000 ms`
  - **opencode**: `600000 ms`
  - **pi**: `600000 ms`
- Automatic waiting must never use less than the backend's minimum（claude: `1800000 ms`, others: `300000 ms`）.
- Without an explicit request for ongoing monitoring, auto-check at most once.
- After a timeout, stop polling unless the user asked for continued monitoring.
- With continued monitoring, use `60000 ms` intervals.
- Repeated "still running" or timeout updates should be emitted at most once every 30 minutes.
- Exit, crash, error, or a direct user request to inspect status should be reported immediately.

## Restrictions

- Do not add any watch, monitoring, or PID-tail logic.
- Do not wrap the command with shell prefixes, PID echos, redirections, or helper preambles.
- Do not silently expand a task into a multi-stage workflow.
- Do not add skill-loading prefixes, slash-command syntax, or extra CLI flags unless the user explicitly asked for them.
- Do not add extra stop conditions or implementation advice.
- Do not narrate every wait cycle back to the user.
- Do not turn an execute request into "you can run this command manually" guidance.
- Do not fall back to any other skill.
- Do not replace the selected backend with a different one.
