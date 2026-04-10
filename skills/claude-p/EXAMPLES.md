# Claude -p Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks working-directory choice, command construction, escaping, execution behavior, and response noise limits.

## Case 01: 未给目录，只要命令

触发方式：

- “用 claude -p 帮我包一条命令，把这个任务转出去”
- “只给我命令，不要执行”

最小上下文：

- 当前仓库目录可作为默认工作目录
- 用户没有提供目标目录

期望产出：

- 使用当前仓库目录作为 `<workdir>`
- 任务被压缩为单一目标
- 只返回命令，不加解释

标准输出样例：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "把当前任务转交给外部 Claude CLI 非交互执行"
```

验收标准：

- 命令以 `cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "` 开头
- 保持 `-p` 位于 `--dangerously-skip-permissions` 之后
- 不补解释性文字
- 不添加 skill 前缀、slash-command 语法或额外 flags

反例：

- “下面是命令：...”
- 自动附带执行说明、skill 前缀或风险提示

---

## Case 02: 用户给了目录，只要命令

触发方式：

- “在 `packages/demo` 里给我一条 claude -p 命令”

最小上下文：

- 用户已明确给出目标目录 `packages/demo`

期望产出：

- 直接使用用户给的目录
- 不改写目录

标准输出样例：

```bash
cd packages/demo && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "执行用户指定的单一任务"
```

验收标准：

- 工作目录与用户输入一致
- 不替换成当前仓库根目录

反例：

- 忽略用户目录，改成别的路径
- 把目录信息放到说明文字里，不进命令

---

## Case 03: 任务里有双引号和裸 `$`

触发方式：

- “给我命令：让 Claude 输出 `\"done\"` 并打印 `$HOME`”

最小上下文：

- 用户只要命令

期望产出：

- 外层保持双引号
- 内部双引号与裸 `$` 被最小必要转义

标准输出样例：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "让 Claude 输出 \"done\" 并打印 \$HOME"
```

验收标准：

- `\"` 用于内部双引号
- `\$` 用于裸 `$`
- 不改写原始中文语义

反例：

- 改成单引号包裹整个任务
- 把 `$HOME` 删除或意译

---

## Case 04: 默认模板内置权限参数

触发方式：

- “给我的 `claude -p` 默认就带上权限参数”
- “不要先跑一次再补权限，直接给能执行的模板”

最小上下文：

- 用户要的是一条可直接执行的 `claude -p` 命令

期望产出：

- 直接使用默认模板
- 把 `IS_SANDBOX=1` 视为默认命令骨架的一部分
- 明确使用当前官方 flag `--dangerously-skip-permissions`
- 不把权限参数描述成“卡住后的补救步骤”
- 不改写成 `--permission-mode bypassPermissions`
- 不改写成不存在或过时的参数名

标准输出样例：

```bash
cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "把当前任务转交给外部 Claude CLI 非交互执行"
```

验收标准：

- 命令包含 `--dangerously-skip-permissions`
- 命令包含 `IS_SANDBOX=1`
- 保持 `claude --dangerously-skip-permissions -p` 的顺序
- 语义上这是首选默认模板，不是 retry 方案
- 不把 `IS_SANDBOX=1` 当作可省略前缀
- 不写成 `claude --permission-mode bypassPermissions -p "..."`
- 不写成 `dangerouslyDisableSandbox`
- 不额外添加无关 flag 或解释性长文

反例：

- `cd <workdir> && claude -p "..."`
- `cd <workdir> && claude --permission-mode bypassPermissions -p "..."`
- `cd <workdir> && claude -p --dangerously-skip-permissions "..."`
- `cd <workdir> && claude --dangerouslyDisableSandbox -p "..."`

---

## Case 05: 用户要求直接执行

触发方式：

- “直接执行，不用先给我命令”
- “把这条 claude -p 现在跑起来”

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

- 不把终端轮询日志逐条转述给用户
- 若执行已退出或报错，应直接汇报关键状态

反例：

- 每次 wait 都发一条“仍在运行”
- 把完整终端输出原样贴给用户

---

## Case 06: 宿主必须 wait 才能知道状态

触发方式：

- “直接执行并看看有没有跑完”

最小上下文：

- 宿主需要 wait 才能判断命令是否结束

期望产出：

- 默认 wait 粒度为 `1800000 ms`
- 自动检查最多 1 次
- 超时后不继续轮询

验收标准：

- 自动 wait 不小于 `1800000 ms`
- 未明确要求持续监控时，最多自动检查 1 次

反例：

- 默认使用短轮询频繁刷状态
- 超时后继续无限轮询

---

## Case 07: 用户要求持续监控

触发方式：

- “直接执行，并持续监控直到结束”

最小上下文：

- 用户明确要求持续监控

期望产出：

- 使用 `60000 ms` 粒度
- 重复的“仍在运行”或超时播报最多每 30 分钟一次
- 退出、崩溃、报错时立即汇报

验收标准：

- 连续状态播报被节流
- 终止态即时上报

反例：

- 每几秒播报一次“仍在运行”
- 结束后继续按固定频率汇报

---

## Case 08: 用户已经给出完整命令

触发方式：

- “就执行这条：`cd worktree && IS_SANDBOX=1 claude --dangerously-skip-permissions -p \"原样处理这个任务\"`”

最小上下文：

- 用户已经提供完整命令

期望产出：

- 只做最小修正
- 不重写任务内容

验收标准：

- 除非 quoting、escaping 或工作目录前导有问题，否则保持原命令结构
- 不因为措辞偏好重写任务文本
- 不擅自补充额外 flags 或 skill 前缀

反例：

- 重新总结任务并替换原命令内容
- 擅自加入 skill 前缀、额外参数或实现建议
