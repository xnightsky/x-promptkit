# Case ID

case-06-fallback-limitation-disclosure

## Purpose

约束 `claude-p-watch` 在 fallback / prompt-only 场景下，显式披露能力边界，不伪造 host watch 证据。

## Environment Assumptions

- 高级 runtime helper 不可用
- 只能依赖退化提示词契约

## Assert Must Include

- fallback
- runtime
- 不能确认
- DONE

## Assert Must Not Include

- 已确认进程还在
- 已确认进程结束

## Assert Notes

- 必须体现“没有证据”而不是“根据 prompt 猜一个状态”
