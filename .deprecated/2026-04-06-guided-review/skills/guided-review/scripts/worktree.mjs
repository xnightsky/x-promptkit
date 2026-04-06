import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeDisplayPath, runGit } from "./repo.mjs";

export function resolveWorktreePath(worktree, cwd = process.cwd()) {
  const resolvedPath = path.resolve(cwd, worktree);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`worktree path does not exist: \`${normalizeDisplayPath(cwd, resolvedPath)}\``);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`worktree path is not a directory: \`${normalizeDisplayPath(cwd, resolvedPath)}\``);
  }

  return resolvedPath;
}

export function planReviewWorkspace(options, repoRoot, cwd = process.cwd()) {
  if (options.worktree) {
    const resolvedWorktree = resolveWorktreePath(options.worktree, cwd);
    return {
      repoRoot,
      resolvedWorktree,
      displayWorktree: normalizeDisplayPath(cwd, resolvedWorktree),
      source: "explicit-worktree",
      headRef: options.head ?? "HEAD",
      cleanup() {},
    };
  }

  if (options.mode === "base" && options.head && options.head !== "HEAD") {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-worktree-"));
    const resolvedWorktree = path.join(tempRoot, "workspace");
    const addResult = runGit(["-C", repoRoot, "worktree", "add", "--detach", resolvedWorktree, options.head]);

    if (addResult.status !== 0) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      throw new Error(`failed to create review worktree for \`${options.head}\``);
    }

    return {
      repoRoot,
      resolvedWorktree,
      displayWorktree: normalizeDisplayPath(cwd, resolvedWorktree),
      source: "ephemeral-head-worktree",
      headRef: options.head,
      cleanup() {
        runGit(["-C", repoRoot, "worktree", "remove", "--force", resolvedWorktree]);
        fs.rmSync(tempRoot, { recursive: true, force: true });
      },
    };
  }

  return {
    repoRoot,
    resolvedWorktree: repoRoot,
    displayWorktree: normalizeDisplayPath(cwd, repoRoot),
    source: "repo-root",
    headRef: options.head ?? "HEAD",
    cleanup() {},
  };
}
