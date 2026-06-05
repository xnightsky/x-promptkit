#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const testFiles = walkRepoFiles(rootDir, {
  extensions: [".mjs"],
}).filter((filePath) => {
  // `npm test` is the unit-test entrypoint. Keep it scoped to the low-side-
  // effect suite under `tests/` and leave all environment/runtime integration
  // coverage, including token-backed host validation, to dedicated `iitest`
  // entrypoints. Token suites are named `*.token.ittest.mjs` by convention;
  // the `.token.test.mjs` exclusion below is a guard against legacy naming.
  const normalizedPath = filePath.split(path.sep).join("/");
  return (
    normalizedPath.startsWith("tests/") &&
    normalizedPath.endsWith(".test.mjs") &&
    !normalizedPath.endsWith(".token.test.mjs")
  );
});

if (testFiles.length === 0) {
  console.error("test: no active unit test files were found under tests/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
