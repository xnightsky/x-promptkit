# AI Run Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks backend selection, command construction, escaping, execution behavior, and response noise limits.

## Case 01: 无后端指定，读取配置默认后端

触发方式：

- "帮我把这个任务跑一下"
- "直接执行"

最小上下文：

- 用户没有指定后端
- 从 `PWD` 向 home 最近命中的 `.dev-run.yaml` 含 `default_backend: pi`，且有对应 `backends.pi` section

期望产出：

- 使用配置的 **pi** 后端
- 命令以 `cd <workdir> && pi -p ` 开头，并保留 `</dev/null`

标准输出样例：

```bash
cd <workdir> && pi -p --model deepseek/deepseek-v4-flash --thinking high "把当前任务转交非交互执行" </dev/null
```

验收标准：

- 后端为 pi
- 已从 `PWD` 向 home 检索配置
- 不补解释性文字

反例：

- 无视配置直接选 claude
- 最近配置缺失/非法时仍静默执行命令

### 无配置兜底

当从 `PWD` 到 home 的所有候选位置都不存在 `.dev-run.yaml` 时，才使用 claude 标准命令骨架：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "把当前任务转交非交互执行"
```

---

## Case 02: 用户明确指定后端

触发方式：

- "用 codex 执行这个任务"
- "用 opencode run 跑一下"
- "pi -p 帮我处理"

最小上下文：

- 用户给了明确的后端信号

期望产出：

- 严格按用户指定的后端构造命令
- 使用该后端对应的命令模板

标准输出样例（codex）：

```bash
cd <workdir> && codex exec --json "执行用户指定的任务"
```

标准输出样例（opencode）：

```bash
cd <workdir> && opencode run "执行用户指定的任务"
```

标准输出样例（pi）：

```bash
cd <workdir> && pi -p "执行用户指定的任务" </dev/null
```

标准输出样例（cursor-agent）：

```bash
cd <workdir> && cursor-agent -p --trust "执行用户指定的任务" </dev/null
```

标准输出样例（kimi）：

```bash
cd <workdir> && kimi -p "执行用户指定的任务"
```

验收标准：

- 后端匹配用户信号
- 命令模板匹配该后端的标准骨架

反例：

- 收到 codex 信号，输出 claude 命令
- 加了自己发明的 flag

---

## Case 03: 任务含双引号和 `$`

触发方式：

- "执行：输出 `\"done\"` 并打印 `$HOME`"

最小上下文：

- 用户只要执行，且任务文本里有特殊字符

期望产出：

- 外层保持双引号
- 内部特殊字符最小转义

标准输出样例（claude 默认）：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "输出 \"done\" 并打印 \$HOME"
```

验收标准：

- `\"` 转义内部双引号
- `\$` 转义裸 `$`
- 不改写原始中文语义

反例：

- 把外层改成单引号
- 删除 `$HOME` 或意译

---

## Case 04: 用户只要命令，不执行

触发方式：

- "只给我命令，不要跑"

最小上下文：

- 用户明确说不要执行

期望产出：

- 只返回命令
- 不加解释

标准输出样例：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "执行用户任务"
```

验收标准：

- 只输出命令
- 不加 markdown 说明

反例：

- "下面是你要的命令：..."
- 自动附带使用说明

---

## Case 05: 直接执行

触发方式：

- "直接跑"
- "帮我执行"

最小上下文：

- 命令可按固定模板构造

期望产出：

- 先执行命令
- 只转述关键结果
- 不逐次转述后台 wait 轮询

标准结果样例：

```md
命令已启动；当前未要求持续监控。
```

验收标准：

- 不把终端轮询日志逐条转述
- 若执行已退出或报错，应直接汇报关键状态

反例：

- 每次 wait 都发"仍在运行"
- 把完整终端输出原样贴给用户

---

## Case 06: 用户已有完整命令

触发方式：

- "就执行这条：`cd worktree && IS_SANDBOX=1 claude --dangerously-skip-permissions -p \"原样处理\"`"

最小上下文：

- 用户已经提供完整命令

期望产出：

- 只做最小修正（quoting、escaping、工作目录前导有问题时才改）
- 不重写任务内容

验收标准：

- 保持原命令结构
- 不因措辞偏好重写
- 不擅自补充额外 flag

反例：

- 重新总结任务并替换原命令
- 擅自加入 skill 前缀或额外参数

---

## Case 07: 不存在的后端

触发方式：

- "用 nonexistent-cli 跑这个任务"

最小上下文：

- 用户给了一个不在支持列表里的后端名

期望产出：

- 报告不支持此后端
- 列出支持的后端列表
- 询问用户选择哪个

标准结果样例：

```md
不支持后端 `nonexistent-cli`。支持的后端：claude、codex、opencode、pi、cursor、kimi。请从中选择一个。
```

验收标准：

- 明确说"不支持"
- 列出全部 6 个选项
- 不假装能处理

---

## Case 08: 显式指定 cursor-agent

触发方式：

- "用 cursor 执行这个任务"
- "cursor-agent -p 帮我改这段"

最小上下文：

- 用户给了明确的 cursor 后端信号

期望产出：

- 路由到 **cursor-agent** 后端
- 默认走 `--trust` 安全档（代码编辑落地、shell 被挡）

标准输出样例：

```bash
cd <workdir> && cursor-agent -p --trust "执行用户指定的任务" </dev/null
```

验收标准：

- 后端为 cursor-agent
- 默认带 `--trust`（未显式 `--force`/`--yolo` 时不走危险全开档）
- Windows/Git-Bash 下二进制名换 `cursor-agent.cmd`

反例：

- 默认就上 `-f`/`--yolo` 危险全开
- 路由到 claude 或别的后端

---

## Case 09: 显式指定 kimi（kimi-code）

触发方式：

- "用 kimi 执行这个任务"
- "kimi -p 帮我改这段"

最小上下文：

- 用户给了明确的 kimi 后端信号

期望产出：

- 路由到 **kimi** 后端
- 命令骨架 `cd <workdir> && kimi -p "..."`，**不带任何放行 flag**（`-p` 原生 auto permission 就能落地编辑）
- 不加 `</dev/null`（kimi 不吃 stdin）、不加 `-y`/`--yolo`（默认不上）

标准输出样例：

```bash
cd <workdir> && kimi -p "执行用户指定的任务"
```

验收标准：

- 后端为 kimi
- 命令为 `kimi -p "..."`，无 `</dev/null`、无 `-y`/`--yolo`、无 `IS_SANDBOX=1`
- kimi 是 6 个支持后端之一（claude/codex/opencode/pi/cursor/kimi），不能报"不支持"

反例：

- 给命令补 `</dev/null` 或 `--dangerously-skip-permissions`（那是别的后端的骨架）
- 默认就上 `-y`/`--yolo`
- 路由到 claude 或别的后端

---

## Case 10: 显式请求 scope（生成套餐表）

触发方式：

- "给 pi 跑一下 scope"
- "帮我生成 cursor 的套餐表"
- "配一下 kimi 的默认 model 档"

最小上下文：

- 用户显式要给某后端生成/更新套餐表（不是交接任务）

期望产出：

- 走 [references/scoping.md](./references/scoping.md) 引擎：拉该后端真实可用模型 → 交互建套餐 → 校验 → 写 `.dev-run.yaml`
- 落盘层跟安装作用域走：项目级安装写 `<项目根>/.dev-run.yaml`，用户级安装写 `~/.dev-run.yaml`
- 新文件把当前后端写为顶层 `default_backend`；已有文件让用户确认保留还是切换默认后端
- 已存在 `.dev-run.yaml` 时只更新本 backend section 与确认后的 `default_backend`，不动其他后端

验收标准：

- model 候选只来自该后端 list-models 的真实输出，不瞎编
- 全部校验通过前不落盘、不留半成品
- 无 scope 的后端（claude/codex/opencode）如实报「无 scope」并列出 pi/cursor/kimi

反例：

- 把 scope 请求当成普通交接任务去跑 `pi -p`
- 凭记忆编 model id 写进套餐表
- 写每后端一个文件的旧形态（`pi.yaml` 等）
