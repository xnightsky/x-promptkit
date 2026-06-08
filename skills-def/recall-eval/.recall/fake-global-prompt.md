# 测试用全局提示词（手写 fixture）

本文件是 recall-eval 自测专用的假全局提示词，供 `.recall/` 下自测队列的
`context.global.path` 指向，避免自测依赖用户机器上的真实全局提示词
（如 `~/.claude/CLAUDE.md`，跨机器不可复现）。

- fixture 标记：`[fixture-global-prompt]`
- 本文件内容可以随自测需要修改，不承载任何真实全局记忆。
