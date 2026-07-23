# Case ID

case-01-config-default

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：在当前仓库执行这个任务：“输出当前工作目录路径并确认执行环境正常”。

## Execution Constraints

- 必须使用 `$dev-run` skill 构造并执行命令
- 用户没有指定后端；测试环境从 PWD 向 home 最近命中的 `.dev-run.yaml` 声明 `default_backend: pi` 且有对应 section
- 必须读取配置并使用 pi，命令为 `cd <workdir> && pi -p ... "..." </dev/null` 骨架
- 必须先确认工作目录再检索配置、构造命令
- 不要改用其他后端
