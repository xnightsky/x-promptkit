import test from "node:test";
import assert from "node:assert/strict";

import { buildReviewContext } from "../../skills/guided-review/scripts/git-context.mjs";

test("buildReviewContext returns a branch-vs-branch skeleton", () => {
  const context = buildReviewContext(
    {
      mode: "base",
      base: "HEAD",
      head: "HEAD",
      commit: null,
    },
    {
      repoRoot: process.cwd(),
      resolvedWorktree: process.cwd(),
      displayWorktree: ".",
      source: "repo-root",
      headRef: "HEAD",
    },
  );

  assert.match(context, /Prepared review context:/);
  assert.match(context, /scope: branch-vs-branch/);
  assert.match(context, /The review scope above was precomputed by the skill-local script/);
});

test("buildReviewContext returns an uncommitted skeleton", () => {
  const context = buildReviewContext(
    {
      mode: "uncommitted",
      base: null,
      head: null,
      commit: null,
    },
    {
      repoRoot: process.cwd(),
      resolvedWorktree: process.cwd(),
      displayWorktree: ".",
      source: "repo-root",
      headRef: "HEAD",
    },
  );

  assert.match(context, /scope: uncommitted/);
  assert.match(context, /git_status:/);
});
