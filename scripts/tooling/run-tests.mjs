#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const testFiles = walkRepoFiles(rootDir, {
  extensions: [".mjs"],
}).filter((filePath) => {
  // Keep fast/unit-style Node tests under tests/ and high-side-effect Node
  // integration cases under integration-tests/, while ignoring the Markdown/YAML
  // integration assets that live alongside them.
  const normalizedPath = filePath.split(path.sep).join("/");
  return (
    (normalizedPath.startsWith("tests/") || normalizedPath.startsWith("integration-tests/")) &&
    normalizedPath.endsWith(".test.mjs")
  );
});

if (testFiles.length === 0) {
  console.error("test: no active test files were found under tests/ or integration-tests/");
  process.exit(1);
}

// The maintained suite includes harness cases that patch fs globals and
// create/remove real git worktrees. Run the repo test entry serially so the
// default verification command stays deterministic across environments.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
