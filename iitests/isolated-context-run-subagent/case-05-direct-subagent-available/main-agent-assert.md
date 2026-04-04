# case-05-direct-subagent-available

## Purpose

验证子层被直接调用且 native subagent 可用时，只处理当前会话内的 native subagent 路径，不重新比较 `self-cli`，也不改写成外部 CLI。

## Environment Assumptions

- 当前宿主会话存在 native subagent capability
- 调用方直接请求 `isolated-context-run:subagent`
- 当前场景不是父层 default selection，而是 direct sublayer invocation

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `Selected Runner\n\`subagent\``
- `direct sublayer invocation`
- `native subagent capability`

## Assert Must Not Include

- `isolated-context-run:subagent`
- `Selected Runner\n\`self-cli`
- `codex exec`
- `claude -p`
- `opencode run`
- `Install Guidance`
- `Execution Template`

## Assert Notes

- 这里的 `Selected Runner` 必须是子层内部 carrier `subagent`
- 主代理应允许出现 `native subagent capability probe -> present` 这类证据
- `Default Priority` 里的 `subagent -> self-cli` 是共享骨架的一部分，不应单独判失败
