# case-01-parent-route-to-codex

## Purpose

验证父层在 Codex 宿主下默认降级到 `self-cli` 时，不再直接输出 `codex exec`，而是路由到 `isolated-context-run:codex`。

## Environment Assumptions

- 当前宿主是 Codex host
- native subagent capability 不可用
- Codex 非交互入口可用

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `isolated-context-run:codex`
- `selected by parent frontdoor`

## Assert Must Not Include

- `Selected Runner\n\`self-cli -> codex exec\``
- `Selected Runner\n\`mode=codex-exec -> codex exec\``

## Assert Notes

- 允许 `Why` 或证据里出现 `codex exec`
- 重点断言是公共 runner 名称已经切到 Codex 子层
