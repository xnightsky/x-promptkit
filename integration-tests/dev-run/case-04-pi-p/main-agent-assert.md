# Case ID

case-04-pi-p

## Purpose

验证 `dev-run` 在用户指定 pi 后端时，正确路由并构造 `pi -p` 命令。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户明确指定 pi

## Assert Must Include

- `pi`
- `-p`

## Assert Must Not Include

- `codex`
- `claude`
- `opencode`
- `IS_SANDBOX=1`
- 你可以手动运行

## Assert Notes

- 命令骨架必须是 `pi -p`（带 `</dev/null` stdin 护栏），不混入其他后端参数
- pi 是 5 个支持后端之一（claude/codex/opencode/pi/cursor），不能报"不支持"
