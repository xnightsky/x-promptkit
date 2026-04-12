# Case ID

case-04-session-returned-then-pid-recheck

## Target Layer

claude-p-watch

## Input

Use `$claude-p-watch`.

用户追问：执行会话已经返回最终结果了，`claude -p` 这个进程是不是停止了？

## Execution Constraints

- 必须提到先承认 session 已返回最终结果
- 必须提到再做一次短暂运行态复核，例如 PID 或 session 侧复核
- 必须避免把 session 返回和进程已退出直接画等号
- 结论可以是“已退出”或“仍短暂存在”，但要说明这是复核后的结果
