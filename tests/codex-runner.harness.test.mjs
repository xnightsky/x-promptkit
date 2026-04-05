import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  cleanupCodexRunEnvironment,
  prepareCodexRunEnvironment,
} from "../scripts/isolated-context-run/codex/clean-room.mjs";
import { materializeResolvedSkillView } from "../scripts/isolated-context-run/codex/skill-loading.mjs";
import { runExecRequest } from "../scripts/isolated-context-run/codex/run-exec.mjs";

const repoRoot = process.cwd();
const fixtureBinDir = path.join(repoRoot, "tests", "fixtures", "codex-runner", "fake-bin");

function gitWorktreeList() {
  return execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("prepareCodexRunEnvironment creates a git-worktree clean room with metadata", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-clean-room-git-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    workspace_mode: "git-worktree",
    repo_root: repoRoot,
    revision: "HEAD",
  });

  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex")), true);
  assert.equal(fs.existsSync(prepared.workingDirectory), true);
  assert.equal(fs.existsSync(path.join(prepared.metaDir, "run.json")), true);
  assert.equal(fs.existsSync(path.join(prepared.metaDir, "environment.json")), true);

  cleanupCodexRunEnvironment(prepared);
  assert.equal(fs.existsSync(prepared.runRoot), false);
  assert.equal(gitWorktreeList().includes(prepared.workingDirectory), false);
});

test("prepareCodexRunEnvironment supports minimal-seed with init steps and init report", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-clean-room-seed-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const fixtureRoot = path.join(tempRoot, "fixture");
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "AGENTS.md"), "seed source");

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    workspace_mode: "minimal-seed",
    repo_root: fixtureRoot,
    workspace_profile: {
      workspace: { mode: "minimal-seed" },
      seed: {
        copy: [{ from: "AGENTS.md", to: "AGENTS.md" }],
      },
      init: {
        steps: [
          { type: "mkdir", path: "notes" },
          { type: "write_file", path: "notes/init.txt", content: "alpha\n" },
        ],
      },
    },
  });

  assert.equal(
    fs.readFileSync(path.join(prepared.workingDirectory, "AGENTS.md"), "utf8"),
    "seed source",
  );
  assert.equal(
    fs.readFileSync(path.join(prepared.workingDirectory, "notes", "init.txt"), "utf8"),
    "alpha\n",
  );
  assert.equal(fs.existsSync(path.join(prepared.metaDir, "resolved-workspace-profile.yaml")), true);
  assert.equal(fs.existsSync(path.join(prepared.metaDir, "init-report.json")), true);

  cleanupCodexRunEnvironment(prepared);
  assert.equal(fs.existsSync(prepared.runRoot), false);
});

test("materializeResolvedSkillView links the winning skill source into the target root", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-view-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const sourceRoot = path.join(tempRoot, "sources");
  const targetRoot = path.join(tempRoot, "resolved");
  const repoSkill = path.join(sourceRoot, "repo", "demo-skill");
  const devSkill = path.join(sourceRoot, "dev", "demo-skill");

  fs.mkdirSync(repoSkill, { recursive: true });
  fs.mkdirSync(devSkill, { recursive: true });
  fs.writeFileSync(path.join(repoSkill, "SKILL.md"), "# repo\n");
  fs.writeFileSync(path.join(devSkill, "SKILL.md"), "# dev\n");

  const report = materializeResolvedSkillView({
    targetRoot,
    entries: [
      { sourceClass: "repo", skillName: "demo-skill", sourcePath: repoSkill },
      { sourceClass: "dev-path-mount", skillName: "demo-skill", sourcePath: devSkill },
    ],
  });

  assert.equal(report.resolvedEntries.length, 1);
  const linkedPath = path.join(targetRoot, "demo-skill");
  assert.equal(fs.lstatSync(linkedPath).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(path.join(linkedPath, "SKILL.md"), "utf8"), "# dev\n");
});

test("runExecRequest writes the expected artifacts for successful runs", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-harness-run-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    workspace_mode: "minimal-seed",
    repo_root: repoRoot,
    workspace_profile: {
      workspace: { mode: "minimal-seed" },
      seed: {
        copy: [{ from: "AGENTS.md", to: "AGENTS.md" }],
      },
    },
  });

  const result = runExecRequest(
    {
      backend: "exec-json",
      task: { prompt: "say hello" },
      working_directory: prepared.workingDirectory,
      artifacts_dir: prepared.artifactsDir,
      env: prepared.env,
      extra_args: [],
    },
    {
      env: {
        ...process.env,
        PATH: `${fixtureBinDir}:${process.env.PATH}`,
        CODEX_FIXTURE_MODE: "run_ok",
      },
    },
  );

  assert.equal(result.ok, true);
  for (const fileName of [
    "raw-events.jsonl",
    "stdout.txt",
    "stderr.txt",
    "evidence.json",
    "result.json",
  ]) {
    assert.equal(fs.existsSync(path.join(prepared.artifactsDir, fileName)), true);
  }

  cleanupCodexRunEnvironment(prepared);
  assert.equal(fs.existsSync(prepared.runRoot), false);
});

test("cleanupCodexRunEnvironment keeps the prepared root when explicitly requested", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-clean-room-keep-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    workspace_mode: "minimal-seed",
    repo_root: repoRoot,
    workspace_profile: {
      workspace: { mode: "minimal-seed" },
      seed: {
        copy: [{ from: "AGENTS.md", to: "AGENTS.md" }],
      },
    },
  });

  cleanupCodexRunEnvironment(prepared, { keepRunRoot: true });
  assert.equal(fs.existsSync(prepared.runRoot), true);
});

test("cleanupCodexRunEnvironment is idempotent for git-worktree runs", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-clean-room-idempotent-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    workspace_mode: "git-worktree",
    repo_root: repoRoot,
    revision: "HEAD",
  });

  cleanupCodexRunEnvironment(prepared);
  cleanupCodexRunEnvironment(prepared);

  assert.equal(fs.existsSync(prepared.runRoot), false);
  assert.equal(gitWorktreeList().includes(prepared.workingDirectory), false);
});
