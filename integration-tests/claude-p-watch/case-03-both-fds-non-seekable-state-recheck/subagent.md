# Case ID

case-03-both-fds-non-seekable-state-recheck

## Target Layer

claude-p-watch

## Input

Use `$claude-p-watch`.

用户场景：Linux 下 `/proc/<pid>/fd/1` 和 `/proc/<pid>/fd/2` 都指向 tty、pipe 或其他 non-seekable 目标。请说明此时 watch 应该怎么汇报。

## Execution Constraints

- 必须提到 tail 为空或 empty reason
- 必须提到两个 fd 都 non-seekable，因而不能走 stdout/stderr regular-file fallback
- 必须提到还要单独复核 PID 或 session 状态
- 不要把“没有 tail”直接说成“进程已结束”
