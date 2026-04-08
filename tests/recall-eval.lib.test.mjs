import test from "node:test";
import assert from "node:assert/strict";

const cwd = process.cwd();

import {
  buildLiveRunArtifactRecord,
  formatBatchRunEvalOutput,
  formatRunEvalOutput,
  resolveRecallInputPath,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "../skills/recall-evaluator/scripts/lib.mjs";

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
      runArtifact: "none",
    },
  });

  assert.match(output, /5\. Summary/);
  assert.match(output, /runtime failures: `case-02` carrier unavailable in current environment/);
  assert.match(output, /run artifact: none/);
});

test("buildLiveRunArtifactRecord keeps the persisted run schema stable", () => {
  const record = buildLiveRunArtifactRecord({
    runId: "run-123",
    mode: "live",
    startedAt: "2026-04-07T10:00:00.000Z",
    completedAt: "2026-04-07T10:00:02.000Z",
    queuePath: "skills/recall-eval/.recall/queue.yaml",
    selectedCaseId: "case-01",
    carrierOverride: "isolated-context-run:subagent",
    cases: [
      {
        caseId: "case-01",
        sourceRef: "skills/recall-eval/SKILL.md",
        carrier: "isolated-context-run:subagent",
        question: "缺少 medium 时是否拒绝执行？",
        answerText: "必须拒绝执行。",
        score: 2,
        rationale: "full",
        status: "scored",
        timestamp: "2026-04-07T10:00:01.000Z",
        runtimeFailure: null,
      },
    ],
  });

  assert.deepEqual(Object.keys(record), [
    "version",
    "run_id",
    "mode",
    "started_at",
    "completed_at",
    "queue_path",
    "selected_case_id",
    "carrier_override",
    "cases",
  ]);
  assert.deepEqual(Object.keys(record.cases[0]), [
    "case_id",
    "source_ref",
    "carrier",
    "question",
    "answer_text",
    "score",
    "rationale",
    "status",
    "timestamp",
    "runtime_failure",
  ]);
  assert.equal(record.cases[0].runtime_failure, null);
});

test("formatBatchRunEvalOutput distinguishes target summaries and embedded reports", () => {
  const output = formatBatchRunEvalOutput({
    mode: "live",
    targets: [
      {
        yamlPath: "skills/recall-eval/.recall/queue.yaml",
        reportText: "1. Queue\n- `skills/recall-eval/.recall/queue.yaml`",
        summary: {
          directlyEvaluable: "`case-a`",
          refusedForMissingCarrier: "none",
          queueFixesRequired: "none",
          runtimeFailures: "none",
          runArtifact: ".tmp/recall-runs/run-a/result.json",
        },
      },
      {
        yamlPath: ".recall/queue.yaml",
        reportText: "1. Queue\n- `.recall/queue.yaml`",
        summary: {
          directlyEvaluable: "`case-b`",
          refusedForMissingCarrier: "none",
          queueFixesRequired: "none",
          runtimeFailures: "none",
          runArtifact: ".tmp/recall-runs/run-b/result.json",
        },
      },
    ],
  });

  assert.match(output, /Batch Recall Eval/);
  assert.match(output, /- mode: `live`/);
  assert.match(output, /- `skills\/recall-eval\/.recall\/queue\.yaml`: directly evaluable=`case-a`/);
  assert.match(output, /## `\.recall\/queue\.yaml`/);
  assert.match(output, /run artifact=.tmp\/recall-runs\/run-b\/result\.json/);
});

test("resolveRecallInputPath discovers a repo-local queue from a target file", () => {
  const resolved = resolveRecallInputPath("AGENTS.md", cwd);

  assert.equal(resolved.path, ".recall/queue.yaml");
  assert.equal(resolved.discovery.originalInputPath, "AGENTS.md");
  assert.equal(resolved.discovery.mode, "target_file");
});

test("resolveRecallInputPath discovers a target-local queue from a target directory", () => {
  const resolved = resolveRecallInputPath("skills/recall-eval", cwd);

  assert.equal(resolved.path, "skills/recall-eval/.recall/queue.yaml");
  assert.equal(resolved.discovery.originalInputPath, "skills/recall-eval");
  assert.equal(resolved.discovery.mode, "target_directory");
});
