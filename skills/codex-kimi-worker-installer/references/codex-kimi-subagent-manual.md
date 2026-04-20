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

| Path | Purpose |
|---|---|
| `~/.codex/config.toml` (managed block) | Two `model_providers` entries: `kimi_coding`, `kimi_general` |
| `~/.codex/agents/kimi-worker.toml` | Agent bound to `kimi_coding` (default) |
| `~/.codex/agents/kimi-worker-general.toml` | Agent bound to `kimi_general` (optional) |

The managed block in `config.toml` is delimited by:

```
# BEGIN managed-by: codex-kimi
...
# END managed-by: codex-kimi
```

The installer rewrites this block in place on every run. Nothing outside the
markers is touched, so coexistence with `codex-bridge-minimax-worker-installer`
is safe as long as each installer uses its own distinct marker label.

## 4. Switching upstream at runtime

Codex's `base_url` is a static string; there is no env interpolation. To
switch between `coding` and `general` at runtime, pick the corresponding
agent:

```bash
codex --agent kimi_worker            # coding/v1 (default)
codex --agent kimi_worker_general    # moonshot/v1
```

Or use a project-scoped `.codex/config.toml` to override `model_provider`
for a specific repo.

## 5. Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KIMI_API_KEY` | yes | — | Moonshot API key. Read by Codex at call time via `env_key`. |
| `KIMI_UPSTREAM` | no | `coding` | `coding` / `general` / `both`. Controls which agent TOMLs are generated. |
| `KIMI_MODEL_CODING` | no | `kimi-k2-thinking` | Model SKU for the coding agent. Placeholder; confirm current SKU. |
| `KIMI_MODEL_GENERAL` | no | `kimi-k2-0905` | Model SKU for the general agent. Placeholder; confirm current SKU. |
| `CODEX_DIR` | no | `$HOME/.codex` | Override for testing. |

## 6. Troubleshooting

**`wire "chat" deprecated` warning.** You have an older block. Re-run
`install-or-update.sh`; it writes `wire_api = "responses"`.

**401 / 403.** `KIMI_API_KEY` is stale or not exported in the shell that
launched Codex. Re-export and retry — never write the key into any file.

**Model not found.** The default SKUs in this installer are placeholders for
Kimi 2.6-era naming; confirm the current SKU on `platform.moonshot.ai` and
re-run with `KIMI_MODEL_CODING=... KIMI_MODEL_GENERAL=...`.

**Managed block looks doubled.** You hand-edited inside the markers, or two
installers wrote using the same markers. Run `uninstall.sh` then
`install-or-update.sh` to restore a single clean block.

## 7. Uninstall contract

`uninstall.sh`:

- Removes the `managed-by: codex-kimi` block from `config.toml`.
- Deletes both agent TOMLs.
- Does **not** clear `KIMI_API_KEY` from env.
- Does **not** touch the skill directory itself.
- Does **not** touch any block owned by other installers.
