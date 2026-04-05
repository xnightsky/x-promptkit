#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HELP_TEXT = `Usage: npm run guided-review -- --worktree <path> [--uncommitted | --base <branch> | --commit <sha>] [--title <text>] [--prompt <text>] [--dry-run]

Options:
  --worktree <path>   Review target. Required.
  --uncommitted       Review staged, unstaged, and untracked changes.
  --base <branch>     Review changes against the given base branch.
  --commit <sha>      Review the changes introduced by a commit.
  --title <text>      Optional review title passed through to codex review.
  --prompt <text>     Extra review guidance appended after the default prompt.
  --dry-run           Print the generated command and prompt without executing it.
  --help              Print this message.
`;

const DEFAULT_PROMPT = [
  "Review this change using a guided-code-review workflow.",
  "Focus on one concrete review point at a time instead of scanning with a broad checklist.",
  "Ask a few high-value questions first, summarize what is already known, and only escalate when there is evidence.",
  "If a technical detail is unclear, clarify it from code, tests, repository docs, official docs, or public sources as needed, then return to the current review point.",
  "When the concern is ready, phrase feedback with concern, why it matters, evidence, and a suggested question or change.",
].join(" ");

export function parseArgs(argv) {
  const options = {
    worktree: null,
    mode: "uncommitted",
    base: null,
    commit: null,
    title: null,
    prompt: null,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--uncommitted") {
      ensureSingleMode(options, "uncommitted");
      options.mode = "uncommitted";
      continue;
    }

    if (arg === "--worktree" || arg === "--base" || arg === "--commit" || arg === "--title" || arg === "--prompt") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`missing value for \`${arg}\``);
      }

      index += 1;

      if (arg === "--worktree") {
        options.worktree = next;
      } else if (arg === "--base") {
        ensureSingleMode(options, "base");
        options.mode = "base";
        options.base = next;
      } else if (arg === "--commit") {
        ensureSingleMode(options, "commit");
        options.mode = "commit";
        options.commit = next;
      } else if (arg === "--title") {
        options.title = next;
      } else if (arg === "--prompt") {
        options.prompt = next;
      }

      continue;
    }

    throw new Error(`unknown argument: \`${arg}\``);
  }

  return options;
}

function ensureSingleMode(options, nextMode) {
  if (options.mode !== "uncommitted" || options.base || options.commit) {
    throw new Error("only one of `--uncommitted`, `--base`, or `--commit` may be specified");
  }

  if (nextMode === "uncommitted") {
    return;
  }
}

export function buildReviewPrompt(extraPrompt = null) {
  if (!extraPrompt) {
    return DEFAULT_PROMPT;
  }

  // Keep the built-in workflow as the stable front-door. Extra prompt text can narrow
  // the review, but should not silently replace the guided-review behavior.
  return `${DEFAULT_PROMPT}\n\nAdditional reviewer context:\n${extraPrompt}`;
}

export function resolveWorktreePath(worktree, cwd = process.cwd()) {
  if (!worktree) {
    throw new Error("missing required `--worktree`");
  }

  const resolvedPath = path.resolve(cwd, worktree);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`worktree path does not exist: \`${normalizeDisplayPath(cwd, resolvedPath)}\``);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`worktree path is not a directory: \`${normalizeDisplayPath(cwd, resolvedPath)}\``);
  }

  return resolvedPath;
}

export function buildCodexCommand(options, cwd = process.cwd()) {
  const resolvedWorktree = resolveWorktreePath(options.worktree, cwd);
  const prompt = buildReviewPrompt(options.prompt);
  const args = ["-C", resolvedWorktree, "review"];

  // Default to uncommitted changes so the wrapper stays useful with the smallest invocation,
  // while still allowing callers to pin a base branch or commit when they need a stable diff.
  if (options.mode === "base") {
    args.push("--base", options.base);
  } else if (options.mode === "commit") {
    args.push("--commit", options.commit);
  } else {
    args.push("--uncommitted");
  }

  if (options.title) {
    args.push("--title", options.title);
  }

  args.push(prompt);

  return {
    command: "codex",
    args,
    prompt,
    resolvedWorktree,
    displayWorktree: normalizeDisplayPath(cwd, resolvedWorktree),
  };
}

export function runCli(argv, deps = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    spawn = spawnSync,
  } = deps;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`guided-review: ${error.message}\n`);
    stderr.write(HELP_TEXT);
    return 1;
  }

  if (options.help) {
    stdout.write(HELP_TEXT);
    return 0;
  }

  let invocation;
  try {
    invocation = buildCodexCommand(options, cwd);
  } catch (error) {
    stderr.write(`guided-review: ${error.message}\n`);
    return 1;
  }

  if (options.dryRun) {
    stdout.write("guided-review dry run\n");
    stdout.write(`- worktree: \`${invocation.displayWorktree}\`\n`);
    stdout.write(`- command: \`${formatCommand(invocation.command, invocation.args, cwd)}\`\n`);
    stdout.write("- prompt:\n");
    stdout.write(`${invocation.prompt}\n`);
    return 0;
  }

  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env,
    encoding: "utf8",
  });

  if (child.error) {
    if (child.error.code === "ENOENT") {
      stderr.write("guided-review: `codex` command is not available in PATH\n");
      return 1;
    }

    stderr.write(`guided-review: failed to start \`codex review\`: ${child.error.message}\n`);
    return 1;
  }

  if (child.stdout) {
    stdout.write(child.stdout);
  }
  if (child.stderr) {
    stderr.write(child.stderr);
  }

  if (child.status !== 0) {
    stderr.write(`guided-review: \`codex review\` exited with code ${child.status}\n`);
  }

  return child.status ?? 1;
}

function normalizeDisplayPath(cwd, targetPath) {
  const relativePath = path.relative(cwd, targetPath);
  return relativePath.length === 0 ? "." : relativePath.split(path.sep).join("/");
}

function formatCommand(command, args, cwd) {
  return [command, ...args.map((arg) => quoteForDisplay(cwd, arg))].join(" ");
}

function quoteForDisplay(cwd, arg) {
  if (fs.existsSync(arg)) {
    return normalizeDisplayPath(cwd, path.resolve(cwd, arg));
  }

  if (/[\s"`]/.test(arg)) {
    return JSON.stringify(arg);
  }

  return arg;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  process.exitCode = runCli(process.argv.slice(2));
}
