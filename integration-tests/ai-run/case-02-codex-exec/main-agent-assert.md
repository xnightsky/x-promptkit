# Case ID

case-02-codex-exec

## Purpose

验证 `ai-run` 在用户指定 codex 后端时，正确路由并构造 `codex exec --json` 命令。

## Environment Assumptions

- `ai-run` skill 已可用
- 用户明确指定 codex

## Assert Must Include

- `codex`
- `exec`
- `--json`

## Assert Must Not Include

- `IS_SANDBOX=1`
- `--dangerously-skip-permissions`
- `opencode`
- `pi -p`
- `--agent`
- 你可以手动运行

## Assert Notes

- 命令骨架必须是 `codex exec --json`，不能混入 claude 专属的 sandbox 参数
- `--agent` 是用户未要求的额外 flag，不应出现
