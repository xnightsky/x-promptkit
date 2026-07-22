---
description: 按真实可用模型交互生成某后端的套餐表，写 .dev-run.yaml（项目级/用户级双层，供 /dev:<backend> 便捷壳读默认档）
argument-hint: <pi|cursor|kimi> [模型关键词(可选)]
allowed-tools: Bash(pi:*), Bash(cursor-agent:*), Bash(cursor-agent.cmd:*), Bash(kimi:*), Read, Write, AskUserQuestion
---

你是编排者。本命令按「真实可用模型」交互生成指定后端的套餐表，按安装作用域写对应层 `.dev-run.yaml`（项目级安装 → `<项目根>/.dev-run.yaml`，用户级安装 → `~/.dev-run.yaml`），供 `/dev:<backend>` 便捷壳读默认档——你只负责拉清单、交互问用户、校验、落盘、回显，**不要自己瞎编 model 或套餐内容**。

原始参数：`$ARGUMENTS`（**首个位置参数 = 后端名**，其余 = 传给该后端 list-models 的关键词过滤，可空）

## 怎么执行（严格按共享事实源）

- **通用引擎 + 每后端 scope 配置（list-models 命令 / knob 集 / 落盘名）+ 读方契约**：见 `${CLAUDE_PLUGIN_ROOT}/references/scoping.md`。严格按其 6 步跑。
- 各后端 model 语法 / list-models 细节以 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 对应条目为准。

## 本命令的取值约定

1. 解析**第一个位置参数 = 后端名**；其后非 flag 文本 = list-models 关键词。
2. **缺后端名 → 停下让用户选**（`pi` / `cursor` / `kimi` 之一）。
3. **后端在 scoping.md 里标「无 scope」**（`claude`/`codex`/`opencode`）→ 报「后端 `<x>` 无 scope（dev-run 模板固定、不吃 `--model`）。支持 scope 的后端：pi、cursor、kimi。」，停下。
4. 合法后端 → 按 scoping.md 引擎：拉清单 → 逐条交互建档（结构化走 `AskUserQuestion`、自由文本对话问）→ 校验 → 按 scoping.md「存储」写对应层 `.dev-run.yaml`（形状对齐 `${CLAUDE_PLUGIN_ROOT}/schemas/packages.schema.yaml`，只更新本 backend section）→ 回显全文确认。
