# Technical Clarification Reference

Use this reference only when the reviewer is blocked on a technical detail and the review cannot progress responsibly without more context.

## When To Enter Clarification Mode

Enter clarification mode when one of these is true:

- the reviewer says they do not understand the mechanism involved
- the reviewer interrupts the current review to challenge your judgment or ask a code-knowledge question
- the risk depends on framework or library semantics
- the concern depends on concurrency, retries, ordering, caching, or compatibility details
- the current judgment would otherwise be speculative

If the reviewer already has enough evidence to write feedback, stay in review mode.

## Evidence Order

Always prefer the nearest trustworthy source first:

1. current code, call chain, and surrounding comments
2. tests, fixtures, and assertions
3. repository docs
4. official docs
5. public web sources when earlier layers do not answer the question

The goal is not to collect references. The goal is to produce a better review judgment.

## Clarification Template

Use this sequence:

1. Name the missing detail in one sentence.
2. State what evidence is already local.
3. Fill the missing detail from the best remaining source.
4. Translate the detail back into review impact.
5. State the next review question or conclusion, then continue the remaining guided-question loop instead of restarting from scratch.

## Common Detail Types

### Concurrency and Ordering

Clarify:

- whether operations can overlap
- whether ordering is guaranteed
- whether retries or duplicate delivery are possible

Return to review with:

- hidden assumptions about sequencing
- user-visible failure modes
- whether tests cover interleaving or retries

### Consistency and Transactions

Clarify:

- what is atomic
- what can partially fail
- what stale reads or double writes are possible

Return to review with:

- whether the code relies on stronger guarantees than the storage layer provides
- whether compensation or rollback behavior exists

### Caching and Invalidation

Clarify:

- where data is cached
- when it becomes stale
- what invalidation trigger exists

Return to review with:

- whether the change can serve stale or mixed-version data
- whether invalidation is coupled to the real source of truth

### Framework Lifecycle and Side Effects

Clarify:

- when initialization, teardown, and rerender or retry paths occur
- whether side effects are idempotent
- whether cleanup is guaranteed

Return to review with:

- whether the code depends on a lifecycle guarantee that is not real
- whether repeated execution causes leaks or duplicate work

### Third-Party Library Contracts

Clarify:

- documented input and output semantics
- error behavior and retry behavior
- supported configuration and version-specific caveats

Return to review with:

- whether the current code relies on undocumented behavior
- whether a safer contract-aligned usage exists

### Compatibility and Regression Risk

Clarify:

- what callers, data formats, or versions must remain compatible
- whether the change alters defaults, output shape, or timing

Return to review with:

- who may break
- whether migration or tests are required

## Return-To-Review Rule

Every clarification must end with one of these:

- `no actionable issue yet`
- `needs more evidence`
- `likely feedback`
- `ready-to-write comment`

If you cannot map the clarified detail back to one of these, the clarification is incomplete.
