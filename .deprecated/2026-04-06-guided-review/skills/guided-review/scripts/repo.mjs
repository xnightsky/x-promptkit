import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function resolveRepoPath(repoPath = ".", cwd = process.cwd()) {
  const candidate = path.resolve(cwd, repoPath);
  if (!fs.existsSync(candidate)) {
    throw new Error(`repo path does not exist: \`${normalizeDisplayPath(cwd, candidate)}\``);
  }

  const result = runGit(["-C", candidate, "rev-parse", "--show-toplevel"]);
  if (result.status !== 0) {
    throw new Error(`repo path is not inside a git repository: \`${normalizeDisplayPath(cwd, candidate)}\``);
  }

  return result.stdout.trim();
}

export function normalizeDisplayPath(cwd, targetPath) {
  const relativePath = path.relative(cwd, targetPath);
  return relativePath.length === 0 ? "." : relativePath.split(path.sep).join("/");
}

export function formatCommandForDisplay(command, args, cwd = process.cwd()) {
  return [command, ...args.map((arg) => quoteForDisplay(cwd, arg))].join(" ");
}

export function runGit(args, options = {}) {
  return spawnSync("git", args, {
    encoding: "utf8",
    ...options,
  });
}

function quoteForDisplay(cwd, arg) {
  if (typeof arg === "string" && fs.existsSync(arg)) {
    return normalizeDisplayPath(cwd, path.resolve(cwd, arg));
  }

  if (typeof arg === "string" && /[\s"`]/.test(arg)) {
    return JSON.stringify(arg);
  }

  return String(arg);
}
