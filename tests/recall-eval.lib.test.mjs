import test from "node:test";
import assert from "node:assert/strict";

// 召回评测纯函数库（lib.mjs）的单元测试。
// 风格：BDD（场景 / 预期）。
// 重要：随着 --live 本地落盘能力被移除，buildLiveRunArtifactRecord 相关测试已删除，
// 输出格式化测试也不再断言 run artifact 行/段。

const cwd = process.cwd();

import {
  formatBatchRunEvalOutput,
  formatRunEvalOutput,
  resolveRecallInputPath,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "../skills/recall-evaluator/scripts/lib.mjs";

// 场景：用例未提供 source_ref。预期：继承队列级 source_ref，无错误。
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

// 场景：用例自带 source_ref。预期：优先采用用例级覆盖值。
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

// 场景：解析生效 carrier。预期：CLI 覆盖优先于队列 carrier，二者皆无时为 null。
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

// 场景：仅命中 should_include。预期：score=1（部分），并列出缺失的 must 项。
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

// 场景：禁止项以否定形式出现（“不能继续执行”）。预期：不计为越界命中，score=2。
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

// 场景：格式化单目标报告。预期：始终包含 runtime failures 摘要行（不再包含 run artifact 行）。
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
  assert.doesNotMatch(output, /run artifact/);
});

// 场景：格式化批量报告。预期：能区分各目标摘要与内嵌报告（不再包含 run artifact 段）。
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
        },
      },
    ],
  });

  assert.match(output, /Batch Recall Eval/);
  assert.match(output, /- mode: `live`/);
  assert.match(output, /- `skills\/recall-eval\/.recall\/queue\.yaml`: directly evaluable=`case-a`/);
  assert.match(output, /## `\.recall\/queue\.yaml`/);
  assert.doesNotMatch(output, /run artifact/);
});

// 场景：从目标文件发现仓库本地队列。预期：解析到 .recall/queue.yaml 且发现模式为 target_file。
test("resolveRecallInputPath discovers a repo-local queue from a target file", () => {
  const resolved = resolveRecallInputPath("AGENTS.md", cwd);

  assert.equal(resolved.path, ".recall/queue.yaml");
  assert.equal(resolved.discovery.originalInputPath, "AGENTS.md");
  assert.equal(resolved.discovery.mode, "target_file");
});

// 场景：从目标目录发现本地队列。预期：解析到该目录下的 .recall/queue.yaml 且模式为 target_directory。
test("resolveRecallInputPath discovers a target-local queue from a target directory", () => {
  const resolved = resolveRecallInputPath("skills/recall-eval", cwd);

  assert.equal(resolved.path, "skills/recall-eval/.recall/queue.yaml");
  assert.equal(resolved.discovery.originalInputPath, "skills/recall-eval");
  assert.equal(resolved.discovery.mode, "target_directory");
});
