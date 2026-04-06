import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { applyWorkspaceProfile } from "./workspace-profile.mjs";
import { validateWorkspaceProfile } from "./lib.mjs";
import { materializeResolvedSkillView } from "./skill-loading.mjs";

function buildRunId() {
  return `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function writeMetadata(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

const MINIMAL_CODEX_HOME_FILES = ["config.toml", "auth.json"];

function resolveSourceCodexHome(env = process.env) {
  if (typeof env.CODEX_HOME === "string" && env.CODEX_HOME.trim().length > 0) {
    return path.resolve(env.CODEX_HOME);
  }

  if (typeof env.HOME === "string" && env.HOME.trim().length > 0) {
    return path.join(env.HOME, ".codex");
  }

  return path.join(os.homedir(), ".codex");
}

function seedMinimalCodexHome(targetCodexHome, env = process.env) {
  const sourceCodexHome = resolveSourceCodexHome(env);

  if (!fs.existsSync(sourceCodexHome) || !fs.statSync(sourceCodexHome).isDirectory()) {
    return;
  }

  // The clean room should reuse only stable user config and auth material.
  // Runtime state stays isolated so tmp HOME does not inherit history or logs.
  for (const fileName of MINIMAL_CODEX_HOME_FILES) {
    const sourcePath = path.join(sourceCodexHome, fileName);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }

    fs.copyFileSync(sourcePath, path.join(targetCodexHome, fileName));
  }
}

function prepareRunRoot(tempRoot) {
  const runRoot = path.join(tempRoot ?? os.tmpdir(), "isolated-context-run", buildRunId());
  const codexHome = path.join(runRoot, ".codex");
  const workspace = path.join(runRoot, "workspace");
  const artifacts = path.join(runRoot, "artifacts");
  const meta = path.join(runRoot, "meta");
  const tmpDir = path.join(runRoot, ".tmp");
  const configDir = path.join(runRoot, ".config");
  const cacheDir = path.join(runRoot, ".cache");
  const stateDir = path.join(runRoot, ".local", "state");
  const agentsDir = path.join(runRoot, ".agents", "skills");

  for (const directory of [
    codexHome,
    workspace,
    artifacts,
    meta,
    tmpDir,
    configDir,
    cacheDir,
    stateDir,
    agentsDir,
  ]) {
    ensureDir(directory);
  }

  return {
    runRoot,
    codexHome,
    workspace,
    artifacts,
    meta,
    tmpDir,
    configDir,
    cacheDir,
    stateDir,
    agentsDir,
  };
}

function isWindowsAbsolutePath(candidate) {
  return typeof candidate === "string" && /^[A-Za-z]:[\\/]/.test(candidate);
}

function toWslMountedPath(windowsPath) {
  const drive = windowsPath.slice(0, 1).toLowerCase();
  const rest = windowsPath.slice(2).replace(/\\/g, "/");
  const rootedRest = rest.startsWith("/") ? rest : `/${rest}`;
  return path.posix.join("/", "mnt", drive, rootedRest);
}

function resolveGitDirReference(repoRoot, reference, platform) {
  if (isWindowsAbsolutePath(reference) && platform === "linux") {
    return toWslMountedPath(reference);
  }

  if (path.isAbsolute(reference) || isWindowsAbsolutePath(reference)) {
    return path.normalize(reference);
  }

  return path.resolve(repoRoot, reference);
}

export function resolveGitCommandRepoRoot(repoRoot, options = {}) {
  const platform = options.platform ?? process.platform;
  const gitPath = path.join(repoRoot, ".git");

  if (!fs.existsSync(gitPath) || !fs.statSync(gitPath).isFile()) {
    return repoRoot;
  }

  const gitFileText = fs.readFileSync(gitPath, "utf8").trim();
  if (!gitFileText.startsWith("gitdir:")) {
    return repoRoot;
  }

  const gitDirPath = resolveGitDirReference(repoRoot, gitFileText.slice("gitdir:".length).trim(), platform);
  const worktreesDir = path.dirname(gitDirPath);
  const gitCommonDir = path.dirname(worktreesDir);

  if (path.basename(worktreesDir) !== "worktrees" || path.basename(gitCommonDir) !== ".git") {
    return repoRoot;
  }

  return path.dirname(gitCommonDir);
}

function createGitWorktreeWorkspace(repoRoot, revision, workspaceRoot) {
  // `git-worktree` keeps the repository shape realistic without copying the
  // whole repo into the fake HOME tree.
  const controlRepoRoot = resolveGitCommandRepoRoot(repoRoot);
  const result = spawnSync(
    "git",
    ["-C", controlRepoRoot, "worktree", "add", "--detach", workspaceRoot, revision],
    {
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(`git-worktree setup failed: ${result.stderr || result.stdout}`);
  }
}

function removeGitWorktree(repoRoot, workspaceRoot) {
  const controlRepoRoot = resolveGitCommandRepoRoot(repoRoot);
  const result = spawnSync(
    "git",
    ["-C", controlRepoRoot, "worktree", "remove", "--force", workspaceRoot],
    {
      encoding: "utf8",
    },
  );

  if (result.status === 0) {
    return;
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();
  if (
    combinedOutput.includes("is not a working tree") ||
    combinedOutput.includes("not found") ||
    combinedOutput.includes("no such file or directory")
  ) {
    return;
  }

  throw new Error(`git-worktree cleanup failed: ${result.stderr || result.stdout}`);
}

export function prepareCodexRunEnvironment({
  tempRoot,
  workspace_mode = "git-worktree",
  repo_root,
  revision = "HEAD",
  workspace_profile = null,
  skill_entries = [],
}) {
  const prepared = prepareRunRoot(tempRoot);
  const env = {
    HOME: prepared.runRoot,
    CODEX_HOME: prepared.codexHome,
    PWD: prepared.workspace,
    TMPDIR: prepared.tmpDir,
    XDG_CONFIG_HOME: prepared.configDir,
    XDG_CACHE_HOME: prepared.cacheDir,
    XDG_STATE_HOME: prepared.stateDir,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
  };

  seedMinimalCodexHome(prepared.codexHome);

  if (workspace_mode === "git-worktree") {
    createGitWorktreeWorkspace(repo_root, revision, prepared.workspace);
  } else if (workspace_mode === "minimal-seed") {
    const profile = validateWorkspaceProfile(workspace_profile ?? {
      workspace: { mode: "minimal-seed" },
      seed: { copy: [] },
    });
    applyWorkspaceProfile({
      profile,
      sourceRoot: repo_root,
      workspaceRoot: prepared.workspace,
      metaDir: prepared.meta,
    });
  } else {
    throw new Error(`unsupported workspace mode: \`${workspace_mode}\``);
  }

  writeMetadata(path.join(prepared.meta, "run.json"), {
    runner_managed: true,
    workspace_mode,
    repo_root,
    revision,
    cleanup_policy: {
      default: "auto",
      keep_workspace: false,
      keep_run_root: false,
    },
  });
  writeMetadata(path.join(prepared.meta, "workspace-manifest.json"), {
    workspace_mode,
    workspace_root: prepared.workspace,
  });
  const resolvedSkillViewReport = materializeResolvedSkillView({
    targetRoot: prepared.agentsDir,
    entries: skill_entries,
    targetRootRel: ".agents/skills",
  });
  writeMetadata(path.join(prepared.meta, "resolved-skill-view.json"), {
    resolved_skill_view: resolvedSkillViewReport.resolvedSkillView,
    excluded_skills: resolvedSkillViewReport.excludedSkills,
  });
  writeMetadata(path.join(prepared.meta, "environment.json"), env);

  return {
    runRoot: prepared.runRoot,
    workingDirectory: prepared.workspace,
    artifactsDir: prepared.artifacts,
    metaDir: prepared.meta,
    agentsSkillsRoot: prepared.agentsDir,
    resolvedSkillView: resolvedSkillViewReport.resolvedSkillView,
    workspaceMode: workspace_mode,
    repoRoot: repo_root,
    revision,
    workspaceManagedByRunner: true,
    env,
  };
}

export function cleanupCodexRunEnvironment(prepared, options = {}) {
  if (!prepared || typeof prepared !== "object") {
    return;
  }

  const keepWorkspace = options.keepWorkspace === true;
  const keepRunRoot = keepWorkspace || options.keepRunRoot === true;

  // Cleanup must stay scoped to the exact prepared object. We never scan for
  // other `run-*` roots because existing historical worktrees require explicit
  // manual removal.
  if (prepared.workspaceManagedByRunner === true && prepared.workspaceMode === "git-worktree" && !keepWorkspace) {
    removeGitWorktree(prepared.repoRoot, prepared.workingDirectory);
  }

  if (keepRunRoot) {
    const cleanupMetaPath = path.join(prepared.metaDir, "cleanup.json");
    if (fs.existsSync(prepared.metaDir)) {
      writeMetadata(cleanupMetaPath, {
        kept: true,
        keep_workspace: keepWorkspace,
        keep_run_root: keepRunRoot,
        working_directory: prepared.workingDirectory,
      });
    }
    return;
  }

  if (prepared.runRoot && fs.existsSync(prepared.runRoot)) {
    fs.rmSync(prepared.runRoot, { recursive: true, force: true });
  }
}
