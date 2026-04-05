# recall-eval iitests

These files define repo-root integration orchestration for initialized-workspace recall.

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

- treat these as non-blocking smoke coverage, not the default fast regression suite
- use them when changing carrier/runtime wiring or when you need higher confidence in a real host path
- keep assertions focused on task success, workspace state, status classification, and recall scoring rather than long answer bodies
