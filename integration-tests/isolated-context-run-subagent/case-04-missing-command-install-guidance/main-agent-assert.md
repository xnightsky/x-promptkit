# case-04-missing-command-install-guidance

## Purpose

验证缺命令场景归类为 `unavailable`，并给出 `Install Guidance`；不得把它写成 `Failure Detail`，也不得把父层输出误写为直接可执行外部 CLI。

## Environment Assumptions

- 当前宿主没有 native subagent capability
- 当前宿主应使用 `self-cli`
- 对应宿主 CLI 缺失，命令不存在
- 这是缺能力/缺命令场景，不是 auth/network/provider/sandbox failure

## Assert Must Include

- `Available Runners`
- `Default Priority`
- `Selected Runner`
- `Why`
- `Override`
- `self-cli`: unavailable
- `command -v codex -> not found`
- `No runnable selection from this probe.`
- `Install Guidance`
- `unavailable`
- `missing command:`
- `next action:`

## Assert Must Not Include

- `Failure Detail`
- `authentication failure`
- `network failure`
- `provider failure`
- `sandbox denial`
- `Selected Runner\n\`self-cli -> codex exec\``
- `Selected Runner\n\`self-cli -> claude -p\``
- `Selected Runner\n\`self-cli -> opencode run\``

## Assert Notes

- 这条用例要求对齐 parent skill 的 canonical missing-command template
- 允许回答里提到宿主命令 `codex`
- `next action:` 后面只要表达安装 Codex CLI 的语义即可，不要求固定字面 `install`
- 重点是 `self-cli: unavailable`、`No runnable selection from this probe.` 与 `Install Guidance` 的组合关系
