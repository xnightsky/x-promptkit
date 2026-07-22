# dev 插件 /dev:scope — 通用可配置预设生成机制设计

> **后续变更（2026-07-23）**：本设计 §3「scope 全在插件侧、scoping.md 插件原生不镜像」与 §8「不把 scope 放进共享 skill」已被 [2026-07-23-dev-scope-skill-sinking-design.md](./2026-07-23-dev-scope-skill-sinking-design.md) 取代——scope 下沉为 dev-run skill 共享核心，存储改为单文件双层 `.dev-run.yaml`（项目级/用户级），`${CLAUDE_PLUGIN_DATA}/<backend>.yaml` 形态作废。下文保留作历史记录。

- 日期：2026-07-14
- 状态：已被 2026-07-23 下沉设计部分取代（见顶部横幅）
- 范围：x-promptkit 的 Claude Code `dev` 插件。新增 `/dev:scope <backend>`：把 pi 专属的 `/dev:pi-scope`（已撤下）泛化成**面向多后端、可配置**的预设（套餐表）生成器；`/dev:pi`、`/dev:cursor` 便捷壳读各自 `<backend>.yaml` 默认档。
- 关联：`2026-07-12-dev-pi-scope-packages-design.md`（pi 专属前身，已被本方案取代）、`2026-07-14-ai-cli-handoff-unification-design.md`（dev-run 整合基线，其 §8 记录了 pi-scope 移除→本次重做）。

## 1. 背景与动机

`/dev:pi-scope`（pi 专属：拉真实模型清单 → 交互建套餐 → 落 `pi.yaml`）曾实现、后因「单后端投机」整体移除。现按「面向多后端的通用 scope」重做。

**从 pi-scope 提炼**：通用 **6 步引擎**（拉清单 → 逐条交互建档 → 校验 → 落盘 → 回显 → 异常态）与后端无关；**后端专属只有 4 处** = 每后端一份「scope 配置」：① list-models 命令 + stdin 护栏 ② 要问哪些 knob ③ 校验规则 ④ 输出 yaml 名。抽成配置、引擎复用，即「可配置 scope」。

## 2. 场景分析（哪些后端能 scope）

| 后端 | list-models（backends.md 已有） | stdin | knob | scope? |
|---|---|---|---|---|
| **pi** | `pi --list-models [kw] </dev/null` | 必带 | `thinking`(enum off｜minimal｜low｜medium｜high｜xhigh) | ✅ |
| **cursor-agent** | `cursor-agent --list-models [kw]` | 免 | 无（推理档编进 model ID） | ✅ |
| **claude / codex / opencode** | — | — | — | ❌ dev-run 模板固定、**不吃 `--model`**，无「选模型」这件事 |

`/dev:scope claude` → 报「该后端无 scope」+列 pi/cursor。将来给它们上 scope，前提是先让其交接模板支持 `--model`——另议。

## 3. 架构（scope 全在插件侧，共享核心不动）

**scope 是 CC 插件专属能力**：非 CC 宿主（codex/opencode/pi 上的 `dev-run` skill）没有 `/dev:scope`、没有 `${CLAUDE_PLUGIN_DATA}`、便捷壳也不读 yaml。故：

- **共享核心 `references/backends.md`、`orchestration.md`（skill 源 + 插件镜像）一律不动**——保持宿主无关、无 `${CLAUDE_PLUGIN_*}`（`dev-run` 整合已验证的性质不破）。scope 要的 list-models 命令 backends.md 里本就有，`scoping.md` 引用即可。
- **scope 实现全部落插件 `extensions/claude-code/dev/` 内**，可自由用 `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`；`references/scoping.md` 是**插件原生、不镜像**（`sync-handoff-core` 只镜像 backends/orchestration）。

文件：

| 文件 | 角色 |
|---|---|
| `references/scoping.md` | **插件原生**：通用 6 步引擎 + 每后端 scope 配置 + 读方契约 |
| `schemas/packages.schema.yaml` | 通用结构权威（取代已删的 `pi-packages.schema.yaml`） |
| `commands/scope.md` → `/dev:scope <backend>` | 薄壳：解析首个位置参数=后端名，跑 scoping.md 引擎 |
| `commands/pi.md`、`cursor.md` | 加读方（读 `<backend>.yaml` default 档、回退兜底）+ 补 `Read` in allowed-tools |

### 3.1 定位（沿用 2026-07-12 §2.2 已核实的官方结论）

- 生成物 `<backend>.yaml` → **`${CLAUDE_PLUGIN_DATA}/`**（可写、跨插件升级/重装持久、首用自建；官方定性的「运行时生成、要持久化」落点）。
- schema 与 references → **`${CLAUDE_PLUGIN_ROOT}/`**（只读、随 `claude plugin install` 拷入、命令内联展开）。不往 `${CLAUDE_PLUGIN_ROOT}` 写状态（缓存 ephemeral、升级换路径）。

## 4. 套餐结构（通用 schema）

`schemas/packages.schema.yaml`：顶层 `version`（int≥1）、`packages`（非空数组）。每条 package：

| 字段 | 类型 | 必填 | 说明 |
|---|---|:--:|---|
| `name` | 非空 string | ✓ | 套餐名，用户自定 |
| `model` | 非空 string | ✓ | 后端 model id，须命中该后端 list-models |
| `case` | 非空 string | ✓ | 一句话适用场景 |
| `descr` | string（多行） | — | 可选长告警/注意事项 |
| `default` | bool | ✓ | 全表恰好一条 true |
| `knobs` | object | — | **后端专属旋钮**，如 pi 的 `{thinking: medium}`；cursor 无则省略 |

- **决策：后端专属旋钮统一进 `knobs` 对象**，schema 后端无关；每后端的 knob key/枚举由 `scoping.md` 的 scope 配置声明、校验步兜。加新后端不改 schema。
- 跨字段约束（packages≥1、恰好 1 default、model∈list、knob 值合法）由 `scoping.md` 的 prose + 校验步兜（本仓库无运行时 yaml 校验器，schema 是写读契约 + 人读权威）。

## 5. 读方（便捷壳读 `<backend>.yaml`）

`/dev:pi`、`/dev:cursor` 没给显式 model/knob 旋钮时：读 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml` 取 `default:true` 档的 `model`（+ `knobs`）；命中且有 `descr` → 回显。

- **决策：读不到 yaml（没跑过 scope）→ 回退后端自身默认，不停**（pi 裸 `pi -p`、cursor `composer-2.5-fast`）。scope 是**可选便利层**——比 pi-scope 时代「没 yaml 就停」友好；显式旋钮永远优先。

## 6. 输入/输出契约与异常态

- **输入**：`/dev:scope <backend> [关键词]`——首个位置参数=后端名（对齐 `/dev:run <backend>`），其余=list-models 关键词过滤。
- **输出**：符合 `packages.schema.yaml` 的 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`。
- **异常态**：无 scope 的后端 → 报并列支持项、停；缺后端名 → 停下让选；CLI 不存在/list 失败 → 打印 stderr、停、不写盘；用户放弃 → 不落半成品；校验反复不过 → 如实告知、不放宽不瞎编。

## 7. 验收点

1. `references/scoping.md`（插件原生）、`schemas/packages.schema.yaml`、`commands/scope.md` 就位；`pi.md`/`cursor.md` 加读方 + `Read`；`run.md` 补 `Read`。
2. 共享 `backends.md`/`orchestration.md` 未动、仍无 `${CLAUDE_PLUGIN_*}`；`sync --check` 通过（scoping 不镜像）。
3. 端到端：`/dev:scope pi kimi` → 拉真实清单 → 交互建套餐（含 thinking→knobs）→ 校验 → 落 `${CLAUDE_PLUGIN_DATA}/pi.yaml` → 回显；`/dev:pi` 读到 default 档；删 yaml 后 `/dev:pi` 回退裸 `pi -p` 不停。`/dev:scope cursor` 同（无 thinking、落 cursor.yaml）；`/dev:scope claude` 报「无 scope」。
4. `npm run lint` 全绿（除既有 gitignored `skills-lock.json`）；README（插件+根）、`plugin.json`、`marketplace.json`、`docs/README.md` 同步。

## 8. 非目标（YAGNI）

- 不给 claude/codex/opencode 上 scope（先得让其交接模板吃 `--model`）。
- 不把 scope 放进共享 `backends.md`/skill（保持宿主无关）；`scoping.md` 插件原生、不镜像。
- 不做套餐自动巡检；过期重跑 `/dev:scope <backend>`。
- 不把 `<backend>.yaml` 纳入版本控制。
- 不引新 flag。
