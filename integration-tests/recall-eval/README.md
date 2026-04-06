# recall-eval integration-tests

Overview: see [../README.md](../README.md). This directory stores real initialized-workspace recall integration tests and their supporting assets.

These files define repo-root real integration coverage for initialized-workspace recall.

They are not the schema source of truth. Real recall fixtures live next to the prompt targets under `.recall/`.

## Main Model

Each suite drives this lifecycle:

1. Read the suite yaml.
2. Load the referenced queue.
3. Copy `fixture_ref` into a fresh temp workspace.
4. Execute `task_prompt` in that temp workspace through a host-injected child executor.
5. Validate `workspace_assert` when present.
6. Ask each selected recall question through the same executor contract.
7. Score the recall answer with the queue's `expected` and `score_rule`.

## Suite Contract

Required fields:

- `name`
- `queue`
- `fixture_ref`
- `task_prompt`
- `cases`

Optional fields:

- `carrier`
- `workspace_assert.must_exist`
- `workspace_assert.file_contains`

`cases` must list queue case ids. The queue remains the source of truth for:

- `source_ref`
- `question`
- `medium`
- `carrier`
- `expected`
- `score_rule`

## Executor Contract

The default bridge uses `RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND`.

The command receives one JSON request on stdin:

```json
{
  "phase": "task|recall",
  "prompt": "...",
  "workspace_root": "<workspace-root>",
  "source_ref": "AGENTS.md#anchor",
  "carrier": "isolated-context-run:subagent",
  "case_id": "case-id",
  "medium": "skill-mechanism"
}
```

The command must return plain text on stdout.

## Execution Policy

- treat everything under this directory as real integration-test assets, whether the file is YAML, Markdown, fixture content, or executable test code
- use these suites when changing carrier/runtime wiring or when you need higher confidence in a real host path
- keep assertions focused on task success, workspace state, status classification, and recall scoring rather than long answer bodies

## Current Suites

- `smoke.test.yaml`: happy-path initialized workspace recall
- `carrier-resolution.test.yaml`: explicit carrier resolution through the harness path
- `carrier-execution-failure.test.yaml`: task phase succeeds but recall carrier execution fails in runtime
- `mixed-source-ref.test.yaml`: queue-level and case-level `source_ref` resolution through the harness path
- `real-host.trigger.test.mjs`: real Codex host validation for should-trigger, should-not-trigger, and broken queue refusal
