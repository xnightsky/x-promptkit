import fs from "node:fs";
import path from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([".git", "node_modules", ".worktrees"]);
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const UNIX_ABSOLUTE_PATH_PATTERN =
  /(^|[\s("'`])((?:\/(?:data|home|opt|private|tmp|Users|var|Volumes|mnt)[^ \n\r\t"'`)<]+))/g;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /(^|[\s("'`])([A-Za-z]:\\[^ \n\r\t"'`)<]+)/g;

function shouldIgnoreDir(entryName, ignoredDirs) {
  return ignoredDirs.has(entryName);
}

export function walkRepoFiles(rootDir, options = {}) {
  const {
    extensions = null,
    ignoredDirs = DEFAULT_IGNORED_DIRS,
  } = options;
  const files = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name, ignoredDirs)) {
          continue;
        }

        visit(path.join(currentDir, entry.name));
        continue;
      }

      const relativePath = path.relative(rootDir, path.join(currentDir, entry.name));
      if (extensions && !extensions.includes(path.extname(relativePath))) {
        continue;
      }

      files.push(relativePath);
    }
  }

  visit(rootDir);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

export function extractRelativeMarkdownLinks(markdown) {
  const links = [];

  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = match[1]?.trim() ?? "";
    if (
      target.length === 0 ||
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    links.push(target.split("#")[0]);
  }

  return links;
}

export function findMissingMarkdownLinks(filePath, markdown, rootDir) {
  const baseDir = path.dirname(path.join(rootDir, filePath));
  const missingLinks = [];

  for (const linkTarget of extractRelativeMarkdownLinks(markdown)) {
    const resolvedTarget = path.resolve(baseDir, linkTarget);
    if (!fs.existsSync(resolvedTarget)) {
      missingLinks.push(linkTarget);
    }
  }

  return missingLinks;
}

export function findAbsolutePathMatches(text) {
  const matches = new Set();

  for (const pattern of [UNIX_ABSOLUTE_PATH_PATTERN, WINDOWS_ABSOLUTE_PATH_PATTERN]) {
    for (const match of text.matchAll(pattern)) {
      matches.add(match[2]);
    }
  }

  return [...matches].sort((left, right) => left.localeCompare(right));
}

export function classifyFixturePath(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");

  if (normalizedPath.includes("/.recall/") || normalizedPath.startsWith(".recall/")) {
    // Broken fixtures are intentional contract negatives and should stay invalid.
    return {
      kind: "recall",
      expectValid: !path.basename(normalizedPath).startsWith("broken-"),
    };
  }

  if (normalizedPath.startsWith("iitests/") && normalizedPath.endsWith(".yaml")) {
    return {
      kind: "iitest",
      expectValid: true,
    };
  }

  return null;
}

export function formatFailures(header, failures) {
  if (failures.length === 0) {
    return `${header}: PASS`;
  }

  return [`${header}: FAIL`, ...failures.map((failure) => `- ${failure}`)].join("\n");
}
