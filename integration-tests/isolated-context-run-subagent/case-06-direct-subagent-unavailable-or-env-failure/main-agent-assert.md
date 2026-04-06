# case-06-direct-subagent-unavailable-or-env-failure

## Purpose

验证子层在两类失败场景下的边界：

- native subagent 不存在时，返回 `No runnable selection from this probe.`
- native subagent 存在但 delegation 启动后失败时，返回 `Failure Detail`

并明确子层不能自行降级到 `self-cli`。

## Environment Assumptions

- 调用方直接请求 `isolated-context-run:subagent`
- 当前文件包含两个独立情景，主代理应把它们视为同一条 case 下的双断言说明

## Assert Must Include

- `Scenario A`
- `Scenario B`
- `No runnable selection from this probe.`
- `Failure Detail`
- `environment failure`
- `direct sublayer invocation`

## Assert Must Not Include

- `Selected Runner\n\`self-cli`
- `codex exec`
- `claude -p`
- `opencode run`
- `Install Guidance`
- `selected by parent frontdoor`

## Assert Notes

- 主代理应分别断言两个场景都存在
- Scenario A 的重点是 unavailable 且不降级
- Scenario B 的重点是能力存在但执行环境失败
- `Default Priority` 里的 `subagent -> self-cli` 是共享骨架的一部分，不应单独判失败
- 只有实际回退到 `self-cli` 才应视为失败
