# Case ID

case-01-claude-default

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：在当前仓库执行这个任务：“输出当前工作目录路径并确认执行环境正常”。

## Execution Constraints

- 必须使用 `$dev-run` skill 构造并执行命令
- 用户没有指定后端，必须默认使用 claude
- 命令必须是 `cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "..."` 骨架
- 必须先确认工作目录再构造命令
- 不要指定其他后端
