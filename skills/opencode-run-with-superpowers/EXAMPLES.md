# Opencode Run With Superpowers Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks working-directory choice, superpowers-skill selection, command construction, escaping, execution behavior, and response noise limits.

## Case 01: 未给目录，只要命令

触发方式：

- “给我一条带 superpowers 前缀的 opencode run 命令”
- “只给命令，不要执行”

最小上下文：

- 当前仓库目录可作为默认工作目录
- 用户没有提供目标目录
- 用户只要求“带 superpowers”，未指定具体 skill

期望产出：

- 使用当前仓库目录作为 `<workdir>`
- 默认 skill 为 `superpowers/brainstorming`
- 只返回命令，不加解释

标准输出样例：

```bash
cd <workdir> && opencode run "use skill tool to load superpowers/brainstorming; 把当前任务转交给外部代理执行"
```

验收标准：

- 命令以 `cd <workdir> && opencode run "` 开头
- 出现且只出现一个 superpowers skill 前缀
- 不补解释性文字

反例：

- 自动再拼第二个 skill
- 输出“下面是命令：...”

---

## Case 02: 用户给了目录，只要命令

触发方式：

- “在 `packages/demo` 里给我一条带 superpowers 的 opencode run 命令”

最小上下文：

- 用户已明确给出目标目录 `packages/demo`
- 用户未指定具体 superpowers skill

期望产出：

- 直接使用用户给的目录
- 默认 `superpowers/brainstorming`
- 不改写目录

标准输出样例：

```bash
cd packages/demo && opencode run "use skill tool to load superpowers/brainstorming; 执行用户指定的单一任务"
```

验收标准：

- 工作目录与用户输入一致
- 不替换成当前仓库根目录

反例：

- 忽略用户目录，改成别的路径
- 把目录信息放到说明文字里，不进命令

---

## Case 03: 用户明确指定 superpowers skill

触发方式：

- “用 `superpowers/using-git-worktrees` 给我包一条 opencode run 命令”
- “前缀 skill 指定成 `superpowers/skill-creator`”

最小上下文：

- 用户已明确给出具体 superpowers skill

期望产出：

- 使用用户指定的 skill
- 不回退到默认 skill

标准输出样例：

```bash
cd <workdir> && opencode run "use skill tool to load superpowers/skill-creator; 生成当前任务所需命令"
```

验收标准：

- skill 名称与用户输入一致
- 不偷偷替换成 `superpowers/brainstorming`

反例：

- 用户明示了 skill，结果仍回退默认值
- 擅自把 skill 改成别的 superpowers skill

---

## Case 04: 用户只说“带 superpowers”，未指定 skill

触发方式：

- “给我一条带 superpowers 的 opencode run 命令”
- “先加载 superpowers 再执行这个任务”

最小上下文：

- 用户没有给具体 superpowers skill

期望产出：

- 只允许回退到 `superpowers/brainstorming`

标准输出样例：

```bash
cd <workdir> && opencode run "use skill tool to load superpowers/brainstorming; 处理当前单一任务"
```

验收标准：

- 默认 skill 固定为 `superpowers/brainstorming`
- 不猜别的 skill

反例：

- 自动猜 `superpowers/test-driven-development`
- 自动拼多个 superpowers skill

---

## Case 05: 任务里有双引号和裸 `$`

触发方式：

- “给我命令：让外部代理输出 `\"done\"` 并打印 `$HOME`，前面带 superpowers”

最小上下文：

- 用户只要命令
- 用户未指定具体 skill

期望产出：

- 外层保持双引号
- 前缀里的分号保留
- 内部双引号与裸 `$` 被最小必要转义

标准输出样例：

```bash
cd <workdir> && opencode run "use skill tool to load superpowers/brainstorming; 让外部代理输出 \"done\" 并打印 \$HOME"
```

验收标准：

- `\"` 用于内部双引号
- `\$` 用于裸 `$`
- 不改写原始中文语义

反例：

- 改成单引号包裹整个任务
- 把分号删掉或改成别的分隔

---

## Case 06: 用户要求直接执行

触发方式：

- “直接执行，不用先给我命令，但要带 superpowers 前缀”
- “现在就跑起来”

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

## Case 07: 宿主必须 wait 才能知道状态

触发方式：

- “直接执行并看看有没有跑完，记得带 superpowers”

最小上下文：

- 宿主需要 wait 才能判断命令是否结束

期望产出：

- 默认 wait 粒度为 `600000 ms`
- 自动检查最多 1 次
- 超时后不继续轮询

验收标准：

- 自动 wait 不小于 `300000 ms`
- 未明确要求持续监控时，最多自动检查 1 次

反例：

- 默认使用短轮询频繁刷状态
- 超时后继续无限轮询

---

## Case 08: 用户要求持续监控

触发方式：

- “直接执行，并持续监控直到结束，前面带 superpowers”

最小上下文：

- 用户明确要求持续监控

期望产出：

- 使用 `600000 ms` 粒度
- 重复的“仍在运行”或超时播报最多每 30 分钟一次
- 退出、崩溃、报错时立即汇报

验收标准：

- 连续状态播报被节流
- 终止态即时上报

反例：

- 每几秒播报一次“仍在运行”
- 结束后继续按固定频率汇报

---

## Case 09: 用户没有明确要求 superpowers

触发方式：

- “给我一条 opencode run 命令”
- “把当前任务转给外部 OpenCode 代理”

最小上下文：

- 用户没有要求 superpowers 前缀

期望产出：

- 这个 skill 不应擅自加 superpowers 前缀

验收标准：

- 不生成带 `use skill tool to load superpowers/...;` 的命令

反例：

- 只因为任务适合某个 superpowers skill，就自动加前缀

---

## Case 10: 用户给的是普通 skill 名称

触发方式：

- “前缀 skill 用 `opencode-run`”
- “先加载 `isolated-context-run` 再执行”

最小上下文：

- 用户给的是普通 skill，不是 superpowers skill

期望产出：

- 不把普通 skill 改写成 `superpowers/...`
- 需要保留“只有 superpowers skill 才能放进该前缀”的约束

验收标准：

- 不输出 `superpowers/opencode-run`
- 不输出 `superpowers/isolated-context-run`

反例：

- 把任何 skill 名都盲目前缀成 `superpowers/`
