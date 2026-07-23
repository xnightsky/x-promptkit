# dev scope 下沉 skill + 单文件双层存储设计

> **后续变更（2026-07-23）**：读方不再固定检查“项目根 + home”两个点，也不再无条件默认 Claude；改为从执行命令的 `PWD` 向 home 查找最近的 `.dev-run.yaml`，并由顶层 `default_backend` 决定未显式指定时的后端。见 [2026-07-23-dev-run-default-backend-design.md](./2026-07-23-dev-run-default-backend-design.md)。本文以下内容保留为当时的存储下沉记录。

- 日期：2026-07-23
- 状态：现行实现（2026-07-23 落地，证据见 §9）
- 范围：把 scope（套餐表生成）从 Claude Code 插件专属能力下沉为 `dev-run` skill 共享核心，跨宿主可用；存储从 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`（每后端一文件）改为**单文件 `.dev-run.yaml`、按安装作用域分双层**。
- 关联：[2026-07-14-ai-cli-handoff-unification-design.md](./2026-07-14-ai-cli-handoff-unification-design.md)（共享核心 + 镜像机制基线）、[2026-07-14-dev-scope-generalized-design.md](./2026-07-14-dev-scope-generalized-design.md)（现行 scope 实现；其 §3「scope 全在插件侧、scoping.md 不镜像」与 §8「不把 scope 放进共享 skill」两条被本设计取代）。

## 1. 背景与决策

现行实现（2026-07-14 落地）：scope 引擎 `scoping.md` 是插件原生文件，生成物落 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`，只有 CC 宿主能用。非 CC 宿主（Kimi/Codex/opencode/pi 上的 dev-run skill）有 Tier-2 编排但无 scope。

2026-07-22 ~ 23 讨论结论（本设计的三条决策）：

1. **scoping 下沉 skill**：scope 引擎的三块能力（跑 list-models、`AskUserQuestion` 交互建档、校验写文件）Kimi 等宿主都具备，无需等任何官方 slash command。scoping.md 移入 `skills-def/dev-run/references/` 作 authored 源，插件侧改为镜像，复用 `scripts/sync-handoff-core.mjs` 防漂移。
2. **单文件存储**：不再每后端一个 yaml、不再建 `.dev-run/` 目录；一个 `.dev-run.yaml` 装全部后端的套餐表。
3. **双层存储**：插件和 skill 都可能是项目级或用户级安装，存储跟着安装作用域走——用户级安装 → `~/.dev-run.yaml`；项目级安装 → `<项目根>/.dev-run.yaml`。读方就近优先（§5）。

语义依据：套餐表绑定的是「用户 × 本机 CLI 安装 × （可选）项目」，不是仓库资产；现行 `${CLAUDE_PLUGIN_DATA}` 本就是用户级位置，本设计只是把它显式化并补平项目级一档。

## 2. 文件结构（单文件）

```yaml
# 由 dev-run scope 生成 · 符合 references/packages.schema.yaml
version: 1
backends:
  pi:
    packages:
      - name: 省钱（默认）
        model: deepseek/deepseek-v4-flash
        case: 官方 deepseek，1M context / 384K max-out，速度快
        knobs:
          thinking: high
        default: true
  cursor:
    packages:
      - name: ...
```

- 顶层：`version`（int≥1）+ `backends`（map，key = `backends.md` 登记的后端名）。
- 每个 backend section 复用现行 package 结构（`name/model/case/default` 必填，`descr/knobs` 可选），字段语义不变。
- `schemas/packages.schema.yaml` 扩展为**整文件权威**（增加 `backends` 层），随 scoping.md 一起下沉镜像（见 §3）。

## 3. 架构变更

| 项 | 当前实现 | 目标设计 |
|---|---|---|
| `scoping.md` | `extensions/claude-code/dev/references/`（插件原生） | authored 于 `skills-def/dev-run/references/scoping.md`，插件侧变镜像 |
| `packages.schema.yaml` | `extensions/claude-code/dev/schemas/` | authored 于 `skills-def/dev-run/references/packages.schema.yaml`（与 scoping.md 同目录，保持相对引用稳定），插件侧镜像到 `schemas/` |
| `sync-handoff-core.mjs` | 镜像 `backends.md`、`orchestration.md` | `FILES` 增加 `scoping.md`；schema 单加一条镜像规则（源 references/ → 目标 schemas/） |
| 落盘位置 | `${CLAUDE_PLUGIN_DATA}/<backend>.yaml` | 双层 `.dev-run.yaml`（§4、§5） |
| 触发形态 | 仅 `/dev:scope <backend>` 斜杠 | CC 斜杠不变；skill 宿主走自然语言显式请求（`SKILL.md` 加 scope 小节指向 `references/scoping.md`） |

- **去 `${CLAUDE_PLUGIN_*}`**：scoping.md 内 `${CLAUDE_PLUGIN_ROOT}/references/backends.md` 改相对引用 `./backends.md`；schema 引用改 `./packages.schema.yaml`；落盘路径改 §4 双层规则。改完后共享核心 4 份文件（backends/orchestration/scoping/schema）全部宿主无关。
- **CC 命令侧**：`commands/scope.md`、`pi.md`、`cursor.md`、`kimi.md` 的落盘/读方路径改写为双层规则；`scope.md` 的 frontmatter 与引擎流程不变。
- **旧存储迁移**：`${CLAUDE_PLUGIN_DATA}/<backend>.yaml` 直接作废，不做自动迁移——套餐表是可再生便利层，文档注明「升级后重跑一次 scope」。读方**不**回退读旧位置（避免第三份事实）。

## 4. 写方契约（scope 生成落盘）

1. **判定安装作用域**（看自身安装路径，不问用户）：
   - skill 形态：skill 位于 `<根>/.agents/skills/dev-run/`（或宿主等价技能目录）——`<根>` 是 home → 用户级；`<根>` 是项目目录 → 项目级。
   - CC 插件形态：`${CLAUDE_PLUGIN_ROOT}` 在项目目录下 → 项目级；在 home 下 → 用户级。
2. **落盘**：写对应层的 `.dev-run.yaml`——用户级 → `~/.dev-run.yaml`；项目级 → `<项目根>/.dev-run.yaml`。`~` 由执行 agent 解析为本机用户目录（Windows 下同）。
3. **局部更新**：文件已存在 → 只替换本 backend 的 section，**保留其他 backend section 与文件内其余内容**；不存在 → 新建。全部通过校验前不落盘、不留半成品（沿用现行约束）。
4. **git 处理**：项目级 `.dev-run.yaml` 默认建议 gitignore（机器本地模型清单）；文件无敏感信息，团队想共享默认档可自行决定提交。

## 5. 读方契约（便捷壳 / skill 侧读默认档）

没给显式 model/knob 旋钮时，**按 backend 就近取值**：

1. 读 `<项目根>/.dev-run.yaml`，含该 backend section → 用其 default 档。
2. 否则读 `~/.dev-run.yaml`，含该 backend section → 用其 default 档。
3. 都没有 → 回退后端自身默认（pi 裸 `pi -p`、cursor `composer-2.5-fast`、kimi 裸 `kimi -p`；现行行为不变）。

- **合并粒度 = 整个 backend section**：不做 packages 数组级跨层合并（就近层整段胜出，规则一句话能说清）。
- 显式旋钮（`--model`/`--thinking`）永远压过 yaml 默认档（现行行为不变）。
- 命中且有 `descr` → 回显（现行行为不变）。

## 6. 异常态

沿用 scoping.md 现行第 6 步（CLI 不存在/list 失败 → 打印 stderr 停；用户放弃 → 不落半成品；校验反复不过 → 如实告知），新增：

- **目标层不可写**（home/项目目录无写权限）→ 报错停下；**不**自动改写另一层冒充成功。
- **已存在 `.dev-run.yaml` 但结构非法**（缺 `version`、`backends` 非 map）→ 停下如实报告，由用户决定修或删，不静默覆盖整个文件。
- **作用域判定不出**（skill 安装路径既不在项目也不在 home，如全局 npm 目录）→ 按用户级处理并在落盘前告知实际路径。

## 7. 验收点

1. `skills-def/dev-run/references/{scoping.md,packages.schema.yaml}` 就位；`sync-handoff-core.mjs` 覆盖 4 份文件，`--check` 零退出；共享核心全文无 `${CLAUDE_PLUGIN_*}`。
2. CC 端到端：项目级安装 `/dev:scope pi` → 落 `<项目>/.dev-run.yaml`；用户级安装 → 落 `~/.dev-run.yaml`；`/dev:pi` 按 §5 就近读档；删文件后回退裸 `pi -p` 不停。
3. skill 宿主（Kimi）自然语言触发 scope → 按安装作用域落对应层，多 backend 写同一文件互不干扰。
4. 已有多 backend 的文件跑单 backend scope → 其他 section 原样保留。
5. `npm run lint`、`npm run check` 全绿；`SKILL.md`、`EXAMPLES.md`、插件 README、根 README、`docs/README.md` 同步；两份 2026-07-14 spec 顶部标注被本设计取代的条目。

## 8. 非目标（YAGNI）

- 不做 packages 数组级跨层合并（§5 已定为整段就近）。
- 不做旧 `${CLAUDE_PLUGIN_DATA}` 文件的自动迁移/回退读取。
- 不给 `claude`/`codex`/`opencode` 上 scope（前提仍是交接模板先支持 `--model`）。
- 不做 `.dev-run/` 目录 + 每后端一文件的存储形态（已被单文件决策取代）。
- 不做套餐表自动巡检；过期重跑 scope。

## 9. 落地证据（2026-07-23）

按 §3 变更清单实施后，在仓库根执行：

```text
$ node scripts/sync-handoff-core.mjs
SYNCED: skills-def/dev-run/references/backends.md → extensions/claude-code/dev/references/backends.md
SYNCED: skills-def/dev-run/references/orchestration.md → extensions/claude-code/dev/references/orchestration.md
SYNCED: skills-def/dev-run/references/scoping.md → extensions/claude-code/dev/references/scoping.md
SYNCED: skills-def/dev-run/references/packages.schema.yaml → extensions/claude-code/dev/schemas/packages.schema.yaml

$ npm run check
check:fixtures: PASS
sync:handoff-core --check: PASS

$ npm run lint
lint:code: PASS / lint:docs: PASS / lint:repo: PASS

$ npm test
pass 157 / fail 0
```

未做端到端真机验收（§7 第 2~4 条的 `/dev:scope` 交互跑通）：需要真实安装插件/skill 并消耗真实后端 CLI 调用，留给下次显式集成验证；本次交付以镜像一致、静态契约与全量单测为准。

### 9.1 后续打磨（同日）：skill 包全面宿主无关化

首轮下沉后 review 发现 skill 包（`skills-def/dev-run/`，会分发到 Kimi/Codex/opencode/pi 等宿主）仍残留 CC 形态的注记——包括一处 `${CLAUDE_PLUGIN_ROOT}` 硬引用。已全量清除：

- `references/scoping.md`、`backends.md`、`orchestration.md`：删除 `/dev:*` 命令名、插件内部路径、`${CLAUDE_PLUGIN_*}` 变量；镜像头注记改为宿主无关表述（「它会被镜像进各宿主的分发形态，只改这一份」）；`backends.md#pi` 的 `</dev/null`  rationale 从「Claude Code 的 Bash 工具」改写为「非 TTY 宿主」一般化表述。
- `SKILL.md` Tier-2 条目、`agents/claude-code.yaml`、`agents/kimi.yaml`：删除 `/dev:run`、`/dev:kimi` 等交叉引用。
- 验收：`grep -rn '/dev:|Claude Code|CLAUDE_PLUGIN' skills-def/dev-run/` 零命中；`npm run lint` / `npm run check` 全绿。
- 边界：CC 斜杠形态与 skill 的对应关系只在插件侧文档（`extensions/claude-code/dev/README.md`、根 `README.md`）记录，skill 包内不反向引用。

### 9.2 事故记录（同日）：description 未加引号导致全宿主静默拒载

首轮 scope 小节改动往 `SKILL.md` 的 description 里加了「Also handles scope: …」，其中 `scope:` 的**冒号+空格在 YAML 普通标量里非法**，整个 frontmatter 解析失败。后果是跨宿主一致的**静默拒载**：Kimi 不列入 skill 列表、`npx skills add` 也发现不了 dev-run（两者都是解析失败即跳过、无报错 surfacing）。修复：description 整体加双引号（对齐 pua 等既有 skill 的写法）。

- 诊断路径：`kimi -p` 探针确认未加载 → 读 session wire.jsonl 确认不在系统 skill 列表 → 读 kimi-code 0.28.1 的 dist 解析代码（directory skill 要求 frontmatter 首行 `---`、顶层 mapping、`name`/`description` 必填）→ 对比可加载 skill 的 description 写法定位 `: `。
- 验收：修复后 `kimi -p` 探针回答「有」；`npx skills add . -l` 列出 dev-run；`skills-def/` 全仓 grep 确认无其他未加引号且含 `: ` 的标量。
- 教训（约束）：**SKILL.md frontmatter 的标量值只要含冒号，必须加引号**；改 frontmatter 后的验收不能只看 lint（本仓 lint 不解析 skill frontmatter 的 YAML 语义），要用目标宿主做一次加载探针。
