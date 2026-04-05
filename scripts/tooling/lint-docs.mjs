#!/usr/bin/env node
import fs from "node:fs";

import { findMissingMarkdownLinks, formatFailures, walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const markdownFiles = walkRepoFiles(rootDir, {
  extensions: [".md"],
}).filter((filePath) => !filePath.startsWith(".worktrees/"));

const failures = [];

for (const filePath of markdownFiles) {
  const markdown = fs.readFileSync(filePath, "utf8");
  // Markdown links are part of the repo contract; stale relative links should fail early.
  const missingLinks = findMissingMarkdownLinks(filePath, markdown, rootDir);

  for (const linkTarget of missingLinks) {
    failures.push(`${filePath}: missing relative link target \`${linkTarget}\``);
  }
}

console.log(formatFailures("lint:docs", failures));
process.exit(failures.length === 0 ? 0 : 1);
