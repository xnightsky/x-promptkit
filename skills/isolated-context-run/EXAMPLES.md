# Isolated Context Run Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case defines trigger phrases, minimum context, expected output shape, acceptance criteria, and anti-patterns.

Unless a scenario needs extra detail, output stops after the 5 core sections:

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`

When needed, append only the matching extension block after `Override`, such as `Execution Template`, `Install Guidance`, or `Failure Detail`.

If a prompt or test case already states the host, capability, or probe result, treat that input as authoritative. Do not replace it with contradictory live-session probing.

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
- 当前宿主会话已有原生 subagent 能力时，父层把它路由到独立子层

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
`isolated-context-run:subagent`

Why
Default selection uses the highest-priority available normal runner. Native subagent execution belongs to the dedicated sublayer, while `self-cli` remains the fallback.

Override
`none`
```

验收标准：

- 明确写出默认顺序是 `subagent -> self-cli`
- 明确给出至少一条 runner 可用性证据
- 当前宿主会话已有原生 subagent 能力时，输出中明确路由到 `isolated-context-run:subagent`
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
- 给出所选模式、原因和执行模板扩展块

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
This is an explicit override: caller explicitly requested `self-cli`. In a Codex host, `self-cli` maps to `codex exec`.

Override
`self-cli requested explicitly`

Execution Template
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
- 当显式值存在时，不再重复走默认优先级选择，即使默认赢家是 `subagent`
- 明确显式 runner 不属于默认回退链路

标准输出样例：

```md
Available Runners
- `subagent`: available
- evidence: `host subagent capability probe -> present`
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`

Default Priority
`subagent -> self-cli`

Selected Runner
`mode=codex-exec -> codex exec`

Why
Selection came from an explicit caller override. `subagent` would win by default here, but explicit runner ids do not participate in the default fallback chain.

Override
`mode=codex-exec`
```

验收标准：

- 输出中明确写出覆盖来源
- `Why` 里保留字面 `explicit`
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
- auth / network / provider / sandbox 场景要追加 `Failure Detail`，而不是 `Install Guidance`

标准输出样例 1：缺命令 = unavailable

```md
Available Runners
- `subagent`: unavailable
- evidence: `host subagent capability probe -> absent`
- `self-cli`: unavailable
- evidence: `command -v codex -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
The required `self-cli` command is missing in the current environment, so no runnable selection is available from this probe. This is `unavailable`, not an environment failure.

Override
`none`
```

标准输出样例 2：认证失败 = environment failure

```md
Available Runners
- `self-cli`: available
- evidence: `command -v codex -> /usr/bin/codex`
- evidence: `codex exec --help -> exits 0`

Default Priority
`subagent -> self-cli`

Selected Runner
`self-cli -> codex exec`

Why
The runner exists in the current environment, but execution failed after startup. This is an environment failure, not `unavailable`.

Override
`self-cli requested explicitly`

Failure Detail
- class: `authentication failure`
- evidence: `codex exec "<task prompt>" -> 401 unauthorized`
- next action: refresh auth for `codex`, then re-run the same command
```

验收标准：

- `command not found` 这类缺命令场景，记为 unavailable
- CLI 已启动但被认证/网络/沙箱打断，记为能力链路存在但环境失败
- 环境失败样例必须保留“命令存在且 help probe 成功”的证据
- 环境失败样例必须使用 `Failure Detail`，不能改写成 `Install Guidance`
- 不把环境问题上升成 skill 文档缺陷

反例：

- 只要失败就统一写 unavailable
- 认证失败时给“去安装 CLI”的建议
- 把外部认证失败写成 runner 不存在

---

## Case 03C: 父层与子层职责分离

触发方式：

- “当前 session 就是 Codex CLI，subagent 应该怎么落层”
- “父层和 `isolated-context-run:subagent` 各负责什么”

最小上下文：

- `isolated-context-run/SKILL.md`
- `skills/isolated-context-run-subagent/SKILL.md`

期望产出：

- 明确父层是 frontdoor
- 明确 `isolated-context-run:subagent` 是第一阶段唯一独立子层
- 明确原生 subagent 留在当前宿主会话内，不改写成外部 CLI 重入

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
The parent frontdoor keeps runner comparison and shared output shape, while native subagent execution is delegated to the dedicated sublayer inside the current host session.

Override
`none`
```

验收标准：

- 父层负责比较、路由、统一骨架
- 子层负责 probe、delegation、subagent 特有错误分类、结果归一化
- 不把当前会话里的原生 subagent 改写成 `codex exec` 或 `codex app-server`

反例：

- 父层自己展开全部 subagent 执行细节
- 子层退化成外部 CLI 包装器

---

## Case 03D: 输出 evidence 时保持固定结构

触发方式：

- “给我一个 runner 选择结果样例”
- “把 probe 证据也一起列出来”

最小上下文：

- `isolated-context-run/SKILL.md`

期望产出：

- 使用 5 个核心段落输出
- 只有在场景确实需要补充信息时，才在 `Override` 之后追加扩展块
- evidence 写成 `probe动作 -> 结果` 或等价紧凑格式

验收标准：

- 输出包含 `Available Runners / Default Priority / Selected Runner / Why / Override`
- 至少一条 evidence 能看出 probe 动作和结果
- 非必要场景不要追加第 6 个固定段
- 不只写空泛结论，如“环境可用”“应该能跑”

反例：

- 只给最终选择，不给 evidence
- evidence 只写“可用”，不说明依据

---

## Case 04: 缺命令时给安装引导

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
- `subagent`: unavailable
- evidence: `host subagent capability probe -> absent`
- `self-cli`: unavailable
- evidence: `command -v codex -> not found`

Default Priority
`subagent -> self-cli`

Selected Runner
No runnable selection from this probe.

Why
`self-cli` cannot run because the required command is missing in the current environment.

Override
`none`

Install Guidance
- missing command: `codex`
- next action: install Codex CLI, then re-run `command -v codex` and `codex --help`
```

验收标准：

- 必须点名 exact missing command
- 必须区分缺命令与认证/网络失败
- 必须给出一个明确 next action
- 必须提醒安装后重跑 probe
