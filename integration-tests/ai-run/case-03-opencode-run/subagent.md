# Case ID

case-03-opencode-run

## Target Layer

ai-run

## Input

Use `$ai-run`.

用户要求：用 opencode run 在当前仓库执行这个任务：“检查当前 git 分支并显示最近一次提交”。

## Execution Constraints

- 必须使用 `$ai-run` skill
- 用户明确指定了 opencode 后端
- 命令必须是 `cd <workdir> && opencode run "..."` 骨架
- 不要添加 superpowers 前缀（用户没有要求）
- 不要使用其他后端
