---
description: 把当前任务交接给指定 AI CLI 后端落地（统一交接编排，claude/codex/opencode/pi/cursor）
argument-hint: <claude|codex|opencode|pi|cursor> [后端旋钮] [--timeout 5m] <任务描述>
allowed-tools: Bash(claude:*), Bash(codex:*), Bash(opencode:*), Bash(pi:*), Bash(cursor-agent:*), Bash(cursor-agent.cmd:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git status:*), Read
---

你是编排者。本命令是「AI CLI 交接」的通用入口（与 `dev-run` skill 同源）：按**第一个位置参数（后端名）**选定执行者，把当前任务真正交接给它起进程落地——你只拼参数、起进程、段间复核、回报，不自己动手写这段代码。

原始参数：`$ARGUMENTS`

## 怎么执行（严格按共享事实源）

- **后端命令模板 / stdin 护栏（如 pi、cursor 的 `</dev/null`）/ Shell 转义 / wait 预算 / 各后端旋钮**：见 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 对应后端条目。
- **参数解析 / 两轴复杂度闸门 / 拆段串行 / 段间 `git diff` 复核 / 回报**：见 `${CLAUDE_PLUGIN_ROOT}/references/orchestration.md`。

## 本命令的取值约定

1. **第一个位置参数（首个空白分隔 token）= 后端名**（`claude`/`codex`/`opencode`/`pi`/`cursor`）；其后的 = 该后端旋钮 + `--timeout` + 任务文本。
2. **首参不是合法后端名（或缺失）→ 停下让用户选**（上述 5 个之一）；不擅自替用户选后端。给了不在列表里的后端 → 报「不支持」并列出支持列表。
3. 任务文本为空 → 停下问用户要落地什么。
4. cursor 的安全档、pi 的 `--model`/`--thinking` 等**后端专属旋钮**走各自便捷壳 `/dev:pi`、`/dev:cursor` 更省事；在本命令里要用就显式传（如 `--model` / `--thinking` / `--force`）。
5. 按 backends.md 该后端模板组命令，交给 orchestration.md 的流程跑（单次或拆段），最后 `git diff`/`git status` 复核回报。
