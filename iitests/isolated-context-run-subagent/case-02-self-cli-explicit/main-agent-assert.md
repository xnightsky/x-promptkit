# case-02-self-cli-explicit

## Purpose

验证调用方显式要求 `self-cli` 时，父层不再走默认链，而是直接映射到当前宿主 CLI 的非交互入口，并附带 `Execution Template`。

## Environment Assumptions

- 当前宿主是 Codex host
- 当前宿主会话即使具备 native subagent capability，也被调用方显式要求不要使用
- `codex exec` 可用

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `self-cli requested explicitly`
- `self-cli -> codex exec`
- `Execution Template`
- `codex exec "<task prompt>"`

## Assert Must Not Include

- `isolated-context-run:subagent`
- `Selected Runner\n\`subagent\``
- `default winner`
- `downgraded because`

## Assert Notes

- 主代理应把这类场景视为显式覆盖，而不是“subagent 不可用后的降级”
- 可以列出 `subagent` 的可用性，但最终选择不能回到 `subagent`
