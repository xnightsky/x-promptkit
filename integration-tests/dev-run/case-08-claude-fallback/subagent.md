# Case ID

case-08-claude-fallback

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：在当前仓库执行这个任务：“输出当前工作目录路径并确认执行环境正常”。

## Execution Constraints

- 必须使用 `$dev-run` skill 构造并执行命令
- 用户没有指定后端，且测试环境从 PWD 到 home 的所有候选位置都不存在 `.dev-run.yaml`
- 必须使用无配置时的 claude 内建兜底
- 命令必须是 `cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "..."` 骨架
