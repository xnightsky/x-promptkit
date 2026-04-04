# Isolated Context Run: Subagent Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks direct invocation behavior, native-session delegation, and failure classification.

Unless a scenario needs extra detail, output stops after the 5 core sections:

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`

When needed, append only `Failure Detail`.

If the prompt already states capability presence, failure state, or scenario labels, preserve those facts as authoritative input instead of replacing them with fresh host probing.

## Case 01: 当前宿主会话具备原生 subagent 能力

触发方式：

- “直接用 `isolated-context-run:subagent` 处理这个任务”
- “当前就是 Codex CLI，会话里走 subagent”

最小上下文：

- 当前宿主会话
- 是否有原生 subagent 能力

期望产出：

- 不重新做 `self-cli` 比较
- 只判断当前会话里是否有原生 subagent 能力
- 可用时直接走 native delegation

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The current host session exposes native subagent capability, so this sublayer can delegate without re-entering another CLI path.

Override
`direct sublayer invocation`
```

验收标准：

- 输出里不出现 `codex exec`
- 输出里不出现 `codex app-server`
- 说明这是当前会话内的原生 subagent 路径

反例：

- 把当前会话 subagent 改写成外部 CLI 调用
- 重新退回父层比较 `self-cli`

---

## Case 02: 父层默认路由到子层

触发方式：

- “在独立上下文里跑一下这个任务”
- “默认给我一个隔离 runner”

最小上下文：

- 当前宿主会话具备原生 subagent 能力
- 父层 `isolated-context-run`

期望产出：

- 父层把 `subagent` 解释成独立子层
- 子层负责真实 delegation 细节

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`
- `self-cli`: available
- evidence: `codex --help -> contains "exec        Run Codex non-interactively"`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:subagent`

Why
The parent frontdoor keeps runner selection, while native subagent execution is delegated to the dedicated sublayer.

Override
`none`
```

验收标准：

- 父层输出里明确写出 `isolated-context-run:subagent`
- 不把父层写成直接执行外部 CLI
- 明确父层只负责路由和统一骨架

反例：

- 父层直接展开所有 subagent 执行细节
- 父层把 `subagent` 与 `codex exec` 混写成同一路径

---

## Case 03: 能力存在但 delegated run 失败

触发方式：

- “subagent 能拉起，但执行失败了，这算什么”
- “当前会话支持 subagent，但子代理跑挂了”

最小上下文：

- 当前会话具备原生 subagent 能力
- delegated run 已经开始

期望产出：

- 记为 environment failure
- 不改写成 unavailable
- 不给安装 CLI 的建议

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The current host session exposes native subagent capability, but the delegated run failed after startup. This is an environment failure, not `unavailable`.

Override
`direct sublayer invocation`

Failure Detail
- class: `environment failure`
- evidence: `native subagent delegation -> failed after startup`
- next action: inspect the delegated run failure in the current host session, then retry the same delegation path
```

验收标准：

- 明确说能力存在
- 明确说失败发生在 delegation 启动之后
- `Failure Detail` 保留在子层，不上升成安装问题

反例：

- 只要失败就写 unavailable
- 把子层失败改写成“去安装 codex”

---

## Case 03A: 父层已路由到子层

触发方式：

- “父层已经选中了 `isolated-context-run:subagent`，子层现在怎么回答”
- “这是 parent frontdoor route 进来的 subagent 场景”

最小上下文：

- 父层已完成 runner 选择
- 当前会话具备原生 subagent 能力

期望产出：

- 保留子层自己的 5 段骨架
- `Override` 明确写成 `selected by parent frontdoor`
- 不把 parent-routed 场景写成 direct invocation

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The parent frontdoor already selected this child layer, and the current host session exposes native subagent capability, so delegation stays inside the current host session.

Override
`selected by parent frontdoor`
```

验收标准：

- `Override` 与 direct invocation 严格区分
- 不重新比较 `self-cli`
- 不改写成外部 CLI 重入

反例：

- 父层已路由进来却还写 `direct sublayer invocation`
- 父层已路由进来却重新打开 runner comparison

---

## Case 04: 当前会话没有原生 subagent 能力

触发方式：

- “直接用 `isolated-context-run:subagent`”
- “当前会话里能不能直接走 subagent”

最小上下文：

- 当前宿主会话

期望产出：

- 明确当前会话没有原生 subagent 能力
- 子层直接停下，不自己降级

标准输出样例：

```md
Available Runners
- `subagent`: unavailable
- evidence: `native subagent capability probe -> absent`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The current host session does not expose native subagent capability, so this sublayer cannot run.

Override
`direct sublayer invocation`
```

验收标准：

- 子层只报告 unavailable
- 子层不主动切到 `self-cli`
- 让父层决定是否继续选其他 runner

反例：

- 子层内部偷偷降级到 `codex exec`
- 子层自己重开 runner 比较

---

## Case 05: 一个回答里包含多个 scenario

触发方式：

- “请同时给我 Scenario A 和 Scenario B”
- “同一条回答里分别说明 unavailable 与 environment failure”

最小上下文：

- 调用方已经给出多个 scenario 标签
- 每个 scenario 都是 direct invocation

期望产出：

- 原样保留 `Scenario A`、`Scenario B`
- 每个 scenario 都重复完整结果骨架
- `Failure Detail` 只出现在 environment failure 那个 scenario

标准输出样例：

```md
Scenario A
Available Runners
- `subagent`: unavailable
- evidence: `native subagent capability probe -> absent`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The current host session does not expose native subagent capability, so this sublayer cannot run.

Override
`direct sublayer invocation`

Scenario B
Available Runners
- `subagent`: available
- evidence: `native subagent capability probe -> present`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
The current host session exposes native subagent capability, but the delegated run failed after startup. This is an environment failure, not `unavailable`.

Override
`direct sublayer invocation`

Failure Detail
- class: `environment failure`
- evidence: `native subagent delegation -> failed after startup`
```

验收标准：

- `Scenario A` 和 `Scenario B` 都保留
- 不输出 `selected by parent frontdoor`
- 不输出 `native subagent delegation -> started`

反例：

- 把两个 scenario 合并成一个总结段
- 只在标题写 Scenario，正文不重复骨架
