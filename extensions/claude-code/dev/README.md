# dev 插件（Claude Code）

x-promptkit dev 模块的 Claude Code 侧插件，承载 `/dev:*` 斜杠命令。当前命令：

- `/dev:run <claude|codex|opencode|pi|cursor>` — 通用交接：**第一个位置参数**选执行者，把当前任务交接给它落地（复杂度超标自动拆段串行喂）。
- `/dev:pi` — `/dev:run` 钉死 pi 的便捷壳（默认档可读 `/dev:scope pi` 生成的 `pi.yaml`，无则走 pi 自身默认）。
- `/dev:cursor` — `/dev:run` 钉死 cursor-agent 的便捷壳（默认 `--trust` 安全档；model 可读 `cursor.yaml`，无则 `composer-2.5-fast`）。
- `/dev:scope <pi|cursor>` — 按真实可用模型交互生成该后端套餐表 `<backend>.yaml`（供便捷壳读默认档；claude/codex/opencode 无 scope）。

## 核心事实源（`references/`）

后端命令模板、`</dev/null` 护栏、两轴复杂度闸门、拆段与段间复核这些**编排核心**不写在各命令正文里，而是 `references/backends.md` + `references/orchestration.md` 一份事实源，各命令用 `${CLAUDE_PLUGIN_ROOT}/references/*` 引用。

`references/backends.md` + `references/orchestration.md` 是 **`skills-def/dev-run/references/` 的镜像**（跨轨道无法运行时共享，故提交入库一份）。**只改 skill 侧那两份源**，改完在仓库根跑 `npm run sync:handoff-core` 同步；`npm run check` 会用 `--check` 兜住漂移。同一能力的非 Claude 宿主形态就是 `dev-run` skill 本身（`npx skills add . --skill dev-run -a openai|opencode|pi`）。

> `references/scoping.md` 是**例外**——它是 scope 引擎、CC 插件专属能力，**插件原生、不镜像**、不进宿主无关的 `dev-run` skill。

## scope 与套餐表（`<backend>.yaml`）

`/dev:scope <backend>`（引擎见 `references/scoping.md`）按 `<backend> --list-models` 的**真实可用模型**交互生成该后端套餐表，落 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml`（`~/.claude/plugins/data/{插件id}/`，**跨插件升级/重装持久、不进版本控制**；结构 schema 随插件走 `${CLAUDE_PLUGIN_ROOT}/schemas/packages.schema.yaml`）。`/dev:pi`、`/dev:cursor` 便捷壳没给显式旋钮时读它的 `default` 档；**读不到则回退后端自身默认**（scope 是可选便利层）。想换套餐重跑 `/dev:scope <backend>` 覆盖。当前支持 pi、cursor；claude/codex/opencode 因交接模板不吃 `--model`，无 scope。

## 为什么是插件（而非 npx skills）

带冒号的命名空间 `/dev:pi` 只有 Claude Code 插件能提供（裸 `.claude/commands/` 的子目录只是描述标签、不改命令名）。x-promptkit 的 `npx skills` 只装 `SKILL.md` 技能、不认斜杠命令，所以本插件走 `claude plugin` 独立安装。

## 安装 / 卸载

推荐用仓库脚本（薄包装 `claude plugin`）。下列命令均**在 x-promptkit 仓库根目录执行**（`node scripts/...` 是相对路径）；`--repo <path>` 会以该路径为目标项目，`--global` 装到用户级：

```bash
# 装进当前 repo（项目级）
node scripts/install-dev-plugin.mjs
# 装进指定 repo
node scripts/install-dev-plugin.mjs --repo <path>
# 全机安装（用户级，所有项目可用）
node scripts/install-dev-plugin.mjs --global
# 卸载（带 --global / --repo <path> 对应 scope）
node scripts/install-dev-plugin.mjs --remove [--global|--repo <path>]
```

裸命令兜底：

```bash
claude plugin marketplace add <repo>/extensions/claude-code/dev --scope project
claude plugin install dev@x-promptkit-dev --scope project
# 改源后刷新（install 对已装版本是 no-op，需先卸再装）：
claude plugin disable dev@x-promptkit-dev --scope project
claude plugin uninstall dev@x-promptkit-dev --scope project -y
claude plugin install dev@x-promptkit-dev --scope project
```

插件改动需重启 CC 会话或 `/reload-plugins` 生效。
