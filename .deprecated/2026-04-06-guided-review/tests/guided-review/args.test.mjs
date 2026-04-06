import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "../../skills/guided-review/scripts/args.mjs";

test("parseArgs defaults repo to current directory and mode to uncommitted", () => {
  const parsed = parseArgs([]);

  assert.equal(parsed.repo, ".");
  assert.equal(parsed.mode, "uncommitted");
  assert.equal(parsed.worktree, null);
});

test("parseArgs accepts repo, base, head, and prompt", () => {
  const parsed = parseArgs([
    "--repo",
    ".",
    "--base",
    "origin/main",
    "--head",
    "origin/feat/demo",
    "--prompt",
    "Focus on compatibility.",
  ]);

  assert.equal(parsed.repo, ".");
  assert.equal(parsed.mode, "base");
  assert.equal(parsed.base, "origin/main");
  assert.equal(parsed.head, "origin/feat/demo");
  assert.equal(parsed.prompt, "Focus on compatibility.");
});

test("parseArgs rejects head without base", () => {
  assert.throws(() => parseArgs(["--head", "origin/feat/demo"]), /`--head` requires `--base`/);
});
