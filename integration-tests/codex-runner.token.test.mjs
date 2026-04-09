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
