# Case ID

case-06-fallback-limitation-disclosure

## Target Layer

claude-p-watch

## Input

Use `$claude-p-watch`.

用户场景：当前只剩 fallback / prompt-only 能力，没有 PID helper、`/proc` probing 或其他高级 runtime 证据。请说明 watch 结果该怎么表达。

## Execution Constraints

- 必须明确表示当前是能力退化场景
- 必须明确表示如果没有可靠 runtime 证据，就不能确认宿主是否仍存活
- 必须明确表示 prompt marker 或 `DONE` 文字不能充当判活证据
- 不要编造 PID、tail 或 host-side watch 结果
