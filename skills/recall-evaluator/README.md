# recall-evaluator runtime (`skills/recall-evaluator/scripts`)

These scripts are the official minimal runtime entrypoints for the `recall-eval` contract. Use them as the default runner path before building custom orchestration.

Commands:

- `npm run lint`
- `npm run check`
- `npm run verify`
- `npm run recall:validate -- <yaml-path|target-path>`
- `npm run recall:resolve -- <yaml-path|target-path>`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --answer "<text>"`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --live`
- `npm run recall:run -- <yaml-path|target-path> [<yaml-path|target-path> ...] --live`

Development rules:

- Runtime or contract changes must update this README, the related `SKILL.md` / `EXAMPLES.md`, and any affected fixtures together.
- Non-obvious carrier normalization, queue validation branches, and fixed report-shape logic must keep explanatory comments in code.
- Before claiming the runtime work is complete, run `npm run lint`; if fixtures changed, also run `npm run check`; use `npm run verify` for a full local gate.

Responsibilities:

- `validate-schema.mjs`: schema and integrity validation
- `resolve-target.mjs`: inspect effective `source_ref`
- `carrier-adapter.mjs`: runtime carrier bridge, clean-context policy injection, failure normalization, and retry budgeting
- `run-eval.mjs`: evaluate a single queue in score-only or live mode, or batch multiple queue targets in live mode, then print either the fixed five-section report or a batch wrapper with per-target embedded reports
- `replay-matrix.mjs`: turn a provider matrix into an ephemeral, in-process recall agent for offline self-tests and token-backed replay

Live recall defaults:

- every recall-phase bridge request carries `context_policy.id = clean-context-v1`
- `clean-context-v1` means memory-only answer, no tools, no web search, and no repo reads
- compare live recall runs only when they used the same clean-context policy

Provider-matrix replay (token):

- the replay harness turns a `.env`-style provider matrix into an ephemeral, in-process recall agent; it has zero local footprint (nothing is written to disk and no clean-up step runs) and pulls the clean-context policy from `carrier-adapter.mjs` so the replay path and the live recall path stay aligned
- reusable scoring or carrier strategy belongs upstream in the shared runtime, not in this harness
- helper module: `replay-matrix.mjs`
- offline coverage: `npm run test:recall-replay-unit` (also runs under the default `npm test`)
- token-backed replay: `npm run iitest:token:recall-replay` (excluded from the default `npm run iitest`; self-skips unless a key-bearing provider is enabled)
- matrix discovery checks several locations in priority order — the current working directory, the repo root (the directory containing `.git`), the skill runtime directory (`skills/recall-evaluator/scripts`), and the home directory — and reads the first of `.recall-replay.env.yaml` / `.recall-replay.env.yml` / `.recall-replay.env` found in any of them; override the path with the `RECALL_REPLAY_MATRIX` environment variable
- copy `.recall-replay.env.example.yaml` to any of those locations as `.recall-replay.env.yaml` (git-ignored) and fill in real values
- secrets are referenced through `key_env` only; inline `key` values are allowed solely for the offline `echo` backend
- supported `api` values: `openai-chat`, `anthropic-messages`, `gemini-generate`, `echo`
- supported memory modes: `in-process` (keep recalled facts inside the ephemeral agent) and `upstream` (defer persistence to the shared recall store)
- every replay request carries `context_policy.id = clean-context-v1`; the token suite asserts the provider echoes it back

Runtime failure accounting:

- queue-definition failure, carrier-resolution failure, runtime environment failure, and content-score failure stay separated
- runtime environment failure does not produce a recall score; the case stays `not_evaluated`
- the runner classifies runtime failures into `rate_limited`, `bridge_stream_closed`, `thread_limit`, or generic `environment_failure`
- default retry budget is `2` for `rate_limited`, `1` for `bridge_stream_closed`, and `0` for `thread_limit` or generic `environment_failure`

Live recall (no local footprint):

- `--live` sources each answer by executing the recall through the carrier in-process; it writes nothing to disk and runs no clean-up step.
- score-only mode (`--answer` / `--answer-file` / `--answers-file`) likewise has no local footprint.
- runtime-failure accounting (`kind`, `class`, `reason`, `retryable`, `attempts`, `retries_used`, `max_retries`) is surfaced in the report's runtime-failures summary instead of a persisted artifact.
- multiple yaml targets are supported only with `--live`; batch mode does not combine with `--case` or direct answer inputs.

Target-local queue discovery:

- when the CLI input is an explicit `.yaml` / `.yml` path, it is treated as the queue path directly
- when the CLI input is a target file such as `AGENTS.md`, the runtime discovers `<target-dir>/.recall/queue.yaml`
- when the CLI input is a target directory such as `skills/recall-eval`, the runtime discovers `<target-dir>/.recall/queue.yaml`
- if the discovered target-local queue is missing, the CLI exits with a clear error that includes the expected `.recall/queue.yaml` path

Test layers:

- `npm run test:recall-unit`: pure function coverage for queue validation, carrier precedence, scoring, and report formatting
- `npm run test:recall-bridge`: carrier adapter contract coverage without requiring a real host subagent
- `npm run test:recall-cli`: black-box CLI coverage for `validate-schema`, `resolve-target`, and `run-eval`
- `npm run test:recall-replay-unit`: offline coverage for the provider-matrix replay helper (matrix discovery, parsing, provider selection, protocol dispatch via injected fetch, and echo-backend scoring)
- `npm run iitest:token:recall-replay`: token-backed provider-matrix replay across enabled providers (self-skips without a configured provider matrix)
- `integration-tests/recall-eval/`: token-backed integration assets for recall evaluation
