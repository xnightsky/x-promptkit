# Case ID

case-02-runtime-owns-liveness

## Purpose

约束 `claude-p-watch` 在解释 watch 设计时，把进程判活明确落在 runtime / 运行时证据层，而不是 prompt marker。

## Environment Assumptions

- skill `claude-p-watch` 已可用
- 响应为普通文本

## Assert Must Include

- runtime
- 证据
- prompt
- 不能作为
- 限制

## Assert Must Not Include

- 都可以
- 一样可靠

## Assert Notes

- 不要求固定句式，但必须清楚区分“判活证据”和“阶段标记”
