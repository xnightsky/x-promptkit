# dev 插件 /dev:pi-scope 套餐机制 Implementation Plan

> ⚠️ **已被通用 scope 取代（2026-07-14）**：本 plan 对应的 pi 专属 `/dev:pi-scope` 已泛化为 `/dev:scope <backend>`，见 [`2026-07-14-dev-scope-generalized-design.md`](./2026-07-14-dev-scope-generalized-design.md)。留作历史记录。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/dev:pi` 里写死的套餐速查表，改成由新命令 `/dev:pi-scope` 按真实可用模型交互生成的 `pi.yaml`，`/dev:pi` 改为读该 yaml。

**Architecture:** 三件套全在 `extensions/claude-code/dev/`：新增写方命令 `commands/pi-scope.md`、结构权威 `schemas/pi-packages.schema.yaml`、改造读方 `commands/pi.md`。生成物 `pi.yaml` 由 `/dev:pi-scope` 运行时写入 `${CLAUDE_PLUGIN_DATA}/pi.yaml`（官方持久化落点，非版本控制物）；schema 随插件走 `${CLAUDE_PLUGIN_ROOT}/schemas/`（只读随装）。定位方式经 Task 0 核实官方文档改定，见其结论表。

**Tech Stack:** Claude Code 插件（slash command markdown + plugin.json）、`pi` CLI（`--list-models` / `-p`）、yaml（类 JSON Schema 子集，无运行时校验器，作人读契约）。

**参照 spec:** `docs/specs/2026-07-12-dev-pi-scope-packages-design.md`（字段/流程/验收以它为准）。

## Global Constraints

- **提交需用户显式同意**（仓库红线 `no-commit-without-consent`）。计划内的 `git commit` 步骤仅在拿到一次性授权后执行；未授权时把改动留在工作区、如实回报，不擅自提交。
- **canary**：本仓库人类可读回复末尾附 `[by=x-promptkit]`（对交付产物本身无影响，指开发过程回复）。
- **无本机绝对路径**：仓库内一律相对路径；命令文档里的运行时路径用插件变量——读 `pi.yaml` 用 `${CLAUDE_PLUGIN_DATA}`、引 schema 用 `${CLAUDE_PLUGIN_ROOT}`，不写死机器路径。
- **收口校验**：改动结束前跑 `npm run lint` 必须全绿（`lint:docs` 是自研脚本，非 markdownlint；IDE 的 MD0xx 私有规则不作数）。
- **`</dev/null` 硬约束**：任何 `pi ...` 调用（含 `pi --list-models`、`pi -p`）在 CC 非 TTY Bash 下必须重定向 `</dev/null`，否则 stdin 永不 EOF、进程永久阻塞。
- **不动 `/dev:pi` 编排逻辑**：两轴复杂度评估、分段串行、段间 `git diff` 复核、复核回报，一律保留原样。
- **字段命名**：套餐条目字段为 `name / model / thinking / case / descr / default`（是 `case`，不是 `when`）。

---

### Task 0: 核实定位假设（前置闸门）— ✅ 已完成

**结论**（claude-code-guide 查官方 `plugins-reference` 定性，已记入 spec §2.2 结论表）：

| 假设 | 结论 | 处置 |
|------|------|------|
| `${CLAUDE_PLUGIN_ROOT}` 对斜杠命令可见、内联展开 | ✅ 成立 | schema 用它引用（只读随装） |
| 插件缓存根运行时可写/可持久 | ❌ **不成立**（官方：缓存 ephemeral、升级换路径、“do not write state here”） | **`pi.yaml` 落点改为 `${CLAUDE_PLUGIN_DATA}/pi.yaml`**（官方持久化落点，`~/.claude/plugins/data/{id}/`，跨版本持久、首用自建） |
| `claude plugin install` 连 `schemas/` 一起拷 | ✅ 成立 | schema 随装可用 |

**因此本计划的定位手段已改定**（spec §2.2/§2.3/§4/§5 + 本计划 Task 1–4 路径同步）：
- 只读 schema → `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml`（随插件分发）。
- 运行时生成物 `pi.yaml` → `${CLAUDE_PLUGIN_DATA}/pi.yaml`（不再放缓存根/「兄弟文件」）。

（无独立提交步：核实结论与 spec 改定位一并计入基线后的文档修订提交。）

---

### Task 1: 结构权威 `schemas/pi-packages.schema.yaml`

**Files:**
- Create: `extensions/claude-code/dev/schemas/pi-packages.schema.yaml`

**Interfaces:**
- Produces: 套餐 yaml 结构定义。写方（Task 2 `pi-scope.md`）据它生成 `pi.yaml`；读方（Task 3 `pi.md`）据它取 `default` 档与字段。字段集：`version`（int≥1）、`packages[]`，每条 `{name, model, thinking(enum), case, descr?, default(bool)}`。

- [ ] **Step 1: 写 schema 文件**

风格对齐 `skills-def/recall-eval/schemas/recall-queue.schema.yaml`（类 JSON Schema 子集，yaml 表达；本仓库无 yaml-schema 运行时校验器，故它是写读两方的结构权威 + 人读契约，跨字段约束落在下方注释与命令 prose）。

```yaml
# dev 插件套餐速查表的结构权威（类 JSON Schema 子集，无运行时校验器，作写读两方契约）。
#
# 写方：extensions/claude-code/dev/commands/pi-scope.md 据此生成 ${CLAUDE_PLUGIN_DATA}/pi.yaml。
# 读方：extensions/claude-code/dev/commands/pi.md 据此取 default 档与各字段。
#
# schema 表达不了的跨字段约束（由两条命令的 prose + pi-scope 的校验步兜住）：
#   - packages 至少 1 条。
#   - 恰好 1 条 default:true（0 条或 ≥2 条都非法）。
#   - 每条 model 必须命中当次 `pi --list-models` 结果集。
$schema: "https://json-schema.org/draft/2020-12/schema"
title: pi packages cheatsheet
type: object
additionalProperties: false
required: [version, packages]
properties:
  version:
    type: integer
    minimum: 1
  packages:
    type: array
    minItems: 1
    items:
      type: object
      additionalProperties: false
      required: [name, model, thinking, case, default]
      properties:
        name:
          $ref: "#/$defs/non_empty_string"     # 套餐名，用户自定
        model:
          $ref: "#/$defs/non_empty_string"     # pi 的 provider/id，须来自 pi --list-models
        thinking:
          enum: [off, minimal, low, medium, high, xhigh]
        case:
          $ref: "#/$defs/non_empty_string"     # 一句话速查：适用场景
        descr:
          type: string                         # 可选长描述/注意事项（多行），存 kimi 那类整段告警
        default:
          type: boolean                        # 全表恰好一条 true
$defs:
  non_empty_string:
    type: string
    minLength: 1
```

- [ ] **Step 2: 结构自检**

肉眼核对：`required` 含 `case` 未含 `when`；`descr` 不在 `required`（可选）；`thinking` 枚举六值齐；跨字段约束（≥1 条、恰好一条 default）已写进顶部注释。

- [ ] **Step 3: 跑 docs lint**

Run: `npm run lint:docs`
Expected: `lint:docs: PASS`（确认新文件相对链接无悬空——本文件无外链，主要确认不破坏全局）。

- [ ] **Step 4:（授权后）提交**

```bash
git add extensions/claude-code/dev/schemas/pi-packages.schema.yaml
git commit -m "feat(dev): 新增 pi 套餐结构权威 schema pi-packages.schema.yaml"
```

---

### Task 2: 写方命令 `commands/pi-scope.md` → `/dev:pi-scope`

**Files:**
- Create: `extensions/claude-code/dev/commands/pi-scope.md`

**Interfaces:**
- Consumes: Task 1 的 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml`（结构权威）。
- Produces: 运行时生成 `${CLAUDE_PLUGIN_DATA}/pi.yaml`，供 Task 3 的 `pi.md` 读。

- [ ] **Step 1: 写命令 frontmatter + 正文**

frontmatter 的 `allowed-tools` 至少要能跑 `pi --list-models` 与写文件。正文按 spec §4 主流程组织，关键点逐条写清（不留「交互略」这种空话）：

frontmatter 骨架：

```markdown
---
description: 拉真实可用模型清单，交互式生成 /dev:pi 的套餐速查表 pi.yaml
argument-hint: [模型关键词(可选，透传给 pi --list-models)]
allowed-tools: Bash(pi:*), Read, Write, AskUserQuestion
---
```

正文必须覆盖：

1. **拉清单**：`pi --list-models $ARGUMENTS </dev/null`（`</dev/null` 硬约束，见 pi.md 警示原文；有关键词就透传，无则全量），解析出可选 `provider/id` 集合。
2. **逐条建套餐（循环，用 AskUserQuestion）**：每轮依次问——从清单挑 `model` → 选 `thinking`（六枚举）→ 写 `name` 与 `case` → 可选填 `descr`（长告警，允许多行/留空）→「设为默认?」→「再加一条 or 收工?」。
3. **校验（落盘前，逐条对 schema）**：`packages` ≥1；恰好 1 条 `default:true`；每条 `model` 命中本次 `--list-models` 结果；`thinking` 合法枚举。任一不过 → 指出问题、回到对应步补齐，**不落半成品**。
4. **落盘**：把结果按 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml` 形状写到 `${CLAUDE_PLUGIN_DATA}/pi.yaml`；文件首行加注释标注「由 /dev:pi-scope 生成 · 符合 schema」。
5. **回显**：把最终 `pi.yaml` 全文回显给用户确认。
6. **异常态**：`pi` 不存在 / `--list-models` 失败 → 打印原始 stderr、停下、不写盘；用户中途放弃 → 不落半成品文件。

正文里给一份「生成结果样例」= spec §3.3 的 yaml（含 kimi `descr` 告警那条），让执行者对齐目标形状。

- [ ] **Step 2: 一致性自检**

核对：命令名（文件名 `pi-scope.md` → `/dev:pi-scope`）；字段用 `case` 非 `when`；每处 `pi` 调用都带 `</dev/null`；生成路径用 `${CLAUDE_PLUGIN_DATA}/pi.yaml` 非写死路径；引用的 schema 路径与 Task 1 文件名一致。

- [ ] **Step 3: 跑 docs lint**

Run: `npm run lint:docs`
Expected: `lint:docs: PASS`。

- [ ] **Step 4:（授权后）提交**

```bash
git add extensions/claude-code/dev/commands/pi-scope.md
git commit -m "feat(dev): 新增 /dev:pi-scope——交互生成 pi 套餐速查表 yaml"
```

---

### Task 3: 改造读方 `commands/pi.md`

**Files:**
- Modify: `extensions/claude-code/dev/commands/pi.md`（现「套餐速查表」段约 11–31 行；决策流程图 `rmodel` 节点；「2. 解析 model」与「3. 解析 thinking」的默认档描述）

**Interfaces:**
- Consumes: Task 2 生成的 `${CLAUDE_PLUGIN_DATA}/pi.yaml`（读 `default:true` 档的 `model`/`thinking`，命中套餐时回显其 `descr`）。

- [ ] **Step 1: 删除写死的套餐速查表段**

删掉现 `## 套餐速查表（推荐 model + thinking 组合）` 整段（含那张 Markdown 表、切换示例、kimi 云端开关告警块，约 11–31 行）。kimi 告警不丢——它迁移进 `pi.yaml` 对应套餐的 `descr`（spec §3.3 样例已示范），由 `/dev:pi` 命中时回显。

- [ ] **Step 2: 新增「读套餐 yaml」段（替换原速查表段位置）**

写一段说明 `/dev:pi` 默认档来源改为 yaml，关键 prose：

```markdown
## 套餐来源（读运行时 pi.yaml）

> 默认 model + thinking 不再钦定在本文件，改由 `/dev:pi-scope` 生成的
> `${CLAUDE_PLUGIN_DATA}/pi.yaml`（符合 `schemas/pi-packages.schema.yaml`）提供。

- 读 `${CLAUDE_PLUGIN_DATA}/pi.yaml`，取 `default: true` 那条套餐的 `model` 与 `thinking` 作默认档。
- 命中某套餐且其有 `descr` 时，把 `descr`（长告警/注意事项）回显给用户。
- **读不到 `pi.yaml` → 停下**，提示「先跑 `/dev:pi-scope` 生成套餐速查表」，不内置任何写死默认。
- 显式 `--model` / `--thinking`（第 2/3 步）优先级最高、原样透传，可不在 yaml 内。
```

- [ ] **Step 3: 改决策流程图 `rmodel` / `rthink` 节点**

把 `rmodel` 节点里「否则默认 kimi-coding/kimi-for-coding (套餐速查表·日常档)」改为「否则读 pi.yaml 的 default 套餐；读不到→停下提示先跑 /dev:pi-scope」；`rthink` 的「否则默认 medium（随套餐速查表）」改为「否则取 pi.yaml default 套餐的 thinking」。其余节点（rtime/gate/over/split/seg/single/done）不动。

- [ ] **Step 4: 改「2. 解析 model」「3. 解析 thinking」默认档描述**

- 「2. 解析 model」的「没给 → 默认 日常档 kimi-for-coding」改为「没给 → 读 `pi.yaml` 的 `default` 套餐取 model；读不到 → 停下提示先跑 `/dev:pi-scope`」。表里「省钱备选 deepseek-v4-pro」这类钦定措辞删掉（改由 yaml 承载）。
- 「3. 解析 thinking」的「没给 → 默认 medium（随套餐速查表）」改为「没给 → 取 `pi.yaml` `default` 套餐的 thinking」。

- [ ] **Step 5: 一致性自检**

核对：全文再无写死套餐表 / 钦定 model 名作默认；`</dev/null` 警示段、两轴复杂度、6A/6B 分段、第 7 步复核回报**原样保留**；读 `pi.yaml` 用 `${CLAUDE_PLUGIN_DATA}` 变量、不写死机器路径。

- [ ] **Step 6: 跑 docs lint**

Run: `npm run lint:docs`
Expected: `lint:docs: PASS`。

- [ ] **Step 7:（授权后）提交**

```bash
git add extensions/claude-code/dev/commands/pi.md
git commit -m "feat(dev): /dev:pi 改读 pi.yaml 套餐、删写死速查表"
```

---

### Task 4: 文档与元数据同步 + 全量 lint

**Files:**
- Modify: `extensions/claude-code/dev/README.md`（新增 `/dev:pi-scope` 条目 + `pi.yaml` 生命周期说明）
- Modify: `extensions/claude-code/dev/.claude-plugin/plugin.json`（`description` 加 `/dev:pi-scope`）
- Modify: `README.md`（根，dev 插件命令清单加 `/dev:pi-scope`）
- 已完成: `docs/specs/2026-07-12-dev-pi-scope-packages-design.md` + `docs/README.md` 清单（brainstorming 阶段已落）

- [ ] **Step 1: 改插件 README**

在命令清单加 `/dev:pi-scope — 拉真实可用模型清单、交互生成 /dev:pi 的套餐速查表 pi.yaml`。另加一小节说明：`pi.yaml` 是**运行时生成物、不进版本控制**，落 `${CLAUDE_PLUGIN_DATA}/pi.yaml`（`~/.claude/plugins/data/{插件id}/`，**跨插件升级/重装持久、不丢**）；schema 随插件走 `${CLAUDE_PLUGIN_ROOT}/schemas/`；想换套餐主动重跑 `/dev:pi-scope` 覆盖。

- [ ] **Step 2: 改 plugin.json description**

把 `description` 里的命令清单补上 `/dev:pi-scope = 生成套餐速查表 yaml`。不改 `name`（仍 `dev`，`/dev:` 前缀来源，禁改）。

- [ ] **Step 3: 改根 README**

在「Claude Code 斜杠命令（dev 插件）」清单加 `/dev:pi-scope` 一行，措辞与插件 README 一致。

- [ ] **Step 4: 全量 lint**

Run: `npm run lint`
Expected: 三段（code/docs/repo）全 PASS。若 `lint:repo` 因新文件报绝对路径/引用问题，按提示修到绿。

- [ ] **Step 5:（授权后）提交**

```bash
git add extensions/claude-code/dev/README.md extensions/claude-code/dev/.claude-plugin/plugin.json README.md
git commit -m "docs(dev): README/plugin.json 同步 /dev:pi-scope 命令与 pi.yaml 生命周期"
```

---

## Self-Review

**Spec 覆盖核对（spec 各节 → 任务）：**
- §2 文件布局 → Task 1（schema）/ Task 2（pi-scope）/ Task 3（pi.md）✓
- §2.2 定位假设 → Task 0（已核实：缓存根不可写 → pi.yaml 改落 `${CLAUDE_PLUGIN_DATA}`）✓
- §2.3 生命周期 → Task 4 Step 1（README 写明落 `${CLAUDE_PLUGIN_DATA}`、跨升级持久不丢）✓
- §3 套餐结构（含 `case`/`descr`/恰好一条 default）→ Task 1 ✓
- §4 pi-scope 主流程（拉清单/交互/校验/落盘/回显/异常）→ Task 2 Step 1 六点 ✓
- §5 pi.md 改动（删表/读 yaml/硬停/显式优先/不动编排）→ Task 3 Step 1–5 ✓
- §6 文档校验 → Task 4 ✓
- §7 验收点 → 各 Task 自检步 + Task 4 全量 lint ✓

**占位符扫描：** 无 TBD/TODO；schema 全文给出；命令正文的六点契约逐条具体（非「交互略」）；pi.md 改动给了替换段落原文与节点改法。

**类型/命名一致：** 字段集 `name/model/thinking/case/descr/default` 在 Task 1 schema、Task 2 生成、Task 3 读取三处一致；`case` 非 `when` 全程一致；生成路径 `${CLAUDE_PLUGIN_DATA}/pi.yaml` 三处一致；schema 文件名 `pi-packages.schema.yaml` 引用一致。

**测试适配说明：** 本改动为纯命令文档 + yaml 契约、无运行代码，不套经典 TDD 单测；闸门为结构自检 + `npm run lint` + spec §7 手动验收点。这与本仓库「纯文档/契约改动不强塞低价值测试」的取向一致。
