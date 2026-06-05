# Case ID

case-05-backend-selection

## Purpose

验证 `ai-run` 在多次请求中正确切换后端，不产生参数污染。

## Environment Assumptions

- `ai-run` skill 已可用
- 三次请求分别指定 claude、codex、pi

## Assert Must Include

- `claude`
- `codex`
- `pi`
- `-p`
- `--json`

## Assert Must Not Include

- `opencode`（用户未请求此后端）
- 你可以手动运行
- 不支持

## Assert Notes

- 三次请求覆盖三个不同后端
- 不允许 claude 命令中出现 `--json`
- 不允许 codex 命令中出现 `IS_SANDBOX=1`
- 不允许 pi 命令中出现其他后端专有 flag
