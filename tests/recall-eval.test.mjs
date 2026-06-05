import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 召回评测 CLI（validate-schema.mjs / resolve-target.mjs / run-eval.mjs）的端到端测试。
// 风格：BDD（场景 / 预期）。
// 重要：--live 仅触发 carrier 现场执行，不再向本地磁盘落盘任何运行产物，
// 因此所有 run artifact / --runs-dir / result.json 相关断言均已移除。

const cwd = process.cwd();
const node = process.execPath;
const scriptsDir = path.join(cwd, "skills", "recall-evaluator", "scripts");

// 在仓库根目录下以子进程方式运行指定脚本，返回 stdout。
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

// 场景：对合法的目标本地队列做 schema 校验。预期：输出 PASS 并回显路径。
test("validate-schema passes for a target-local queue", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
  ]);

  assert.match(output, /PASS/);
  assert.match(output, /skills\/recall-eval\/.recall\/queue.yaml/);
});

// 场景：对任意路径但 schema 合法的 YAML 做校验。预期：PASS。
test("validate-schema accepts arbitrary yaml paths when schema matches", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/SAMPLE-QUEUE.yaml",
  ]);

  assert.match(output, /PASS/);
});

// 场景：用例缺少 medium。预期：退出码 1 且报错 missing `medium`。
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

// 场景：用例缺少 carrier。预期：退出码 1 且报错 missing `carrier`。
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

// 场景：缺少生效的 source_ref。预期：退出码 1 且报错 missing effective `source_ref`。
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

// 场景：score_rule 结构非法。预期：退出码 1 且报错 score_rule 必须为对象。
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

// 场景：expected.must_include 缺失。预期：退出码 1 且报错。
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

// 场景：用例级 source_ref 覆盖、队列级缺省。预期：PASS。
test("validate-schema allows case-level source_ref override without queue-level source_ref", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /PASS/);
});

// 场景：校验仓库根的 AGENTS 队列。预期：PASS 并回显 .recall/queue.yaml。
test("validate-schema passes for the repo-root AGENTS queue", () => {
  const output = runScript("validate-schema.mjs", [".recall/queue.yaml"]);

  assert.match(output, /PASS/);
  assert.match(output, /\.recall\/queue\.yaml/);
});

// 场景：从目标文件路径发现本地队列。预期：PASS 并回显 .recall/queue.yaml。
test("validate-schema discovers a target-local queue from a target file path", () => {
  const output = runScript("validate-schema.mjs", ["AGENTS.md"]);

  assert.match(output, /PASS/);
  assert.match(output, /\.recall\/queue\.yaml/);
});

// 场景：从目标目录路径发现本地队列。预期：PASS 并回显该目录下的 .recall/queue.yaml。
test("validate-schema discovers a target-local queue from a target directory path", () => {
  const output = runScript("validate-schema.mjs", ["skills/recall-eval"]);

  assert.match(output, /PASS/);
  assert.match(output, /skills\/recall-eval\/.recall\/queue\.yaml/);
});

// 场景：目标下找不到本地队列。预期：退出码 1 且给出清晰的缺失提示。
test("validate-schema reports a clear error when a target-local queue is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-missing-target-queue-"));

  assert.throws(
    () => runScript("validate-schema.mjs", [tempDir]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /No target-local queue found/);
      assert.match(error.stdout, /\.recall[\\/]+queue\.yaml/);
      return true;
    },
  );
});

// 场景：解析目标并打印生效的 source_ref。预期：包含用例级覆盖值。
test("resolve-target prints effective source_ref values", () => {
  const output = runScript("resolve-target.mjs", [
    "skills/recall-eval/.recall/queue-with-case-source-override.yaml",
  ]);

  assert.match(output, /override-by-case/);
  assert.match(output, /skills\/isolated-context-run\/SKILL.md#default-priority/);
});

// 场景：从目标目录发现队列并解析。预期：回显队列路径与队列级 source_ref。
test("resolve-target discovers a target-local queue from a target directory", () => {
  const output = runScript("resolve-target.mjs", ["skills/recall-eval"]);

  assert.match(output, /Queue: skills\/recall-eval\/.recall\/queue\.yaml/);
  assert.match(output, /Queue source_ref: skills\/recall-eval\/SKILL\.md/);
});

// 场景：通过 answers-file 对整个队列打分。预期：两个用例均 score=2 且进入 directly evaluable。
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

// 场景：从目标文件路径发现本地队列后打分。预期：回显队列并对用例 score=2。
test("run-eval discovers a target-local queue from a target file path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-target-discovery-"));
  const answersPath = path.join(tempDir, "answers.json");
  fs.writeFileSync(
    answersPath,
    JSON.stringify({
      "repo_agents.cn_and_canary": "必须使用简体中文，并在每次回复末尾附带 [by=x-promptkit]。",
    }),
  );

  const output = runScript("run-eval.mjs", [
    "AGENTS.md",
    "--answers-file",
    answersPath,
  ]);

  assert.match(output, /1\. Queue/);
  assert.match(output, /`\.recall\/queue\.yaml`/);
  assert.match(output, /`repo_agents\.cn_and_canary`: score=2/);
});

// 场景：完全正确的答案。预期：score=2，并输出 Queue/Carrier 区块。
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

// 场景：命中禁止项（越界）的答案。预期：score=0。
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

// 场景：--live 下通过注入的 subagent carrier bridge 现场取答案。预期：score=2 且无运行时失败（不落盘）。
test("run-eval can source an answer from the subagent carrier bridge in live mode", () => {
  const output = runScript(
    "run-eval.mjs",
    [
      "skills/recall-eval/.recall/queue.yaml",
      "--case",
      "recall_eval.reject_missing_medium",
      "--live",
    ],
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

// 场景：显式指定不支持的 carrier 覆盖。预期：refused | unsupported carrier。
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

// 场景：--live 但未注入 bridge。预期：报告 carrier 在当前环境不可用（不落盘）。
test("run-eval reports unavailable subagent carrier when no bridge is injected in live mode", () => {
  const output = runScript("run-eval.mjs", [
    "skills/recall-eval/.recall/queue.yaml",
    "--case",
    "recall_eval.reject_missing_medium",
    "--live",
  ]);

  assert.match(
    output,
    /not evaluated \| carrier unavailable in current environment \(class=unavailable, retries=0\/0\)/,
  );
});

// 场景：--live 下 carrier 执行失败。预期：作为运行时失败单独记账，与队列错误区分（不落盘）。
test("run-eval reports subagent execution failures separately from queue errors in live mode", () => {
  const output = runScript(
    "run-eval.mjs",
    [
      "skills/recall-eval/.recall/queue.yaml",
      "--case",
      "recall_eval.reject_missing_medium",
      "--live",
    ],
    {
      env: {
        RECALL_EVAL_SUBAGENT_FAIL_RECALL_EVAL_REJECT_MISSING_MEDIUM: "1",
      },
    },
  );

  assert.match(
    output,
    /not evaluated \| carrier execution failed: environment failure \(class=environment_failure, retries=0\/0\)/,
  );
  assert.match(
    output,
    /runtime failures: `recall_eval\.reject_missing_medium` carrier execution failed: environment failure \(class=environment_failure, retries=0\/0\)/,
  );
});

// 场景：无 --live 且未提供直接答案。预期：not evaluated | missing answer input，且不会调用 carrier。
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

// 场景：--live 与直接答案混用。预期：退出码 1 并报错互斥。
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

// 场景：--live 下对整个队列现场执行并打分。预期：两个用例均被打分（不落盘，无单一 run id 产物）。
test("run-eval scores a whole live queue in one pass", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--live"],
    {
      env: {
        RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_MEDIUM:
          "缺少 medium 时必须拒绝执行，需要先完善 queue。",
        RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_CARRIER:
          "缺少 carrier 时必须拒绝执行，并返回推荐值 isolated-context-run:subagent。",
      },
    },
  );

  assert.match(output, /`recall_eval\.reject_missing_medium`: score=2/);
  assert.match(output, /`recall_eval\.reject_missing_carrier`: score=2/);
});

// 场景：--live 下批量评测多个队列目标。预期：批量报告可区分各目标（不落盘）。
test("run-eval batches multiple queue targets in live mode with distinguishable summaries", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", ".recall/queue.yaml", "--live"],
    {
      env: {
        RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_MEDIUM:
          "缺少 medium 时必须拒绝执行，需要先完善 queue。",
        RECALL_EVAL_SUBAGENT_RESPONSE_RECALL_EVAL_REJECT_MISSING_CARRIER:
          "缺少 carrier 时必须拒绝执行，并返回推荐值 isolated-context-run:subagent。",
        RECALL_EVAL_SUBAGENT_RESPONSE_REPO_AGENTS_CN_AND_CANARY:
          "必须使用简体中文，并在每次回复末尾附带 [by=x-promptkit]。",
      },
    },
  );

  assert.match(output, /Batch Recall Eval/);
  assert.match(output, /- targets: `2`/);
  assert.match(output, /## `skills\/recall-eval\/.recall\/queue\.yaml`/);
  assert.match(output, /## `\.recall\/queue\.yaml`/);
  assert.match(output, /repo_agents\.cn_and_canary/);
});

// 场景：多个队列目标但缺少 --live。预期：退出码 1 并报错需要 --live。
test("run-eval rejects multiple queue targets without --live", () => {
  assert.throws(
    () =>
      runScript("run-eval.mjs", [
        "skills/recall-eval/.recall/queue.yaml",
        ".recall/queue.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /multiple yaml targets require --live/);
      return true;
    },
  );
});

// 场景：--case 与多个队列目标混用。预期：退出码 1 并报错互斥。
test("run-eval rejects combining --case with multiple queue targets", () => {
  assert.throws(
    () =>
      runScript("run-eval.mjs", [
        "skills/recall-eval/.recall/queue.yaml",
        ".recall/queue.yaml",
        "--live",
        "--case",
        "recall_eval.reject_missing_medium",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /--case cannot be combined with multiple yaml targets/);
      return true;
    },
  );
});

// 场景：同时提供直接答案与会失败的 carrier。预期：优先采用直接答案 score=2，不触发 carrier。
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

// 场景：指定不存在的用例 id。预期：退出码 1 并报错 No case found。
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

// 场景：队列存在完整性错误（缺 carrier）。预期：输出完整性检查并标记 refused。
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
