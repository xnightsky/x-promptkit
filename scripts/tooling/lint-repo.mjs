#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { findAbsolutePathMatches, formatFailures, walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const requiredScripts = [
  "lint",
  "lint:code",
  "lint:docs",
  "lint:repo",
  "check",
  "check:fixtures",
  "verify",
];
const policyDocs = [
  {
    path: "AGENTS.md",
    requiredSnippets: ["lint", "注释", "verify"],
  },
  {
    path: "README.md",
    requiredSnippets: ["npm run lint", "npm run verify", "开发流程"],
  },
  {
    path: "docs/README.md",
    requiredSnippets: ["npm run lint", "npm run verify", "注释"],
  },
  {
    path: "skills/recall-evaluator/README.md",
    requiredSnippets: ["npm run lint", "npm run check", "npm run verify"],
  },
];
const textFiles = walkRepoFiles(rootDir, {
  extensions: [".json", ".md", ".mjs", ".txt", ".yaml", ".yml"],
});
const failures = [];
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const scriptName of requiredScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`package.json: missing script \`${scriptName}\``);
  }
}

for (const filePath of textFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  // Absolute local paths make fixtures and docs non-portable across machines.
  const matches = findAbsolutePathMatches(content);

  for (const match of matches) {
    failures.push(`${filePath}: contains forbidden absolute path \`${match}\``);
  }
}

for (const policyDoc of policyDocs) {
  const content = fs.readFileSync(policyDoc.path, "utf8");

  for (const snippet of policyDoc.requiredSnippets) {
    if (!content.includes(snippet)) {
      failures.push(`${policyDoc.path}: missing required policy snippet \`${snippet}\``);
    }
  }
}

// Vendor directories must stay in sync with their upstream source. Drift
// between runtime/ and vendored copies causes silent behavioral divergence.
const vendorSyncTargets = [
  {
    source: "runtime/codex-bridge",
    vendor: "skills/codex-bridge-minimax-worker-installer/vendor/codex-bridge",
  },
];

for (const { source, vendor } of vendorSyncTargets) {
  const sourceDir = path.join(rootDir, source);
  const vendorDir = path.join(rootDir, vendor);
  if (!fs.existsSync(vendorDir)) {
    failures.push(`${vendor}: vendor directory missing (run \`npm run sync:codex-bridge-runtime\`)`);
    continue;
  }
  const sourceFiles = walkRepoFiles(sourceDir, { ignoredDirs: new Set(["node_modules"]) });
  for (const relFile of sourceFiles) {
    const srcPath = path.join(sourceDir, relFile);
    const vndPath = path.join(vendorDir, relFile);
    if (!fs.existsSync(vndPath)) {
      failures.push(`${vendor}/${relFile}: missing in vendor (run \`npm run sync:codex-bridge-runtime\`)`);
      continue;
    }
    const srcHash = createHash("md5").update(fs.readFileSync(srcPath)).digest("hex");
    const vndHash = createHash("md5").update(fs.readFileSync(vndPath)).digest("hex");
    if (srcHash !== vndHash) {
      failures.push(`${vendor}/${relFile}: out of sync with ${source}/${relFile}`);
    }
  }
}

console.log(formatFailures("lint:repo", failures));
process.exit(failures.length === 0 ? 0 : 1);
