#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const testFiles = walkRepoFiles(rootDir, {
  extensions: [".mjs"],
}).filter((filePath) => {
  const normalizedPath = filePath.split(path.sep).join("/");
  return (
    normalizedPath.startsWith("integration-tests/") &&
    normalizedPath.endsWith(".test.mjs") &&
    !normalizedPath.endsWith(".token.test.mjs")
  );
});

if (testFiles.length === 0) {
  console.error("iitest: no active non-token integration test files were found under integration-tests/");
  process.exit(1);
}

// Integration tests create temp workspaces, artifacts, and harness-managed
// environments. Run them serially so shared fixture assumptions stay stable.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
