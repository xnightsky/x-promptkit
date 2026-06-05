# Case ID

case-03-opencode-run

## Purpose

验证 `ai-run` 在用户指定 opencode 后端时，正确路由并构造 `opencode run` 命令，不自动添加 superpowers 前缀。

## Environment Assumptions

- `ai-run` skill 已可用
- 用户明确指定 opencode
- 用户未要求 superpowers 前缀

## Assert Must Include

- `opencode`
- `run`

## Assert Must Not Include

- `superpowers`
- `use skill tool to load`
- `codex`
- `claude`
- `IS_SANDBOX=1`
- 你可以手动运行

## Assert Notes

- 命令骨架必须是 `opencode run`，不能混入 claude/codex 的参数
- `superpowers` 等前缀是用户未要求的，不应出现
