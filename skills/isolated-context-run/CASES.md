# Isolated Context Run Cases

This file turns the skill rules into reusable answer patterns. Use these examples as pressure cases when checking whether the skill closes the right loopholes.

## Case 01: Default To Independent Runner

### Trigger

- "在独立上下文里跑一下这个任务"
- "给我一个隔离执行方案"

### Expected answer shape

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
Default selection uses the highest-priority available normal runner. `self-cli` stays as the fallback.

Override
`none`
```

### Required checks

- Must state `subagent -> self-cli`
- Must show at least one evidence line
- If `subagent` is unavailable, must say why selection downgraded to `self-cli`
- Must not mix `subagent-wrapper-cli` into the default choice

## Case 02: List All Options

### Trigger

- "把所有 isolated context 方案列出来"
- "有哪些 runner 可以选"

### Default view

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

### Advanced view

Add one extra note:

```md
Advanced / Optional
- `subagent-wrapper-cli`: advanced strategy, not part of default priority
```

### Required checks

- Default list must not show `subagent-wrapper-cli`
- Advanced view must include `subagent-wrapper-cli` as advanced/optional

## Case 03: Explicit `self-cli`

### Trigger

- "不要走 subagent，直接用当前 CLI 非交互跑"
- "用 self-cli 执行"

### Codex-host example

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

### Mapping table

- Codex host -> `codex exec`
- Claude host -> `claude -p`
- OpenCode host -> `opencode run`

### Required checks

- Must explain that `self-cli` is host-mapped
- Must cite host identification or help probing
- Must not treat `self-cli` as a fixed global binary

## Case 03A: Explicit Mode Override

### Trigger

- "不要默认选择，直接按 `mode=codex-exec` 跑"
- "这轮 mode 明确指定成 `opencode-run`"

### Expected answer shape

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

### Required checks

- Must say the source of override explicitly
- Must not re-explain `codex-exec` as auto host detection
- Must not keep choosing from the default chain after `mode` is set

## Case 03B: `unavailable` vs Environment Failure

### Trigger

- "`command not found` 时这个 runner 算什么状态？"
- "CLI 能启动，但因为认证失败，这算 unavailable 吗？"

### Expected classification

- `command not found` -> `unavailable`
- command exists but auth/network/provider/sandbox blocks execution -> capability exists, but current environment failed

### Example answer fragment

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

## Case 03C: Fixed Evidence Structure

### Trigger

- "给我一个 runner 选择结果样例"
- "把 probe 证据也一起列出来"

### Required output sections

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`

### Evidence rule

Write evidence as:

- `probe action -> result`

Good examples:

- `command -v codex -> /usr/bin/codex`
- `codex --help -> contains "exec        Run Codex non-interactively"`
- `host subagent capability probe -> absent`

Bad examples:

- `环境可用`
- `应该能跑`
- `支持非交互`

## Case 04: Missing Command And Install Guidance

### Trigger

- "缺什么 command，引导我去安装"
- "`command not found` 的时候下一步该干嘛"

### Expected answer shape

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

### Required checks

- Must name the exact missing command
- Must distinguish missing command from auth or network failure
- Must give one concrete next install action
- Must tell the user to re-run the probe after installation
