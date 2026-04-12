# Case ID

case-03-both-fds-non-seekable-state-recheck

## Purpose

约束 `claude-p-watch` 在 `fd1` / `fd2` 都 non-seekable 的场景下，返回 empty reason 并与状态判定分离。

## Environment Assumptions

- Linux `/proc` 场景
- `fd/1` 与 `fd/2` 都指向 tty、pipe 或其他 non-seekable 目标

## Assert Must Include

- tail
- 空
- reason
- PID
- session

## Assert Must Not Include

- 所以进程已经结束
- 没有任何进展

## Assert Notes

- 必须体现“stderr fallback 已不可用”或等价语义
- 必须体现“观测不到 tail”与“宿主是否仍活着”是两件事
