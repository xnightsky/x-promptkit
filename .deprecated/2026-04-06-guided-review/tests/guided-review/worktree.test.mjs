import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { planReviewWorkspace, resolveWorktreePath } from "../../skills/guided-review/scripts/worktree.mjs";
import { createBranchReviewFixture } from "./test-helpers.mjs";

test("resolveWorktreePath validates an explicit worktree directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-worktree-explicit-"));
  const resolved = resolveWorktreePath(tempDir, process.cwd());

  assert.equal(resolved, tempDir);
});

test("planReviewWorkspace uses repo root when no explicit worktree is provided", () => {
  const repoRoot = process.cwd();
  const plan = planReviewWorkspace({ mode: "uncommitted", worktree: null, head: null }, repoRoot, process.cwd());

  assert.equal(plan.resolvedWorktree, repoRoot);
  assert.equal(plan.source, "repo-root");
});

test("planReviewWorkspace keeps repo root when base mode uses HEAD", () => {
  const repoRoot = process.cwd();
  const plan = planReviewWorkspace(
    { mode: "base", base: "HEAD", head: "HEAD", worktree: null },
    repoRoot,
    process.cwd(),
  );

  assert.equal(plan.source, "repo-root");
  plan.cleanup();
});

test("planReviewWorkspace creates and cleans up an ephemeral head worktree for branch review", () => {
  const fixture = createBranchReviewFixture();

  try {
    const plan = planReviewWorkspace(
      {
        mode: "base",
        base: fixture.base,
        head: fixture.head,
        worktree: null,
      },
      fixture.repoRoot,
      fixture.repoRoot,
    );

    assert.equal(plan.source, "ephemeral-head-worktree");
    assert.equal(plan.headRef, fixture.head);
    assert.equal(fs.existsSync(plan.resolvedWorktree), true);
    assert.match(plan.displayWorktree, /guided-review-worktree-/);

    const tempRoot = path.dirname(plan.resolvedWorktree);
    plan.cleanup();

    assert.equal(fs.existsSync(plan.resolvedWorktree), false);
    assert.equal(fs.existsSync(tempRoot), false);
  } finally {
    fixture.cleanup();
  }
});
