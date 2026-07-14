# Scoping — 通用预设生成引擎（`/dev:scope`）

> **插件原生文件（非镜像）**：scope 是 Claude Code 插件专属能力（要 `${CLAUDE_PLUGIN_DATA}` 落盘、要 `/dev:scope` 斜杠命令），**不进宿主无关的 `dev-run` skill**，也不由 `sync-handoff-core` 镜像。相邻的 `backends.md`/`orchestration.md` 才是那份共享镜像。
>
> `/dev:scope <backend>` 按「真实可用模型」交互生成该后端的套餐表，落 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`，供 `/dev:<backend>` 便捷壳读默认档。生成物是**运行时机器本地物**（落 `${CLAUDE_PLUGIN_DATA}`，跨插件升级/重装持久、不进版本控制）；结构权威是 `${CLAUDE_PLUGIN_ROOT}/schemas/packages.schema.yaml`（只读随装）。

## 每后端 scope 配置（后端专属只有这 4 处，引擎其余步骤后端无关）

| 后端 | list-models 命令（含 stdin 护栏） | knobs（要交互问的后端专属旋钮） | 落盘 |
|------|-----------------------------------|-------------------------------|------|
| **pi** | `pi --list-models [关键词] </dev/null`（`</dev/null` 不可省，见 backends.md#pi） | `thinking`：枚举 `off｜minimal｜low｜medium｜high｜xhigh` | `${CLAUDE_PLUGIN_DATA}/pi.yaml` |
| **cursor-agent** | `cursor-agent --list-models [关键词]`（Windows/Git-Bash 用 `cursor-agent.cmd`） | 无（推理档编进 model ID，见 backends.md#cursor-agent） | `${CLAUDE_PLUGIN_DATA}/cursor.yaml` |
| **claude / codex / opencode** | —— **无 scope** | —— | —— |

- **无 scope 的后端**：`claude`/`codex`/`opencode` 在 dev-run 里模板固定、不吃 `--model`，没有「选模型」这件事 → 不做 scope。
- 各后端的 list-models 命令与 model 语法细节以 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 对应条目为准；本表只列 scope 相关的取值。

## 引擎（后端无关 6 步）

### 0. 取配置
从上表取 `<backend>` 的 scope 配置。若该后端**无 scope** → 报「后端 `<backend>` 无 scope（dev-run 模板固定、不吃 `--model`）。支持 scope 的后端：pi、cursor。」，停下，不进入第 1 步。

### 1. 拉清单
跑该后端配置里的 list-models 命令（**带其 stdin 护栏**，如 pi 的 `</dev/null`）；`$ARGUMENTS` 里的关键词（后端名之后的部分）非空 → 当过滤词传入，为空 → 拉全量。

从输出解析真实可用的 model id 集合，记下来——这是第 2 步选 model 的唯一合法候选集，也是第 3 步校验「model 命中清单」的依据。若 list-models 失败（命令不存在、非零退出等）→ 按第 6 步异常态处理，直接停下。

### 2. 逐条建套餐（循环）
每轮凑齐一条 package。**结构化选择**（model / 各 knob / 设为默认 / 再加一条）用 `AskUserQuestion`；**自由文本**（name / case / descr）直接对话问——`AskUserQuestion` 无原生多行自由文本字段，长文本别硬塞进选项。

1. **挑 model**（`AskUserQuestion`）：从第 1 步清单里选（选项直接列具体 model id，不让用户手打，避免拼错落到清单外）。
2. **逐个问 knob**（`AskUserQuestion`）：按该后端配置声明的 knob 集问（pi 问 `thinking` 六选一枚举；cursor 无 knob → 跳过本步）。
3. **写 name**（对话）：套餐名，用户自定（如「多模态」「省钱」）。
4. **写 case**（对话）：一句话速查——适用什么场景。
5. **可选填 descr**（对话，非 `AskUserQuestion`）：长描述/注意事项，允许多行、允许留空（存跟 model 强相关、CLI 本身看不到的整段告警）。用户不填就跳过。
6. **问「设为默认?」**（`AskUserQuestion`）：是/否。
7. **问「再加一条 or 收工?」**（`AskUserQuestion`）：「再加一条」→ 回步骤 1；「收工」→ 进第 3 步校验。

### 3. 落盘前校验
写文件前，把全部 package 过一遍：

- `packages` 至少 1 条。
- 全表**恰好 1 条** `default: true`（0 条或 ≥2 条都非法）。
- 每条 `model` 必须命中第 1 步 list-models 的结果集（不是随口编的字符串）。
- 每个 knob 值合法（按该后端配置声明的枚举/类型，如 pi 的 `thinking` 六枚举之一）。

**任一不过** → 明确指出哪条 package、哪个字段不对，回到第 2 步对应小步针对性补齐/改正；修完再回本步重过。**全部通过前绝不落盘，不留半成品文件。**

### 4. 落盘
写入该后端配置的落盘路径（`${CLAUDE_PLUGIN_DATA}/<backend>.yaml`，首次引用自动建目录，无需预先 `mkdir`）。形状对齐 `${CLAUDE_PLUGIN_ROOT}/schemas/packages.schema.yaml`：顶层 `version`/`packages`，每条 package 含 `name/model/case/default`（`descr` 可选），**后端专属旋钮存进 `knobs` 对象**（如 pi：`knobs: {thinking: medium}`；cursor：无 knob 则省略 `knobs`）。

首行注释标来源：

```yaml
# 由 /dev:scope <backend> 生成 · 符合 schemas/packages.schema.yaml
```

生成样例（pi）：

```yaml
# 由 /dev:scope pi 生成 · 符合 schemas/packages.schema.yaml
version: 1
packages:
  - name: 省钱（默认）
    model: deepseek/deepseek-v4-flash
    case: 官方 deepseek，1M context / 384K max-out，速度快
    knobs:
      thinking: high
    default: true
```

### 5. 回显确认
写盘成功后，把最终落盘的 yaml **全文**回显给用户确认，并提示一句「已生成，`/dev:<backend>` 之后会读这份 default 档」。

### 6. 异常态
- **CLI 不存在，或 list-models 非零退出**：打印其原始 stderr，停下，**不写盘**、不进第 2 步。
- **用户中途放弃**（取消交互、拒绝继续）：直接结束，**不落半成品文件**。
- **第 3 步校验反复不过**：如实告知具体卡在哪条哪字段，不为收尾放宽校验、也不自作主张编值糊弄。

## 读方（供 `/dev:pi`、`/dev:cursor` 便捷壳引用）

便捷壳在**没给该后端 model/knob 旋钮**时按此取默认档：

- 读 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`，取 `default: true` 那条的 `model`（+ `knobs`，如 pi 的 `knobs.thinking`）作默认档；命中且有 `descr` → 回显给用户。
- **读不到该 yaml（没跑过 `/dev:scope <backend>`）→ 回退后端自身默认**，不停：pi 走裸 `pi -p`（pi 自身配置的默认 model）、cursor 走 `composer-2.5-fast`。scope 是**可选便利层**，不生成也能用。
- **显式旋钮优先级最高**：用户给了 `--model`/`--thinking` 等就原样透传，压过 yaml 默认档。
