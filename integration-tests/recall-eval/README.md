# recall-eval integration-tests

Overview: see [../README.md](../README.md). This directory holds token-backed integration coverage for recall evaluation.

These files are not the schema source of truth. Real recall fixtures live next to the prompt targets under `.recall/`.

## Current Suites

- `recall-replay.token.ittest.mjs`: token-backed provider-matrix replay that asserts the clean-context policy echo across enabled providers (self-skips without a configured provider matrix)
- `recall-live.token.ittest.mjs`: token-backed live recall over the real queue cases via `runRecallAgent` (self-skips without a token-bearing provider)

Naming: token-burning integration tests use the `*.token.ittest.mjs` suffix — the `.ittest.mjs` suffix keeps them out of the batch `npm run iitest` collector by construction.

## Provider-matrix replay

The replay suite turns a `.env`-style provider matrix into an ephemeral, in-process recall agent. It has zero local footprint — nothing is written to disk and no clean-up step runs — and pulls the clean-context policy from `lib.mjs` so the replay path and the live recall path stay aligned.

- helper module: `skills/recall-eval/scripts/replay-matrix.mjs`
- matrix discovery walks up from the current working directory to the repo root (the directory containing `.git`) and reads the first of `.recall-replay.env.yaml` / `.recall-replay.env.yml` / `.recall-replay.env`; override with `RECALL_REPLAY_MATRIX`
- copy `skills/recall-eval/.recall-replay.env.example.yaml` to the repo-root `.recall-replay.env.yaml` (git-ignored) and fill in real values
- run with `npm run iitest:token:recall-replay` (excluded from the default `npm run iitest`)

## Execution Policy

- treat everything under this directory as real integration-test assets
- keep assertions focused on clean-context policy echo and recall scoring rather than long answer bodies
- classify runtime environment failures separately from content failures; bridge EOF / stream closed should not become a recall score
