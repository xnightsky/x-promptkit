# Case ID

case-05-backend-selection

## Target Layer

dev-run

## Input

Use `$dev-run`.

用户要求：分三次请求，每次指定不同后端执行同一个任务“检查当前工作目录是否存在”。
1. 用 claude 执行
2. 用 codex 执行
3. 用 pi 执行

## Execution Constraints

- 必须使用 `$dev-run` skill
- 每次请求切换后端时，必须严格使用用户指定的后端
- 对应后端命令骨架：
  - claude: `IS_SANDBOX=1 claude --dangerously-skip-permissions -p`
  - codex: `codex exec --json`
  - pi: `pi -p`
- 后端之间不能互相污染参数
