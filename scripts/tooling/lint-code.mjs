#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { formatFailures, walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const codeFiles = walkRepoFiles(rootDir, {
  extensions: [".mjs"],
}).filter((filePath) => {
  // Syntax-check all runtime .mjs files except vendored copies which are
  // validated by the sync:codex-bridge-runtime consistency guarantee.
  if (filePath.includes("/vendor/") || filePath.includes("\\vendor\\")) {
    return false;
  }
  return (
    filePath.startsWith("scripts/") ||
    filePath.startsWith("tests/") ||
    filePath.startsWith("skills-def/") ||
    filePath.startsWith("runtime/") ||
    filePath.startsWith("integration-tests/")
  );
});

const failures = [];

for (const filePath of codeFiles) {
  // Keep code lint lightweight: syntax validity is the hard gate for runtime scripts and tests.
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures.push(`${filePath}: ${result.stderr.trim() || "syntax check failed"}`);
  }
}

console.log(formatFailures("lint:code", failures));
process.exit(failures.length === 0 ? 0 : 1);
