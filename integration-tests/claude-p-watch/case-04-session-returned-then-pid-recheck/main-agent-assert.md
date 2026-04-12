# Case ID

case-04-session-returned-then-pid-recheck

## Purpose

约束 `claude-p-watch` 在用户直接追问状态时，立即做终止态复核而不是继续等定时 watch。

## Environment Assumptions

- session 已返回 terminal result
- 外层 PID 可能尚未完全退出

## Assert Must Include

- session
- 运行态
- 复核

## Assert Must Not Include

- 必然已经退出
- 等下一次

## Assert Notes

- 关键是区分 session 终态与进程终态；可以提 PID，但不应把 PID 当成唯一允许的复核手段
