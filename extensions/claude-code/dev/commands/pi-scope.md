---
description: 拉真实可用模型清单，交互式生成 /dev:pi 的套餐速查表 pi.yaml
argument-hint: [模型关键词(可选，透传给 pi --list-models)]
allowed-tools: Bash(pi:*), Read, Write, AskUserQuestion
---

你是编排者。本命令的产出是一份给 `/dev:pi` 读的套餐速查表 `pi.yaml`——你只负责拉清单、交互问用户、校验、落盘、回显，不要自己瞎编 model 或套餐内容。

原始参数（可选，透传给 `pi --list-models` 作关键词过滤）：`$ARGUMENTS`

## 1. 拉清单

```
pi --list-models $ARGUMENTS </dev/null
```

- `$ARGUMENTS` 非空 → 当关键词过滤传入；为空 → 拉全量清单。

> ⚠️ **`</dev/null` 不可省（同 `pi.md` 警示原文）**：`pi` 系子命令会读 stdin 直到 EOF（为支持管道拼接），Claude Code 的 Bash 工具是**非 TTY**、stdin 是个不会关闭的管道 → 不带 `</dev/null` 会永久卡死在 stdin 读、连输出都没有。**本命令里每一处 `pi` 调用都必须 `</dev/null` 重定向 stdin**，包括这里的 `pi --list-models`。

从输出里解析出真实可用的 `provider/id` 集合，记下来——这是第 2 步选 model 时唯一合法的候选集，也是第 3 步校验「model 命中清单」的依据。若 `pi --list-models` 失败（命令不存在、非零退出等），按第 6 步「异常态」处理，直接停下，不进入第 2 步。

## 2. 逐条建套餐（循环）

每一轮依次问，凑齐一条 package。**结构化选择**（model / thinking / 设为默认 / 再加一条）用 `AskUserQuestion`；**自由文本**（name / case / descr）直接对话向用户问——`AskUserQuestion` 是结构化多选、没有原生多行自由文本字段，长文本别硬塞进选项。

1. **挑 model**（`AskUserQuestion`）：从第 1 步解析出的清单里选（选项直接列出具体 `provider/id`，不要让用户手打，避免拼错落到清单外）。
2. **选 thinking**（`AskUserQuestion`）：六选一枚举 `off / minimal / low / medium / high / xhigh`。
3. **写 name**（对话问）：套餐名，用户自定（如「多模态」「省钱」）。
4. **写 case**（对话问）：一句话速查——这套餐适用什么场景（对应旧写死表「何时用」列）。
5. **可选填 descr**（对话问，非 `AskUserQuestion`）：长描述/注意事项，允许多行、允许留空（比如把云端限速开关一类跟 model 强相关但 pi CLI 本身看不到的整段告警存进来）。这是自由长文本，直接对话收集；用户不填就留空跳过。
6. **问「设为默认?」**（`AskUserQuestion`）：是/否。
7. **问「再加一条 or 收工?」**（`AskUserQuestion`）：选「再加一条」→ 回到步骤 1 开始下一轮；选「收工」→ 结束循环，进入第 3 步校验。

## 3. 落盘前校验（逐条对 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml`）

在写文件之前，把收集到的全部 package 过一遍这四条：

- `packages` 至少 1 条。
- 全表**恰好 1 条** `default: true`（0 条或 ≥2 条都不合法）。
- 每条 `model` 必须命中第 1 步 `pi --list-models` 的结果集（不是随口编的字符串）。
- 每条 `thinking` 必须是合法枚举值（`off/minimal/low/medium/high/xhigh` 之一）。

**任一条不过** → 明确指出是哪一条 package、哪个字段不对，回到第 2 步对应的那一小步补齐或改正（不是从头重来，是针对性修）；修完再回到本步重新过一遍全部四条。**校验不全部通过前，绝不进入第 4 步落盘，不留半成品文件。**

## 4. 落盘

写入 `${CLAUDE_PLUGIN_DATA}/pi.yaml`（该目录首次引用会自动创建，不需要预先 `mkdir`）。内容形状必须对齐 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml`（顶层 `version`/`packages`，每条 package 含 `name/model/thinking/case/default`，`descr` 可选）。

文件首行写一条注释，标注生成来源与 schema 遵从：

```yaml
# 由 /dev:pi-scope 生成 · 符合 schemas/pi-packages.schema.yaml
```

### 生成结果样例（对齐目标形状）

```yaml
# 由 /dev:pi-scope 生成 · 符合 schemas/pi-packages.schema.yaml
version: 1
packages:
  - name: 多模态
    model: kimi-coding/kimi-for-coding
    thinking: medium
    case: 平衡日常编码（262K context / 32.8K max-out），支持多模态
    descr: |
      ⚠️ kimi 烧钱的真正来源是云端开关，不在 pi 这边：Kimi 控制台的
      「K2.7 Code 高速版」（6× 速度 / 3× 消耗）是账号级设置，只能在控制台网页切——
      同一个 kimi-for-coding ID 走正常速度还是 6× 高速，pi CLI 与 model ID 都看不到、
      也调不了。想省钱：去控制台切回正常速度，或换 deepseek/deepseek-v4-pro。
    default: false
  - name: 省钱（默认）
    model: deepseek/deepseek-v4-flash
    thinking: high
    case: 官方 deepseek，1M context / 384K max-out，无多模态，速度快
    default: true
```

## 5. 回显确认

写盘成功后，把最终落到 `${CLAUDE_PLUGIN_DATA}/pi.yaml` 的**全文**回显给用户，供确认；同时提示一句「已生成，`/dev:pi` 之后会读这份 default 档」。

## 6. 异常态

- **`pi` 不存在，或 `pi --list-models` 非零退出**：打印其原始 stderr，停下，**不写盘**、不进入第 2 步交互。
- **用户中途放弃**（取消交互、拒绝继续）：直接结束，**不落半成品文件**——已问出来的部分只留在本轮对话里，不写入 `${CLAUDE_PLUGIN_DATA}/pi.yaml`。
- **第 3 步校验反复不过**：如实告知用户具体卡在哪条哪个字段，不要为了收尾而放宽校验、也不要自作主张编一个值糊弄过去。
