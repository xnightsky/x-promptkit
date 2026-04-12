# Case ID

case-02-runtime-owns-liveness

## Target Layer

claude-p-watch

## Input

Use `$claude-p-watch`.

用户问：watch 确认 `claude -p` 是否还活着，这个判定应该放在脚本里还是提示词里？请给出简短结论。

## Execution Constraints

- 必须明确表示“判活归 runtime / 运行时证据”
- 必须明确表示“prompt marker 不能作为宿主进程存活证明”
- 必须明确表示“如果拿不到可靠 runtime 证据，要说明限制”
- 不要把两者混成“都一样”
