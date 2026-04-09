import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const node = process.execPath;
const scriptsDir = path.join(cwd, "skills", "recall-evaluator", "scripts");

function runIitest(args = [], options = {}) {
  return execFileSync(node, [path.join(scriptsDir, "run-iitest.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    ...options,
  });
}

test("run-iitest initializes a temp workspace, executes the task phase, and scores the recall phase", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recall-iitest-runner-"));
  const fixtureRoot = path.join(tempRoot, "fixture");
  fs.mkdirSync(path.join(fixtureRoot, ".recall"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "AGENTS.md"),
    "Use Simplified Chinese. Operate only inside this workspace.\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, ".recall", "queue.yaml"),
    [
      "version: 1",
      "source_ref: AGENTS.md",
      "fallback_answer: 未明确",
      "scoring:",
      '  "2": full',
      '  "1": partial',
      '  "0": fail',
      "cases:",
      "  - id: task_memory.recall_written_file",
      "    question: 你刚才把 alpha 写到了哪个文件里？",
      "    medium: skill-mechanism",
      "    carrier: isolated-context-run:subagent",
      "    expected:",
      "      must_include:",
      "        - notes/task-log.md",
      "      should_include:",
      "        - alpha",
      "      must_not_include:",
      "        - todo.txt",
      "    score_rule:",
      "      full: full",
      "      partial: partial",
      "      fail: fail",
      "    tags: [iitest]",
      "    source_scope: AGENTS.md#top-level",
      "",
    ].join("\n"),
  );
  const suitePath = path.join(tempRoot, "suite.yaml");
  fs.writeFileSync(
    suitePath,
    [
      "name: recall workspace smoke",
      `queue: ${JSON.stringify(path.join(fixtureRoot, ".recall", "queue.yaml"))}`,
      `fixture_ref: ${JSON.stringify(fixtureRoot)}`,
      "carrier: isolated-context-run:subagent",
      "task_prompt: |",
      "  Create `notes/task-log.md` with the single line `alpha`.",
      "workspace_assert:",
      "  must_exist:",
      "    - notes/task-log.md",
      "  file_contains:",
      "    - path: notes/task-log.md",
      "      text: alpha",
      "cases:",
      "  - task_memory.recall_written_file",
      "",
    ].join("\n"),
  );

  const executorScript = [
    "process.stdin.setEncoding('utf8');",
    "let data = '';",
    "process.stdin.on('data', (chunk) => { data += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(data);",
    "  const fs = require('node:fs');",
    "  const path = require('node:path');",
    "  if (request.phase === 'task') {",
    "    fs.mkdirSync(path.join(request.workspace_root, 'notes'), { recursive: true });",
    "    fs.writeFileSync(path.join(request.workspace_root, 'notes', 'task-log.md'), 'alpha\\n');",
    "    process.stdout.write('task ok');",
    "    return;",
    "  }",
    "  const notePath = path.join(request.workspace_root, 'notes', 'task-log.md');",
    "  const content = fs.readFileSync(notePath, 'utf8').trim();",
    "  process.stdout.write('alpha 被写到了 notes/task-log.md，内容是 ' + content);",
    "});",
  ].join(" ");
  const executorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(executorScript)}`;

  const output = runIitest([suitePath], {
    env: {
      RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND: executorCommand,
    },
  });

  assert.match(output, /Task Execution/);
  assert.match(output, /workspace assert: pass/);
  assert.match(output, /`task_memory\.recall_written_file`: score=2/);
});

test("run-iitest reports recall-phase carrier failures separately from workspace assertions", () => {
  const taskExecutorScript = [
    "process.stdin.setEncoding('utf8');",
    "let data = '';",
    "process.stdin.on('data', (chunk) => { data += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(data);",
    "  const fs = require('node:fs');",
    "  const path = require('node:path');",
    "  fs.mkdirSync(path.join(request.workspace_root, 'notes'), { recursive: true });",
    "  fs.writeFileSync(path.join(request.workspace_root, 'notes', 'task-log.md'), 'alpha\\n');",
    "  process.stdout.write('task ok');",
    "});",
  ].join(" ");
  const taskExecutorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(taskExecutorScript)}`;

  assert.throws(
    () =>
      runIitest(["integration-tests/recall-eval/smoke.test.yaml"], {
        env: {
          RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND_TASK: taskExecutorCommand,
          RECALL_EVAL_SUBAGENT_FAIL_RECALL_TASK_MEMORY_RECALL_WRITTEN_FILE: "1",
          RECALL_EVAL_SUBAGENT_ERROR_RECALL_TASK_MEMORY_RECALL_WRITTEN_FILE: "bridge down",
        },
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /workspace assert: pass/);
      assert.match(
        error.stdout,
        /`task_memory\.recall_written_file`: not evaluated \| carrier execution failed: bridge down/,
      );
      assert.match(
        error.stdout,
        /runtime failures: `task_memory\.recall_written_file` carrier execution failed: bridge down/,
      );
      return true;
    },
  );
});

test("run-iitest uses case-level source_ref overrides during recall", () => {
  const executorScript = [
    "process.stdin.setEncoding('utf8');",
    "let data = '';",
    "process.stdin.on('data', (chunk) => { data += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(data);",
    "  const fs = require('node:fs');",
    "  const path = require('node:path');",
    "  if (request.phase === 'task') {",
    "    fs.mkdirSync(path.join(request.workspace_root, 'notes'), { recursive: true });",
    "    fs.writeFileSync(path.join(request.workspace_root, 'notes', 'task-log.md'), 'alpha\\n');",
    "    process.stdout.write('task ok');",
    "    return;",
    "  }",
    "  process.stdout.write(String(request.source_ref).includes('docs') ? 'docs/policy.md#recall-override' : 'bad-source-ref');",
    "});",
  ].join(" ");
  const executorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(executorScript)}`;

  const output = runIitest(["integration-tests/recall-eval/mixed-source-ref.test.yaml"], {
    env: {
      RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND: executorCommand,
    },
  });

  assert.match(output, /`task_memory\.recall_case_override`: score=2/);
  assert.match(output, /directly evaluable: `task_memory\.recall_case_override`/);
});
