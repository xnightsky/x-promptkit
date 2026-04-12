---
name: codex-bridge-minimax-worker-installer
description: Use when installing, updating, repairing, or uninstalling the codex-bridge-backed minimax_worker subagent integration for Codex.
---

# Codex Bridge MiniMax Worker Installer

Use this skill only when the user explicitly wants to install, repair, update, or uninstall the `minimax_worker` integration.

## Allowed Changes

When using this skill normally, only touch these paths:

- `~/.codex/config.toml`
- `~/.codex/agents/minimax-worker.toml`
- `~/codex-bridge/*`

When maintaining this skill itself, these paths are also in scope:

- `~/.codex/skills/codex-bridge-minimax-worker-installer/*`
- `~/.codex/skills/codex-bridge-minimax-worker-loader/*`

Do not change the user's default top-level `model_provider` or `model`.

## Install Or Update

1. Decide whether the user wants `install` or `uninstall`. If unclear, ask one concise question.
2. For `install`, collect:
   - `ANTHROPIC_AUTH_TOKEN` (required)
   - `ANTHROPIC_MODEL` (default `MiniMax-M2.7`)
   - `ANTHROPIC_BASE_URL` (default `https://api.minimaxi.com/anthropic`)
3. If `request_user_input` is available, use it. Otherwise ask the user directly in plain text.
4. Export the collected values in the shell for the command invocation, then run [scripts/install-or-update.sh](./scripts/install-or-update.sh).
5. The installer must use the vendored `codex-bridge` source bundled inside this skill and provision `~/codex-bridge` as a Node project during install. Do not `git clone` at install time.
6. Report what was installed and point the user to `$codex-bridge-minimax-worker-loader` for runtime startup.

Example invocation:

```bash
ANTHROPIC_AUTH_TOKEN='...' \
ANTHROPIC_MODEL='MiniMax-M2.7' \
ANTHROPIC_BASE_URL='https://api.minimaxi.com/anthropic' \
./scripts/install-or-update.sh
```

## Uninstall

Run [scripts/uninstall.sh](./scripts/uninstall.sh).

This removes:

- the managed `minimax_bridge` provider block from `~/.codex/config.toml`
- the managed `minimax_worker` agent block from `~/.codex/config.toml`
- `~/.codex/agents/minimax-worker.toml`
- `~/codex-bridge`

This does not remove the two skill directories themselves.

## Notes

- Never guess a token value.
- If `ANTHROPIC_AUTH_TOKEN` is missing, stop and ask for it.
- Re-running `install-or-update.sh` should be treated as a repair/update path, not a duplicate install.
- Vendored upstream source lives under `vendor/codex-bridge`.
- Detailed architecture and workflow reference: [references/codex-subagent-minimax-m2.7-manual.md](./references/codex-subagent-minimax-m2.7-manual.md)
