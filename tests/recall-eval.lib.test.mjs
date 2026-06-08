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
  scoreAnswer,
  validateRecallData,
} from "../skills-def/recall-eval/lib/lib.mjs";

// 场景：用例未提供 source_ref。预期：继承队列级 source_ref，无错误。
test("validateRecallData inherits queue-level source_ref when case-level override is absent", () => {
  const report = validateRecallData({
    version: 1,
    source_ref: "skills-def/recall-eval/SKILL.md",
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

  assert.equal(report.caseReports[0].effectiveSourceRef, "skills-def/recall-eval/SKILL.md");
  assert.equal(report.caseReports[0].errors.length, 0);
});

// 场景：用例自带 source_ref。预期：优先采用用例级覆盖值。
test("validateRecallData prefers case-level source_ref override", () => {
  const report = validateRecallData({
    version: 1,
    source_ref: "skills-def/recall-eval/SKILL.md",
    fallback_answer: "未明确",
    scoring: {
      "2": "full",
      "1": "partial",
      "0": "fail",
    },
    cases: [
      {
        id: "case.override_source_ref",
        question: "默认优先级是什么？",
        medium: "skill-mechanism",
        source_ref: "skills-def/recall-eval/SKILL.md#default-priority",
        expected: {
          must_include: ["direct recall"],
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
    "skills-def/recall-eval/SKILL.md#default-priority",
  );
  assert.equal(report.caseReports[0].errors.length, 0);
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
    yamlPath: "skills-def/recall-eval/.recall/queue.yaml",
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
      runtimeFailures: "`case-02` agent failed in current environment",
    },
  });

  assert.match(output, /4\. Summary/);
  assert.match(output, /runtime failures: `case-02` agent failed in current environment/);
  assert.doesNotMatch(output, /run artifact/);
});

// 场景：格式化批量报告。预期：能区分各目标摘要与内嵌报告（不再包含 run artifact 段）。
test("formatBatchRunEvalOutput distinguishes target summaries and embedded reports", () => {
  const output = formatBatchRunEvalOutput({
    mode: "live",
    targets: [
      {
        yamlPath: "skills-def/recall-eval/.recall/queue.yaml",
        reportText: "1. Queue\n- `skills-def/recall-eval/.recall/queue.yaml`",
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
  assert.match(output, /- `skills-def\/recall-eval\/.recall\/queue\.yaml`: directly evaluable=`case-a`/);
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
  const resolved = resolveRecallInputPath("skills-def/recall-eval", cwd);

  assert.equal(resolved.path, "skills-def/recall-eval/.recall/queue.yaml");
  assert.equal(resolved.discovery.originalInputPath, "skills-def/recall-eval");
  assert.equal(resolved.discovery.mode, "target_directory");
});

// 构造一个最小合法用例对象，供 context 相关测试做局部覆写。
function makeValidCase(overrides = {}) {
  return {
    id: "case.context",
    question: "context 怎么生效？",
    medium: "skill-mechanism",
    expected: { must_include: ["context"] },
    score_rule: { full: "full", partial: "partial", fail: "fail" },
    tags: ["unit"],
    source_scope: "SKILL.md#context-rule",
    ...overrides,
  };
}

// 构造一个最小合法队列对象。
function makeValidQueue(overrides = {}) {
  return {
    version: 1,
    source_ref: "skills-def/recall-eval/SKILL.md",
    fallback_answer: "未明确",
    scoring: { "2": "full", "1": "partial", "0": "fail" },
    cases: [makeValidCase()],
    ...overrides,
  };
}

// 场景：队列级 context 声明、用例未覆盖。预期：用例继承队列级声明。
test("validateRecallData inherits the queue-level context declaration", () => {
  const queueContext = { repo: { enabled: true }, global: { enabled: false } };
  const report = validateRecallData(makeValidQueue({ context: queueContext }));

  assert.deepEqual(report.caseReports[0].effectiveContext, queueContext);
  assert.equal(report.isValid, true);
});

// 场景：用例级 context 覆盖队列级。预期：整块覆盖（不深合并），用例级声明原样生效。
test("validateRecallData prefers the case-level context override as a whole block", () => {
  const caseContext = { repo: { enabled: false } };
  const report = validateRecallData(
    makeValidQueue({
      context: { repo: { enabled: true }, global: { enabled: false } },
      cases: [makeValidCase({ context: caseContext })],
    }),
  );

  assert.deepEqual(report.caseReports[0].effectiveContext, caseContext);
});

// 场景：队列与用例均未声明 context。预期：effectiveContext 为 null（clean-context 基线）。
test("validateRecallData defaults effectiveContext to null", () => {
  const report = validateRecallData(makeValidQueue());

  assert.equal(report.caseReports[0].effectiveContext, null);
});

// 场景：队列级 context 的 global 启用却无 path。预期：归入队列级错误。
test("validateRecallData reports an enabled global layer without path at queue level", () => {
  const report = validateRecallData(makeValidQueue({ context: { global: { enabled: true } } }));

  assert.equal(report.isValid, false);
  assert.ok(report.queueErrors.some((error) => error.includes("missing `context.global.path`")));
});

// 场景：用例级 context 结构非法（缺 enabled）。预期：schema 错误按用例相对路径归入该用例。
test("validateRecallData routes case-level context schema errors to the case", () => {
  const report = validateRecallData(
    makeValidQueue({ cases: [makeValidCase({ context: { repo: {} } })] }),
  );

  assert.deepEqual(report.caseReports[0].errors, ["missing `context.repo.enabled`"]);
});

// 场景：回答以「不做X」「不会X」的否定形态提到 must_not_include 词条。
// 预期：识别为否定，不按命中禁止项计 0 分（live 自测中真实模型的高频措辞）。
test("scoreAnswer treats 不做/不会 prefixes as negation for must_not_include", () => {
  const report = validateRecallData(
    makeValidQueue({
      cases: [
        makeValidCase({
          expected: { must_include: ["整块覆盖"], must_not_include: ["深合并"] },
        }),
      ],
    }),
  );

  const negated = scoreAnswer(report.caseReports[0], "用例级 context 是整块覆盖，不做深合并。");
  assert.equal(negated.score, 2);
  assert.deepEqual(negated.mustNotHits, []);

  const negatedFuture = scoreAnswer(report.caseReports[0], "整块覆盖；不会深合并处理。");
  assert.equal(negatedFuture.score, 2);

  // 「没有X」「而非X」这类二字否定词同样要识别（deepseek live 实测措辞）
  const negatedHave = scoreAnswer(report.caseReports[0], "是整块覆盖（whole-block override），没有深合并。");
  assert.equal(negatedHave.score, 2);
  const negatedRather = scoreAnswer(report.caseReports[0], "整块覆盖，而非深合并。");
  assert.equal(negatedRather.score, 2);

  // 非否定形态仍要按命中禁止项计 0 分
  const overreach = scoreAnswer(report.caseReports[0], "整块覆盖后再做深合并。");
  assert.equal(overreach.score, 0);
});
