# Case ID

case-06-cursor-agent

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：用 cursor-agent 在当前仓库执行这个任务：“显示当前项目名称和版本号”。

## Execution Constraints

- 必须使用 `$dev-run` skill
- 用户明确指定了 cursor 后端
- 命令必须是 `cd <workdir> && cursor-agent -p --trust "..." </dev/null` 骨架
- 默认走 `--trust` 安全档；未显式 `--force`/`--yolo` 时不上危险全开档
- 不要使用其他后端
