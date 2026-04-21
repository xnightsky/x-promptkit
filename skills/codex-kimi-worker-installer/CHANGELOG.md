# Changelog — codex-kimi-worker-installer

All notable changes to this skill will be documented in this file.

## [Unreleased]

### Changed
- `codex-kimi-worker-installer` refactored into a **three-dimension action
  model** (A. providers / B. default agents / C. custom workers), dispatched
  via `KIMI_ACTION`. Default action = A + B.
- Default agent TOML template updated: dropped the `[agent]` header and
  switched to flat keys, added `developer_instructions`, default model now
  `kimi-k2.6` (replaces `kimi-k2-thinking` / `kimi-k2-0905`).
- `kimi_coding` / `kimi_general` are now written conditionally based on
  `KIMI_UPSTREAM` (`coding` / `general` / `both`). Previously both entries
  were written regardless of the upstream selection.
- Removed the post-install soft liveness probe
  (`curl -H Authorization ... /models`). direnv detection now serves as
  the end-of-run sanity signal.

### Added
- `KIMI_ACTION=custom-worker` to create a custom kimi_worker built on an
  existing provider (`kimi_coding` or `kimi_general`). Inputs:
  `KIMI_WORKER_NAME`, `KIMI_WORKER_PROVIDER`, `KIMI_WORKER_MODEL` (optional,
  default `kimi-k2.6`), `KIMI_WORKER_DESCRIPTION` (optional),
  `KIMI_WORKER_INSTRUCTIONS_FILE` (optional).
- Internal manifest `~/.codex/.codex-kimi/workers.json` tracks custom
  workers for clean uninstall.
- `KIMI_UPSTREAM=both` runs print a maintenance cheat-sheet for
  multi-worker workflows (per-call agent selection, project-scoped default,
  aliases, fold-back).
- `KIMI_UNINSTALL_SCOPE=custom-only` removes only Dimension C, preserving
  providers and default agents.
- `SKILL.md` gained `## Actions (dimensions)`, `## Interaction Contract`,
  and `## Prerequisites · KIMI_API_KEY` sections.
- `references/codex-kimi-subagent-manual.md` gained §3a / §3b / §4a for the
  three-dimension model and multi-worker patterns.
- **direnv as recommended key-wiring strategy.** The installer detects
  direnv at the end of every run and, if missing, prints OS-appropriate
  installation hints (Homebrew / apt / dnf / pacman / Nix / Scoop) plus
  explicit alternatives. The script **does not auto-install** direnv and
  **does not write** any `.envrc` files — both decisions belong to the user.
- `references/codex-kimi-subagent-manual.md` §6 "Key wiring architecture
  (cross-shell × cross-OS)" covers principle, direnv usage, the GUI /
  subagent inheritance boundary (Codex GUI on macOS / Windows / IDE
  extensions do not go through a shell, so direnv has no effect —
  mitigated by `launchctl setenv` / `setx` or launching from a
  direnv-allowed terminal), the shell × OS matrix, and anti-patterns
  (`auth.json` custom fields, `.env` auto-load, inline agent keys — all
  unsupported, with issue references to openai/codex#5409, #41, #14039,
  #3064).
- `references/examples/envrc.kimi.example` ships as a ready-to-copy
  `.envrc` template.

### Compatibility
- Existing users re-running the default path will see their
  `[agent]`-header-based default agent files rewritten to the new
  flat-keys template. This is intentional and idempotent.
- Custom agent files in `~/.codex/agents/*.toml` not listed in the
  manifest are left untouched by both install and uninstall.
- direnv detection is purely advisory. Users already maintaining
  `KIMI_API_KEY` via `~/.zshenv`, `setx`, `launchctl setenv`, etc., are
  unaffected.
