# recall-evaluator runtime (`skills/recall-evaluator/scripts`)

These scripts are the current evaluator/runtime entrypoints for the `recall-eval` contract. They do not turn the skill itself into the live runtime.

Commands:

- `npm run lint`
- `npm run check`
- `npm run verify`
- `npm run recall:validate -- <yaml-path|target-path>`
- `npm run recall:resolve -- <yaml-path|target-path>`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --answer "<text>"`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --live [--runs-dir <path>]`
- `npm run recall:run -- <yaml-path|target-path> [<yaml-path|target-path> ...] --live [--runs-dir <path>]`
- `npm run recall:iitest -- <suite-yaml> [--case <id>] [--keep-workspace]`

Development rules:

- Runtime or contract changes must update this README, the related `SKILL.md` / `EXAMPLES.md`, and any affected fixtures together.
- Non-obvious carrier normalization, queue validation branches, and fixed report-shape logic must keep explanatory comments in code.
- Before claiming the runtime work is complete, run `npm run lint`; if fixtures changed, also run `npm run check`; use `npm run verify` for a full local gate.

Responsibilities:

- `validate-schema.mjs`: schema and integrity validation
- `resolve-target.mjs`: inspect effective `source_ref`
- `carrier-adapter.mjs`: runtime carrier bridge and failure normalization
- `run-eval.mjs`: evaluate a single queue in score-only or live mode, or batch multiple queue targets in live mode, then print either the fixed five-section report or a batch wrapper with per-target embedded reports
- `iitest-lib.mjs`: initialized-workspace recall harness helpers
- `run-iitest.mjs`: initialize a temp workspace from a fixture, run a task phase in a child executor, then run the recall phase and score it

Live run persistence:

- `--live` always writes one run artifact to `./.tmp/recall-runs/<run-id>/result.json` by default.
- `--runs-dir <path>` overrides the base output directory for that live invocation.
- score-only mode (`--answer` / `--answer-file` / `--answers-file`) does not write run artifacts.
- `result.json` is the v1 source of truth for replaying a live run. It stores top-level run metadata plus per-case `answer_text`, `score`, `rationale`, `status`, and `runtime_failure`.
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
- `npm run test:recall-harness`: initialized-workspace harness coverage with a fake child executor
- `integration-tests/recall-eval/`: real integration-test assets for initialized-workspace recall, including YAML suites, fixtures, docs, and host-backed tests

`run-iitest.mjs` expects a suite yaml that points at:

- a recall queue
- a fixture directory to copy into a temp workspace
- a `task_prompt` to execute before recall
- optional `workspace_assert` checks

The real executor path is host-injected. The default command bridge reads a JSON request from stdin and should return plain-text output on stdout.
