# Isolated Context Run Examples

This file is the companion corpus for [SKILL.md](/data/projects/x-promptkit/skills/isolated-context-run/SKILL.md). Each case defines trigger phrases, minimum context, expected output shape, acceptance criteria, and anti-patterns.

## Case 01: 默认选择独立上下文 runner

触发方式：

- “在独立上下文里跑一下这个任务”
- “给我一个隔离执行方案”

最小上下文：

- 当前环境是否有 `subagent`
- 当前宿主 CLI 是否支持非交互入口

期望产出：

- 先列出可用 runner
- 未指定模式时，默认选择优先级最高且可用的 runner

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `host subagent capability probe -> present`
- `self-cli`: available
- evidence: `codex --help -> contains "exec        Run Codex non-interactively"`

Default Priority
`subagent -> self-cli`

Selected Runner
`subagent`

Why
Default selection uses the highest-priority available normal runner. `self-cli` remains the fallback.

Override
`none`
```

验收标准：

- 明确写出默认顺序是 `subagent -> self-cli`
- 明确给出至少一条 runner 可用性证据
- 如果 `subagent` 不可用，说明为何降级到 `self-cli`
- 不把高级 runner 混入默认选择

反例：

- 直接默认 `codex exec`
- 不判断环境可用性就宣布 runner

---

## Case 02: 列出全部方案

触发方式：

- “把所有 isolated context 方案列出来”
- “有哪些 runner 可以选”

最小上下文：

- `isolated-context-run/SKILL.md`

期望产出：

- 默认视图列出常规 runner
- 高级视图额外列出 `subagent-wrapper-cli`

默认视图样例：

```md
Available Runners
- `subagent`
- `self-cli`

Default Priority
`subagent -> self-cli`

Selected Runner
Not selecting yet. Listing normal runners only.

Why
This is the default options view, so only normal runners are shown.

Override
`none`
```

高级视图补充：

```md
Advanced / Optional
- `subagent-wrapper-cli`: advanced strategy, not part of default priority
```

验收标准：

- 默认 list 不展示 `subagent-wrapper-cli`
- 高级视图明确把它标成高级/可选策略

反例：

- 默认列表把 `subagent-wrapper-cli` 和普通 `subagent` 并列推荐
- 完全漏掉高级 runner 的存在

---

## Case 03: 显式指定当前 CLI 非交互模式

触发方式：

- “不要走 subagent，直接用当前 CLI 非交互跑”
- “用 self-cli 执行”

最小上下文：

- 当前宿主环境

期望产出：

- 正确把 `self-cli` 映射到当前宿主 CLI 的非交互入口
- 给出所选模式、原因和最小执行模板

标准输出样例：

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`
- evidence: `codex --help -> contains "exec        Run Codex non-interactively"`

Default Priority
`subagent -> self-cli`

Selected Runner
`self-cli -> codex exec`

Why
Caller explicitly requested `self-cli`. In a Codex host, `self-cli` maps to `codex exec`.

Override
`self-cli requested explicitly`

Minimal Template
`codex exec "<task prompt>"`
```

验收标准：

- Codex 环境解释为 `codex exec`
- Claude 环境解释为 `claude -p`
- OpenCode 环境解释为 `opencode run`
- 至少说明宿主识别或 help probe 这类证据来源

反例：

- 把 `self-cli` 当成固定等于某个具体 CLI
- 没说明映射关系就直接给命令

---

## Case 03A: 显式 mode 覆盖默认 runner

触发方式：

- “不要默认选择，直接按 `mode=codex-exec` 跑”
- “这轮 mode 明确指定成 `opencode-run`”

最小上下文：

- `isolated-context-run/SKILL.md`

期望产出：

- 明确 `mode` 是调用方显式覆盖项
- 区分 `self-cli` 的宿主映射与显式 runner 的直接指定
- 当显式值存在时，不再重复走默认优先级选择
- 明确显式 runner 不属于默认回退链路

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `probe action -> result`
- `self-cli`: available
- evidence: `probe action -> result`

Default Priority
`subagent -> self-cli`

Selected Runner
`mode=codex-exec -> codex exec`

Why
Selection came from an explicit caller override. Explicit runner ids do not participate in the default fallback chain.

Override
`mode=codex-exec`
```

验收标准：

- 输出中明确写出覆盖来源
- 不把显式 `codex-exec` 再解释成“继续自动判断宿主”
- 若与默认值不同，说明为什么覆盖默认 runner

反例：

- 明明指定了 mode，还继续按默认优先级另选 runner
- 把 `codex-exec` / `claude-p` / `opencode-run` 当成仅供展示的别名

---

## Case 03B: 区分 unavailable 与环境失败

触发方式：

- “`command not found` 时这个 runner 算什么状态？”
- “CLI 能启动，但因为认证失败，这算 unavailable 吗？”

最小上下文：

- `isolated-context-run/SKILL.md`

期望产出：

- 明确区分“当前环境不可用”和“能力链路存在，但当前环境失败”
- 不把认证、网络、provider、沙箱问题误写成 unavailable

标准输出样例：

```md
Available Runners
- `self-cli`: unavailable
- evidence: `command -v opencode -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
Missing command means the runner is unavailable in the current environment. This is different from an environment failure after startup.

Override
`none`
```

验收标准：

- `command not found` 这类缺命令场景，记为 unavailable
- CLI 已启动但被认证/网络/沙箱打断，记为能力链路存在但环境失败
- 不把环境问题上升成 skill 文档缺陷

反例：

- 只要失败就统一写 unavailable
- 把外部认证失败写成 runner 不存在

---

## Case 03C: 输出 evidence 时保持固定结构

触发方式：

- “给我一个 runner 选择结果样例”
- “把 probe 证据也一起列出来”

最小上下文：

- `isolated-context-run/SKILL.md`

期望产出：

- 使用固定 5 段输出
- evidence 写成 `probe动作 -> 结果` 或等价紧凑格式

验收标准：

- 输出包含 `Available Runners / Default Priority / Selected Runner / Why / Override`
- 至少一条 evidence 能看出 probe 动作和结果
- 不只写空泛结论，如“环境可用”“应该能跑”

反例：

- 只给最终选择，不给 evidence
- evidence 只写“可用”，不说明依据

---

## Case 04: 作为 recall-eval 的默认执行载体

触发方式：

- “为 recall-eval 提供一个默认执行载体”
- “在没额外指定载体时，recall 应该怎么跑”

最小上下文：

- `recall-eval`
- 当前环境具备 `subagent` 能力

期望产出：

- 明确把 `subagent` 作为 `recall-eval` 的默认执行载体
- 说明这是默认值，不是对所有上层任务的一刀切强制

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `host subagent capability probe -> present`
- `self-cli`: available
- evidence: `probe action -> result`

Default Priority
`subagent -> self-cli`

Selected Runner
`isolated-context-run:subagent`

Why
`recall-eval` uses `subagent` as its default execution carrier when that capability exists. This default can still be overridden by the caller.

Override
`none`
```

验收标准：

- 输出中明确写出 `isolated-context-run:subagent`
- 若调用方显式指定其它载体，要说明默认值可被覆盖

反例：

- 让 `recall-eval` 直接在当前上下文里跑
- 未经说明就改成 `self-cli`

---

## Case 05: 缺命令时给安装引导

触发方式：

- “缺什么 command，引导我去安装”
- “`command not found` 的时候下一步该干嘛”

最小上下文：

- 当前 probe 结果

期望产出：

- 明确指出缺失的命令
- 给出一个具体安装下一步
- 说明安装后需要重跑 probe

标准输出样例：

```md
Available Runners
- `self-cli`: unavailable
- evidence: `command -v claude -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
`self-cli` cannot run because the required command is missing in the current environment.

Override
`none`

Install Guidance
- missing command: `claude`
- next action: install Claude Code CLI, then re-run `command -v claude` and `claude --help`
```

验收标准：

- 必须点名 exact missing command
- 必须区分缺命令与认证/网络失败
- 必须给出一个明确 next action
- 必须提醒安装后重跑 probe
