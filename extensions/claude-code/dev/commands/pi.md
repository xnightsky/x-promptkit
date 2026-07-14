---
description: 把当前任务交接给 pi CLI 加速落地（走统一 dev-run 编排，默认档可选读 pi.yaml 套餐）
argument-hint: [--model <pattern>] [--thinking off|low|...] [--timeout 5m] <任务描述>
allowed-tools: Bash(pi:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git status:*), Read
---

你是编排者，`pi` CLI 是执行者。本命令 = 统一交接编排（`/dev:run`）钉死 backend=pi 的便捷壳：你只拼参数、起进程、段间复核、回报，不自己动手写这段代码。

原始参数：`$ARGUMENTS`

## 核心编排（共享事实源，不在本文复述）

- **pi 命令模板 / `</dev/null` 护栏 / Shell 转义 / wait 预算 / 旋钮语义**：见 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 的 **pi** 条目。
- **两轴复杂度闸门 → 拆段串行 → 段间 `git diff` 复核 → 回报**：见 `${CLAUDE_PLUGIN_ROOT}/references/orchestration.md`（含参数解析、`--timeout` 规则）。
- **严格按上述两份 references 执行**；本文件只补 pi 专属旋钮。

## pi 专属旋钮

1. **解析** `--model` / `--thinking` / `--timeout` + 任务文本（切分与 `--timeout` 规则见 orchestration.md「参数解析」）。任务为空 → 停下问用户。
2. **显式 `--model` / `--thinking` 原样透传**：给了 `--model` → 原样用；模糊/部分名（如 `kimi`）先 `pi --list-models <pattern> </dev/null` 解析成精确 `provider/id`（必要时补 `--provider`）。给了 `--thinking` → 原样透传。
3. **没给旋钮 → 读套餐默认档（可选）**：按 `${CLAUDE_PLUGIN_ROOT}/references/scoping.md`「读方」——读 `${CLAUDE_PLUGIN_DATA}/pi.yaml` 取 `default:true` 档的 `model` + `knobs.thinking`（命中且有 `descr` → 回显）；**读不到（没跑过 `/dev:scope pi`）→ 回退裸 `pi -p`（pi 自身默认 model），不停**。
4. 组命令按 backends.md#pi 模板：`pi -p [--model <M>] [--thinking <T>] "<任务>" </dev/null`（给了旋钮才带对应 flag），交给 orchestration.md 的两轴评估与流程跑。
