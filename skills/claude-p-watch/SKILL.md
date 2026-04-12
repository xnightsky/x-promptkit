---
name: claude-p-watch
description: Use when the user explicitly wants a task wrapped as a single `claude -p` command and also wants default ongoing watch updates from the running host `claude -p` process
interface:
  display_name: "Claude -p Watch"
  short_description: "生成、执行并默认 watch 单条 Claude -p 命令"
  default_prompt: "Use $claude-p-watch to compose and directly run exactly one canonical watched claude -p command for the current task."
policy:
  allow_implicit_invocation: false
---

# Claude -p Watch

## Overview

Construct exactly one bare watched `claude -p` command for the requested task, execute it directly through the host run tool, and use the skill's internal helper scripts to discover the running `claude -p` PID and tail it by PID.

This skill exists to make watch behavior explicit. The watch mechanism belongs to runtime/harness, not to ad hoc AI-CLI improvisation.

Process-state truth belongs to runtime. Prompt markers may describe task phases, but they do not prove that the outer host `claude -p` process is still alive.

Treat `IS_SANDBOX=1` as part of the canonical watched command literal. Keep it in the command shape, but do not explain its rationale unless the user explicitly asks.

Use [EXAMPLES.md](./EXAMPLES.md) for canonical command shapes, watch outcomes, and anti-patterns.

## Workflow

Process requests in this order:

1. Confirm the target working directory.
2. Compress the user's task into one goal.
3. Construct the canonical command.
4. Execute the bare command directly through the host run tool.
5. Discover the running `claude -p` PID once via the internal PID helper.
6. Reuse that PID for periodic `tail(pid)` checks through the internal tail helper.
7. Report launch, periodic watch updates, and terminal status.

## Execution Preconditions

- Confirm `claude` is available before launching the watched run.
- Launch the command in a way that keeps the outer host `claude -p` process alive long enough for PID discovery and follow-up watch checks.
- If the current harness cannot keep the outer host process alive reliably, report that watch could not be established instead of pretending watch is active.
- When the user asked to execute, launch the canonical watched command first. Do not preemptively replace execution with manual-run guidance based on generic sandbox or approval speculation.

## Command Template

Default command template:

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"
```

Rules:

- Keep the outer double quotes.
- Escape double quotes inside the task text as `\"`.
- Escape bare `$` inside the task text as `\$`.
- Keep `IS_SANDBOX=1` and `--dangerously-skip-permissions` as part of the default command shape.
- Treat `IS_SANDBOX=1` as a fixed command-literal detail, not as a topic that needs proactive explanation.
- Do not add `--verbose`.
- Do not add `--output-format stream-json`.
- Do not add skill-loading prefixes, slash-command syntax, or extra CLI flags unless the user explicitly asked for them.

## Watch Contract

Watch is enabled by default for this skill.

- The watch target is the running outer `claude -p` host process PID.
- Start watching only after the host process has started and the PID has been acquired once.
- The default interval is `60000 ms`.
- Each repeated update should report only the latest watch result instead of replaying full logs.
- The internal watch helpers are `discover-pid` and `tail-by-pid`.
- `tail-by-pid` accepts only the PID and returns the latest short excerpt on a best-effort basis.
- Watch does not expose internal reasoning, unflushed output, or nested child-process state.
- Host-process liveness is determined by runtime-side PID/session checks, not by prompt text emitted from inside the task.

## Linux Host-PID Observation

On Linux, `tail-by-pid` probes `/proc/<pid>/fd/1` first and may fall back to `/proc/<pid>/fd/2`.

- If stdout resolves to a regular file, tail the latest lines from that file.
- If stdout is unavailable but stderr resolves to a regular file, return the latest stderr lines instead.
- If both resolve to pipe, socket, tty, unreadable, or exited targets, return an empty tail and the reason.
- Do not attempt invasive capture from pipes or other non-seekable targets.
- Do not replace watch with `ps` inference, shell history, or guessed progress.

## State Resolution

- If `tail-by-pid` captures a regular-file tail, report that tail excerpt as the latest watch result.
- If `tail-by-pid` returns empty because both fds are non-seekable or unreadable, report the empty reason and resolve liveness separately via runtime PID/session state.
- If the interactive host session has already returned a terminal result, treat that as a completion signal and do one short follow-up PID recheck to distinguish `completed but pid draining` from `already exited`.
- If the user directly asks whether the command is still running, bypass the minute cadence and perform an immediate state recheck.

## Return Mode

- Report a single launch update after the command starts.
- During watch, emit at most one periodic progress update per minute.
- On exit, crash, error, or direct user inspection requests, report immediately.
- Keep updates concise; 2-3 tail lines are enough when capture is available.
- If launch or watch establishment actually fails, report the concrete failure that occurred. Do not front-load generic sandbox, approval, or permission explanations before a real failure result exists.

## Restrictions

- Do not silently fall back to the plain `claude-p` skill when the user explicitly asked for watch.
- Do not wrap the main command with shell prefixes, PID echos, redirections, or helper preambles.
- Do not watch child shell PIDs as the default target.
- Do not paste full execution logs when a short tail summary or empty reason is enough.
- Do not pretend `ps` state or elapsed time is equivalent to stdout observation.
- Do not turn an execute request into "you can run this command manually" guidance unless the user explicitly asked for the command instead of execution.
- Do not proactively explain sandbox, approval, or permission mechanics just because the command includes `IS_SANDBOX=1`.
