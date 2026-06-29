# dev 插件 /dev:pi 设计

- 日期：2026-06-30
- 状态：现行实现
- 范围：x-promptkit 的 Claude Code `dev` 插件，承载 `/dev:pi` 斜杠命令，把任务交接给 `pi` CLI 落地。

## 1. 背景与动机

### 1.1 要解决什么

- 在 Claude Code 会话里，需要一条**稳定的斜杠命令** `/dev:pi`，把当前任务交给 `pi -p` 执行，编排者只负责拼参数、起进程、段间复核与回报。
- 命令正文是通用的 `pi` CLI 编排流程（模型套餐、两轴复杂度评估、分段串行、`</dev/null` 约束等），与 x-promptkit 的 prompt / skill / runtime 资产同仓维护。

### 1.2 为什么是插件（不是 npx skills）

经核实 Claude Code 官方文档（`agent-sdk/slash-commands`、`skills`）：

- 裸 slash command（`.claude/commands/*.md`）的子目录**只是描述标签，不改命令名**——`.claude/commands/dev/pi.md` 实际命令仍是 `/pi`，**无法**得到 `/dev:pi`。
- 带冒号的 `name:command` 真命名空间**只有插件能提供**，且命令前缀取自 **plugin 名**（非 marketplace 名）。
- 因此 `/dev:pi` ⟺ 必须保留 `.claude-plugin`，且 `plugin.json` 的 `name` 必须固定为 `dev`。
- x-promptkit 的 `npx skills` **只认 SKILL.md，不认斜杠命令**（已实测 `skills --help`），所以命令安装必须自带一条独立轨道，走 `claude plugin`，不复用 `npx skills`。

## 2. 目录与契约

CC 插件是宿主集成，不是 skill，不进只装 SKILL.md 的 `skills-def/`：

```
extensions/
  claude-code/
    dev/
      .claude-plugin/
        marketplace.json   # marketplace 名 x-promptkit-dev
        plugin.json        # plugin 名 dev（/dev:pi 前缀来源，禁止改）
      commands/
        pi.md              # /dev:pi 命令正文
      README.md            # 用途、安装/卸载、与 npx skills 的区别
scripts/
  install-dev-plugin.mjs   # 薄包装 claude plugin（见 §3）
```

- 选 `extensions/<host>/` 命名：清晰表达「按宿主分层的扩展」，并为将来别的 AI 宿主留位（与 `cli/pi/extensions/` 一样用复数 `extensions`，保持一致）。

### 2.1 marketplace / plugin 命名

| 字段 | 值 | 说明 |
|------|-----|------|
| marketplace `name` | `x-promptkit-dev` | 安装串里 `@` 后半段 |
| marketplace `owner.name` | `x-promptkit` | marketplace 归属 |
| plugin `name` | `dev`（**不变**） | `/dev:pi` 的 `dev:` 前缀来源 |
| 安装串 | `dev@x-promptkit-dev` | `plugin@marketplace` |
| 命令 | `/dev:pi` | 用户可见命令名 |

## 3. 安装器：`scripts/install-dev-plugin.mjs`

满足「指定 repo 安装」与「global 安装」，本质是对 `claude plugin` 的薄包装（marketplace 源路径用脚本自身位置 `__dirname` 解析到 `../extensions/claude-code/dev`，不写死任何机器绝对路径）。

CLI scope（`claude plugin install/uninstall --scope user|project|local`，默认 `user`；`marketplace add --scope`，默认 `user`；非 TTY 下 `uninstall` 需 `-y`）：

| 形式 | 调用 | 实际动作 |
|------|------|----------|
| 指定 repo | `node scripts/install-dev-plugin.mjs --repo <path>` | 以 `<path>` 为 cwd 起 `claude plugin marketplace add <mkt> --scope project` + `install dev@x-promptkit-dev --scope project` |
| 当前 repo | `node scripts/install-dev-plugin.mjs` | 同上，cwd 为当前目录，`--scope project` |
| global | `node scripts/install-dev-plugin.mjs --global` | `marketplace add <mkt> --scope user` + `install dev@x-promptkit-dev --scope user`（全机可用） |
| 卸载 | `node scripts/install-dev-plugin.mjs --remove [--global｜--repo <path>]` | `disable` + `uninstall ... -y` + `marketplace remove`，scope 与安装对应 |

脚本要点：

- `--repo` 与 `--global` 互斥；都不给 = 当前 repo（project scope）。
- 失败时打印 `claude` 的原始 stderr 并返回非零退出码，不静默吞。
- 找不到 `claude` CLI 时给出明确提示（「本机未安装 Claude Code CLI」），不报晦涩错误。
- 非 TTY 场景对 `uninstall` 自动补 `-y`。
- `package.json` 提供 `"install:dev-plugin": "node scripts/install-dev-plugin.mjs"` 别名。

兜底：插件 README 同时给出裸 `claude plugin ...` 命令，脚本只是人性化封装。

## 4. `/dev:pi` 命令设计（摘要）

完整正文见 `extensions/claude-code/dev/commands/pi.md`。核心行为：

- **角色**：编排者起 `pi -p`，不自己动手写代码；复杂度超标时由编排者拆段、串行喂 pi、段间 `git diff` 复核。
- **默认套餐**：没给 `--model` 时 `kimi-coding/kimi-for-coding` + `--thinking medium`；省钱备选 `deepseek/deepseek-v4-pro`。
- **复杂度闸门（两轴）**：轴 A 任务规模 vs model context/max-out；轴 B 估算耗时 vs `--timeout` 预算（默认 5m，上限 10m）。任一超标 → 细化分段串行。
- **硬约束**：每个 `pi -p` 必须 `</dev/null`，否则 CC 非 TTY Bash 下 stdin 永不 EOF，进程永久阻塞。

## 5. 文档与校验

- 本 spec + `docs/README.md` 的 `specs/` 目录清单。
- 根 `README.md`「Claude Code 斜杠命令（dev 插件）」：注明走 `claude plugin` 而非 `npx skills`。
- `extensions/claude-code/dev/README.md`：插件用途、安装/卸载/刷新、`/reload-plugins` 限制。
- 收口跑 `npm run lint` 必须全绿；涉及脚本时补 `npm run check` / 单测 `tests/install-dev-plugin.test.mjs`。
- 全程禁止本机绝对路径，一律仓库相对路径。

## 6. 验收点

1. `extensions/claude-code/dev/` 三件套就位，`plugin.json.name == "dev"`，`marketplace.json` 为 `x-promptkit-dev`；`commands/pi.md` 与本文 §4 一致。
2. `node scripts/install-dev-plugin.mjs`（project）与 `--global`（user）均能跑通；`claude plugin marketplace list` / `claude plugin list` 能看到 `x-promptkit-dev` 与 `dev@x-promptkit-dev`；`--remove` 能干净卸载。
   - 注：`/dev:pi` 在活动会话内真正可点用需重启 CC 会话或 `/reload-plugins`；安装器只保证注册成功，这一限制写进文档。
3. `npm run lint` 全绿；本 spec 与各 README 链接、`docs/README.md` 目录一致。

## 7. 非目标（YAGNI）

- 不为 `dev` 插件新增除 `/dev:pi` 外的命令。
- 不改 `pi.md` 命令正文的编排逻辑（模型套餐、`</dev/null` 警示、两轴复杂度评估、分段流程）。
- 不引入 marketplace 远程发布 / GitHub 源安装；本次只覆盖本地 marketplace 路径安装（project / user 两 scope）。
- 不改动 `npx skills` skill 安装链路。
