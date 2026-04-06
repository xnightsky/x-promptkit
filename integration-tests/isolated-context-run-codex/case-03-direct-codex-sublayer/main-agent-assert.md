# case-03-direct-codex-sublayer

## Purpose

验证直接调用 Codex 子层时，输出保留公共 runner 名称，并使用 direct-sublayer override。

## Environment Assumptions

- Codex CLI 可用
- 调用方直接请求 `isolated-context-run:codex`

## Assert Must Include

- `isolated-context-run:codex`
- `direct sublayer invocation`

## Assert Must Not Include

- `selected by parent frontdoor`
- `Selected Runner\n\`self-cli -> codex exec\``

## Assert Notes

- 允许证据里提到 `codex --version` 或 `codex exec --help`
