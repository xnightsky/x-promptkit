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

## Invoking the generated agents

Codex CLI does **not** provide a `--agent` / `--agents` flag (see
[openai/codex#10067](https://github.com/openai/codex/issues/10067) — still an
open feature request). Instead, subagents are spawned by the main Codex
session when you refer to them **by name** in a prompt. See the official
[Codex subagents docs](https://developers.openai.com/codex/subagents) for the
full model.

```bash
# Interactive TUI: start Codex, then mention the agent by name in the prompt
codex
# then at the TUI prompt, for example:
#   > Have kimi_worker implement <task>.
#     Use kimi_worker_general to draft the spec first.

# Non-interactive / one-shot via codex exec
codex exec "Spawn kimi_worker to refactor src/foo.ts and summarize the diff."
```

Inside an interactive session, use the `/agent` slash command to switch
between live agent threads or inspect the current one.

Names to use in prompts:

- **Dimension B**: `kimi_worker` (coding) / `kimi_worker_general` (general).
- **Dimension C**: whatever `name` you set in the custom TOML file
  (e.g. `kimi_worker_review`, `kimi_worker_planner`).

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

## Troubleshooting

### `agent type is currently not available` when an outer agent calls `spawn_agent`

If an outer agent / host (for example, another Codex session acting as an
orchestrator, or a platform that wraps Codex as a tool) calls
`spawn_agent(agent_type="kimi_worker", ...)` and reports
`agent type is currently not available`, the failure is at the **host layer**,
not the installer:

- This installer writes a valid custom agent file to
  `~/.codex/agents/kimi-worker.toml` with the required `name`, `description`,
  and `developer_instructions` fields (matching the schema documented at
  [Codex Subagents · Custom agents](https://developers.openai.com/codex/subagents)).
- Codex CLI, when **started directly by the user**, reads that file and
  recognises `kimi_worker` by name.
- Some outer hosts expose `spawn_agent` with a **fixed enum of agent types**
  (e.g. `default`, `worker`, `explorer`) and will not accept arbitrary
  custom-registered names, even when Codex itself has them loaded. There is
  nothing this installer can do about that — it is a host-side restriction.

**Local diagnostics** (run in a plain terminal, not inside the outer host):

```bash
codex --version
ls -la ~/.codex/agents/
cat ~/.codex/agents/kimi-worker.toml
codex features list | grep -i -E 'subagent|agent'

# Interactive probe:
codex
# then at the TUI prompt:
#   /agent        -> lists active agent threads / loaded custom agents
```

| Observation | Likely cause |
|---|---|
| TOML missing or `name` ≠ `kimi_worker` | Installer did not run successfully in this `$CODEX_DIR`; re-run with correct `KIMI_ACTION`. |
| TOML OK, `/agent` does not list `kimi_worker` | Codex process did not scan `~/.codex/agents/` at startup. Restart Codex; verify `CODEX_DIR`; upgrade Codex if very old. |
| TOML OK, `/agent` lists it, but outer host `spawn_agent` still errors | Outer host uses a fixed `agent_type` enum. Use the resolutions below. |
| `codex features` has no subagent entry | Feature not available in this Codex build; upgrade, or use `--profile` path below. |

**Resolutions**:

1. **Refer to the agent by name in a prompt** (recommended; see
   [Invoking the generated agents](#invoking-the-generated-agents) above).
   This works whenever Codex itself has loaded the TOML, regardless of what
   the outer host exposes via `spawn_agent`.
2. **Bypass the subagent path with `--profile`**. Configure a profile that
   pins `model_provider = "kimi_coding"` (or `kimi_general`) and run
   `codex --profile <name> "<task>"`. This drives the entire Codex session
   with Kimi and sidesteps the subagent enum.
3. **Restart the outer host** after installing, in case it cached its
   `agent_type` enum at startup and does not hot-reload.

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
