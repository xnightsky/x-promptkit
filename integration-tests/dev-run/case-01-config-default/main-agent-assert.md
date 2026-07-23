# Case ID

case-01-config-default

## Purpose

验证 `dev-run` 在用户未指定后端时从 PWD 向 home 检索 `.dev-run.yaml`，路由到配置的 pi，并使用标准 pi 命令骨架。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户未指定后端
- 最近配置声明合法的 `default_backend: pi`

## Assert Must Include

- `pi`
- `-p`
- `</dev/null`

## Assert Must Not Include

- `claude`
- `codex`
- `opencode run`
- `kimi -p`
- `IS_SANDBOX=1`
- `--dangerously-skip-permissions`
- `--verbose`
- `--output-format`
- 你可以手动运行

## Assert Notes

- 不需要固定命令全文，但必须可见 pi 配置默认后端选择 + 标准命令骨架
- 禁止出现 claude 命令骨架，以锁定“配置存在时不得静默回退”的契约
