# isolated-context-run runtime (`scripts/isolated-context-run`)

These scripts are the runtime-side helpers for isolated carriers. The skill layer stays the frontdoor; the runtime layer owns clean-room, host execution, trace normalization, and artifact persistence.

Current Codex entrypoints:

- `scripts/isolated-context-run/codex/probe.mjs`
- `scripts/isolated-context-run/codex/run-exec.mjs`
- `scripts/isolated-context-run/codex/clean-room.mjs`
- `scripts/isolated-context-run/codex/skill-loading.mjs`
- `scripts/isolated-context-run/codex/workspace-profile.mjs`

Recommended local checks for Codex runner work:

- `npm run test:codex-unit`
- `npm run test:codex-cli`
- `npm run test:codex-harness`
- `npm run lint`
- `npm run check`

Contract notes:

- `probe.mjs` and `run-exec.mjs` both use structured JSON input and stdout JSON output.
- Business failures stay inside stdout JSON; non-zero exit codes are reserved for invalid requests or script-internal failures.
- The public carrier name is `isolated-context-run:codex`; backend details such as `codex exec --json` stay inside runtime metadata or execution templates.

Lifecycle notes:

- `prepareCodexRunEnvironment(...)` and `cleanupCodexRunEnvironment(...)` are the paired clean-room lifecycle helpers.
- Default behavior is auto-cleanup for the exact runner-managed environment returned by `prepareCodexRunEnvironment(...)`.
- `keepWorkspace` or `keepRunRoot` are explicit debug-only escape hatches for preserving evidence.
- Historical `run-xxxxx` git worktrees are not auto-scanned or bulk-deleted; they require precise manual cleanup by path.
