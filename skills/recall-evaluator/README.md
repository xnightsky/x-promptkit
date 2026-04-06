# recall-evaluator runtime (`skills/recall-evaluator/scripts`)

These scripts are the current evaluator/runtime entrypoints for the `recall-eval` contract. They do not turn the skill itself into the live runtime.

Commands:

- `npm run lint`
- `npm run check`
- `npm run verify`
- `npm run recall:validate -- <yaml-path>`
- `npm run recall:resolve -- <yaml-path>`
- `npm run recall:run -- <yaml-path> --case <id> --answer "<text>"`
- `npm run recall:run -- <yaml-path> --case <id> --live`
- `npm run recall:iitest -- <suite-yaml> [--case <id>] [--keep-workspace]`

Development rules:

- Runtime or contract changes must update this README, the related `SKILL.md` / `EXAMPLES.md`, and any affected fixtures together.
- Non-obvious carrier normalization, queue validation branches, and fixed report-shape logic must keep explanatory comments in code.
- Before claiming the runtime work is complete, run `npm run lint`; if fixtures changed, also run `npm run check`; use `npm run verify` for a full local gate.

Responsibilities:

- `validate-schema.mjs`: schema and integrity validation
- `resolve-target.mjs`: inspect effective `source_ref`
- `carrier-adapter.mjs`: runtime carrier bridge and failure normalization
- `run-eval.mjs`: evaluate cases against direct answers in score-only mode, or obtain real answers through `--live`, then print the fixed five-section report
- `iitest-lib.mjs`: initialized-workspace recall harness helpers
- `run-iitest.mjs`: initialize a temp workspace from a fixture, run a task phase in a child executor, then run the recall phase and score it

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
