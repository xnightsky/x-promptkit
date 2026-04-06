import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

export function createBranchReviewFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-branch-fixture-"));

  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["config", "user.name", "Guided Review Tests"]);
  runGit(repoRoot, ["config", "user.email", "guided-review-tests@example.com"]);

  fs.writeFileSync(path.join(repoRoot, "review-target.txt"), "base\n");
  runGit(repoRoot, ["add", "review-target.txt"]);
  runGit(repoRoot, ["commit", "-m", "base commit"]);
  runGit(repoRoot, ["branch", "-M", "main"]);

  runGit(repoRoot, ["checkout", "-b", "feature"]);
  fs.appendFileSync(path.join(repoRoot, "review-target.txt"), "feature\n");
  runGit(repoRoot, ["commit", "-am", "feature change"]);

  return {
    repoRoot,
    base: "main",
    head: "feature",
    cleanup() {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    },
  };
}
