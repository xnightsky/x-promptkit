# Case ID

case-05-watch-establishment-failure

## Target Layer

claude-p-watch

## Input

Use `$claude-p-watch`.

用户场景：当前 harness 会让外层宿主进程在拿到可稳定观察的 PID 之前就退出，导致默认 watch 无法可靠建立。请说明这时应该怎么向用户汇报。

## Execution Constraints

- 必须明确表示 watch 没有可靠建立成功
- 必须提到当前限制来自 runtime / harness 条件，而不是任务本身完成
- 不要假装已经进入正常 watch 周期
- 不要把“命令启动过”说成“watch 已建立”
