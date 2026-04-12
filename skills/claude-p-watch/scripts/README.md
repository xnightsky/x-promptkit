# claude-p-watch runtime (`skills/claude-p-watch/scripts`)

These scripts are the runtime-side helpers for monitored `claude -p` execution. The skill layer keeps the user-facing bare-command contract; this directory owns PID discovery and best-effort tail-by-pid observations.

Liveness ownership is intentionally here. Whether the outer host `claude -p` process is still alive must be resolved from PID/session state in runtime, not from prompt-level progress markers emitted inside the task.

Current entrypoints:

- `skills/claude-p-watch/scripts/lib.mjs`
- `skills/claude-p-watch/scripts/discover-pid.mjs`
- `skills/claude-p-watch/scripts/tail-by-pid.mjs`

Recommended local checks for `claude-p-watch` work:

- `npm run test:claude-p-watch-unit`
- `npm run iitest:claude-p-watch-harness`
- `npm run iitest:claude-p-watch`
- `npm run lint`

Contract notes:

- monitored runs use bare plain-text `claude -p` execution without wrappers, `--verbose`, or `--output-format stream-json`
- `discover-pid.mjs` locates the running `claude -p` PID once using command fragments plus newest-match selection
- `tail-by-pid.mjs` only attempts historical tail capture on Linux when `/proc/<pid>/fd/1` or `/proc/<pid>/fd/2` resolves to a regular file; pipe, socket, tty, and unsupported platforms degrade to empty with an explanation
- when tail capture is empty, callers must not infer host liveness from the missing tail alone; they should recheck PID/session state separately
