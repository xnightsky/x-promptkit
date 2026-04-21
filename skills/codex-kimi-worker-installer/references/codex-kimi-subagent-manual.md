# Codex Kimi Subagent — Architecture & Troubleshooting

## 1. Why no bridge

Codex's custom `model_providers` mechanism accepts any OpenAI-compatible
endpoint via `wire_api = "responses"`. Kimi (Moonshot) publishes two
OpenAI-compatible base URLs:

- `https://api.kimi.com/coding/v1` — Kimi Code line, tuned for agentic coding.
- `https://api.moonshot.ai/v1` — Moonshot general line.

Because both are OpenAI-shaped, **no translation layer is required**. This is
deliberately different from `codex-bridge-minimax-worker-installer`, which
uses MiniMax's Anthropic-compatible endpoint and therefore must run a local
`codex-bridge` process to translate protocols.

**Naming convention:** skills whose name starts with `codex-bridge-*` do ship
a local bridge process; skills whose name starts with `codex-*-worker-*`
(without `bridge-`) connect Codex straight to the upstream HTTPS endpoint.

## 2. Topology

```
Codex CLI ──(HTTPS, OpenAI /responses wire)──▶ api.kimi.com/coding/v1
                                          └─▶ api.moonshot.ai/v1
```

No local process. No port binding. No PID file. No vendored source.

## 3. Files this skill manages

| Path | Dimension | Purpose |
|---|---|---|
| `~/.codex/config.toml` (managed block) | A | `model_providers` entries: `kimi_coding`, `kimi_general` (conditional on `KIMI_UPSTREAM`) |
| `~/.codex/agents/kimi-worker.toml` | B | Default agent bound to `kimi_coding` |
| `~/.codex/agents/kimi-worker-general.toml` | B | Default agent bound to `kimi_general` |
| `~/.codex/agents/<custom-name>.toml` | C | Custom kimi_worker generated with user-chosen name + instructions |
| `~/.codex/.codex-kimi/workers.json` | C | Manifest tracking custom workers for clean uninstall |

The managed block in `config.toml` is delimited by:

```
# BEGIN managed-by: codex-kimi
...
# END managed-by: codex-kimi
```

The installer rewrites this block in place on every run. Nothing outside the
markers is touched, so coexistence with `codex-bridge-minimax-worker-installer`
is safe as long as each installer uses its own distinct marker label.

## 3a. Action dimensions & defaults

Every invocation of `install-or-update.sh` falls into one of five modes,
dispatched by `KIMI_ACTION`:

| `KIMI_ACTION` | A | B | C | Notes |
|---|---|---|---|---|
| `default` (default) | ✅ | ✅ | ❌ | Install providers + default agents. Most common path. |
| `providers-only` | ✅ | ❌ | ❌ | Refresh managed block only. |
| `default-agents-only` | ❌ (verifies) | ✅ | ❌ | Rewrite default agent TOMLs. Exits 3 if A not yet installed. |
| `custom-worker` | ❌ (verifies) | ❌ | ✅ | Create a custom worker. Exits 3 if target provider not yet installed. |
| `uninstall` | — | — | — | Delegates to `uninstall.sh`. |

**Default = A + B.** Do not proactively run Dimension C unless the user
explicitly asks for a custom worker.

## 3b. Custom workers (Dimension C)

A custom worker is a Codex agent file that references an already-installed
provider. It is useful when one wants specialized roles (e.g. reviewer,
planner, translator) on the same Kimi upstream with different instructions
or different models.

Required input:

- `KIMI_WORKER_NAME` — must match `^[a-z][a-z0-9_]{2,31}$`; cannot be
  `kimi_worker` or `kimi_worker_general` (reserved for Dimension B).
- `KIMI_WORKER_PROVIDER` — one of `kimi_coding` / `kimi_general`, must
  already exist in the managed block.

Optional input:

- `KIMI_WORKER_MODEL` (default `kimi-k2.6`)
- `KIMI_WORKER_DESCRIPTION`
- `KIMI_WORKER_INSTRUCTIONS_FILE` — path to a text file whose contents go
  into `developer_instructions`. If omitted, a generic template is used.

Manifest entry written to `~/.codex/.codex-kimi/workers.json`:

```json
{
  "version": 1,
  "workers": [
    { "name": "kimi_worker_review", "provider": "kimi_coding", "model": "kimi-k2.6", "created_at": "2026-04-21T05:55:00Z" }
  ]
}
```

`uninstall.sh` reads this manifest to remove custom workers cleanly. Use
`KIMI_UNINSTALL_SCOPE=custom-only` to remove only Dimension C, preserving A
and B.

## 4. Switching upstream at runtime

Codex's `base_url` is a static string; there is no env interpolation. To
switch between `coding` and `general` at runtime, pick the corresponding
agent:

```bash
codex --agent kimi_worker            # coding/v1 (default)
codex --agent kimi_worker_general    # moonshot/v1
codex --agent <your-custom-name>     # Dimension C, any installed provider
```

Or use a project-scoped `.codex/config.toml` to override `model_provider`
for a specific repo.

## 4a. Maintaining multiple workers (`KIMI_UPSTREAM=both`)

When both coding and general agents are installed (or when multiple custom
workers coexist), choose one of these patterns:

- **Per-call selection:**
  ```bash
  codex --agent kimi_worker          "..."   # coding line
  codex --agent kimi_worker_general  "..."   # general line
  codex --agent kimi_worker_review   "..."   # custom
  ```
- **Project-scoped default:** add `model_provider = "kimi_coding"` (or
  `kimi_general`) to the repo's `.codex/config.toml`.
- **Shell aliases:**
  ```bash
  alias kimic='codex --agent kimi_worker'
  alias kimig='codex --agent kimi_worker_general'
  ```
- **Fold back to one worker:** re-run with `KIMI_UPSTREAM=coding` (or
  `general`); the other default agent file will be removed.

## 5. Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KIMI_API_KEY` | for A | — | Moonshot API key. Read by Codex at call time via `env_key`. |
| `KIMI_UPSTREAM` | for A / B | `coding` | `coding` / `general` / `both`. Controls managed block and default agents. |
| `KIMI_MODEL_CODING` | no | `kimi-k2.6` | Model SKU for the coding agent. |
| `KIMI_MODEL_GENERAL` | no | `kimi-k2.6` | Model SKU for the general agent. |
| `KIMI_ACTION` | no | `default` | Dispatch mode. See §3a. |
| `KIMI_WORKER_NAME` | for C | — | Custom worker identifier. |
| `KIMI_WORKER_PROVIDER` | for C | — | `kimi_coding` or `kimi_general`. |
| `KIMI_WORKER_MODEL` | no | `kimi-k2.6` | Custom worker model. |
| `KIMI_WORKER_DESCRIPTION` | no | generic | Custom worker description. |
| `KIMI_WORKER_INSTRUCTIONS_FILE` | no | generic template | Path to `developer_instructions` source. |
| `KIMI_UNINSTALL_SCOPE` | no | `all` | `all` or `custom-only`. |
| `CODEX_DIR` | no | `$HOME/.codex` | Override for testing. |

## 6. Key wiring architecture (cross-shell × cross-OS)

### 6.1 Principle

This skill manages only the `env_key = "KIMI_API_KEY"` reference inside
`config.toml`'s managed block. **It never writes the value of the key to
disk.** The value layer (how the process environment is populated) is the
user's responsibility, handled by the OS/shell. Choosing a good wiring
strategy is what makes `KIMI_API_KEY` visible to Codex in every session.

### 6.2 Recommended: direnv

[direnv](https://direnv.net) is the recommended primary strategy:

- Per-project `.envrc` in any repo; values scoped to that directory tree.
- Explicit `direnv allow` gate — no `.envrc` runs without your consent.
- Values auto-loaded when you `cd` in, auto-unloaded when you leave.
- Works across bash, zsh, fish, tcsh, and Git Bash / MSYS2 / WSL (Unix side).

Minimal `.envrc` (see also the template at
[`references/examples/envrc.kimi.example`](./examples/envrc.kimi.example)):

```bash
# Plaintext (simplest, do NOT commit)
export KIMI_API_KEY="sk-..."
```

Safer variants:

```bash
# 1Password CLI
export KIMI_API_KEY="$(op read op://Private/Kimi/credential)"

# pass / secret-tool
export KIMI_API_KEY="$(secret-tool lookup service kimi)"
```

After editing, run `direnv allow` once. Every new shell that `cd`s into the
directory will have `KIMI_API_KEY` populated automatically.

### 6.3 When direnv does NOT apply

Two scenarios where direnv is silently bypassed:

**GUI-launched Codex.** `Codex.app` on macOS, `codex.exe` on Windows, and
the Codex extensions inside VS Code / Cursor / JetBrains IDEs all start
**without going through your shell.** No `.bashrc`, no `.zshenv`, no
direnv hook runs. These processes see only the OS-level environment.

**Subagent inheritance.** Subagents are forked from Codex's main process
and **inherit its environment verbatim.** If the main process was started
from a GUI without `KIMI_API_KEY`, the subagent will not have it either.
In other words, **Codex GUI's awareness of a subagent's `env_key` equals
its awareness of the main process's `env_key`** — there is no separate
subagent env mechanism.

Mitigations:

- **(a) Launch from a direnv-allowed terminal.** Open your project in a
  terminal where direnv has set `KIMI_API_KEY`, then run `codex`. The GUI
  spawned from there inherits the env. Same pattern for `code .` launching
  VS Code from an allowed terminal.
- **(b) macOS GUI-wide injection.** `launchctl setenv KIMI_API_KEY "sk-..."`
  injects the variable into GUI processes launched via launchd. Pair with a
  LaunchAgent plist to persist across reboots.
- **(c) Windows user-persistent env.** `setx KIMI_API_KEY "sk-..."` writes
  to the user registry; new processes (including GUI apps) pick it up.
  Currently-running processes will not see it.

### 6.4 Cross-platform matrix

| OS × shell / launcher | Recommended strategy |
|---|---|
| Linux · zsh | direnv per repo; fallback `~/.zshenv` for a global value |
| Linux · bash | direnv per repo; fallback `~/.profile` + `~/.bashrc` |
| Linux · cross-shell | `~/.profile` as single source of truth, each shell's init sources it; direnv for project overrides |
| Linux · systemd user session | `~/.config/environment.d/10-kimi.conf` (static values) |
| macOS · terminal (zsh) | direnv per repo; fallback `~/.zshenv` |
| macOS · Codex.app / IDE extension | `launchctl setenv` + LaunchAgent plist, or launch Codex from a direnv-allowed terminal |
| Windows · PowerShell / CMD | `setx KIMI_API_KEY "..."` (user-level); optionally Credential Manager + `$PROFILE` dynamic lookup |
| Windows · Git Bash / MSYS2 | inherits Windows user env; `setx` once is sufficient |
| Windows · WSL | direnv inside WSL; optionally `WSLENV` to forward the Windows env |

### 6.5 Installing direnv

The installer script prints OS-appropriate commands when direnv is missing.
Summary:

- macOS: `brew install direnv` or `sudo port install direnv`
- Debian / Ubuntu: `sudo apt-get install direnv`
- Fedora: `sudo dnf install direnv`
- Arch: `sudo pacman -S direnv`
- NixOS: `nix profile install nixpkgs#direnv`
- Git Bash / MSYS2: `pacman -S direnv` or `scoop install direnv`
- Full list: <https://direnv.net/docs/installation.html>

Then add the shell hook once:

```bash
# ~/.zshrc
eval "$(direnv hook zsh)"
# ~/.bashrc
eval "$(direnv hook bash)"
# ~/.config/fish/config.fish
direnv hook fish | source
```

**This skill does not install direnv for you.** The decision to install a
third-party tool that hooks into your shell belongs to you.

### 6.6 Anti-patterns

Do not try these — they do not work with Codex as of today:

- **Putting `KIMI_API_KEY` into `~/.codex/auth.json` as a custom field.**
  Codex parses only a fixed schema (`OPENAI_API_KEY`, OAuth tokens). Custom
  field names are ignored. See
  [openai/codex#5409](https://github.com/openai/codex/issues/5409) — a
  feature request to support third-party provider keys in `auth.json`.
- **Placing a `.env` in the project root and expecting Codex to auto-load
  it.** Codex does not implement dotenv auto-loading. See
  [openai/codex#41](https://github.com/openai/codex/issues/41).
- **Inlining a key into `[agents.<name>]` in `config.toml`.** Agent blocks
  reference `model_provider` only; they do not accept an inline key value.
  See [openai/codex#14039](https://github.com/openai/codex/issues/14039)
  for the related per-subagent provider/profile selection request.
- **Expecting Codex's sandbox to inherit the terminal's environment.** The
  sandbox does not inherit env vars by default. See
  [openai/codex#3064](https://github.com/openai/codex/issues/3064).

## 7. Troubleshooting

**`wire "chat" deprecated` warning.** You have an older block. Re-run
`install-or-update.sh`; it writes `wire_api = "responses"`.

**401 / 403.** `KIMI_API_KEY` is stale or not exported in the shell that
launched Codex. Re-export (or `direnv allow` in that project), relaunch
Codex, retry.

**Model not found.** The default SKUs in this installer are `kimi-k2.6`
placeholders; confirm the current SKU on `platform.moonshot.ai` and re-run
with `KIMI_MODEL_CODING=... KIMI_MODEL_GENERAL=...`.

**Managed block looks doubled.** You hand-edited inside the markers, or two
installers wrote using the same markers. Run `uninstall.sh` then
`install-or-update.sh` to restore a single clean block.

**Creating a custom worker reports "provider not installed" (exit code 3).**
Run
`KIMI_ACTION=providers-only KIMI_UPSTREAM=<coding|general|both> ./scripts/install-or-update.sh`
first, then retry Dimension C.

**Cannot remove one of my custom workers.** The manifest at
`~/.codex/.codex-kimi/workers.json` is the source of truth for Dimension C
uninstall. Check whether the worker's `name` appears there. If it was
hand-created (not via the installer), remove the `.toml` file manually
and skip the manifest.

**After launching Codex from the GUI, `KIMI_API_KEY` is not set.** See
§6.3. GUI-launched Codex bypasses your shell, so direnv cannot help.
Either launch Codex from a direnv-allowed terminal, or use
`launchctl setenv` (macOS) / `setx` (Windows) to inject the key at the OS
level.

**The installer said "direnv not found — should I install it?"** direnv
is recommended but optional. Pros: per-project isolation, signed
allow-list, clean uninstall. Cons: third-party software that hooks into
your shell. Minimal alternative: export `KIMI_API_KEY` in `~/.zshenv`
(zsh) / `~/.profile` (bash) / `setx` (Windows).

## 8. Uninstall contract

`uninstall.sh` honours `KIMI_UNINSTALL_SCOPE`:

- `all` (default):
  - removes the `managed-by: codex-kimi` block from `config.toml`
  - deletes `kimi-worker.toml` and `kimi-worker-general.toml`
  - deletes all custom workers listed in the manifest
  - deletes the manifest and the `.codex-kimi/` directory if it ends up empty
- `custom-only`:
  - deletes only custom workers and the manifest
  - leaves Dimension A + B intact

In both scopes, `uninstall.sh` never:

- clears `KIMI_API_KEY` from the environment
- touches the skill directory itself
- touches `.envrc`, `~/.zshenv`, `~/.bashrc`, or any shell rc file
- touches blocks owned by other installers
