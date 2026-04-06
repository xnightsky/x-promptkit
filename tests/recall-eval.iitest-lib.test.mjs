import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildIitestSubagentRequest,
  createWorkspaceFromFixture,
  remapSourceRefToWorkspace,
  validateIitestSuite,
  verifyWorkspaceAssert,
} from "../skills/recall-evaluator/scripts/iitest-lib.mjs";

test("validateIitestSuite rejects suites missing fixture_ref", () => {
  const report = validateIitestSuite({
    name: "missing fixture",
    queue: "skills/recall-eval/.recall/queue.yaml",
    task_prompt: "do work",
    cases: ["case-01"],
  });

  assert.equal(report.isValid, false);
  assert.match(report.errors.join("\n"), /missing `fixture_ref`/);
});

test("createWorkspaceFromFixture copies fixture contents into a fresh temp workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recall-iitest-fixture-"));
  const fixtureRoot = path.join(tempRoot, "fixture");
  fs.mkdirSync(path.join(fixtureRoot, "notes"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "AGENTS.md"), "fixture root");
  fs.writeFileSync(path.join(fixtureRoot, "notes", "seed.txt"), "alpha");

  const workspace = createWorkspaceFromFixture(fixtureRoot);

  assert.equal(fs.readFileSync(path.join(workspace.workspaceRoot, "AGENTS.md"), "utf8"), "fixture root");
  assert.equal(
    fs.readFileSync(path.join(workspace.workspaceRoot, "notes", "seed.txt"), "utf8"),
    "alpha",
  );
  assert.match(workspace.workspaceRoot, /recall-iitest-workspace-/);
});

test("verifyWorkspaceAssert validates required files and file content in the temp workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recall-iitest-assert-"));
  fs.mkdirSync(path.join(tempRoot, "notes"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "notes", "task-log.md"), "alpha\n");

  const report = verifyWorkspaceAssert(tempRoot, {
    must_exist: ["notes/task-log.md"],
    file_contains: [
      {
        path: "notes/task-log.md",
        text: "alpha",
      },
    ],
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.failures, []);
});

test("buildIitestSubagentRequest includes phase, workspace, and source binding", () => {
  const request = JSON.parse(
    buildIitestSubagentRequest({
      phase: "recall",
      prompt: "你刚才把 alpha 写到了哪里？",
      workspaceRoot: "<workspace-root>",
      sourceRef: "AGENTS.md#anchor",
      carrier: "isolated-context-run:subagent",
      caseId: "case-01",
      medium: "skill-mechanism",
    }),
  );

  assert.equal(request.phase, "recall");
  assert.equal(request.workspace_root, "<workspace-root>");
  assert.equal(request.source_ref, "AGENTS.md#anchor");
  assert.equal(request.prompt, "你刚才把 alpha 写到了哪里？");
});

test("remapSourceRefToWorkspace remaps fixture-local source_ref into the temp workspace", () => {
  const fixtureAbsolutePath = path.resolve("fixture-root");
  const workspaceRoot = path.resolve("temp-workspace");
  const remapped = remapSourceRefToWorkspace(
    "docs/prompt.md#rule-1",
    fixtureAbsolutePath,
    workspaceRoot,
  );

  assert.equal(remapped, `${path.join(workspaceRoot, "docs", "prompt.md")}#rule-1`);
});
