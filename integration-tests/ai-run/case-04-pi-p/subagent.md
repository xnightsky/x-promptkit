# Case ID

case-04-pi-p

## Target Layer

ai-run

## Input

Use `$ai-run`.

用户要求：用 pi -p 在当前仓库执行这个任务：“显示当前项目名称和版本号”。

## Execution Constraints

- 必须使用 `$ai-run` skill
- 用户明确指定了 pi 后端
- 命令必须是 `cd <workdir> && pi -p "..."` 骨架
- 不要添加任何额外 flag 或前缀
- 不要使用其他后端
