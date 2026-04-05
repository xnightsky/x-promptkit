# case-03-explicit-mode-override

## Purpose

验证 `mode=codex-exec` 这类显式 runner id 会直接覆盖默认选择，即使默认赢家本来会是 `subagent`；但公共 runner 名称仍归一化为 Codex 子层。

## Environment Assumptions

- 当前宿主会话存在 native subagent capability
- `codex exec` 可用
- 调用方显式指定 `mode=codex-exec`

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `subagent -> self-cli`
- `isolated-context-run:codex`
- `mode=codex-exec`
- `explicit`

## Assert Must Not Include

- `isolated-context-run:subagent`
- `self-cli requested explicitly`
- `Selection came from default priority`
- `continue auto-detecting the host`

## Assert Notes

- 主代理应允许回答中说明“即使默认赢家是 subagent，显式 mode 仍然覆盖”
- 只要把 `mode=codex-exec` 重写成底层 backend 名称或默认探测，都应视为失败
