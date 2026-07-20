# Case ID

case-07-kimi

## Purpose

验证 `dev-run` 在用户指定 kimi 后端时，正确路由并构造 `kimi -p` 命令，不带 stdin 护栏、不带放行 flag。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户明确指定 kimi

## Assert Must Include

- `kimi`
- `-p`

## Assert Must Not Include

- `codex`
- `cursor-agent`
- `pi -p`
- `IS_SANDBOX=1`
- `</dev/null`
- `--yolo`
- 你可以手动运行

## Assert Notes

- 命令骨架必须是 `kimi -p "..."`，`-p` 原生 auto permission 就能落地编辑，默认不带放行 flag
- 不加 `</dev/null`（kimi 不吃 stdin，区别于 pi/cursor）
- 未显式要求时不出现 `-y`/`--yolo`
- kimi 是 6 个支持后端之一（claude/codex/opencode/pi/cursor/kimi），不能报"不支持"
