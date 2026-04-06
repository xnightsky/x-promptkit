import { runGit } from "./repo.mjs";

const FILE_LIMIT = 30;
const COMMIT_LIMIT = 20;

export function buildReviewContext(options, workspacePlan) {
  if (options.mode === "base") {
    return buildBaseContext(options, workspacePlan);
  }

  if (options.mode === "commit") {
    return buildCommitContext(options, workspacePlan);
  }

  return buildUncommittedContext(workspacePlan);
}

function buildBaseContext(options, workspacePlan) {
  const headRef = workspacePlan.headRef;
  const mergeBase = gitRead(workspacePlan.repoRoot, ["merge-base", options.base, headRef]);
  const commitList = gitRead(workspacePlan.repoRoot, [
    "log",
    "--oneline",
    "--no-decorate",
    `${options.base}..${headRef}`,
  ]);
  const diffStat = gitRead(workspacePlan.repoRoot, [
    "diff",
    "--stat",
    `${options.base}...${headRef}`,
  ]);
  const changedFiles = gitRead(workspacePlan.repoRoot, [
    "diff",
    "--name-only",
    `${options.base}...${headRef}`,
  ]);

  return [
    "Prepared review context:",
    `- scope: branch-vs-branch`,
    `- repo: ${workspacePlan.repoRoot}`,
    `- workspace: ${workspacePlan.displayWorktree}`,
    `- worktree_source: ${workspacePlan.source}`,
    `- base: ${options.base}`,
    `- head: ${headRef}`,
    `- merge_base: ${mergeBase || "(none)"}`,
    "- commit_summary:",
    formatList(commitList, COMMIT_LIMIT),
    "- diff_stat:",
    formatBlock(diffStat),
    "- changed_files:",
    formatList(changedFiles, FILE_LIMIT),
    "The review scope above was precomputed by the skill-local script. Reuse it instead of redoing broad git enumeration unless local evidence conflicts with it.",
  ].join("\n");
}

function buildCommitContext(options, workspacePlan) {
  const commitSummary = gitRead(workspacePlan.repoRoot, [
    "show",
    "--stat",
    "--format=medium",
    options.commit,
  ]);

  return [
    "Prepared review context:",
    `- scope: commit`,
    `- repo: ${workspacePlan.repoRoot}`,
    `- workspace: ${workspacePlan.displayWorktree}`,
    `- worktree_source: ${workspacePlan.source}`,
    `- commit: ${options.commit}`,
    "- commit_summary:",
    formatBlock(commitSummary),
    "The review scope above was precomputed by the skill-local script. Reuse it instead of redoing broad git enumeration unless local evidence conflicts with it.",
  ].join("\n");
}

function buildUncommittedContext(workspacePlan) {
  const status = gitRead(workspacePlan.resolvedWorktree, ["status", "--short"]);
  const diffStat = gitRead(workspacePlan.resolvedWorktree, ["diff", "--stat"]);

  return [
    "Prepared review context:",
    `- scope: uncommitted`,
    `- repo: ${workspacePlan.repoRoot}`,
    `- workspace: ${workspacePlan.displayWorktree}`,
    `- worktree_source: ${workspacePlan.source}`,
    "- git_status:",
    formatList(status, FILE_LIMIT),
    "- diff_stat:",
    formatBlock(diffStat),
    "The review scope above was precomputed by the skill-local script. Reuse it instead of redoing broad git enumeration unless local evidence conflicts with it.",
  ].join("\n");
}

function gitRead(cwd, args) {
  const result = runGit(["-C", cwd, ...args]);
  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function formatList(text, limit) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "  (none)";
  }

  const visible = lines.slice(0, limit).map((line) => `  - ${line}`);
  if (lines.length > limit) {
    visible.push(`  - ... truncated ${lines.length - limit} more`);
  }

  return visible.join("\n");
}

function formatBlock(text) {
  if (!text) {
    return "  (none)";
  }

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join("\n");
}
