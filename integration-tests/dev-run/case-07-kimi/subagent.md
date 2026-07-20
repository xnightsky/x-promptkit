# Case ID

case-07-kimi

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：用 kimi 在当前仓库执行这个任务：“显示当前项目名称和版本号”。

## Execution Constraints

- 必须使用 `$dev-run` skill
- 用户明确指定了 kimi 后端
- 命令必须是 `cd <workdir> && kimi -p "..."` 骨架
- 不加 `</dev/null`（kimi 不吃 stdin）、不加 `-y`/`--yolo`（`-p` 原生 auto permission 就能落地）
- 不要使用其他后端
