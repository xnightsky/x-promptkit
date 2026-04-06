# case-02-explicit-codex-mode

## Purpose

验证显式 `mode=codex-exec` 仍然落到 Codex 子层，而不是重新暴露成底层 backend 名称。

## Environment Assumptions

- 当前宿主是 Codex host
- `mode=codex-exec` 由调用方显式提供

## Assert Must Include

- `isolated-context-run:codex`
- `mode=codex-exec`
- `explicit`

## Assert Must Not Include

- `Selected Runner\n\`mode=codex-exec -> codex exec\``
- `Selected Runner\n\`self-cli -> codex exec\``

## Assert Notes

- `Why` 中需要说明这是显式 override
