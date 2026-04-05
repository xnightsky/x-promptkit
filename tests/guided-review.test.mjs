import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildReviewPrompt, parseArgs, runCli } from "../scripts/guided-review/run-review.mjs";

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

function createCaptureStream() {
  let buffer = "";
  return {
    stream: {
      write(chunk) {
        buffer += String(chunk);
        return true;
      },
    },
    read() {
      return buffer;
    },
  };
}

function createSpawnRecorder(result = {}) {
  const calls = [];
  return {
    calls,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: "fake codex ok\n",
        stderr: "",
        ...result,
      };
    },
  };
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

test("runCli passes base mode to codex review with an injected spawn bridge", () => {
  const worktree = createTempWorktree();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const recorder = createSpawnRecorder();

  const exitCode = runCli(["--worktree", worktree, "--base", "main"], {
    cwd,
    env: process.env,
    stdout: stdout.stream,
    stderr: stderr.stream,
    spawn: recorder.spawn,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), "");
  assert.match(stdout.read(), /fake codex ok/);
  assert.deepEqual(recorder.calls[0].args.slice(0, 5), ["-C", worktree, "review", "--base", "main"]);
});

test("runCli passes commit mode and title to codex review with an injected spawn bridge", () => {
  const worktree = createTempWorktree();
  const stdout = createCaptureStream();
  const recorder = createSpawnRecorder();

  const exitCode = runCli(["--worktree", worktree, "--commit", "abc123", "--title", "Review title"], {
    cwd,
    env: process.env,
    stdout: stdout.stream,
    stderr: createCaptureStream().stream,
    spawn: recorder.spawn,
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.read(), /fake codex ok/);
  assert.deepEqual(recorder.calls[0].args.slice(0, 7), [
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

test("runCli appends custom prompt text to the default prompt", () => {
  const worktree = createTempWorktree();
  const recorder = createSpawnRecorder();

  const exitCode = runCli(["--worktree", worktree, "--prompt", "Focus on retry safety."], {
    cwd,
    env: process.env,
    stdout: createCaptureStream().stream,
    stderr: createCaptureStream().stream,
    spawn: recorder.spawn,
  });

  assert.equal(exitCode, 0);
  const prompt = recorder.calls[0].args.at(-1);
  assert.match(prompt, /guided-code-review workflow/);
  assert.match(prompt, /Focus on retry safety/);
});

test("script dry-run can validate an isolated-context-style worktree path", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-isolated-context-"));
  const worktree = path.join(tempRoot, ".worktrees", "isolated-context-run-codex");
  fs.mkdirSync(worktree, { recursive: true });

  const output = runScript(["--worktree", ".worktrees/isolated-context-run-codex", "--dry-run"], {
    cwd: tempRoot,
  });

  assert.match(output, /- worktree: `\.worktrees\/isolated-context-run-codex`/);
  assert.match(output, /codex -C \.worktrees\/isolated-context-run-codex review --uncommitted/);
  assert.match(output, /guided-code-review workflow/);
});
