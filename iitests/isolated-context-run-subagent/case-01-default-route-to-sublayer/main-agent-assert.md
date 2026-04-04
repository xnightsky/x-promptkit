# case-01-default-route-to-sublayer

## Purpose

验证当前宿主会话具备 native subagent 能力时，父层默认选择必须路由到 `isolated-context-run:subagent`，而不是在父层展开执行细节或直接退回外部 CLI。

## Environment Assumptions

- 当前宿主会话存在 native subagent capability
- 当前宿主 CLI 同时存在 non-interactive entrypoint
- 调用方没有提供显式 `mode`
- 调用方没有显式要求 `self-cli`

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `subagent -> self-cli`
- `isolated-context-run:subagent`
- `` `none` ``

## Assert Must Not Include

- `Selected Runner\n\`subagent\``
- `Selected Runner\n\`self-cli ->`
- `codex exec`
- `claude -p`
- `opencode run`
- `native subagent delegation -> started`

## Assert Notes

- 主代理应允许输出包含 runner probe evidence
- 主代理应拒绝父层直接展开子层 delegation 细节
- 重点断言是“父层选中独立子层”，不是“父层自己执行 subagent”
