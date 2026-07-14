# AI Run Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks backend selection, command construction, escaping, execution behavior, and response noise limits.

## Case 01: 无后端指定，默认 claude

触发方式：

- "帮我把这个任务跑一下"
- "直接执行"

最小上下文：

- 用户没有指定后端

期望产出：

- 默认使用 **claude** 后端
- 命令以 `cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "` 开头

标准输出样例：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "把当前任务转交非交互执行"
```

验收标准：

- 后端为 claude
- 命令包含 `IS_SANDBOX=1` 和 `--dangerously-skip-permissions`
- 保持 `-p` 在 `--dangerously-skip-permissions` 之后
- 不补解释性文字

反例：

- 默认选了 codex 或别的后端
- 缺少 `IS_SANDBOX=1`

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
不支持后端 `nonexistent-cli`。支持的后端：claude、codex、opencode、pi、cursor。请从中选择一个。
```

验收标准：

- 明确说"不支持"
- 列出全部 5 个选项
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
