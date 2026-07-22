# AI CLI 交接统一设计（dev-run + 按宿主分形态）

> **后续变更（2026-07-23）**：scope 不再是插件专属——引擎下沉进 skill 共享核心（`references/scoping.md` + `packages.schema.yaml` 同样经 `sync-handoff-core` 镜像），存储从 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml` 改为单文件双层 `.dev-run.yaml`。见 [2026-07-23-dev-scope-skill-sinking-design.md](./2026-07-23-dev-scope-skill-sinking-design.md)。

- 日期：2026-07-14
- 状态：现行实现
- 范围：把「一个 AI CLI 调用另一个 AI CLI」的两套重叠实现（`ai-run` skill + `extensions/claude-code/dev` 插件的 `/dev:pi`、`/dev:cursor`）收敛成**一份单一事实源核心 + 按宿主分形态**；skill 改名 `ai-run` → `dev-run`。

## 1. 背景与动机

### 1.1 要解决什么

改动前有两套彼此重叠、又各自残缺的「交接」实现：

- `skills-def/ai-run/`（skill 轨道，`npx skills` 装，跨平台）：把任务压成一条非交互命令，后端 claude(默认)/codex/opencode/pi。**极简一发**，命令骨架被 `integration-tests/ai-run/` 精确锁死；缺 cursor-agent。
- `extensions/claude-code/dev/`（插件轨道，`claude plugin` 装，只服务 Claude Code）：`/dev:pi`、`/dev:cursor` 带**重编排**（两轴复杂度闸门→拆段串行→段间 `git diff` 复核、`</dev/null` 护栏、pi.yaml 套餐、cursor 安全档），但 `pi.md`/`cursor.md` 大量复制粘贴，只覆盖 pi/cursor。

目标本质：**任何 AI CLI 都能「感知 + 方便地调用」另一种 AI CLI，形式随当前宿主的舒服方式走**——Claude Code 用斜杠 `/dev:*`；Codex 不支持斜杠，就走 skill/自然语言触发这类非斜杠形态。

### 1.2 关键取舍

- **两轴 × 两档 × 多宿主**：后端轴（谁干活：claude/codex/opencode/pi/cursor-agent）与宿主轴（谁编排、用什么原生形态触发）正交拆开。
- **两档共享核心**：Tier-1 极简一发（`dev-run` 默认，测试锁死）+ Tier-2 完整编排；两档共享同一份后端表与命令模板。
- **改名 `ai-run` → `dev-run`**：与 CC 插件 `/dev:*` 品牌对齐，形成对称——skill 形态 `dev-run` ⟺ Claude Code 斜杠形态 `/dev:run`，同源同名。

## 2. 目标架构

- **后端轴** = `skills-def/dev-run/references/backends.md` 的 5 条登记：每条含命令模板、stdin 护栏（如 pi/cursor 的 `</dev/null`）、Shell 转义、wait 预算、model/安全/thinking 旋钮。**单一事实源**。
- **编排档**：
  - **Tier-1 · 极简一发**：`skills-def/dev-run/SKILL.md` 正文，压成一条命令→跑→回报，不拆段、不加监控。
  - **Tier-2 · 完整编排**：`skills-def/dev-run/references/orchestration.md`，两轴闸门→拆段串行→段间 `git diff` 复核；显式触发。
- **宿主形态**（形式随宿主）：
  - **Claude Code** → 斜杠插件 `/dev:run`（通用）+ `/dev:pi`、`/dev:cursor`（带专属旋钮的便捷壳）；core 由 `${CLAUDE_PLUGIN_ROOT}/references/*` 提供。
  - **Codex**（无斜杠）→ 装 `dev-run` skill（`npx skills -a openai`），skill 作静态上下文、自然语言触发；`agents/openai.yaml` 声明接口。
  - **opencode / pi** → 同理装 skill（`-a opencode|pi`）+ `agents/<platform>.yaml`。

## 3. 目录与契约

```
skills-def/dev-run/
  SKILL.md              # Tier-1 默认档 + 后端选择 + 指向 references/ + Tier-2 指针
  EXAMPLES.md           # 典型输入/输出/反例（含 cursor case）
  references/           # 单一事实源(core)
    backends.md         #   5 后端登记表
    orchestration.md    #   Tier-2 重编排
  agents/{openai,opencode,pi,claude-code}.yaml   # 各平台接口/策略
extensions/claude-code/dev/
  references/{backends,orchestration}.md   # 镜像（提交入库，供 ${CLAUDE_PLUGIN_ROOT} 运行时读）
  commands/{run,pi,cursor}.md              # run=通用；pi/cursor=便捷壳，引用 references/*
scripts/sync-handoff-core.mjs             # 镜像 + --check
```

### 3.1 单一事实源跨轨道一致

skill 轨道（`npx skills`）与插件轨道（`claude plugin`）**分开安装、无法运行时共享**。故：core 只 authored 一次在 `skills-def/dev-run/references/`；`scripts/sync-handoff-core.mjs` 把它镜像进 `extensions/claude-code/dev/references/`（提交入库）。仿仓库既有的 `recall:sync-shared` 做法。

- 改核心：只改 skill 侧那一份，跑 `npm run sync:handoff-core` 同步。
- 防漂移：`npm run check` 内含 `node scripts/sync-handoff-core.mjs --check`，镜像与源不一致即非零退出。镜像头是静态 HTML 注释（不带 git 短哈希），`--check` 纯按内容比对。
- 非 Claude 宿主无需镜像：`references/` 本就随 skill 一起被 `npx skills` 打包。

### 3.2 pi 的 `</dev/null` 统一（行为对齐）

旧 `ai-run` 的 pi 命令模板缺 `</dev/null`，在 Claude Code 非 TTY Bash 下会永久卡死（`pi -p` 死等 stdin EOF）。统一后 `backends.md#pi` 一律带 `</dev/null` 护栏——零成本、且是唯一在非 TTY 宿主下不卡死的正确形态。`integration-tests/dev-run/case-04` 的骨架约束与断言随之对齐（断言仍只查 `pi`/`-p` 包含、其他后端 token 不包含，不因 `</dev/null` 破）。

## 4. 输入/输出契约与异常态

- **输入**：用户任务 + 后端信号（`/dev:run` 的**首个位置参数**；便捷壳钉死后端）+ 可选旋钮（`--model`/`--thinking`(pi)/`--force`(cursor)/`--timeout`）。
- **输出**：Tier-1 = 一条非交互命令并执行、回报关键结果；Tier-2 = 单次或分段执行 + 段间 `git diff` 复核 + 收口简报。
- **异常态**：任务为空→停下问；`/dev:run` 首参非合法后端→停下让用户选；不支持的后端→报不支持并列支持列表；某段失败/超时→停下回报现状、不盲目重试整坨。

## 5. 与既有 spec 的衔接

- [2026-06-30-dev-pi-plugin-design.md](./2026-06-30-dev-pi-plugin-design.md)：插件轨道、marketplace/plugin 命名（plugin `name` 固定 `dev`、`/dev:` 前缀来源）、安装器 `install-dev-plugin.mjs` 均**不变**；本次只把命令正文的编排逻辑下沉到 `references/` 并加 `/dev:run`、`/dev:cursor` 命令。
- [2026-07-12-dev-pi-scope-packages-design.md](./2026-07-12-dev-pi-scope-packages-design.md)：`/dev:pi-scope` 与 `pi.yaml` 套餐机制、`schemas/pi-packages.schema.yaml` —— **已于 2026-07-14 整体移除**（见 §8），该 spec 转历史记录。

## 6. 验收点

1. `skills-def/dev-run/` 就位：`SKILL.md` name=`dev-run`、含 cursor 后端与 Tier-2 指针；`references/{backends,orchestration}.md` 为单一事实源；`agents/{openai,opencode,pi,claude-code}.yaml` 齐。
2. `node scripts/sync-handoff-core.mjs` 生成插件侧镜像；`--check` 零退出；`npm run check` 全绿。
3. 插件 `commands/{run,pi,cursor}.md` 瘦身、只引用 `references/*`。
4. `integration-tests/dev-run/case-01..06` 骨架与断言随命名/`</dev/null` 对齐。
5. `npm run lint` 无新增失败（`lint:docs` 链接全通、`lint:repo` 无本机绝对路径）。
6. `$ai-run`→`$dev-run`、`iitest:ai-run`→`iitest:dev-run` 全量迁移，仓库内无残留 `ai-run` 引用（CHANGELOG 历史条目除外）。

## 7. 非目标（YAGNI）

- 不引 marketplace 远程发布 / GitHub 源安装。
- 不为 codex/opencode 在 CC 插件里各建独立斜杠命令（用通用 `/dev:run <后端>`）。
- 不把 Tier-2 编排塞进 Tier-1 默认路径（保住测试契约）。
- 不再另建独立 skill：Tier-1/Tier-2 同在 `dev-run`（references + 显式指针），避免跨 skill 引用在独立安装时断链。

## 8. 后续变更：移除 /dev:pi-scope 与 pi.yaml 套餐（2026-07-14）

整合落地后，评估认为 pi 专属的套餐生成器（`/dev:pi-scope` → `pi.yaml`）是**单后端的投机快捷方式**，遂整体撤下，待将来做**面向多后端的通用预设生成（scope）**时一起重做（YAGNI：第 2 个真实消费者出现再抽通用件）。

- **删**：`commands/pi-scope.md`、`schemas/pi-packages.schema.yaml`。
- **`/dev:pi` 去套餐依赖**：不再读 `pi.yaml`、不再「读不到就停下」；不给 `--model`/`--thinking` 时缺省走裸 `pi -p`（pi 自身默认 model），显式旋钮照常透传。
- **作废**：§5「`2026-07-12` 套餐机制不变」、§7「不改 pi.yaml 套餐机制」两条随本次移除失效。
- **后续（同日重做）**：随即按「面向多后端的通用 scope」重做为 `/dev:scope <backend>`，见 [`2026-07-14-dev-scope-generalized-design.md`](./2026-07-14-dev-scope-generalized-design.md)——scope 回归但**泛化 + 插件专属 + 可选便利层**（`/dev:pi` 读不到 yaml 回退裸 `pi -p`，不再停）；`2026-07-12` 两份 spec 横幅已改「被通用 scope 取代」。
