# Case ID

case-01-claude-default

## Purpose

验证 `dev-run` 在用户未指定后端时，默认路由到 claude，并使用标准 claude 命令骨架。

## Environment Assumptions

- `dev-run` skill 已可用
- 用户未指定后端

## Assert Must Include

- `claude`
- `IS_SANDBOX=1`
- `--dangerously-skip-permissions`
- `-p`

## Assert Must Not Include

- `codex`
- `opencode run`
- `pi -p`
- `--verbose`
- `--output-format`
- 你可以手动运行

## Assert Notes

- 不需要固定命令全文，但必须可见 claude 后端选择 + 标准命令骨架
- `IS_SANDBOX=1` 和 `--dangerously-skip-permissions` 是 claude 默认模板的一部分，必须出现
- 禁止项针对：选错后端、添加无关 flag、把执行请求转成手动指导
