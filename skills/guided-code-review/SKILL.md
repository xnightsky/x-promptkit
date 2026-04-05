---
name: guided-code-review
description: Use when reviewing a code change and the reviewer needs guided questioning, evidence-based reasoning, or interactive technical clarification before deciding what feedback to leave
---

# Guided Code Review

## Overview

Guide one review point at a time. Ask focused questions first, clarify technical details only when needed, then return to the review decision.

Use [EXAMPLES.md](./EXAMPLES.md) for concrete interaction shapes and [references/technical-clarification.md](./references/technical-clarification.md) when the reviewer needs a deeper explanation before continuing.

## Scope

This skill owns:

- guided review for a specific change or review point
- evidence-first reasoning before severity or comment wording
- interactive technical clarification when the reviewer is uncertain
- returning from explanation mode to an actionable review direction

This skill does not own:

- repository-wide checklist sweeps as the default starting point
- final team policy decisions that depend on local conventions not in evidence
- long detached tutorials unrelated to the current review point

## Modes

### `review-guide`

Default mode.

Use it to:

- identify the exact review point under discussion
- ask 2 to 4 high-value questions before judging
- focus on intent, hidden assumptions, boundaries, evidence, and alternatives

### `detail-clarifier`

Enter this mode when the reviewer says they do not understand the technical detail, or when the current judgment is blocked on missing evidence.

Evidence order:

1. current code and call chain
2. tests, fixtures, and comments
3. repository docs
4. official docs
5. public web sources only when the earlier layers are insufficient

Do not stop at explanation. Translate the clarified detail back into review impact.

### `return-to-review`

After clarification, explicitly answer:

- what the technical detail means for this change
- what question the reviewer should ask next
- whether the concern is still speculative or ready for feedback

## Default Workflow

1. State the current review point in one sentence.
2. Classify the concern area: correctness, design, maintainability, performance, security, testing, or compatibility.
3. Ask 2 to 4 guiding questions. Do not start with a full checklist.
4. Summarize what is already known from code or evidence.
5. If the reviewer lacks context, switch to `detail-clarifier`.
6. Return to the review and choose a review direction.
7. Only draft a comment when the review direction is `ready-to-write comment`.

## Questioning Rules

Prefer questions like:

- What problem is this change actually solving?
- Which hidden assumption must stay true for this logic to work?
- What happens on empty input, retries, timeouts, concurrency, or partial failure?
- What evidence proves the intended behavior today?
- Is there a smaller or more stable alternative?

Do not stack unrelated questions. Keep the conversation centered on the current point.

## Output Contract

Always keep each turn compact and use these sections in this order:

1. `Current Review Point`
2. `Guiding Questions`
3. `What We Know`
4. `Technical Clarification` or `Need To Clarify`
5. `Review Direction`

Allowed `Review Direction` values:

- `no actionable issue yet`
- `needs more evidence`
- `likely feedback`
- `ready-to-write comment`

When the direction is `ready-to-write comment`, add:

1. `concern`
2. `why it matters`
3. `evidence`
4. `suggested question or change`

## Restrictions

- Do not open with a broad checklist.
- Do not jump to blocker-level language without evidence.
- Do not turn clarification mode into a generic tutorial.
- Do not cite external material without explaining why it matters to the current review point.
- Do not finish clarification mode without returning to the review.
