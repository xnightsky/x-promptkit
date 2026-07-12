# dev 插件（Claude Code）

x-promptkit dev 模块的 Claude Code 侧插件，承载 `/dev:*` 斜杠命令。当前命令：

- `/dev:pi` — 把当前任务交接给 `pi` CLI 落地（复杂度超标自动拆段串行喂）。
- `/dev:cursor` — 把当前任务交接给 `cursor-agent` CLI 落地（默认 `composer-2.5-fast` + `--trust` 安全档，复杂度超标自动拆段串行喂）。
- `/dev:pi-scope` — 拉真实可用模型清单、交互生成 `/dev:pi` 的套餐速查表 `pi.yaml`。

## `pi.yaml` 生命周期

`pi.yaml` 是**运行时生成物、不进版本控制**，由 `/dev:pi-scope` 交互生成，落 `${CLAUDE_PLUGIN_DATA}/pi.yaml`（即 `~/.claude/plugins/data/{插件id}/`）——这个目录**跨插件升级/重装持久、不会丢**。结构 schema 随插件走 `${CLAUDE_PLUGIN_ROOT}/schemas/pi-packages.schema.yaml`，`/dev:pi` 运行时按此 schema 读取。想换套餐，主动重跑 `/dev:pi-scope` 覆盖即可。

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
