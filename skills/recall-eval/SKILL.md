---
name: recall-eval
description: Use when this repository needs recall evaluation from a compatible recall YAML such as `<skill>/.recall/queue.yaml`, `<skill>/.recall/*.yaml`, or another explicitly provided yaml path, especially when recall must run through an explicit execution carrier instead of the current session
---

# Recall Eval

## Purpose

Turn "did the recall answer the right thing" into a stable queue-driven evaluation flow.

Recall evaluation must run through a clean execution carrier. Do not evaluate directly in the current context, improvise the rules, or mix skill-trigger checks with content recall scoring.

Use [EXAMPLES.md](/data/projects/x-promptkit/skills/recall-eval/EXAMPLES.md) as the companion corpus for queue validation, carrier handling, and scoring output shape.

## Scope

- Evaluate answer content from a recall queue
- Bind each recall yaml to an explicit prompt target through `source_ref`
- Detect queue-definition gaps, especially missing `medium` or missing `carrier`
- Expect recall to be bound to an explicit carrier before execution
- Recommend `isolated-context-run:subagent` as the normal default carrier value at the caller layer
- Refuse execution when no carrier can be resolved
- Do not replace the carrier-selection layer itself

## Queue Resolution

Read the queue before doing any scoring.

Resolution order:

1. If the caller explicitly names a yaml path, use it.
2. If evaluating a specific skill, prefer `<skill>/.recall/queue.yaml`.
3. Otherwise use `.instruction/memory/.recall/queue.yaml`.

If the referenced path does not exist, stop and report the missing queue path instead of guessing another source.

Recommended convention:

- keep recall fixtures under `.recall/`
- prefer names like `queue.yaml`, `selftest.yaml`, or other descriptive yaml names
- keep real evaluation fixtures next to the prompt target they evaluate
- keep integration orchestration under `tests/iitest/`

This is only a convention. Any yaml path is acceptable if it matches the recall schema.

## Default Workflow

1. Read the target queue.
2. Validate each case for minimum required fields, especially `medium` and `carrier`.
3. If any required field is missing, refuse evaluation for that case and report the exact gap.
4. Resolve the execution carrier.
5. Run recall through the chosen carrier.
6. Score the answer against `question`, `expected`, and `score_rule`.
7. Report per-case results and an overall summary.

## Case Contract

Top-level recall yaml should include:

- `version`
- `source_ref`
- `fallback_answer`
- `scoring`
- `cases`

Each queue case must include:

- `id`
- `question`
- `medium`
- `carrier`
- `expected.must_include`
- `score_rule`
- `tags`
- `source_scope`

Optional fields:

- `variants`
- `expected.should_include`
- `expected.must_not_include`
- `fallback_answer`
- `source_ref` as a case-level override

Do not infer missing required fields from nearby fields.

Compatible input rule:

- `recall-eval` accepts any yaml file whose top-level shape and case shape match this contract
- do not require the file name to be `queue.yaml`
- do not require the file to live under `.recall/`, though that layout is recommended
- allow a missing queue-level `source_ref` only when every case provides its own case-level `source_ref`

`source_ref` rule:

- `source_ref` is the explicit binding to the prompt being evaluated
- prefer queue-level `source_ref` and let cases inherit it
- use case-level override only for exceptional mixed-source queues
- do not infer the target from queue location, `source_scope`, or prompt text

## `medium` Rule

`medium` must be explicit. Do not infer it from `source_scope`, the prompt text, or repository structure.

Recommended v1 values:

- `global-memory`
- `skill-trigger`
- `skill-mechanism`

If `medium` is missing:

- do not continue the recall evaluation
- do not auto-fill a value
- report the missing case and require the queue to be fixed first

## `carrier` Rule

`carrier` must declare where recall is executed. The current conversation is not an implicit carrier.

Resolution order:

1. Caller-specified `carrier`
2. Queue case `carrier`
3. Otherwise unresolved

Refusal rules:

- If no carrier can be resolved, refuse execution.
- Do not run recall directly in the current session as a fallback.
- Do not do partial queue checking and then keep evaluating without a carrier.
- When refusing, return the gap plus the recommended default carrier.

## Carrier Defaults And Overrides

Default carrier:

- `isolated-context-run:subagent`

Rules:

- Treat the default carrier as the recommended binding supplied by the caller layer, not as an implicit local fallback inside `recall-eval`.
- If the caller explicitly sets another carrier, that override wins.
- If the queue sets a carrier and the caller does not, use the queue value.
- If neither the caller nor the queue provides a carrier, refuse execution and recommend `isolated-context-run:subagent`.
- If a provided carrier is unavailable in the environment, report carrier resolution failure instead of silently downgrading to the current session.

## Scoring Rule

- Missing a required `must_include` item cannot score full marks.
- `should_include` refines boundaries but does not replace hard requirements.
- Hitting `must_not_include` must be recorded as overreach or incorrect recall.
- Follow the queue's `score_rule` text as the primary scoring authority.
- If the scoring rule depends on an undefined rule source, fall back to `fallback_answer` when present.
- Do not invent repository-external standards to fill scoring gaps.

## Output

Always include these five sections:

1. Queue
2. Carrier
3. Integrity Check
4. Case Results
5. Summary

Recommended format:

```md
1. Queue
- `<path>`

2. Carrier
- `<carrier>`

3. Integrity Check
- `<case-id>`: pass | <reason>
- `<case-id>`: fail | <reason>

4. Case Results
- `<case-id>`: score=<0|1|2> | <short result>

5. Summary
- directly evaluable: ...
- refused for missing carrier: ...
- queue fixes required: ...
```

## Validation Strategy

Do not tie validation to `iitest`.

Preferred layers:

- schema and integrity validation from any compatible yaml fixture
- carrier-resolution validation from explicit carrier and missing-carrier cases
- scoring validation from deterministic self-test cases

Use `iitest` only when an upstream flow specifically requires it. The base `recall-eval` contract must stay testable from standalone yaml fixtures.

Script entrypoints:

- `node scripts/recall-eval/validate-schema.mjs <yaml-path>`
- `node scripts/recall-eval/resolve-target.mjs <yaml-path>`
- `node scripts/recall-eval/run-eval.mjs <yaml-path> --case <id> --answer "<text>"`

## Restrictions

- Do not treat the queue as a black-box runner spec
- Do not use `source_scope` as a substitute for `medium`
- Do not use the current context as a substitute for `carrier`
- Do not skip queue integrity checks just because the prompt looks obvious
- Do not confuse skill-trigger verification with answer-content evaluation
- Do not invent extra-repo knowledge when the rule source is undefined
- Without an execution carrier, refuse evaluation instead of degrading locally

## Reference Points

Use these paths when they exist:

- `.instruction/memory/.recall/README.md` for queue field conventions
- `.instruction/skills/ai/recall-eval/.recall/queue.yaml` for `recall-eval` self-test cases
- `skills/recall-eval/.recall/queue.yaml` for the target-local example queue
- `tests/iitest/recall-eval/` for future integration orchestration
- [SAMPLE-QUEUE.yaml](/data/projects/x-promptkit/skills/recall-eval/SAMPLE-QUEUE.yaml) for a minimal compatible fixture
- [EXAMPLES.md](/data/projects/x-promptkit/skills/recall-eval/EXAMPLES.md) for canonical response shapes
