This runtime is now maintained in-repo under `runtime/codex-bridge`.

Historical note:

- The original MiniMax bridge implementation in this repository started from a
  vendored upstream `codex-bridge` snapshot.
- The shared runtime is now maintained directly in this repository as the
  source of truth, then synced into skill-local `vendor/codex-bridge/`
  directories for distribution.
