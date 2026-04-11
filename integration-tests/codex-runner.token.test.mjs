import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupCodexRunEnvironment,
  prepareCodexRunEnvironment,
} from "../skills/isolated-context-run-codex/scripts/clean-room.mjs";
import { runExecRequest } from "../skills/isolated-context-run-codex/scripts/run-exec.mjs";

const repoRoot = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildTokenRunRequest(prepared, prompt) {
  return {
    backend: "exec-json",
    codex_command: "codex",
    task: { prompt },
    working_directory: prepared.workingDirectory,
    artifacts_dir: prepared.artifactsDir,
    env: prepared.env,
    extra_args: [],
  };
}

test("token-backed codex exec runs inside tmp HOME with workspace-link by default", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-token-workspace-link-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    repo_root: repoRoot,
  });
  t.after(() => {
    cleanupCodexRunEnvironment(prepared);
  });

  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    [
      "In one short line, confirm that this Codex run is active.",
    ].join("\n"),
  ));

  assert.equal(result.ok, true);
  assert.equal(result.execution.turn_status, "completed");
  assert.match(result.result.final_text, /\S/);
  assert.equal(prepared.workspaceModeResolved, "workspace-link");
  assert.equal(fs.existsSync(path.join(prepared.artifactsDir, "result.json")), true);
  assert.equal(fs.existsSync(path.join(prepared.metaDir, "workspace-manifest.json")), true);

  const manifest = readJson(path.join(prepared.metaDir, "workspace-manifest.json"));
  assert.equal(manifest.workspace_mode_resolved, "workspace-link");
  assert.equal(manifest.workspace_link.mode, process.platform === "win32" ? "directory_junction" : "directory_symlink");
});

test("token-backed codex exec succeeds with an explicit skill-entry allowlist", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-token-skill-chain-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    repo_root: repoRoot,
    skill_entries: [
      {
        sourceClass: "repo",
        skillName: "isolated-context-run",
        sourcePath: path.join(repoRoot, "skills", "isolated-context-run"),
      },
      {
        sourceClass: "repo",
        skillName: "isolated-context-run-codex",
        sourcePath: path.join(repoRoot, "skills", "isolated-context-run-codex"),
      },
      {
        sourceClass: "repo",
        skillName: "claude-p-watch",
        sourcePath: path.join(repoRoot, "skills", "claude-p-watch"),
      },
    ],
  });
  t.after(() => {
    cleanupCodexRunEnvironment(prepared);
  });

  const prompt = [
    "Use $claude-p-watch.",
    "Only return the exact canonical command skeleton for a watched claude -p run in the current workspace.",
    "Do not execute the command.",
  ].join("\n");

  const result = runExecRequest(buildTokenRunRequest(prepared, prompt));

  assert.equal(result.ok, true);
  assert.match(
    result.result.final_text,
    /IS_SANDBOX=1 claude --dangerously-skip-permissions -p/,
  );
  assert.doesNotMatch(result.result.final_text, /--verbose/);
  assert.doesNotMatch(result.result.final_text, /--output-format\s+stream-json/);
  assert.match(result.result.final_text, /claude -p|claude --dangerously-skip-permissions -p/);

  const resolvedSkillView = readJson(path.join(prepared.metaDir, "resolved-skill-view.json"));
  assert.deepEqual(
    resolvedSkillView.resolved_skill_view.skills.map((skill) => skill.id),
    ["claude-p-watch", "isolated-context-run", "isolated-context-run-codex"],
  );
});
