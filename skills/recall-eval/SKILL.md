---
name: recall-eval
description: Use when this repository needs recall queue policy validation or evaluator-contract reasoning from a compatible recall YAML such as `<target>/.recall/queue.yaml`, `<target>/.recall/*.yaml`, or another explicitly provided yaml path
---

# Recall Eval

## Purpose

Turn "did the recall answer the right thing" into a stable queue-driven evaluation contract.

This skill defines the queue contract, carrier preconditions, clean-context policy, and output shape. The official minimal runner lives in `skills/recall-evaluator/scripts/` and is part of the supported path for this contract.

Use [EXAMPLES.md](./EXAMPLES.md) as the companion corpus for queue validation, carrier handling, and scoring output shape.

## Scope

- Define how answer content from a recall queue should be validated and scored
- Bind each recall yaml to an explicit prompt target through `source_ref`
- Detect queue-definition gaps, especially missing `medium` or missing `carrier`
- Require recall to be bound to an explicit carrier before evaluator runtime can execute
- Recommend `isolated-context-run:subagent` as the normal default carrier value at the caller layer
- Refuse execution when no carrier can be resolved
- Define the fixed live recall clean-context policy
- Point callers to the official minimal runner and its artifacts
- Do not replace the carrier-selection layer itself

## Official Minimal Runner

Use these entrypoints as the supported baseline instead of re-assembling ad hoc scripts in the caller:

- `npm run recall:validate -- <yaml-path|target-path>`
- `npm run recall:resolve -- <yaml-path|target-path>`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --answer "<text>"`
- `npm run recall:run -- <yaml-path|target-path> --case <id> --live`
- `npm run recall:run -- <yaml-path|target-path> [<yaml-path|target-path> ...] --live`
- `npm run recall:iitest -- <suite-yaml> [--case <id>] [--keep-workspace]`

Runner responsibilities:

- validate queue integrity before scoring
- resolve effective carrier and refuse unresolved execution
- persist live answers and runtime metadata under `./.tmp/recall-runs/`
- separate queue-definition failure, carrier/runtime failure, and content-score failure in the final report

Do not treat `recall-eval` as "schema only" when these runner entrypoints are available in the repository.

## Queue Resolution

Read the queue before doing any scoring.

Resolution order:

1. If the caller explicitly names a yaml path, use it.
2. If evaluating a specific target, prefer `<target>/.recall/queue.yaml`.
3. Otherwise stay unresolved and require an explicit queue path or target-local queue.

If the referenced path does not exist, stop and report the missing queue path instead of guessing another source.

Recommended convention:

- keep recall fixtures under `.recall/`
- prefer names like `queue.yaml`, `selftest.yaml`, or other descriptive yaml names
- keep real evaluation fixtures next to the prompt target they evaluate
- keep integration orchestration under `integration-tests/`
- treat example paths like `<memory-target>/.recall/queue.yaml` as layout examples, not implicit repository defaults

This is only a convention. Any yaml path is acceptable if it matches the recall schema.

## Default Workflow

1. Read the target queue.
2. Validate each case for minimum required fields, especially `medium` and `carrier`.
3. If any required field is missing, refuse evaluation for that case and report the exact gap.
4. Resolve the execution carrier.
5. Hand the validated queue and resolved carrier contract to the evaluator runtime.
6. Let the evaluator runtime obtain or accept the answer text.
7. Let the evaluator runtime score the answer against `question`, `expected`, and `score_rule`, then report results.

## Queue Authoring Minimum Boundary

Use the smallest boundary that still keeps the case auditable:

- `source_ref`: binds the case to the exact prompt or skill text being recalled
- `source_scope`: narrows the expected answer surface inside that source
- `score_rule`: explains how to judge full / partial / fail for that scoped answer

Minimum authoring rule:

- if a reviewer cannot tell "what source is being recalled", the queue is missing `source_ref`
- if a reviewer cannot tell "which slice of that source matters", the queue is missing a precise `source_scope`
- if a reviewer cannot tell "why this wording is 2 vs 1 vs 0", the queue is missing a usable `score_rule`

Do not force extra prose beyond that minimum.

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

## Live Clean-Context Policy

Live recall must use a fixed clean-context policy unless the caller explicitly asks for a different policy:

- answer from recall only
- no tools
- no web search
- no repo reads
- no fresh file inspection

Normalize that policy as `clean-context-v1`.

If the carrier request or bridge contract supports structured fields, pass this policy explicitly instead of relying on ad hoc prompt prose.

Do not compare scores from two live runs unless they used the same clean-context policy.

## Carrier Defaults And Overrides

Default carrier:

- `isolated-context-run:subagent`

Rules:

- Treat the default carrier as the recommended binding supplied by the caller layer, not as an implicit local fallback inside `recall-eval`.
- If the caller explicitly sets another carrier, that override wins.
- If the queue sets a carrier and the caller does not, use the queue value.
- If neither the caller nor the queue provides a carrier, refuse execution and recommend `isolated-context-run:subagent`.
- If a provided carrier is unavailable in the environment, report carrier resolution failure instead of silently downgrading to the current session.
- Do not treat this skill as the live execution layer; carrier execution belongs to the evaluator runtime or adapter layer.

## Environment Failure Layering

Keep these layers separate:

- queue-definition failure: broken yaml or missing required fields such as `medium`
- carrier-resolution failure: no carrier, unsupported carrier, or carrier unavailable before execution starts
- runtime environment failure: carrier exists, but bridge / transport / rate limit / host limits break execution after start
- content failure: an answer was produced and scored poorly against `expected` and `score_rule`

Runtime environment failure must not lower the recall score by itself. Mark the case `not evaluated` instead of treating it as a bad answer.

Recommended runtime subclasses:

- `rate_limited`
- `bridge_stream_closed`
- `thread_limit`
- `environment_failure`

Recommended retry budget in the official runner:

- `rate_limited`: up to 2 retries on the same carrier path
- `bridge_stream_closed`: 1 retry on the same carrier path
- `thread_limit`: 0 automatic retries; wait for capacity first
- `environment_failure`: 0 automatic retries unless the caller supplies a host-specific retry rule

## Scoring Rule

- Missing a required `must_include` item cannot score full marks.
- `should_include` refines boundaries but does not replace hard requirements.
- Hitting `must_not_include` must be recorded as overreach or incorrect recall.
- Follow the queue's `score_rule` text as the primary scoring authority.
- If the scoring rule depends on an undefined rule source, fall back to `fallback_answer` when present.
- Do not invent repository-external standards to fill scoring gaps.

Scoring guidance:

- deterministic queues may rely on substring-style `must_include`
- natural-language queues should use `score_rule` to define semantic boundaries, not just keyword presence
- do not call a runtime environment failure a low recall score

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

Do not tie validation to `integration-tests`.

Preferred layers:

- schema and integrity validation from any compatible yaml fixture
- carrier-resolution validation from explicit carrier and missing-carrier cases
- scoring validation from deterministic self-test cases

Use standalone yaml fixtures for schema and scoring helpers. Use `integration-tests` when the evaluation needs initialized workspace state, task execution, or prompt-based child-agent recall.

Script entrypoints:

- `node skills/recall-evaluator/scripts/validate-schema.mjs <yaml-path|target-path>`
- `node skills/recall-evaluator/scripts/resolve-target.mjs <yaml-path|target-path>`
- `node skills/recall-evaluator/scripts/run-eval.mjs <yaml-path|target-path> --case <id> --answer "<text>"`
- `node skills/recall-evaluator/scripts/run-eval.mjs <yaml-path|target-path> --case <id> --live`
- `node skills/recall-evaluator/scripts/run-eval.mjs <yaml-path|target-path> [<yaml-path|target-path> ...] --live`

These are evaluator runtime entrypoints that implement the contract defined here.

## Restrictions

- Do not treat the queue as a black-box runner spec
- Do not use `source_scope` as a substitute for `medium`
- Do not use the current context as a substitute for `carrier`
- Do not skip queue integrity checks just because the prompt looks obvious
- Do not confuse skill-trigger verification with answer-content evaluation
- Do not invent extra-repo knowledge when the rule source is undefined
- Without an execution carrier, refuse evaluation instead of degrading locally
- Do not let `recall-eval` absorb live runtime, persistence, batch scheduling, or external adapter responsibilities

## Reference Points

Use these paths when they exist:

- `<memory-target>/.recall/README.md` for memory-target queue field conventions when such a target exists
- `.instruction/skills/ai/recall-eval/.recall/queue.yaml` for `recall-eval` self-test cases
- `skills/recall-eval/.recall/queue.yaml` for the target-local example queue
- `integration-tests/recall-eval/` for initialized-workspace recall orchestration
- [SAMPLE-QUEUE.yaml](./SAMPLE-QUEUE.yaml) for a minimal compatible fixture
- [EXAMPLES.md](./EXAMPLES.md) for canonical response shapes
