# INSTALL

本仓库 skill 可通过 `npx skills` CLI 安装。

推荐只安装到 `.agents` 和 `claude-code` 两个 agent 目录，避免污染其他平台。

## 命令参考

### 本地安装（从本仓库直接安装）

```bash
cd x-promptkit
npx skills add . --skill <name> -y
```

### 远程安装（从 GitHub 拉取）

```bash
npx skills add xnightsky/x-promptkit --skill <name> -y
```

### 指定 agent 平台

默认已安装到 `claude-code`。通过 `-a` 精确控制：

```bash
# 默认
npx skills add . --skill recall-eval -y

# 仅安装到 claude-code
# npx skills add . --skill recall-eval -a claude-code -y

# 追加其他平台（示例：pi）
# npx skills add . --skill recall-eval -a claude-code -a pi -y
```

### 安装模式与位置

| 参数 | 效果 |
|------|------|
| 默认 | symlink 到当前项目 `.<agent>/skills/<name>/` |
| `-g` | 安装到 `~/.skills/<name>/`，全机可用 |
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
# 本地安装
npx skills add . --skill recall-eval -y

# 远程全局安装
npx skills add xnightsky/x-promptkit --skill recall-eval -g -y

# 安装到所有平台（不推荐，按需取消注释）
# npx skills add . --skill recall-eval -a '*' -y
```

### ai-run

```bash
npx skills add . --skill ai-run -y
```
