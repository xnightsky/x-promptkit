import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  cleanupCodexRunEnvironment,
  prepareCodexRunEnvironment,
  resolveGitCommandRepoRoot,
} from "../scripts/isolated-context-run/codex/clean-room.mjs";
import { materializeResolvedSkillView } from "../scripts/isolated-context-run/codex/skill-loading.mjs";
import { runExecRequest } from "../scripts/isolated-context-run/codex/run-exec.mjs";

const repoRoot = process.cwd();
const fixtureBinDir = path.join(repoRoot, "tests", "fixtures", "codex-runner", "fake-bin");
const fixtureCodexCommand =
  process.platform === "win32" ? path.join(fixtureBinDir, "codex.cmd") : "codex";

function gitWorktreeList() {
  return execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: resolveGitCommandRepoRoot(repoRoot),
    encoding: "utf8",
  });
}

test("resolveGitCommandRepoRoot maps a Windows gitdir reference back to the mounted repo root", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-clean-room-git-meta-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const repoPath = path.join(tempRoot, "repo");
  fs.mkdirSync(repoPath, { recursive: true });
  fs.writeFileSync(
    path.join(repoPath, ".git"),
    "gitdir: D:/workspace/project/x-promptkit/.git/worktrees/review-isolated-context-run-codex\n",
  );

  assert.equal(
    resolveGitCommandRepoRoot(repoPath, { platform: "linux" }),
    path.posix.join("/", "mnt", "d", "workspace", "project", "x-promptkit"),
  );
});

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

test("prepareCodexRunEnvironment materializes the resolved skills view into tmp HOME for run-exec", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-runtime-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const skillSource = path.join(tempRoot, "sources", "demo-skill");
  fs.mkdirSync(skillSource, { recursive: true });
  fs.writeFileSync(path.join(skillSource, "SKILL.md"), "# demo\n");

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
    skill_entries: [
      { sourceClass: "dev-path-mount", skillName: "demo-skill", sourcePath: skillSource },
    ],
  });

  const mountedSkillPath = path.join(prepared.agentsSkillsRoot, "demo-skill", "SKILL.md");
  assert.equal(fs.existsSync(mountedSkillPath), true);

  const result = runExecRequest(
    {
      backend: "exec-json",
      codex_command: fixtureCodexCommand,
      task: { prompt: "check skill view" },
      working_directory: prepared.workingDirectory,
      artifacts_dir: prepared.artifactsDir,
      env: prepared.env,
      extra_args: [],
    },
    {
      env: {
        ...process.env,
        PATH: `${fixtureBinDir}${path.delimiter}${process.env.PATH}`,
        CODEX_FIXTURE_MODE: "run_skill_view_check",
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.result.final_text, "skill view ok");

  const resolvedSkillViewPath = path.join(prepared.metaDir, "resolved-skill-view.json");
  assert.equal(fs.existsSync(resolvedSkillViewPath), true);
  const resolvedSkillView = JSON.parse(fs.readFileSync(resolvedSkillViewPath, "utf8"));
  assert.equal(resolvedSkillView.resolved_skill_view.root, ".agents/skills");
  assert.deepEqual(resolvedSkillView.resolved_skill_view.skills, [
    {
      id: "demo-skill",
      source_class: "dev-path-mount",
      source_ref: skillSource,
      mount_relpath: ".agents/skills/demo-skill",
      link_copy: {
        mode: process.platform === "win32" ? "directory_junction" : "directory_symlink",
      },
      artifacts: {
        skill_md: true,
        openai_yaml: false,
      },
    },
  ]);
});

test("prepareCodexRunEnvironment seeds tmp CODEX_HOME with minimal inherited auth files only", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-seed-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const sourceHome = path.join(tempRoot, "source-home");
  const sourceCodexHome = path.join(sourceHome, ".codex");
  fs.mkdirSync(path.join(sourceCodexHome, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(sourceCodexHome, "skills"), { recursive: true });
  fs.mkdirSync(path.join(sourceCodexHome, "worktrees"), { recursive: true });
  fs.mkdirSync(path.join(sourceCodexHome, "sqlite"), { recursive: true });
  fs.mkdirSync(path.join(sourceCodexHome, "logs"), { recursive: true });
  fs.mkdirSync(path.join(sourceCodexHome, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(sourceCodexHome, "config.toml"), 'model_provider = "packycode"\n');
  fs.writeFileSync(path.join(sourceCodexHome, "auth.json"), '{ "packycode": "token" }\n');
  fs.writeFileSync(path.join(sourceCodexHome, "sessions", "history.json"), "{}\n");

  const originalCodexHome = process.env.CODEX_HOME;
  const originalHome = process.env.HOME;
  process.env.CODEX_HOME = sourceCodexHome;
  process.env.HOME = sourceHome;
  t.after(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
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

  assert.equal(
    fs.readFileSync(path.join(prepared.runRoot, ".codex", "config.toml"), "utf8"),
    'model_provider = "packycode"\n',
  );
  assert.equal(
    fs.readFileSync(path.join(prepared.runRoot, ".codex", "auth.json"), "utf8"),
    '{ "packycode": "token" }\n',
  );
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "sessions")), false);
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "skills")), false);
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "worktrees")), false);
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "sqlite")), false);
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "logs")), false);
  assert.equal(fs.existsSync(path.join(prepared.runRoot, ".codex", "tmp")), false);
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
      codex_command: fixtureCodexCommand,
      task: { prompt: "say hello" },
      working_directory: prepared.workingDirectory,
      artifacts_dir: prepared.artifactsDir,
      env: prepared.env,
      extra_args: [],
    },
    {
      env: {
        ...process.env,
        PATH: `${fixtureBinDir}${path.delimiter}${process.env.PATH}`,
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
