<!-- 本文件由 scripts/sync-handoff-core.mjs 从 skills-def/dev-run/references/ 镜像生成，请勿手改；改源后跑 `npm run sync:handoff-core`。 -->

# Backends — 交接执行后端登记表

> **本文件是「AI CLI 交接」的后端唯一事实源，宿主无关。** `dev-run` skill（Tier-1 极简一发 / Tier-2 编排）读这里取后端命令模板。
> 它会被镜像进各宿主的分发形态（镜像件头部自带「请勿手改」注记）——**只改这一份**。

每个后端登记：命令模板 / stdin 护栏 / wait 预算 / 旋钮。所有后端都是**一次性非交互命令**。

## claude（默认后端）

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"
```

- 触发信号："用 claude" / "claude -p" / "code"；**也是无显式信号时的默认后端**。
- 保持外层双引号。`IS_SANDBOX=1` 与 `--dangerously-skip-permissions` 是默认命令骨架的一部分，不是重试才加的补丁。
  - **PS · `IS_SANDBOX=1` 是什么**：claude 的 `--dangerously-skip-permissions` 在 **linux root（euid=0）** 下会被自身安全闸拒跑，`IS_SANDBOX=1` 是「本环境已是沙盒」的规避信号、放行它。**非 root 用户不需要**它（`--dangerously-skip-permissions` 本就能跑），但**带上它对非 root 无害**（一个不生效的冗余环境变量）。
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
- ⚠️ **`</dev/null` 不可省（否则永久卡死、0 输出）**：`pi -p` 会读 stdin 直到 EOF（为支持 `echo ... | pi -p` 管道拼接）。非 TTY 宿主的 shell 工具 stdin 是个不会关闭的管道 → pi 永远等不到 EOF，**阻塞在 stdin 读、连 session 都不建、stdout 一个字节都没有**（2026-06-20 在非 TTY 宿主实测坐实：不带 `</dev/null` 时 10min timeout 全程 0 输出；带上后 ~4s 正常返回）。**每一个 `pi -p` / `pi --list-models` 调用都必须 `</dev/null` 重定向 stdin**；任务文本只走 `"<...>"` 参数或 heredoc，绝不靠 stdin 喂。
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

## kimi（kimi-code）

```bash
cd <workdir> && kimi -p "<task>"
```

- 触发信号："用 kimi" / "kimi -p" / "kimi code"。
- 保持外层双引号。任务文本走 `-p "<...>"` 参数；`kimi -p` 一次性非交互、跑完即退。
- ✅ **`-p` 原生就是 auto permission（2026-07-20 实测）**：非交互 `-p` 模式下文件写入与 shell 执行都自动放行、无需人工确认，仅 kimi config 里的 static deny 规则仍生效——**所以命令骨架不带任何放行 flag 就能落地编辑**（区别于 claude 要 `--dangerously-skip-permissions`）。实测 `kimi -p "创建 DONE.txt ..."` 直接落盘、rc=0、不卡确认。
- ⚠️ **安全边界**：`-p` 的 auto 放行**含 shell**（比 cursor 默认 `--trust` 只放编辑更宽，接近 cursor 的 `-f`），但这是 kimi 非交互模式的**原生默认、不是我们额外加的 flag**；要收紧靠 kimi 自身 config 的 deny 规则，不在交接命令层加 flag。`-y`/`--yolo`（连 plan 模式退出也自动批）只在用户显式要求时加，默认不加。
- ❌ **不吃 stdin，无需 `</dev/null`**（2026-07-20 实测：不带重定向、非 TTY 下 `kimi -p` ~32s 正常返回，不像 pi 死等 EOF）。不加 `--output-format stream-json` 等额外 flag；不发明不存在的 flag。
- wait 预算：`600000ms`（实测 trivial 任务 32–58s）。
- 旋钮 · model：`-m <alias>`，`alias` 是 `provider/model` 形（默认 `kimi-code/k3`）。**无独立 thinking flag**（thinking 是 config 级 `[thinking]`，非每调用旋钮，这点像 cursor、不像 pi）。模糊/部分名先 `kimi provider list --json`（该命令**无 pattern 参数**，拉全量、从 `.models` 的 key 里自己匹配）解析成精确 `alias`。不给旋钮时用 kimi config 的 `default_model`。

## Shell 转义（所有后端通用）

只做让命令活过 shell 解析所需的最小转义：

- 内层双引号 → `\"`；裸 `$` → `\$`。
- 不改写原始中文语义；不引入多余引用层，除非现有命令本就非法。
- 任务文本含引号/换行时，用单引号包裹或 heredoc，别硬塞进双引号里。
