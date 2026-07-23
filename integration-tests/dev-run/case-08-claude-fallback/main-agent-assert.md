# Case ID

case-08-claude-fallback

## Purpose

验证 `dev-run` 仅在从 PWD 到 home 的所有候选位置都没有配置时回退 claude，并使用标准 claude 命令骨架。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户未指定后端
- 所有候选位置都没有 `.dev-run.yaml`

## Assert Must Include

- `claude`
- `IS_SANDBOX=1`
- `--dangerously-skip-permissions`
- `-p`

## Assert Must Not Include

- `codex`
- `opencode run`
- `pi -p`
- `kimi -p`
- `--verbose`
- `--output-format`
- 你可以手动运行

## Assert Notes

- 不需要固定命令全文，但必须可见 claude 内建兜底 + 标准命令骨架
- 该兜底的前提是所有候选位置都不存在配置，不覆盖配置化默认后端
