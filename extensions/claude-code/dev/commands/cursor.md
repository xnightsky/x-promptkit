---
description: 把当前任务交接给 cursor-agent CLI 加速落地（走统一 dev-run 编排，默认 composer-2.5-fast + --trust 安全档）
argument-hint: [--model <pattern>] [--force] [--timeout 5m] <任务描述>
allowed-tools: Bash(cursor-agent:*), Bash(cursor-agent.cmd:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git status:*), Read
---

你是编排者，`cursor-agent` CLI 是执行者。本命令 = 统一交接编排（`/dev:run`）钉死 backend=cursor-agent 的便捷壳：你只拼参数、起进程、段间复核、回报，不自己动手写这段代码。

原始参数：`$ARGUMENTS`

## 核心编排（共享事实源，不在本文复述）

- **cursor-agent 命令模板 / 二进制名（Windows `.cmd`）/ `</dev/null` 护栏 / Shell 转义 / wait 预算 / model 与安全档语义**：见 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 的 **cursor-agent** 条目。
- **两轴复杂度闸门 → 拆段串行 → 段间 `git diff` 复核 → 回报**：见 `${CLAUDE_PLUGIN_ROOT}/references/orchestration.md`（含参数解析、`--timeout` 规则）。
- **严格按上述两份 references 执行**；本文件只补 cursor 专属旋钮。

## cursor 专属旋钮

1. **解析** `--model` / `--force`(或 `--yolo`) / `--timeout` + 任务文本（切分与 `--timeout` 规则见 orchestration.md「参数解析」）。任务为空 → 停下问用户。
2. **model**：给了 `--model` → 原样用（模糊名先 `cursor-agent --list-models <pattern>` 解析）；没给 → 读套餐默认档（可选，按 `${CLAUDE_PLUGIN_ROOT}/references/scoping.md`「读方」）——从执行命令的 `PWD` 逐级向 home 检索最近的 `.dev-run.yaml`，取 `backends.cursor` 中 `default:true` 档的 `model`（命中且有 `descr` → 回显）；**所有候选位置都读不到或命中配置没有 cursor section → 回退「日常」档 `composer-2.5-fast`（Cursor 自家编码模型、账号默认），不停**。推理档编进 model ID（见 backends.md#cursor-agent）。
3. **安全档（默认安全，危险档需显式）**：
   - 没给放行 flag → 默认 `--trust`（代码编辑落地、**shell 命令默认被挡**）。纯改代码/重构/生成类交接就用它。
   - 给了 `--force`/`--yolo` → **危险全开**（shell 全放行）；原样透传，并在回报里**明确告警**这次是全放行档。
   - 任务确实要跑 shell（build/test/git）又不想全开 → 提示用户在目标 repo `.cursor/cli.json` 配 `permissions.allow`（白名单）+ `deny`（挡危险命令），仍配合 `--trust`。
4. 记下该 model 的能力档交给 orchestration.md 的两轴评估用；最终按 backends.md#cursor-agent 模板组命令 `cursor-agent -p --trust --model <M> "<任务>" </dev/null`（Windows/Git-Bash 换 `cursor-agent.cmd`；危险档把 `--trust` 换 `-f`）。
