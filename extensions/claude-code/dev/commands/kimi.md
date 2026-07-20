---
description: 把当前任务交接给 kimi（Kimi Code CLI）加速落地（走统一 dev-run 编排，`-p` 原生 auto permission 直接落编辑，无需放行 flag）
argument-hint: [--model <pattern>] [--timeout 5m] <任务描述>
allowed-tools: Bash(kimi:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git status:*), Read
---

你是编排者，`kimi`（Kimi Code CLI）是执行者。本命令 = 统一交接编排（`/dev:run`）钉死 backend=kimi 的便捷壳：你只拼参数、起进程、段间复核、回报，不自己动手写这段代码。

原始参数：`$ARGUMENTS`

## 核心编排（共享事实源，不在本文复述）

- **kimi 命令模板 / `-p` 原生 auto permission（含 shell）与安全边界 / 无需 `</dev/null` / Shell 转义 / wait 预算 / model 旋钮语义**：见 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 的 **kimi（kimi-code）** 条目。
- **两轴复杂度闸门 → 拆段串行 → 段间 `git diff` 复核 → 回报**：见 `${CLAUDE_PLUGIN_ROOT}/references/orchestration.md`（含参数解析、`--timeout` 规则）。
- **严格按上述两份 references 执行**；本文件只补 kimi 专属旋钮。

## kimi 专属旋钮

1. **解析** `--model` / `--timeout` + 任务文本（切分与 `--timeout` 规则见 orchestration.md「参数解析」）。任务为空 → 停下问用户。kimi **无独立 thinking 旋钮**（thinking 是 kimi config 级，不在交接层给）。
2. **model**：给了 `--model` → 原样用（模糊/部分名先 `kimi provider list --json` 拉全量、从 `.models` 的 key 里匹配成精确 `provider/id` alias，别拼错落到清单外）；没给 → 读套餐默认档（可选，按 `${CLAUDE_PLUGIN_ROOT}/references/scoping.md`「读方」）——读 `${CLAUDE_PLUGIN_DATA}/kimi.yaml` 取 `default:true` 档的 `model`（命中且有 `descr` → 回显）；**读不到（没跑过 `/dev:scope kimi`）→ 回退 kimi config 的 `default_model`（裸 `kimi -p`），不停**。
3. **安全档**：`kimi -p` 原生就是 auto permission（编辑 + shell 都自动放行、仅 kimi config 的 static deny 仍生效），**默认不带任何放行 flag 就能落地编辑**（见 backends.md#kimi「安全边界」）。要更严靠 kimi 自身 config 的 deny 规则，不在命令层加 flag；`-y`/`--yolo`（连 plan 模式退出也自动批）只在用户**显式要求**时透传，并在回报里点明。
4. 记下该 model 的能力档交给 orchestration.md 的两轴评估用；最终按 backends.md#kimi 模板组命令 `cd <workdir> && kimi -p [--model <M>] "<任务>"`（给了 `--model` 才带；**不加 `</dev/null`**，kimi 不吃 stdin）。
