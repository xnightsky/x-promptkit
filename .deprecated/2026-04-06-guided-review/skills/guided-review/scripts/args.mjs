export const HELP_TEXT = `Usage: npm run guided-review -- [--repo <path>] [--worktree <path>] [--uncommitted | --base <branch> [--head <ref>] | --commit <sha>] [--title <text>] [--prompt <text>] [--dry-run]

Options:
  --repo <path>       Skill development repo. Defaults to the current repo.
  --worktree <path>   Optional review target override for an existing worktree.
  --uncommitted       Review staged, unstaged, and untracked changes.
  --base <branch>     Review changes against the given base branch.
  --head <ref>        Optional head ref for branch-vs-branch review.
  --commit <sha>      Review the changes introduced by a commit.
  --title <text>      Optional review title passed through to codex review.
  --prompt <text>     Extra review guidance appended after the default prompt.
  --dry-run           Print the resolved context and generated command without executing it.
  --help              Print this message.
`;

export function parseArgs(argv) {
  const options = {
    repo: ".",
    worktree: null,
    mode: "uncommitted",
    base: null,
    head: null,
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

    if ([
      "--repo",
      "--worktree",
      "--base",
      "--head",
      "--commit",
      "--title",
      "--prompt",
    ].includes(arg)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`missing value for \`${arg}\``);
      }

      index += 1;

      if (arg === "--repo") {
        options.repo = next;
      } else if (arg === "--worktree") {
        options.worktree = next;
      } else if (arg === "--base") {
        ensureSingleMode(options, "base");
        options.mode = "base";
        options.base = next;
      } else if (arg === "--head") {
        options.head = next;
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

  if (options.head && options.mode !== "base") {
    throw new Error("`--head` requires `--base`");
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
