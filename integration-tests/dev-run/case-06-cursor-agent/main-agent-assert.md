# Case ID

case-06-cursor-agent

## Purpose

验证 `dev-run` 在用户指定 cursor 后端时，正确路由并构造 `cursor-agent -p --trust` 命令，默认走安全档、不上危险全开。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户明确指定 cursor

## Assert Must Include

- `cursor-agent`
- `-p`
- `--trust`

## Assert Must Not Include

- `codex`
- `opencode`
- `pi -p`
- `IS_SANDBOX=1`
- `--yolo`
- 你可以手动运行

## Assert Notes

- 命令骨架必须是 `cursor-agent -p --trust`，默认安全档
- 未显式 `--force`/`--yolo` 时不允许走危险全开档（不出现 `--yolo`）
- cursor 是 5 个支持后端之一（claude/codex/opencode/pi/cursor），不能报"不支持"
