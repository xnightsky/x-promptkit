# dev 插件 /dev:pi-scope — 套餐速查表生成机制设计

- 日期：2026-07-12
- 状态：目标设计（尚未实现）
- 范围：x-promptkit 的 Claude Code `dev` 插件。新增 `/dev:pi-scope` 命令，把 `/dev:pi` 里**写死的套餐速查表**改成**运行时按真实可用模型交互生成**的 yaml；`/dev:pi` 改为读该 yaml。
- 关联：`docs/specs/2026-06-30-dev-pi-plugin-design.md`（dev 插件与 `/dev:pi` 基线）。

## 1. 背景与动机

### 1.1 当前实现

- `extensions/claude-code/dev/commands/pi.md` 正文里有一张**写死的 Markdown 套餐速查表**（现约 11–31 行），钦定了 `kimi-coding/kimi-for-coding` / `deepseek/*` 那几档 model+thinking 组合，并在决策流程图里把「没给 `--model` 时默认走 `kimi-for-coding` 日常档」写进节点。
- 问题：这张表是**作者钦定的固定值**，与「每台机器/每个账号实际可用的模型」脱节；换模型、换默认档，都要手改命令正文。

### 1.2 目标

- 安装后，用一条**独立命令 `/dev:pi-scope`** 拉取**真实可用模型清单**（`pi --list-models`），交互式让用户挑选并命名自己的套餐，落成一份 yaml。
- `/dev:pi` 不再内嵌速查表，改从这份 yaml 读默认档与各档说明。
- 套餐结构由**独立 schema 文件**作唯一权威，写方（`pi-scope.md`）与读方（`pi.md`）都引它，形状不漂移（沿用本仓库「yaml 结构要独立 schema 文件」约束）。

### 1.3 非目标（YAGNI）

- 不改 `/dev:pi` 的编排逻辑：`</dev/null` 硬约束、两轴复杂度评估、分段串行、段间 `git diff` 复核、复核回报，一律不动。
- 不引入独立 `--effort` 或任何新 flag；推理旋钮仍只有 `--thinking`。
- 不做套餐的自动巡检/失效检测；`pi.yaml` 过期就重跑 `/dev:pi-scope`。
- 不把 `pi.yaml` 纳入仓库版本控制（它是运行时机器本地生成物，见 §2.3）。

## 2. 架构与文件布局

三处改动，全部在 `extensions/claude-code/dev/` 内：

| 文件 | 角色 | 动作 |
|------|------|------|
| `commands/pi-scope.md` → `/dev:pi-scope` | **写方**：拉真实模型清单 → 交互选套餐 → 生成 yaml | 新增 |
| `schemas/pi-packages.schema.yaml` | **结构权威**：套餐 yaml 的唯一形状定义，写读两方都引 | 新增 |
| `commands/pi.md` → `/dev:pi` | **读方**：删写死速查表，改读运行时 yaml 的 default 档 | 改 |

### 2.1 命名

- 新命令文件名 `pi-scope.md`，命令名取 plugin 名前缀 → `/dev:pi-scope`（与 `/dev:pi`、`/dev:cursor` 同源规则）。
- schema 文件 `schemas/pi-packages.schema.yaml`，就近放进插件自身（现有 schema 均按模块就近放，无顶层 `schemas/`）。

### 2.2 生成物定位：`${CLAUDE_PLUGIN_ROOT}`

- 生成物 `commands/pi.yaml` = **执行中的那份 `pi.md` 的兄弟文件**。
- 定位靠 Claude Code 插件暴露的环境变量 `${CLAUDE_PLUGIN_ROOT}`：不管插件装在 user scope 还是 project scope，都指向**运行时那份插件根**，`pi.yaml` 落 `${CLAUDE_PLUGIN_ROOT}/commands/pi.yaml`。
- schema 同样经 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml` 被两条命令引用。

> ⚠️ **载荷性假设，实现第 0 步必须先核实**：`${CLAUDE_PLUGIN_ROOT}` 确实对斜杠命令可见、且该目录运行时可写、且 `claude plugin install` 会把 `schemas/` 一起拷贝到插件根下。整个「兄弟文件」方案挂在这三条上。任一不成立，需改定位手段（如固定用户级路径 `~/.claude/...`）并回头修本设计——在核实前不得当既成事实继续实现。

### 2.3 生命周期与代价

- `pi.yaml` 由 `/dev:pi-scope` 在运行时写入插件目录，**不进仓库版本控制**（每台机器现装现生成）。
- **代价**：`claude plugin` 重装/刷新插件会覆盖插件目录、冲掉 `pi.yaml`，需重跑 `/dev:pi-scope`。这是「兄弟于执行中 pi.md」定位方式的固有取舍，写进插件 README。

## 3. 套餐结构（schema 权威）

`schemas/pi-packages.schema.yaml` 用「类 JSON Schema 子集（draft 2020-12，yaml 表达）」描述，风格对齐 `skills-def/recall-eval/schemas/recall-queue.schema.yaml`。本仓库无通用 yaml-schema 运行时校验器，故该 schema 是**写读两方的结构权威 + 人读契约**，不要求被某个 validator 执行；跨字段语义（恰好一条 default）以 §3.2 文字为准。

### 3.1 字段

顶层：`version`（integer ≥1）、`packages`（非空数组，自由命名列表）。

每个 package 条目：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `name` | string | ✓ | 套餐名，用户自定（如「多模态」「省钱」） |
| `model` | string | ✓ | pi 的 `provider/id`，必须来自 `pi --list-models` 实际结果 |
| `thinking` | enum | ✓ | `off｜minimal｜low｜medium｜high｜xhigh` |
| `case` | string | ✓ | 一句话速查：适用场景（对应旧表「何时用」列） |
| `descr` | string（多行） | — | **可选**长描述/注意事项，存 kimi 云端高速版那类整段告警，随套餐走 |
| `default` | bool | ✓ | 全表**恰好一条** `true` |

### 3.2 schema 表达不了的跨字段约束（留在两条命令的 prose + 校验步）

- `packages` 至少 1 条。
- 恰好 1 条 `default: true`（0 条或 ≥2 条都非法）。
- 每条 `model` 必须命中当次 `pi --list-models` 的结果集。
- `thinking` 必须是合法枚举值。

### 3.3 生成的 `commands/pi.yaml` 样例（把当前钦定表迁进来的样子）

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

## 4. `/dev:pi-scope`（新增 · 写方）主流程

```
1. 拉清单：pi --list-models [可选关键词] </dev/null   （</dev/null 硬约束同 pi.md）
   → 得到真实可用 provider/id 集合。
2. 逐条建套餐（AskUserQuestion 交互，循环）：
   挑 model（限 list-models 结果内）→ 选 thinking（枚举）→ 写 name / case →
   可选填 descr（长告警）→ 问「设为默认?」→ 问「再加一条 or 收工?」。
3. 校验（§3.2 全部约束）：≥1 条；恰好 1 条 default；每条 model 命中 list-models；
   thinking 合法。任一不过 → 指出问题、回到对应步补齐，不落盘半成品。
4. 写 ${CLAUDE_PLUGIN_ROOT}/commands/pi.yaml，符合 schema。
5. 回显最终 yaml 供用户确认。
```

- 输入契约：可选关键词参数透传给 `pi --list-models`；无参则拉全量。
- 输出契约：符合 `pi-packages.schema.yaml` 的 `commands/pi.yaml`。
- 异常态：`pi` 不存在 / `--list-models` 失败 → 打印原始 stderr、停下，不写盘；用户中途放弃 → 不落半成品文件。

## 5. `/dev:pi`（改 · 读方）改动点

- **删**：写死的 Markdown 套餐速查表（现 11–31 行）；决策流程图里「默认 `kimi-for-coding` 日常档」节点。
- **改「解析 model 默认」步**：读 `${CLAUDE_PLUGIN_ROOT}/commands/pi.yaml` → 取 `default: true` 那条的 `model` + `thinking` 作默认档；当命中某套餐且其有 `descr` 时，把 `descr` 回显给用户。
- **缺失兜底（硬要求）**：读不到 `pi.yaml` → **停下**，提示「先跑 `/dev:pi-scope` 生成套餐」，**不内置任何写死默认**。
- **显式优先级不变**：`--model` / `--thinking` 显式给的仍原样透传、优先级最高，可以不在 yaml 内。
- **不动**：`</dev/null` 警示、两轴复杂度评估、分段串行、段间复核、复核回报。

## 6. 文档与校验

- 本 spec + `docs/README.md` 的 `specs/` 目录清单补一行。
- `extensions/claude-code/dev/README.md`：新增 `/dev:pi-scope` 命令条目；写明 `pi.yaml` 是运行时生成物、重装会被冲掉需重跑、`${CLAUDE_PLUGIN_ROOT}` 定位。
- `plugin.json.description` 与根 `README.md` 的 dev 插件命令清单同步 `/dev:pi-scope`。
- 收口跑 `npm run lint` 必须全绿；涉及脚本/契约时按需 `npm run check` / `npm run verify`。
- 全程仓库相对路径，禁止本机绝对路径。

## 7. 验收点

1. 实现第 0 步已核实 `${CLAUDE_PLUGIN_ROOT}` 三条假设（可见 / 可写 / `schemas/` 随装拷贝），或已按结论改定位手段并回改本 spec。
2. `schemas/pi-packages.schema.yaml` 就位，字段与 §3.1 一致；`case`（非 `when`）、`descr` 可选、`default` 恰好一条的约束表达清楚。
3. `/dev:pi-scope`：`pi --list-models` 拉真实清单 → 交互建多套餐 → 生成符合 schema 的 `commands/pi.yaml` → 回显确认；非法输入（0/多 default、model 不在清单、thinking 非枚举）被拦下不落盘。
4. `/dev:pi`：写死速查表已删；读 `pi.yaml` 的 `default` 档；命中套餐回显 `descr`；读不到 yaml 时停下提示先跑 `/dev:pi-scope`；显式 `--model`/`--thinking` 仍优先透传；`</dev/null`/两轴/分段逻辑未动。
5. `README.md`（插件 + 根）、`plugin.json`、`docs/README.md` 同步；`npm run lint` 全绿。
