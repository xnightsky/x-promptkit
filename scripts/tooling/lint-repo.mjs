#!/usr/bin/env node
import fs from "node:fs";

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

console.log(formatFailures("lint:repo", failures));
process.exit(failures.length === 0 ? 0 : 1);
