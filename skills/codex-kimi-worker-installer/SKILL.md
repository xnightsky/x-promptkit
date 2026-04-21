---
name: codex-kimi-worker-installer
description: Use when installing, updating, repairing, or uninstalling the Kimi (Moonshot) OpenAI-compatible provider and Kimi worker subagents for Codex. Three-dimension action model - providers (A), default agents (B), custom workers (C). No local bridge process is involved.
---



# Codex Kimi Worker Installer

Use this skill only when the user explicitly wants to install, repair, update, or uninstall the `kimi_worker` integration for Codex.

Unlike `codex-bridge-minimax-worker-installer`, this skill does **not** install or launch any local bridge process. Kimi's OpenAI-compatible endpoints are consumed directly by Codex via its native custom `model_providers` mechanism. There is no port, no PID file, no vendored source.

## Invocation

This skill targets **Codex only** and is **manual-only**.

Invoke via `$codex-kimi-worker-installer`. The accompanying [`agents/openai.yaml`](./agents/openai.yaml) sets `policy.allow_implicit_invocation: false`, so Codex will not trigger this skill without an explicit reference. Do not act on it when the user only mentions Kimi or Codex in passing.

## Actions (dimensions)

This skill has three orthogonal action dimensions. Every invocation is a combination of them:

| Dimension | Artifacts | Default? |
|---|---|---|
| **A. model_providers** | managed block in `~/.codex/config.toml` (`kimi_coding` / `kimi_general`) | ✅ |
| **B. default agents** | `~/.codex/agents/kimi-worker.toml` and/or `kimi-worker-general.toml` | ✅ |
| **C. custom kimi_worker** | `~/.codex/agents/<user-chosen-name>.toml` + manifest `~/.codex/.codex-kimi/workers.json` | ❌ |

**Default path = A + B.** When the user has not explicitly asked for C, run the default path.

Dispatched by `KIMI_ACTION`:

| `KIMI_ACTION` | A | B | C |
|---|---|---|---|
| `default` (default) | ✅ | ✅ | ❌ |
| `providers-only` | ✅ | ❌ | ❌ |
| `default-agents-only` | ❌ (requires A already installed) | ✅ | ❌ |
| `custom-worker` | ❌ (requires A already installed) | ❌ | ✅ |
| `uninstall` | — | — | — (delegates to `uninstall.sh`) |

## Interaction Contract

1. After the user invokes `$codex-kimi-worker-installer`, **use `request_user_input` first** to ask what they want to do. Options, in order:
   - "Install default (providers + default agents)" — default highlight
   - "Only refresh model_providers (Dimension A)"
   - "Only refresh default agents (Dimension B, requires A already installed)"
   - "Create a custom kimi_worker (Dimension C)"
   - "Uninstall"
2. If the user chooses **C**, ask in sequence:
   - `KIMI_WORKER_NAME` (valid identifier, not `kimi_worker` / `kimi_worker_general`)
   - `KIMI_WORKER_PROVIDER` (`kimi_coding` | `kimi_general`; reject if not installed)
   - `KIMI_WORKER_MODEL` (optional, default `kimi-k2.6`)
   - `KIMI_WORKER_INSTRUCTIONS` (optional; script falls back to a generic template if omitted — write multi-line text to a file and pass `KIMI_WORKER_INSTRUCTIONS_FILE`)
3. Export the collected values and invoke [`scripts/install-or-update.sh`](./scripts/install-or-update.sh) with the appropriate `KIMI_ACTION`.
4. When the user has not mentioned any dimension keyword, **default to A + B.** Do not proactively create a custom worker.

## Prerequisites · KIMI_API_KEY

This skill **never** writes the key to any file. It only references `env_key = "KIMI_API_KEY"` in `config.toml`. The recommended way to maintain the value is **direnv**. The installer checks direnv at the end of each run:

- Present → prints a one-line confirmation, does nothing else
- Missing → prints OS-appropriate installation hints (Homebrew / apt / dnf / pacman / Nix / Scoop) and alternatives; **does not auto-install** anything
- GUI-launched Codex (`Codex.app` on macOS, `codex.exe` on Windows, or IDE extensions) does **not** go through a shell, so direnv will not take effect — use `launchctl setenv` / `setx` or launch Codex from a direnv-allowed terminal

Full cross-shell × cross-OS matrix, rationale, and anti-patterns: see [`references/codex-kimi-subagent-manual.md`](./references/codex-kimi-subagent-manual.md) §6 Key wiring architecture.

## Allowed Changes

When using this skill normally, only touch these paths:

- `~/.codex/config.toml` — **only inside** the managed block delimited by `# BEGIN managed-by: codex-kimi` / `# END managed-by: codex-kimi`
- `~/.codex/agents/kimi-worker.toml` (Dimension B, coding)
- `~/.codex/agents/kimi-worker-general.toml` (Dimension B, general)
- `~/.codex/agents/<custom-name>.toml` (Dimension C)
- `~/.codex/.codex-kimi/workers.json` (Dimension C manifest)

When maintaining this skill itself, this path is also in scope:

- `~/.codex/skills/codex-kimi-worker-installer/*`

Do **not** change the user's top-level `model_provider` or `model`. Do **not** modify any block outside the `managed-by: codex-kimi` markers. Do **not** touch user dotfiles (`.envrc`, `~/.zshenv`, `~/.bashrc`, `~/.profile`, etc.) — the key-wiring layer is the user's responsibility. In particular, never touch blocks owned by `codex-bridge-minimax-worker-installer`.

## Install Or Update

Collect inputs depending on the chosen action.

### A + B (default)

- `KIMI_API_KEY` (required) — Moonshot API key, referenced at runtime
- `KIMI_UPSTREAM` (optional, default `coding`) — `coding` | `general` | `both`
- `KIMI_MODEL_CODING` (optional, default `kimi-k2.6`)
- `KIMI_MODEL_GENERAL` (optional, default `kimi-k2.6`)

```bash
KIMI_API_KEY='sk-...' \
KIMI_UPSTREAM='coding' \
./scripts/install-or-update.sh
```

### Providers only (A)

```bash
KIMI_API_KEY='sk-...' \
KIMI_UPSTREAM='both' \
KIMI_ACTION='providers-only' \
./scripts/install-or-update.sh
```

### Default agents only (B)

Requires the corresponding providers to already exist in the managed block (exit code 3 otherwise).

```bash
KIMI_UPSTREAM='coding' \
KIMI_ACTION='default-agents-only' \
./scripts/install-or-update.sh
```

### Custom worker (C)

Requires the target provider to already exist in the managed block (exit code 3 otherwise).

```bash
KIMI_ACTION='custom-worker' \
KIMI_WORKER_NAME='kimi_worker_review' \
KIMI_WORKER_PROVIDER='kimi_coding' \
KIMI_WORKER_MODEL='kimi-k2.6' \
./scripts/install-or-update.sh

# With instructions loaded from a file:
KIMI_ACTION='custom-worker' \
KIMI_WORKER_NAME='kimi_worker_planner' \
KIMI_WORKER_PROVIDER='kimi_coding' \
KIMI_WORKER_INSTRUCTIONS_FILE=./path/to/planner.md \
./scripts/install-or-update.sh
```

Invoke the generated agents with:

```bash
codex --agent kimi_worker                 # Dimension B coding
codex --agent kimi_worker_general         # Dimension B general
codex --agent <your-custom-name>          # Dimension C
```

## Uninstall

Run [scripts/uninstall.sh](./scripts/uninstall.sh), or call `install-or-update.sh` with `KIMI_ACTION=uninstall`.

Scopes, controlled by `KIMI_UNINSTALL_SCOPE`:

- unset or `all` (default):
  - removes the `managed-by: codex-kimi` block from `config.toml`
  - removes `kimi-worker.toml` and `kimi-worker-general.toml`
  - removes all custom workers listed in the manifest
  - removes the manifest itself and the `.codex-kimi/` directory if it ends up empty
- `custom-only`:
  - removes only custom workers and the manifest
  - keeps Dimension A + B intact

Neither scope clears `KIMI_API_KEY`, touches any `.envrc` / shell rc file, or modifies blocks owned by other installers.

## Notes

- Never guess an API key. If `KIMI_API_KEY` is missing when running A, stop and ask for it.
- Re-running any action is safe: the managed block is rewritten in place; custom workers are upserted by name.
- No local process is launched. If the user asks "how do I start the Kimi bridge", tell them this integration has no bridge — Codex connects directly over HTTPS.
- `wire_api = "responses"` is required. The legacy `chat` wire is deprecated.
- Kimi endpoints used:
  - `https://api.kimi.com/coding/v1` — Kimi Code line (default)
  - `https://api.moonshot.ai/v1` — Moonshot general line
- Confirm current model SKUs on `platform.moonshot.ai` if the defaults (`kimi-k2.6`) drift.
- Detailed architecture, cross-platform key wiring, and troubleshooting: [references/codex-kimi-subagent-manual.md](./references/codex-kimi-subagent-manual.md)
