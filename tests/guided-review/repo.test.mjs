import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveRepoPath } from "../../skills/guided-review/scripts/repo.mjs";

test("resolveRepoPath defaults to the current repository", () => {
  const resolved = resolveRepoPath(".", process.cwd());
  assert.equal(path.resolve(resolved), path.resolve(process.cwd()));
});

test("resolveRepoPath rejects non-git directories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-non-git-"));

  assert.throws(
    () => resolveRepoPath(tempDir, process.cwd()),
    /repo path is not inside a git repository/,
  );
});
