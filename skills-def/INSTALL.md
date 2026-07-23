# INSTALL

本仓库 skill 可通过 `npx skills` CLI 安装。

推荐只安装到 `.agents` 和 `claude-code` 两个 agent 目录，避免污染其他平台。

## 命令参考

### 本地安装（从本仓库直接安装）

```bash
cd x-promptkit
npx skills add . --skill <name> -g -y
```

### 远程安装（从 GitHub 拉取）

```bash
npx skills add xnightsky/x-promptkit --skill <name> -y
```

### 指定 agent 平台

默认已安装到 `claude-code`。通过 `-a` 精确控制：

```bash
# 默认
npx skills add . --skill recall-eval -g -y

# 仅安装到 claude-code
# npx skills add . --skill recall-eval -g -a claude-code -y

# 追加其他平台（示例：pi）
# npx skills add . --skill recall-eval -g -a claude-code -a pi -y
```

### 安装模式与位置

本仓库推荐全局安装（`-g`），因为 skill 装到其他项目里使用，不是在本仓库内用。

| 参数 | 效果 |
|------|------|
| `-g` | 安装到 `~/.skills/<name>/`，全机可用（**推荐**） |
| 默认 | symlink 到当前项目 `.<agent>/skills/<name>/` |
| `--copy` | 复制文件而非 symlink |

默认为 symlink。repo 与 global 同时存在同名 skill 时 repo 版本优先。

### 其他命令

| 操作 | 命令 |
|------|------|
| 查看可安装 skill 列表 | `npx skills add xnightsky/x-promptkit -l` |
| 查看已安装 skill | `npx skills list` |
| 更新 | `npx skills update <name>` |
| 卸载指定 skill | `npx skills remove recall-eval -y` |
| 从全局卸载 | `npx skills remove recall-eval -g -y` |
| 从指定 agent 卸载 | `npx skills remove recall-eval -a claude-code -y` |
| 卸载全部 skill | `npx skills remove --all` |

---

## 快速命令

### recall-eval

```bash
# 本地全局安装
npx skills add . --skill recall-eval -g -y

# 远程全局安装
npx skills add xnightsky/x-promptkit --skill recall-eval -g -y

# 安装到所有平台（不推荐，按需取消注释）
# npx skills add . --skill recall-eval -g -a '*' -y
```

### recall-author

```bash
# 本地全局安装
npx skills add . --skill recall-author -g -y

# 远程全局安装
npx skills add xnightsky/x-promptkit --skill recall-author -g -y
```

### dev-run

`dev-run` 是「AI CLI ↔ AI CLI 交接」能力的 skill 形态（Tier-1 极简一发默认 + Tier-2 编排，见 `skills-def/dev-run/references/`）。Claude Code 侧的斜杠形态是 `extensions/claude-code/dev` 插件的 `/dev:run`、`/dev:pi`、`/dev:cursor`（另走 `claude plugin`，见根 README）。

```bash
# 本地全局安装（默认 claude-code）
npx skills add . --skill dev-run -g -y

# 给非 Claude 宿主装上「调用别的 AI CLI」的能力（无斜杠、自然语言触发）：
# codex / opencode / pi —— references/ 随 skill 一起打包
npx skills add . --skill dev-run -g -a codex -y
npx skills add . --skill dev-run -g -a opencode -y
npx skills add . --skill dev-run -g -a pi -y
```

#### Kimi：装进 `.kimi-code/skills`（不进 `.agents/skills`）

Kimi 不要直接 `npx skills add ... -a kimi-cli`：skills CLI 内置注册表把 `kimi-cli` 的**全局落点写死为 `~/.config/agents/skills/`（Kimi 官方不扫描该目录，装了也白装）**，项目级落点写死为 `.agents/skills/`（Kimi 会扫，但那是跨工具共享目录）。要落 Kimi 专属目录，走中转脚本 `scripts/skills.mjs`——它用 `npx skills` 在临时 staging 里完成发现/校验/提取（`--copy` 出真实文件），再把产物拷贝到指定位置，全程不碰 `.agents/skills`：

```bash
# 装进当前项目 <cwd>/.kimi-code/skills/dev-run（项目级，Kimi 官方扫描目录）
node scripts/skills.mjs

# 装进用户级 ~/.kimi-code/skills/dev-run（全机可用）
node scripts/skills.mjs --global

# 装进指定项目 / 自定义技能根目录（--dest 可多次，三类 flag 可自由组合、一次装多个位置）
node scripts/skills.mjs --repo <path>
node scripts/skills.mjs --dest <skills 根目录> --global

# 卸载（删对应目录，flag 组合与安装一致）
node scripts/skills.mjs --remove [--global|--repo <path>|--dest <dir>]
```

注意：装的是**复制件**，仓库里改了 `skills-def/dev-run/` 不会自动同步，重跑一次脚本即覆盖更新；skill 列表在 Kimi 会话启动时扫描，装完要**新开会话**才生效。
