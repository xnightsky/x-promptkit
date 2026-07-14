# Case ID

case-02-codex-exec

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：用 codex 在当前仓库执行这个任务：“列出当前目录的文件并说明项目类型”。

## Execution Constraints

- 必须使用 `$dev-run` skill
- 用户明确指定了 codex 后端
- 命令必须是 `cd <workdir> && codex exec --json "..."` 骨架
- 不要使用 claude、opencode 或 pi 后端
