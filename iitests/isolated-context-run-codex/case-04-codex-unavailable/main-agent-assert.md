# case-04-codex-unavailable

## Purpose

验证 Codex 子层 unavailable 场景会返回无可运行选择，并给出安装指引。

## Environment Assumptions

- Codex CLI 不存在

## Assert Must Include

- `No runnable selection from this probe.`
- `Install Guidance`
- `codex`

## Assert Must Not Include

- `Failure Detail`
- `Selected Runner\n\`isolated-context-run:codex\``

## Assert Notes

- unavailable 场景不应被改写成环境失败
