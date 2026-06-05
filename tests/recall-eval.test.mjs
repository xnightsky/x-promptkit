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
const scriptsDir = path.join(cwd, "skills", "recall-eval", "scripts");

// 在仓库根目录下以子进程方式运行指定脚本，返回 stdout。
function runScript(scriptName, args = [], options = {}) {
  const { env: extraEnv = {}, ...restOptions } = options;
  return execFileSync(node, [path.join(scriptsDir, scriptName), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
    ...restOptions,
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
    "skills/recall-eval/examples/queue.example.yaml",
  ]);

  assert.match(output, /PASS/);
});

// 场景：带 context 层声明（队列级 + 用例级覆盖）的队列。预期：PASS。
test("validate-schema accepts queue-level and case-level context declarations", () => {
  const output = runScript("validate-schema.mjs", [
    "skills/recall-eval/.recall/queue-with-context-layers.yaml",
  ]);

  assert.match(output, /PASS/);
});

// 场景：context.global.enabled 为 true 却未给 path。预期：退出码 1 且点名缺失字段。
test("validate-schema fails when an enabled global context layer has no path", () => {
  assert.throws(
    () =>
      runScript("validate-schema.mjs", [
        "skills/recall-eval/.recall/broken-invalid-context.yaml",
      ]),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /missing `context\.global\.path`/);
      return true;
    },
  );
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

// 场景：--live 下通过 echo provider 现场执行。预期：echo 回显 SKILL.md 内容，产出 5 段报告。
test("run-eval executes live recall via echo provider and produces a report", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-live-matrix-"));
  const matrixPath = path.join(tempDir, ".recall-replay.env.yaml");
  fs.writeFileSync(
    matrixPath,
    [
      "version: 1",
      "providers:",
      "  - id: echo-test",
      "    enabled: true",
      "    api: echo",
    ].join("\n"),
  );

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
        RECALL_REPLAY_MATRIX: matrixPath,
      },
    },
  );

  // echo 回显包含 SKILL.md 原文和问题，至少应产出 5 段结构
  assert.match(output, /Queue/);
  assert.match(output, /Carrier/);
  assert.match(output, /Integrity Check/);
  assert.match(output, /Case Results/);
  assert.match(output, /Summary/);
});

// 为 --live 的发现类用例搭隔离环境：临时 cwd(自带 .git,把仓库根收敛在沙箱内)
// + 临时 home。home 通过 HOME / USERPROFILE 注入(os.homedir() 在 POSIX 读
// HOME、Windows 读 USERPROFILE),因此用例不依赖宿主机真实 home 或仓库根的
// 本地矩阵文件状态——这两处的本地文件都被 .gitignore 忽略,内容不可预期。
function makeLiveSandbox() {
  const sandboxCwd = fs.mkdtempSync(path.join(os.tmpdir(), "recall-live-cwd-"));
  fs.mkdirSync(path.join(sandboxCwd, ".git"));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-live-home-"));
  return {
    sandboxCwd,
    homeDir,
    // 子进程 cwd 是沙箱,队列路径必须用仓库根的绝对路径
    queuePath: path.join(cwd, "skills", "recall-eval", ".recall", "queue.yaml"),
    env: { HOME: homeDir, USERPROFILE: homeDir, RECALL_REPLAY_MATRIX: "" },
  };
}

const ECHO_MATRIX = [
  "version: 1",
  "providers:",
  "  - id: echo-home",
  "    enabled: true",
  "    api: echo",
].join("\n");

// 场景：--live 时无显式 RECALL_REPLAY_MATRIX 但 home 目录有矩阵。预期：自动发现 home 矩阵。
test("run-eval uses home directory provider matrix when available in live mode", () => {
  const { sandboxCwd, homeDir, queuePath, env } = makeLiveSandbox();
  fs.writeFileSync(path.join(homeDir, ".recall-replay.env.yaml"), ECHO_MATRIX);

  const output = runScript(
    "run-eval.mjs",
    [queuePath, "--case", "recall_eval.reject_missing_medium", "--live"],
    { env, cwd: sandboxCwd },
  );

  // 应产出 5 段报告结构
  assert.match(output, /Queue/);
  assert.match(output, /Carrier/);
  assert.match(output, /Integrity Check/);
  assert.match(output, /Case Results/);
  assert.match(output, /Summary/);
  // 回归钉:source_ref 必须按队列所在仓库根解析;按进程 cwd(沙箱)解析时
  // 这里会稳定输出 not evaluated | source_ref not found
  assert.doesNotMatch(output, /source_ref not found/);
});

// 场景：RECALL_REPLAY_MATRIX 用 `~/` 前缀指向 home 下的矩阵。预期：展开后正常 live。
// 矩阵文件名刻意不在自动发现名单里，证明走的是 override 展开而非目录发现。
test("run-eval expands a ~ prefix in RECALL_REPLAY_MATRIX to the home directory", () => {
  const { sandboxCwd, homeDir, queuePath, env } = makeLiveSandbox();
  fs.writeFileSync(path.join(homeDir, "custom-matrix.yaml"), ECHO_MATRIX);

  const output = runScript(
    "run-eval.mjs",
    [queuePath, "--case", "recall_eval.reject_missing_medium", "--live"],
    { env: { ...env, RECALL_REPLAY_MATRIX: "~/custom-matrix.yaml" }, cwd: sandboxCwd },
  );

  assert.match(output, /Case Results/);
  assert.match(output, /Summary/);
  assert.doesNotMatch(output, /SKIP: no active provider/);
  assert.doesNotMatch(output, /source_ref not found/);
});

// 场景：无 --live 且未提供直接答案。预期：not evaluated | missing answer input。
test("run-eval does not call live mode without --live when no direct answer is provided", () => {
  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--case", "recall_eval.reject_missing_medium"],
  );

  assert.match(output, /not evaluated \| missing answer input/);
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

// 场景：--live 下对整个队列现场执行。预期：echo 回显 SKILL.md，两个用例产出报告。
test("run-eval scores a whole live queue with echo provider", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-live-whole-"));
  const matrixPath = path.join(tempDir, ".recall-replay.env.yaml");
  fs.writeFileSync(
    matrixPath,
    [
      "version: 1",
      "providers:",
      "  - id: echo-test",
      "    enabled: true",
      "    api: echo",
    ].join("\n"),
  );

  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", "--live"],
    {
      env: {
        RECALL_REPLAY_MATRIX: matrixPath,
      },
    },
  );

  assert.match(output, /recall_eval\.reject_missing_medium/);
  assert.match(output, /recall_eval\.reject_missing_carrier/);
  assert.match(output, /Summary/);
});

// 场景：--live 下批量评测多个队列目标。预期：产出批量报告。
test("run-eval batches multiple queue targets in live mode with echo provider", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-live-batch-"));
  const matrixPath = path.join(tempDir, ".recall-replay.env.yaml");
  fs.writeFileSync(
    matrixPath,
    [
      "version: 1",
      "providers:",
      "  - id: echo-test",
      "    enabled: true",
      "    api: echo",
    ].join("\n"),
  );

  const output = runScript(
    "run-eval.mjs",
    ["skills/recall-eval/.recall/queue.yaml", ".recall/queue.yaml", "--live"],
    {
      env: {
        RECALL_REPLAY_MATRIX: matrixPath,
      },
    },
  );

  assert.match(output, /Batch Recall Eval/);
  assert.match(output, /- targets: `2`/);
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

// 场景：同时提供直接答案，不受 --live 影响（score-only 模式）。预期：score=2。
test("run-eval prefers direct answers and scores correctly", () => {
  const output = runScript(
    "run-eval.mjs",
    [
      "skills/recall-eval/.recall/queue.yaml",
      "--case",
      "recall_eval.reject_missing_medium",
      "--answer",
      "缺少 medium 时必须拒绝执行，需要先完善 queue。",
    ],
  );

  assert.match(output, /score=2/);
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

// 场景：队列存在完整性错误（缺 carrier）。预期：报告完整性检查失败。
test("run-eval reports integrity failures for invalid cases", () => {
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
  assert.match(output, /not evaluated/);
});
