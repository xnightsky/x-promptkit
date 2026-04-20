---
name: codex-kimi-worker-installer
description: Use when installing, updating, repairing, or uninstalling the Kimi (Moonshot) OpenAI-compatible provider and the kimi_worker subagent for Codex. No local bridge process is involved.
---

# Codex Kimi Worker Installer

Use this skill only when the user explicitly wants to install, repair, update, or uninstall the `kimi_worker` integration for Codex.

Unlike `codex-bridge-minimax-worker-installer`, this skill does **not** install or launch any local bridge process. Kimi's OpenAI-compatible endpoints are consumed directly by Codex via its native custom `model_providers` mechanism. There is no port, no PID file, no vendored source.

## Invocation

This skill targets **Codex only** and is **manual-only**.

Invoke via `$codex-kimi-worker-installer`. The accompanying [`agents/openai.yaml`](./agents/openai.yaml) sets `policy.allow_implicit_invocation: false`, so Codex will not trigger this skill without an explicit reference. Do not act on it when the user only mentions Kimi or Codex in passing.

## Allowed Changes

When using this skill normally, only touch these paths:

- `~/.codex/config.toml` — **only inside** the managed block delimited by `# BEGIN managed-by: codex-kimi` / `# END managed-by: codex-kimi`
- `~/.codex/agents/kimi-worker.toml`
- `~/.codex/agents/kimi-worker-general.toml` (only when `KIMI_UPSTREAM=general` or `both`)

When maintaining this skill itself, this path is also in scope:

- `~/.codex/skills/codex-kimi-worker-installer/*`

Do **not** change the user's top-level `model_provider` or `model`. Do **not** modify any block outside the `managed-by: codex-kimi` markers. In particular, never touch blocks owned by `codex-bridge-minimax-worker-installer`.

## Install Or Update

1. Decide whether the user wants `install` or `uninstall`. If unclear, ask one concise question.
2. For `install`, collect:
   - `KIMI_API_KEY` (required) — Moonshot API key
   - `KIMI_UPSTREAM` (optional, default `coding`) — one of `coding`, `general`, `both`
   - `KIMI_MODEL_CODING` (optional, default `kimi-k2-thinking`) — model SKU for the Kimi Code line
   - `KIMI_MODEL_GENERAL` (optional, default `kimi-k2-0905`) — model SKU for the Moonshot general line
3. If `request_user_input` is available, use it. Otherwise ask the user directly in plain text.
4. Export the collected values in the shell, then run [scripts/install-or-update.sh](./scripts/install-or-update.sh).
5. The installer writes two managed provider blocks (`kimi_coding`, `kimi_general`) and generates the agent TOML files according to `KIMI_UPSTREAM`.
6. Report what was installed and tell the user they can invoke the subagent with `codex --agent kimi_worker "..."` (or `--agent kimi_worker_general` when installed).

Example invocation:

```bash
KIMI_API_KEY='sk-...' \
KIMI_UPSTREAM='coding' \
KIMI_MODEL_CODING='kimi-k2-thinking' \
./scripts/install-or-update.sh
```

## Uninstall

Run [scripts/uninstall.sh](./scripts/uninstall.sh).

This removes:

- the managed `kimi_coding` / `kimi_general` provider blocks from `~/.codex/config.toml` (by the `managed-by: codex-kimi` markers)
- `~/.codex/agents/kimi-worker.toml`
- `~/.codex/agents/kimi-worker-general.toml`

This does **not** remove the skill directory itself, does **not** clear `KIMI_API_KEY` from your environment, and does **not** touch any block owned by other installers (e.g. `codex-bridge-minimax-worker-installer`).

## Notes

- Never guess an API key. If `KIMI_API_KEY` is missing, stop and ask for it.
- Re-running `install-or-update.sh` is a repair/update path: the managed block is rewritten in place, never appended.
- No local process is launched. If the user explicitly asks "how do I start the Kimi bridge", tell them this integration has no bridge — Codex connects directly over HTTPS.
- `wire_api = "responses"` is required. The legacy `chat` wire is on the deprecated path.
- Kimi endpoints used:
  - `https://api.kimi.com/coding/v1` — Kimi Code line (default)
  - `https://api.moonshot.ai/v1` — Moonshot general line
- The default model SKUs are placeholders for Kimi 2.6-era naming. Confirm the current SKU on `platform.moonshot.ai` and pass `KIMI_MODEL_CODING` / `KIMI_MODEL_GENERAL` at install time as needed.
- Detailed architecture and troubleshooting reference: [references/codex-kimi-subagent-manual.md](./references/codex-kimi-subagent-manual.md)
