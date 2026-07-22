---
name: dev-run
description: "Use when the user wants to hand off a task as a single non-interactive AI CLI command — supporting claude (default), codex, opencode, pi, cursor-agent, or kimi. Construct the command, execute it directly, and report the result. Also handles scope: interactively generating a backend's model preset table (.dev-run.yaml) from its real available models."
interface:
  display_name: "Dev Run"
  short_description: "统一非交互 AI CLI 执行（自动选后端）"
  default_prompt: "Use $dev-run to select the right backend, construct the command, and execute it directly."
policy:
  allow_implicit_invocation: false
---

# Dev Run

## Overview

Construct exactly one non-interactive AI CLI command for the requested task, pick the right backend, and execute it directly.

Supported backends: **claude**（默认）、**codex**、**opencode**、**pi**、**cursor-agent**、**kimi**。

- 各后端命令模板、stdin 护栏、wait 预算、Shell 转义、专属旋钮 —— **唯一事实源见 [references/backends.md](./references/backends.md)**，本文不复述以免两处维护漂移。
- 典型输入、输出、反例见 [EXAMPLES.md](./EXAMPLES.md)。

## 两档（Tier）

- **Tier-1 · 极简一发（本 skill 默认）**：把用户任务压成**一条**非交互命令，选好后端，直接执行、回报。**不拆段、不加监控**。适合可脚本化的一次性交接——下面的 Workflow 就是 Tier-1。
- **Tier-2 · 完整编排（显式触发）**：两轴复杂度闸门 → 拆段串行 → 段间 `git diff` 复核，见 [references/orchestration.md](./references/orchestration.md)。**不要在 Tier-1 默认路径里悄悄扩成多段**。

## Scope（套餐表生成，显式触发）

用户要「给 `<backend>` 跑 scope / 生成套餐表 / 配默认 model 档」→ 走 [references/scoping.md](./references/scoping.md) 引擎：拉该后端真实可用模型 → 交互建套餐 → 校验 → 写 `.dev-run.yaml`（单文件双层：项目级安装写 `<项目根>/.dev-run.yaml`，用户级安装写 `~/.dev-run.yaml`，只更新本 backend section）。支持 scope 的后端：pi、cursor、kimi（claude/codex/opencode 无 scope）。

组后端命令时用户没给 model 类旋钮 → 可按 scoping.md「读方」就近读 `.dev-run.yaml` 默认档（可选便利层；读不到回退后端自身默认，不停）。显式旋钮永远优先。scope 与 Tier-1/Tier-2 执行互不阻塞：没跑过 scope 照常用。

## Workflow（Tier-1）

Process requests in this order:

1. Confirm the target working directory.
2. Compress the user's task into one goal.
3. Select the backend（see Backend Selection）.
4. Construct the command using the backend's template in [references/backends.md](./references/backends.md).
5. Apply only the required shell escaping（见 backends.md「Shell 转义」）.
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

- 无显式信号 → 默认 **claude**。
- 有显式信号 → 按信号选后端。**后端清单 + 各自触发信号 + 命令模板的唯一事实源是 [references/backends.md](./references/backends.md)**——每个后端条目的「触发信号」行给出该后端的路由信号；本文不再复述以免两处维护漂移。

Rules:

- Match the **first** explicit signal in the user's request. Do not switch backends mid-task.
- If the user names a backend not in the registry（backends.md 登记的后端）, report the unsupported backend and ask the user to choose from the supported list.
- Do not guess a backend based on task content alone. The user's explicit signal is the only trigger.

## Command Construction

- 命令模板、stdin 护栏（如 pi/cursor 的 `</dev/null`）、各后端旋钮、Shell 转义 —— **一律按 [references/backends.md](./references/backends.md) 的对应后端条目执行**。
- 不加 skill 加载前缀、斜杠命令语法或额外 CLI flag，除非用户显式要求。
- 不发明不存在的 flag 名。

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
- 各后端默认等待预算（含最小值）见 [references/backends.md](./references/backends.md) 的对应条目（claude 最小 `1800000ms`，其余 `600000ms`）。
- Without an explicit request for ongoing monitoring, auto-check at most once.
- After a timeout, stop polling unless the user asked for continued monitoring.
- With continued monitoring, use `60000 ms` intervals.
- Repeated "still running" or timeout updates should be emitted at most once every 30 minutes.
- Exit, crash, error, or a direct user request to inspect status should be reported immediately.

## Restrictions

- Do not add any watch, monitoring, or PID-tail logic.
- Do not wrap the command with shell prefixes, PID echos, redirections, or helper preambles.
- **Do not silently expand a task into a multi-stage workflow**（要拆段/编排走 Tier-2，见 [references/orchestration.md](./references/orchestration.md)）.
- Do not add skill-loading prefixes, slash-command syntax, or extra CLI flags unless the user explicitly asked for them.
- Do not add extra stop conditions or implementation advice.
- Do not narrate every wait cycle back to the user.
- Do not turn an execute request into "you can run this command manually" guidance.
- Do not fall back to any other skill.
- Do not replace the selected backend with a different one.
