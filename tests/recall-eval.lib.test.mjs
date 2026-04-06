import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRunEvalOutput,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "../skills/recall-eval/scripts/lib.mjs";

test("validateRecallData inherits queue-level source_ref when case-level override is absent", () => {
  const report = validateRecallData({
    version: 1,
    source_ref: "skills/recall-eval/SKILL.md",
    fallback_answer: "未明确",
    scoring: {
      "2": "full",
      "1": "partial",
      "0": "fail",
    },
    cases: [
      {
        id: "case.inherit_source_ref",
        question: "queue-level source_ref 会被继承吗？",
        medium: "skill-mechanism",
        carrier: "isolated-context-run:subagent",
        expected: {
          must_include: ["source_ref"],
        },
        score_rule: {
          full: "full",
          partial: "partial",
          fail: "fail",
        },
        tags: ["unit"],
        source_scope: "SKILL.md#source-ref-rule",
      },
    ],
  });

  assert.equal(report.caseReports[0].effectiveSourceRef, "skills/recall-eval/SKILL.md");
  assert.equal(report.caseReports[0].errors.length, 0);
});

test("validateRecallData prefers case-level source_ref override", () => {
  const report = validateRecallData({
    version: 1,
    source_ref: "skills/recall-eval/SKILL.md",
    fallback_answer: "未明确",
    scoring: {
      "2": "full",
      "1": "partial",
      "0": "fail",
    },
    cases: [
      {
        id: "case.override_source_ref",
        source_ref: "skills/isolated-context-run/SKILL.md#default-priority",
        question: "默认优先级是什么？",
        medium: "skill-mechanism",
        carrier: "isolated-context-run:subagent",
        expected: {
          must_include: ["subagent -> self-cli"],
        },
        score_rule: {
          full: "full",
          partial: "partial",
          fail: "fail",
        },
        tags: ["unit"],
        source_scope: "SKILL.md#default-priority",
      },
    ],
  });

  assert.equal(
    report.caseReports[0].effectiveSourceRef,
    "skills/isolated-context-run/SKILL.md#default-priority",
  );
  assert.equal(report.caseReports[0].errors.length, 0);
});

test("resolveEffectiveCarrier applies cli override before queue carrier", () => {
  const caseReport = {
    caseValue: {
      carrier: "isolated-context-run:subagent",
    },
  };

  assert.equal(resolveEffectiveCarrier(caseReport, "custom-carrier"), "custom-carrier");
  assert.equal(
    resolveEffectiveCarrier(caseReport, null),
    "isolated-context-run:subagent",
  );
  assert.equal(resolveEffectiveCarrier({ caseValue: {} }, null), null);
});

test("scoreAnswer returns partial score when only should_include matches", () => {
  const scored = scoreAnswer(
    {
      expected: {
        mustInclude: ["拒绝执行", "medium"],
        shouldInclude: ["需要先完善 queue"],
        mustNotInclude: [],
      },
      scoreRule: {
        full: "full",
        partial: "partial",
        fail: "fail",
      },
    },
    "需要先完善 queue。",
  );

  assert.equal(scored.score, 1);
  assert.match(scored.rationale, /partial/);
  assert.deepEqual(scored.missingMust, ["拒绝执行", "medium"]);
});

test("scoreAnswer does not treat negated must_not_include text as an overreach hit", () => {
  const scored = scoreAnswer(
    {
      expected: {
        mustInclude: ["拒绝执行"],
        shouldInclude: [],
        mustNotInclude: ["继续执行"],
      },
      scoreRule: {
        full: "full",
        partial: "partial",
        fail: "fail",
      },
    },
    "不能继续执行，必须拒绝执行。",
  );

  assert.equal(scored.score, 2);
  assert.deepEqual(scored.mustNotHits, []);
});

test("formatRunEvalOutput always includes the runtime failures summary line", () => {
  const output = formatRunEvalOutput({
    yamlPath: "skills/recall-eval/.recall/queue.yaml",
    carrierLabel: "`isolated-context-run:subagent`",
    integrityItems: [
      {
        id: "case-01",
        status: "pass",
        reason: "required fields present",
      },
    ],
    caseItems: [
      {
        id: "case-01",
        result: "score=2 | matched required recall points",
      },
    ],
    summary: {
      directlyEvaluable: "`case-01`",
      refusedForMissingCarrier: "none",
      queueFixesRequired: "none",
      runtimeFailures: "`case-02` carrier unavailable in current environment",
    },
  });

  assert.match(output, /5\. Summary/);
  assert.match(output, /runtime failures: `case-02` carrier unavailable in current environment/);
});
