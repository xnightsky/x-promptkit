#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HELP_TEXT, parseArgs } from "./args.mjs";
import { buildCodexInvocation, executeCodexReview } from "./exec-review.mjs";
import { buildReviewContext } from "./git-context.mjs";
import { buildGuidedReviewPrompt } from "./prompt.mjs";
import { formatCommandForDisplay, normalizeDisplayPath, resolveRepoPath } from "./repo.mjs";
import { planReviewWorkspace } from "./worktree.mjs";

export function runCli(argv, deps = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    spawn,
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

  let repoRoot;
  let workspacePlan;
  try {
    repoRoot = resolveRepoPath(options.repo, cwd);
    workspacePlan = planReviewWorkspace(options, repoRoot, cwd);
  } catch (error) {
    stderr.write(`guided-review: ${error.message}\n`);
    return 1;
  }

  try {
    const contextText = buildReviewContext(options, workspacePlan);
    const prompt = buildGuidedReviewPrompt({
      contextText,
      extraPrompt: options.prompt,
    });
    const invocation = buildCodexInvocation({
      workspacePlan,
      options,
      prompt,
    });

    if (options.dryRun) {
      stdout.write("guided-review dry run\n");
      stdout.write(`- repo: \`${normalizeDisplayPath(cwd, repoRoot)}\`\n`);
      stdout.write(`- worktree: \`${workspacePlan.displayWorktree}\`\n`);
      stdout.write(`- worktree-source: \`${workspacePlan.source}\`\n`);
      if (options.base) {
        stdout.write(`- base: \`${options.base}\`\n`);
      }
      if (workspacePlan.headRef && options.mode === "base") {
        stdout.write(`- head: \`${workspacePlan.headRef}\`\n`);
      }
      if (options.commit) {
        stdout.write(`- commit: \`${options.commit}\`\n`);
      }
      stdout.write(`- command: \`${formatCommandForDisplay(invocation.command, invocation.args, cwd)}\`\n`);
      stdout.write("- prepared-review-context:\n");
      stdout.write(`${contextText}\n`);
      stdout.write("- prompt:\n");
      stdout.write(`${prompt}\n`);
      return 0;
    }

    const child = executeCodexReview(invocation, {
      cwd,
      env,
      spawn,
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
  } finally {
    workspacePlan?.cleanup?.();
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  process.exitCode = runCli(process.argv.slice(2));
}
