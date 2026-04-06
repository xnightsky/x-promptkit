const REVIEW_SCAFFOLD_LINES = [
  "Use this response scaffold for the current turn:",
  "Current Review Point: name the single review point in one sentence.",
  "Guiding Questions: ask 1 to 2 high-value questions for this turn, up to 2 to 4 total across the review point.",
  "What We Know: return any partial answers, local evidence, or risk signals immediately instead of waiting for a complete checklist.",
  "Technical Clarification or Need To Clarify: answer a reviewer challenge or code-knowledge question before continuing.",
  "Review Direction: choose no actionable issue yet, needs more evidence, likely feedback, or ready-to-write comment.",
];

const EVIDENCE_ORDER_LINES = [
  "Use evidence in this order:",
  "1. current code and call chain",
  "2. tests, fixtures, comments, and assertions",
  "3. repository docs",
  "4. official docs",
  "5. public web sources only when the earlier layers are insufficient",
];

export function buildReviewScaffold() {
  return REVIEW_SCAFFOLD_LINES.join("\n");
}

export function buildQuestionLoopContract() {
  return [
    "Do not wait to assemble all guiding questions before replying.",
    "Ask 1 to 2 high-value questions at a time, up to 2 to 4 total for the review point.",
    "As soon as you have partial answers, local evidence, or one meaningful risk signal, return it immediately and continue with the remaining questions in later turns.",
    "Treat 2 to 4 guiding questions as a lifetime budget for the review point, not a per-turn quota.",
  ].join(" ");
}

export function buildEvidenceOrder() {
  return EVIDENCE_ORDER_LINES.join("\n");
}

export function buildClarificationContract() {
  return [
    "At any point, the reviewer may challenge the current judgment or ask a code-knowledge question.",
    "Answer that question first, using the evidence order below.",
    buildEvidenceOrder(),
    "If local evidence is insufficient, consult official docs and public web sources as needed.",
    "After clarifying, translate the answer back into the current review point and continue with any remaining guiding questions instead of starting a new checklist.",
  ].join("\n");
}

export function buildGuidedReviewPrompt({ contextText, extraPrompt = null }) {
  const sections = [
    "Review this change using a guided-review workflow.",
    "Focus on one concrete review point at a time instead of scanning with a broad checklist.",
    contextText,
    buildReviewScaffold(),
    buildQuestionLoopContract(),
    "Do not turn the first response into a conventional code review summary or a finished findings list.",
    "Only use ready-to-write comment when the reviewer explicitly asks for comment drafting or the evidence is already complete.",
    buildClarificationContract(),
    "When the concern is ready, phrase feedback with concern, why it matters, evidence, and a suggested question or change.",
  ];

  if (extraPrompt) {
    sections.push(`Additional reviewer context:\n${extraPrompt}`);
  }

  return sections.join("\n\n");
}
