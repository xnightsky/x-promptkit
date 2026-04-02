import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const node = process.execPath;
const scriptsDir = path.join(cwd, "scripts", "recall-eval");

function runScript(scriptName, args = [], options = {}) {
  return execFileSync(node, [path.join(scriptsDir, scriptName), ...args], {
    cwd,
    encoding: "utf8",
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

test("validate-schema allows case-level source_ref override without queue-level source_ref", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /PASS/);
});

test("resolve-target prints effective source_ref values", () => {
  const output = runScript("resolve-target.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /override-by-case/);
  assert.match(output, /skills\/isolated-context-run\/SKILL.md#default-priority/);
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
