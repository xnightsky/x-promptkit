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

Construct exactly one bare watched `claude -p` command for the requested task and keep watch behavior explicit, even when advanced runtime helpers are unavailable.

This fallback file is the degraded prompt-only contract. It must not assume PID helpers, `/proc` probing, or any other advanced runtime-side script support.

Prompt markers can describe task phases, but they must not be treated as proof that the host `claude -p` process is still alive.

Treat `IS_SANDBOX=1` as part of the canonical watched command literal. Keep it in the command shape, but do not explain its rationale unless the user explicitly asks.

## Command Template

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"
```

## Command Rules

- Treat `IS_SANDBOX=1` as a fixed command-literal detail, not as a topic that needs proactive explanation.
- When the user asked to execute, launch the canonical watched command first.
- Do not turn an execute request into manual-run guidance unless the user explicitly asked for the command instead of execution.
- Do not proactively explain sandbox, approval, or permission mechanics just because the command includes `IS_SANDBOX=1`.

## Watch Contract

- Watch is enabled by default for this skill.
- The intended watch target is the running outer `claude -p` host process.
- The default interval is `60000 ms`.
- If the current runtime exposes reliable host-process watch evidence, use that evidence.
- If the current runtime does not expose reliable host-process watch evidence, state that limitation explicitly instead of fabricating liveness claims.
- If launch or watch establishment actually fails, report the concrete failure that occurred instead of front-loading generic sandbox or approval speculation.
- Empty or missing progress output does not prove the host process has exited.
- Session completion text and prompt-level `DONE` markers do not by themselves prove that the host process is still running or has fully exited.
- Do not replace watch with `ps` inference or guessed progress.
