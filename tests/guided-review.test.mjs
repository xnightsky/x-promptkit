import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildReviewPrompt, parseArgs } from "../scripts/guided-review/run-review.mjs";

const cwd = process.cwd();
const node = process.execPath;
const scriptPath = path.join(cwd, "scripts", "guided-review", "run-review.mjs");

function runScript(args = [], options = {}) {
  return execFileSync(node, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    ...options,
  });
}

function createTempWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-worktree-"));
}

function createFakeCodex() {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-bin-"));
  const logPath = path.join(binDir, "codex-log.json");
  const codexPath = path.join(binDir, "codex");
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env node
import fs from "node:fs";
const [, , ...args] = process.argv;
fs.writeFileSync(process.env.GUIDED_REVIEW_FAKE_CODEX_LOG, JSON.stringify({ args }, null, 2));
process.stdout.write("fake codex ok\\n");
`,
  );
  fs.chmodSync(codexPath, 0o755);
  return { binDir, logPath };
}

test("parseArgs defaults to uncommitted mode", () => {
  const parsed = parseArgs(["--worktree", "."]);

  assert.equal(parsed.worktree, ".");
  assert.equal(parsed.mode, "uncommitted");
});

test("buildReviewPrompt appends extra reviewer context without replacing the default prompt", () => {
  const prompt = buildReviewPrompt("Focus on backward compatibility.");

  assert.match(prompt, /guided-code-review workflow/);
  assert.match(prompt, /Additional reviewer context/);
  assert.match(prompt, /Focus on backward compatibility/);
});

test("script requires worktree", () => {
  assert.throws(() => runScript([]), (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /missing required `--worktree`/);
    return true;
  });
});

test("script defaults to uncommitted mode in dry-run output", () => {
  const worktree = createTempWorktree();
  const output = runScript(["--worktree", worktree, "--dry-run"]);

  assert.match(output, /guided-review dry run/);
  assert.match(output, /review --uncommitted/);
});

test("script passes base mode to codex review", () => {
  const worktree = createTempWorktree();
  const fakeCodex = createFakeCodex();

  const output = runScript(["--worktree", worktree, "--base", "main"], {
    env: {
      PATH: `${fakeCodex.binDir}:${process.env.PATH ?? ""}`,
      GUIDED_REVIEW_FAKE_CODEX_LOG: fakeCodex.logPath,
    },
  });

  assert.match(output, /fake codex ok/);
  const call = JSON.parse(fs.readFileSync(fakeCodex.logPath, "utf8"));
  assert.deepEqual(call.args.slice(0, 5), ["-C", worktree, "review", "--base", "main"]);
});

test("script passes commit mode and title to codex review", () => {
  const worktree = createTempWorktree();
  const fakeCodex = createFakeCodex();

  runScript(["--worktree", worktree, "--commit", "abc123", "--title", "Review title"], {
    env: {
      PATH: `${fakeCodex.binDir}:${process.env.PATH ?? ""}`,
      GUIDED_REVIEW_FAKE_CODEX_LOG: fakeCodex.logPath,
    },
  });

  const call = JSON.parse(fs.readFileSync(fakeCodex.logPath, "utf8"));
  assert.deepEqual(call.args.slice(0, 7), [
    "-C",
    worktree,
    "review",
    "--commit",
    "abc123",
    "--title",
    "Review title",
  ]);
});

test("script rejects conflicting diff selectors", () => {
  const worktree = createTempWorktree();

  assert.throws(() => runScript(["--worktree", worktree, "--base", "main", "--commit", "abc123"]), (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /only one of `--uncommitted`, `--base`, or `--commit` may be specified/);
    return true;
  });
});

test("script rejects missing worktree paths", () => {
  assert.throws(() => runScript(["--worktree", "missing-worktree"]), (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /worktree path does not exist/);
    return true;
  });
});

test("script reports missing codex executable", () => {
  const worktree = createTempWorktree();

  assert.throws(
    () =>
      runScript(["--worktree", worktree], {
        env: {
          PATH: "",
        },
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /`codex` command is not available in PATH/);
      return true;
    },
  );
});

test("script appends custom prompt text to the default prompt", () => {
  const worktree = createTempWorktree();
  const fakeCodex = createFakeCodex();

  runScript(["--worktree", worktree, "--prompt", "Focus on retry safety."], {
    env: {
      PATH: `${fakeCodex.binDir}:${process.env.PATH ?? ""}`,
      GUIDED_REVIEW_FAKE_CODEX_LOG: fakeCodex.logPath,
    },
  });

  const call = JSON.parse(fs.readFileSync(fakeCodex.logPath, "utf8"));
  const prompt = call.args.at(-1);
  assert.match(prompt, /guided-code-review workflow/);
  assert.match(prompt, /Focus on retry safety/);
});
