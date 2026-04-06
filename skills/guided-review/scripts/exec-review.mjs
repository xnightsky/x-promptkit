import { spawnSync } from "node:child_process";

export function buildCodexInvocation({ workspacePlan, options, prompt }) {
  const args = ["-C", workspacePlan.resolvedWorktree, "review"];

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
  };
}

export function executeCodexReview(invocation, deps = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    spawn = spawnSync,
  } = deps;

  return spawn(invocation.command, invocation.args, {
    cwd,
    env,
    encoding: "utf8",
  });
}
