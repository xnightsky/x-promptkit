import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const node = process.execPath;
const scriptsDir = path.join(cwd, "skills", "recall-evaluator", "scripts");

function runScript(scriptName, args = [], options = {}) {
  return execFileSync(node, [path.join(scriptsDir, scriptName), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    ...options,
  });
}

test("validate-schema passes for a target-local queue", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
  ]);

  assert.match(output, /PASS/);
  assert.match(output, /skills\/recall-eval\/.recall\/queue.yaml/);
});

test("validate-schema accepts arbitrary yaml paths when schema matches", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/SAMPLE-QUEUE.yaml",
  ]);

  assert.match(output, /PASS/);
});

test("validate-schema fails when medium is missing", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-missing-medium.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /missing `medium`/);
      return true;
    },
  );
});

test("validate-schema fails when carrier is missing", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-missing-carrier.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /missing `carrier`/);
      return true;
    },
  );
});

test("validate-schema fails when effective source_ref is missing", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-missing-source-ref.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /missing effective `source_ref`/);
      return true;
    },
  );
});

test("validate-schema fails when score_rule structure is invalid", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-invalid-score-rule.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /`score_rule` must be an object/);
      return true;
    },
  );
});

test("validate-schema fails when expected.must_include is missing", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-missing-must-include.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /missing `expected.must_include`/);
      return true;
    },
  );
});

test("validate-schema allows case-level source_ref override without queue-level source_ref", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /PASS/);
});

test("validate-schema passes for the repo-root AGENTS queue", () => {
  const output = runScript("validate-schema.mjs", [".recall/queue.yaml"]);

  assert.match(output, /PASS/);
  assert.match(output, /\.recall\/queue\.yaml/);
});

test("resolve-target prints effective source_ref values", () => {
  const output = runScript("resolve-target.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /override-by-case/);
  assert.match(output, /skills\/isolated-context-run\/SKILL.md#default-priority/);
});

test("run-eval evaluates an entire queue from an answers-file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-eval-answers-"));
  const answersPath = path.join(tempDir, "answers.json");
  fs.writeFileSync(
    answersPath,
    JSON.stringify({
      "recall_eval.reject_missing_medium": "缺少 medium 时必须拒绝执行，需要先完善 queue。",
      "recall_eval.reject_missing_carrier":
        "缺少 carrier 时必须拒绝执行，并返回推荐值 isolated-context-run:subagent。",
    }),
  );

  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--answers-file",
    answersPath,
  ]);

  assert.match(output, /`recall_eval\.reject_missing_medium`: score=2/);
  assert.match(output, /`recall_eval\.reject_missing_carrier`: score=2/);
  assert.match(
    output,
    /directly evaluable: `recall_eval\.reject_missing_medium`, `recall_eval\.reject_missing_carrier`/,
  );
});

test("run-eval scores a fully correct answer as 2", () => {
  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--case",
    "recall_eval.reject_missing_medium",
    "--answer",
    "缺少 medium 时必须拒绝执行，需要先完善 queue，不能自行猜测 medium。",
  ]);

  assert.match(output, /score=2/);
  assert.match(output, /Queue/);
  assert.match(output, /Carrier/);
});

test("run-eval scores an overreaching answer as 0", () => {
  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--case",
    "recall_eval.reject_missing_medium",
    "--answer",
    "可以继续执行，并且自行猜测 medium。",
  ]);

  assert.match(output, /score=0/);
});

test("run-eval can source an answer from the subagent carrier bridge in live mode", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--case", "recall_eval.reject_missing_medium", "--live"],
    {
      env: {
        RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_MEDIUM:
          "缺少 medium 时必须拒绝执行，需要先完善 queue。",
      },
    },
  );

  assert.match(output, /score=2/);
  assert.match(output, /runtime failures: none/);
});

test("run-eval reports unsupported carrier overrides", () => {
  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--case",
    "recall_eval.reject_missing_medium",
    "--carrier",
    "custom-carrier",
  ]);

  assert.match(output, /refused \| unsupported carrier: `custom-carrier`/);
});

test("run-eval reports unavailable subagent carrier when no bridge is injected in live mode", () => {
  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--case",
    "recall_eval.reject_missing_medium",
    "--live",
  ]);

  assert.match(output, /not evaluated \| carrier unavailable in current environment/);
});

test("run-eval reports subagent execution failures separately from queue errors in live mode", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--case", "recall_eval.reject_missing_medium", "--live"],
    {
      env: {
        RECALL_EVAL_SUBAGENT_FAIL_RECALL_EVAL_REJECT_MISSING_MEDIUM: "1",
      },
    },
  );

  assert.match(output, /not evaluated \| carrier execution failed: environment failure/);
  assert.match(output, /runtime failures: `recall_eval\.reject_missing_medium` carrier execution failed: environment failure/);
});

test("run-eval does not call the carrier without --live when no direct answer is provided", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--case", "recall_eval.reject_missing_medium"],
    {
      env: {
        RECALL_EVAL_SUBAGENT_FAIL_RECALL_EVAL_REJECT_MISSING_MEDIUM: "1",
      },
    },
  );

  assert.match(output, /not evaluated \| missing answer input/);
  assert.doesNotMatch(output, /carrier execution failed/);
});

test("run-eval rejects mixing --live with direct answer input", () => {
  assert.throws(
    () =>
      runScript("run-eval.mjs", [
        "skills/recall-eval/.recall/queue.yaml",
        "--case",
        "recall_eval.reject_missing_medium",
        "--live",
        "--answer",
        "缺少 medium 时必须拒绝执行。",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /--live cannot be combined with direct answer inputs/);
      return true;
    },
  );
});

test("run-eval prefers direct answers over carrier execution", () => {
  const output = runScript(
    "run-eval.mjs",
    [
      "skills/recall-eval/.recall/queue.yaml",
      "--case",
      "recall_eval.reject_missing_medium",
      "--answer",
      "缺少 medium 时必须拒绝执行，需要先完善 queue。",
    ],
    {
      env: {
        RECALL_EVAL_SUBAGENT_FAIL_RECALL_EVAL_REJECT_MISSING_MEDIUM: "1",
      },
    },
  );

  assert.match(output, /score=2/);
  assert.doesNotMatch(output, /carrier execution failed/);
});

test("run-eval exits with an error when the selected case id does not exist", () => {
  assert.throws(
    () =>
      runScript("run-eval.mjs", [
        "skills/recall-eval/.recall/queue.yaml",
        "--case",
        "missing.case.id",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /No case found for id: missing\.case\.id/);
      return true;
    },
  );
});

test("run-eval refuses invalid cases and reports integrity failures", () => {
  const output = runScript(
    "run-eval.mjs",
    [
      "skills/recall-eval/.recall/broken-missing-carrier.yaml",
      "--answer",
      "随便写点内容",
    ],
    { stdio: "pipe" },
  );

  assert.match(output, /Integrity Check/);
  assert.match(output, /missing `carrier`/);
  assert.match(output, /refused/);
});
