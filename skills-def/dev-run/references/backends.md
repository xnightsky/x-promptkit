# Backends — 交接执行后端登记表

> **本文件是「AI CLI 交接」的后端唯一事实源。** `dev-run` skill（Tier-1 极简一发 / Tier-2 编排）、
> Claude Code 插件的 `/dev:run`、`/dev:pi`、`/dev:cursor` 命令都读这里取后端命令模板。
> 插件侧 `extensions/claude-code/dev/references/backends.md` 是本文件的**镜像**，由
> `scripts/sync-handoff-core.mjs` 生成——**只改这一份**，改完 `npm run sync:handoff-core` 同步。

每个后端登记：命令模板 / stdin 护栏 / wait 预算 / 旋钮。所有后端都是**一次性非交互命令**。

## claude（默认后端）

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"
```

- 触发信号："用 claude" / "claude -p" / "code"；**也是无显式信号时的默认后端**。
- 保持外层双引号。`IS_SANDBOX=1` 与 `--dangerously-skip-permissions` 是默认命令骨架的一部分，不是重试才加的补丁。
- 保持 `-p` 在 `--dangerously-skip-permissions` 之后，不要重排。
- 不加 `--verbose` / `--output-format stream-json` 等额外 flag；不发明不存在的 flag（如 `dangerouslyDisableSandbox`）。
- 无需 `</dev/null`。wait 预算：`1800000ms`（claude 单次可能跑很久，最小等待也不得低于此值）。

## codex

```bash
cd <workdir> && codex exec --json "<task>"
```

- 触发信号："用 codex" / "codex exec" / "codex exec --json"。
- 保持外层双引号。`--json` 开机器可读输出。
- 不加 `--agent` 或任何 agent 专属 flag，除非用户显式要求。
- **不加任何 skill 加载前缀或斜杠命令语法**（codex 本就不吃斜杠）。
- wait 预算：`600000ms`。

## opencode

```bash
cd <workdir> && opencode run "<task>"
```

- 触发信号："用 opencode" / "opencode run"。
- 保持外层双引号。
- 不加 `use skill tool to load ...` 或任何 superpowers 前缀，除非用户显式要求。
- wait 预算：`600000ms`。

## pi

```bash
cd <workdir> && pi -p [--model <M>] [--thinking <T>] "<task>" </dev/null
```

- 触发信号："用 pi" / "pi -p"。
- 保持外层双引号。
- ⚠️ **`</dev/null` 不可省（否则永久卡死、0 输出）**：`pi -p` 会读 stdin 直到 EOF（为支持 `echo ... | pi -p` 管道拼接）。Claude Code 的 Bash 工具是**非 TTY**、stdin 是个不会关闭的管道 → pi 永远等不到 EOF，**阻塞在 stdin 读、连 session 都不建、stdout 一个字节都没有**（2026-06-20 实测坐实：不带 `</dev/null` 时 10min timeout 全程 0 输出；带上后 ~4s 正常返回）。**每一个 `pi -p` / `pi --list-models` 调用都必须 `</dev/null` 重定向 stdin**；任务文本只走 `"<...>"` 参数或 heredoc，绝不靠 stdin 喂。
- wait 预算：`600000ms`。
- 旋钮：`--model <provider/id>`（支持 `:thinking` 语法）、`--thinking off|minimal|low|medium|high|xhigh`。模糊/部分名先 `pi --list-models <pattern> </dev/null` 解析成精确 `provider/id`。不给旋钮时用 pi 自身配置的默认 model。

## cursor-agent

```bash
cd <workdir> && cursor-agent -p --trust [--model <M>] "<task>" </dev/null
```

- 触发信号："用 cursor" / "cursor-agent" / "cursor-agent -p"。
- 保持外层双引号。
- 🪟 **二进制名（Windows/Git-Bash 坑，已实证）**：mac/Linux 用无扩展的 `cursor-agent`；Windows + Git Bash 下裸名**不解析**（PATH 里有安装目录，但 Git Bash 不自动补 `.cmd`），必须写 `cursor-agent.cmd`。按宿主选对应名字。
- `</dev/null` 作**零成本护栏**保留（本仓库实测「非必需」——`cursor-agent -p` prompt 走参数、不像 `pi -p` 死等 stdin EOF；2026-07-04 实测带与不带都 ~18s 正常返回）。照 pi 惯例保留兜底，零成本且已验证不影响正常返回。
- wait 预算：`600000ms`。
- 旋钮 · model：`--model <ID>`，推理档**编进 model ID 本身**（后缀 `-low/-medium/-high/-xhigh/-max` 是推理档，中缀 `-thinking-` 开扩展思考，后缀 `-fast` 是高速烧钱档、默认别用），没有 pi 那种独立 `--thinking`。默认「日常」档 `composer-2.5-fast`（Cursor 自家编码模型、账号默认，快且省）。模糊名先 `cursor-agent --list-models <pattern>` 解析。
- 旋钮 · 安全档（两道闸：①工作区信任 ②shell/编辑放行）：
  - **默认·安全** `--trust`：代码编辑照常落地，但 **shell 命令默认被挡**（未 allowlist 一律 `Rejected`；2026-07-04 实测）。纯改代码/重构/生成类交接就用它。
  - **需要 shell·可控**：`--trust` + 目标 repo `.cursor/cli.json` 的 `permissions.allow`/`deny`（`deny` 优先于 `allow`）白名单放行具体命令，如 `Shell(npm)`、`Shell(git)`。
  - **危险·全开** `-f` / `--yolo`：shell 全放行（"Force allow commands unless explicitly denied"）。**只在用户显式指定时用，命令与回报里必须告警**，不当默认。

## Shell 转义（所有后端通用）

只做让命令活过 shell 解析所需的最小转义：

- 内层双引号 → `\"`；裸 `$` → `\$`。
- 不改写原始中文语义；不引入多余引用层，除非现有命令本就非法。
- 任务文本含引号/换行时，用单引号包裹或 heredoc，别硬塞进双引号里。
