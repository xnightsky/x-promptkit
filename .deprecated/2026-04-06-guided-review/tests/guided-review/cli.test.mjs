import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  buildClarificationContract,
  buildEvidenceOrder,
  buildGuidedReviewPrompt,
  buildQuestionLoopContract,
  buildReviewScaffold,
} from "../../skills/guided-review/scripts/prompt.mjs";
import { runCli } from "../../skills/guided-review/scripts/run-review.mjs";
import { createBranchReviewFixture } from "./test-helpers.mjs";

const cwd = process.cwd();
const node = process.execPath;
const scriptPath = path.join(cwd, "skills", "guided-review", "scripts", "run-review.mjs");

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

test("prompt helpers expose the rolling question scaffold and clarification contract", () => {
  assert.match(buildReviewScaffold(), /Current Review Point/);
  assert.match(buildReviewScaffold(), /Guiding Questions: ask 1 to 2 high-value questions for this turn/i);
  assert.match(buildQuestionLoopContract(), /Do not wait to assemble all guiding questions before replying/i);
  assert.match(buildEvidenceOrder(), /1\. current code and call chain/);
  assert.match(buildClarificationContract(), /continue with any remaining guiding questions instead of starting a new checklist/i);
});

test("buildGuidedReviewPrompt appends extra reviewer context without replacing the default prompt", () => {
  const prompt = buildGuidedReviewPrompt({
    contextText: "Prepared review context:\n- scope: uncommitted",
    extraPrompt: "Focus on backward compatibility.",
  });

  assert.match(prompt, /guided-review workflow/);
  assert.match(prompt, /Prepared review context:/);
  assert.match(prompt, /Guiding Questions: ask 1 to 2 high-value questions for this turn/i);
  assert.match(prompt, /Focus on backward compatibility/);
});

test("script defaults to current repo in dry-run output", () => {
  const output = runScript(["--dry-run"]);

  assert.match(output, /guided-review dry run/);
  assert.match(output, /- repo: `\.`/);
  assert.match(output, /- worktree-source: `repo-root`/);
  assert.match(output, /prepared-review-context/i);
  assert.match(output, /guided-review workflow/);
});

test("runCli passes base mode to codex review with an injected spawn bridge", () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const recorder = createSpawnRecorder();

  const exitCode = runCli(["--base", "HEAD"], {
    cwd,
    env: process.env,
    stdout: stdout.stream,
    stderr: stderr.stream,
    spawn: recorder.spawn,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), "");
  assert.match(stdout.read(), /fake codex ok/);
  assert.equal(recorder.calls[0].args[0], "-C");
  assert.equal(path.resolve(recorder.calls[0].args[1]), path.resolve(cwd));
  assert.deepEqual(recorder.calls[0].args.slice(2, 5), ["review", "--base", "HEAD"]);
});

test("runCli reports missing codex executable", () => {
  const stderr = createCaptureStream();

  const exitCode = runCli([], {
    cwd,
    env: process.env,
    stdout: createCaptureStream().stream,
    stderr: stderr.stream,
    spawn() {
      return {
        error: { code: "ENOENT", message: "spawn codex ENOENT" },
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.read(), /`codex` command is not available in PATH/);
});

test("runCli accepts an explicit worktree path in dry-run mode", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "guided-review-cli-worktree-"));
  const worktree = path.join(tempRoot, ".worktrees", "guided-review");
  fs.mkdirSync(worktree, { recursive: true });

  const output = runScript(["--worktree", worktree, "--dry-run"]);

  assert.match(output, /guided-review dry run/);
  assert.match(output, /worktree-source: `explicit-worktree`/);
});

test("runCli keeps branch review focused on one review point after preparing an ephemeral worktree", () => {
  const fixture = createBranchReviewFixture();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const exitCode = runCli(["--base", fixture.base, "--head", fixture.head, "--dry-run"], {
      cwd: fixture.repoRoot,
      env: process.env,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    const output = stdout.read();

    assert.equal(exitCode, 0);
    assert.equal(stderr.read(), "");
    assert.match(output, /worktree-source: `ephemeral-head-worktree`/);
    assert.match(output, /- head: `feature`/);
    assert.match(output, /Prepared review context:/);
    assert.match(output, /scope: branch-vs-branch/);
    assert.match(output, /Focus on one concrete review point at a time instead of scanning with a broad checklist\./);
    assert.match(output, /Guiding Questions: ask 1 to 2 high-value questions for this turn/i);
  } finally {
    fixture.cleanup();
  }
});
