# dev 插件（Claude Code）

x-promptkit dev 模块的 Claude Code 侧插件，承载 `/dev:*` 斜杠命令。当前命令：

- `/dev:run <claude|codex|opencode|pi|cursor|kimi>` — 通用交接：**第一个位置参数**选执行者，把当前任务交接给它落地（复杂度超标自动拆段串行喂）。
- `/dev:pi` — `/dev:run` 钉死 pi 的便捷壳（默认档可读 `/dev:scope pi` 生成的 `.dev-run.yaml`，无则走 pi 自身默认）。
- `/dev:cursor` — `/dev:run` 钉死 cursor-agent 的便捷壳（默认 `--trust` 安全档；model 可读 `.dev-run.yaml`，无则 `composer-2.5-fast`）。
- `/dev:kimi` — `/dev:run` 钉死 kimi（Kimi Code CLI）的便捷壳（`-p` 原生 auto permission 直接落编辑、无需放行 flag；model 可读 `.dev-run.yaml`，无则 kimi config 的 `default_model`）。
- `/dev:scope <pi|cursor|kimi>` — 按真实可用模型交互生成该后端套餐表，写 `.dev-run.yaml`（供便捷壳读默认档；claude/codex/opencode 无 scope）。

## 核心事实源（`references/`）

后端命令模板、`</dev/null` 护栏、两轴复杂度闸门、拆段与段间复核这些**编排核心**不写在各命令正文里，而是 `references/backends.md` + `references/orchestration.md` 一份事实源，各命令用 `${CLAUDE_PLUGIN_ROOT}/references/*` 引用。

`references/backends.md`、`references/orchestration.md`、`references/scoping.md` 与 `schemas/packages.schema.yaml` 都是 **`skills-def/dev-run/references/` 的镜像**（跨轨道无法运行时共享，故提交入库一份）。**只改 skill 侧那几份源**，改完在仓库根跑 `npm run sync:handoff-core` 同步；`npm run check` 会用 `--check` 兜住漂移。同一能力的非 Claude 宿主形态就是 `dev-run` skill 本身（`npx skills add . --skill dev-run -a openai|opencode|pi|kimi-cli`）。

## scope 与套餐表（`.dev-run.yaml`）

`/dev:scope <backend>`（引擎见 `references/scoping.md`）按 `<backend> --list-models` 的**真实可用模型**交互生成该后端套餐表，写 `.dev-run.yaml`——**单文件装全部后端**（顶层 `version` + `default_backend` + `backends` map，结构权威 `schemas/packages.schema.yaml`），**按安装作用域分两层写入**：项目级安装写 `<项目根>/.dev-run.yaml`，用户级安装写 `~/.dev-run.yaml`（机器本地物、不进版本控制；项目层建议 gitignore）。读取时从执行命令的 `PWD` 逐级向 home 检索，最近命中的文件生效且不与远层合并；`dev-run` 未显式点名后端时读取 `default_backend`，便捷壳没给显式旋钮时读取对应 section 的 `default` 套餐。所有候选位置都没有配置才回退后端自身默认。想换套餐重跑 `/dev:scope <backend>` 覆盖对应 section。当前支持 pi、cursor、kimi；claude/codex/opencode 因交接模板不吃 `--model`，无 scope。

> 2026-07-23 起 scope 引擎下沉进 `dev-run` skill 共享核心，非 CC 宿主（Kimi/Codex/opencode/pi 上的 skill）也能用自然语言触发同一套 scope；旧 `${CLAUDE_PLUGIN_DATA}/<backend>.yaml` 存储形态已作废，重跑一次 `/dev:scope <backend>` 即在新位置生成。

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
