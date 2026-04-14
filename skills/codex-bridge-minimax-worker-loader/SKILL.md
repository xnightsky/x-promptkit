---
name: codex-bridge-minimax-worker-loader
description: Use when enabling or using the minimax_worker Codex subagent and the local codex-bridge may need to be started or verified first.
---

# Codex Bridge MiniMax Worker Loader

Use this skill only when the user explicitly wants to use the `minimax_worker` role.

## Required First Step

Your first action is to run [scripts/minimax-provider-start.sh](./scripts/minimax-provider-start.sh).

Do not skip this step. Do not assume the bridge is already healthy.

## Runtime Rules

- Only use `minimax_worker` after the startup script succeeds.
- If the script fails, do not use `minimax_worker`. Explain the failure and fall back to the default main agent.
- `minimax_worker` is backed by:
  - `model_provider = "minimax_bridge"`
  - `model = "MiniMax-M2.7"` by default
- The runtime bridge directory is still `~/codex-bridge`, but it is installed from the vendored source bundled in `$codex-bridge-minimax-worker-installer`, not from a fresh `git clone`.
- The startup script defaults to `127.0.0.1:54187`; for controlled tests or debugging, it also honors `CODEX_BRIDGE_HOST` and `CODEX_BRIDGE_PORT`.
- Do not start duplicate bridge instances.
- Do not assume the bridge is auto-cleaned.
- If this session started the bridge, tell the user it remains running until manually stopped.

## Manual Cleanup

If the bridge was started and the user asks how to stop it, use:

```bash
kill "$(cat ~/codex-bridge/bridge.pid)" && rm -f ~/codex-bridge/bridge.pid
```
