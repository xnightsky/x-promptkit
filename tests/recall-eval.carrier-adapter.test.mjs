import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecallRequest,
  executeRecallViaCarrier,
  SUBAGENT_CARRIER,
} from "../skills/recall-evaluator/scripts/carrier-adapter.mjs";

function makeCaseReport(overrides = {}) {
  return {
    id: "recall_eval.reject_missing_medium",
    effectiveSourceRef: "skills/recall-eval/SKILL.md",
    caseValue: {
      question: "recall queue 缺少 medium 时，能否继续执行？",
      medium: "skill-mechanism",
      carrier: SUBAGENT_CARRIER,
      ...overrides.caseValue,
    },
    ...overrides,
  };
}

test("buildRecallRequest includes the core request contract fields", () => {
  const request = JSON.parse(buildRecallRequest({
    caseReport: makeCaseReport(),
    carrier: SUBAGENT_CARRIER,
  }));

  assert.equal(request.phase, "recall");
  assert.equal(request.source_ref, "skills/recall-eval/SKILL.md");
  assert.equal(request.medium, "skill-mechanism");
  assert.equal(request.carrier, "isolated-context-run:subagent");
  assert.equal(request.case_id, "recall_eval.reject_missing_medium");
  assert.equal(request.question, "recall queue 缺少 medium 时，能否继续执行？");
  assert.equal(request.prompt, "recall queue 缺少 medium 时，能否继续执行？");
});

test("executeRecallViaCarrier rejects missing carriers", () => {
  const result = executeRecallViaCarrier(makeCaseReport(), "");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "missing_carrier");
  assert.match(result.reason, /carrier required before recall/);
});

test("executeRecallViaCarrier rejects unsupported carriers", () => {
  const result = executeRecallViaCarrier(makeCaseReport(), "custom-carrier");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "unsupported_carrier");
  assert.match(result.reason, /unsupported carrier/);
});

test("executeRecallViaCarrier uses an injected subagent executor", () => {
  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    subagentExecutor: (request) =>
      request.source_ref === "skills/recall-eval/SKILL.md"
        ? "缺少 medium 时必须拒绝执行。"
        : "",
  });

  assert.equal(result.ok, true);
  assert.equal(result.answerText, "缺少 medium 时必须拒绝执行。");
});

test("executeRecallViaCarrier normalizes thrown executor failures", () => {
  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    subagentExecutor: () => {
      throw new Error("boom");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "environment_failure");
  assert.match(result.reason, /carrier execution failed: boom/);
});

test("executeRecallViaCarrier prefers case-scoped response env over the global response env", () => {
  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    env: {
      RECALL_EVAL_SUBAGENT_RESPONSE: "全局响应",
      RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_MEDIUM: "case 响应",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.answerText, "case 响应");
});

test("executeRecallViaCarrier can bridge through a command that reads the request from stdin", () => {
  const script = [
    "process.stdin.setEncoding('utf8');",
    "let data = '';",
    "process.stdin.on('data', (chunk) => { data += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(data);",
    "  process.stdout.write(request.source_ref === 'skills/recall-eval/SKILL.md' ? 'bridge ok' : 'bad');",
    "});",
  ].join(" ");
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    env: {
      RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND: command,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.answerText, "bridge ok");
});

test("executeRecallViaCarrier reports non-zero command bridge exits as environment failures", () => {
  const script = "process.stderr.write('command failed'); process.exit(3);";
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    env: {
      RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND: command,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "environment_failure");
  assert.match(result.reason, /carrier execution failed: command failed/);
});

test("executeRecallViaCarrier reports empty command bridge output as an environment failure", () => {
  const script = "process.exit(0);";
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

  const result = executeRecallViaCarrier(makeCaseReport(), SUBAGENT_CARRIER, {
    env: {
      RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND: command,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "environment_failure");
  assert.match(result.reason, /carrier execution failed: empty response/);
});
