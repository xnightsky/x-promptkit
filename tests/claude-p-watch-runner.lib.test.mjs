import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MAX_TAIL_LINES,
  discoverPidByCommand,
  inspectPidFd,
  tailByPid,
} from "../skills/claude-p-watch/scripts/lib.mjs";

test("discoverPidByCommand selects the newest matching process row", () => {
  const result = discoverPidByCommand({
    command_contains: ["claude", "-p", "demo-task"],
  }, {
    psText: [
      "4100 329906 10 claude claude --dangerously-skip-permissions -p demo-task",
      "4200 329906 2 claude claude --dangerously-skip-permissions -p demo-task",
      "4300 329906 1 sleep sleep 60",
    ].join("\n"),
  });

  assert.deepEqual(result, {
    ok: true,
    pid: 4200,
    ppid: 329906,
    etimes: 2,
    command: "claude claude --dangerously-skip-permissions -p demo-task",
    reason: null,
  });
});

test("discoverPidByCommand returns process_not_found after excluding the only match", () => {
  const result = discoverPidByCommand({
    command_contains: ["sleep", "60"],
    exclude_pid: 4100,
  }, {
    psText: "4100 329906 3 sleep sleep 60",
  });

  assert.deepEqual(result, {
    ok: false,
    pid: null,
    ppid: null,
    etimes: null,
    command: null,
    reason: "process_not_found",
  });
});

test("inspectPidFd tails a regular file target on linux", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-watch-fd-"));
  const logPath = path.join(tempRoot, "stdout.log");
  fs.writeFileSync(logPath, "line-1\nline-2\nline-3\n");

  const result = inspectPidFd(1234, 1, {
    platform: "linux",
    maxTailLines: 2,
    readlink: () => logPath,
  });

  assert.equal(result.canCapture, true);
  assert.equal(result.tailExcerpt, "line-2\nline-3");
  assert.equal(result.targetKind, "file");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("tailByPid prefers stdout when stdout tail is available", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-watch-stdout-"));
  const stdoutPath = path.join(tempRoot, "stdout.log");
  const stderrPath = path.join(tempRoot, "stderr.log");
  fs.writeFileSync(stdoutPath, "out-1\nout-2\nout-3\n");
  fs.writeFileSync(stderrPath, "err-1\n");

  const result = tailByPid(1234, {
    maxTailLines: 2,
    inspectPidFdImpl: (pid, fd, options) =>
      inspectPidFd(pid, fd, {
        ...options,
        platform: "linux",
        readlink: () => (fd === 1 ? stdoutPath : stderrPath),
      }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.stream, "stdout");
  assert.equal(result.tailExcerpt, "out-2\nout-3");
  assert.equal(result.reason, null);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("tailByPid falls back to stderr when stdout cannot be captured", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-watch-stderr-"));
  const stderrPath = path.join(tempRoot, "stderr.log");
  fs.writeFileSync(stderrPath, "err-1\nerr-2\n");

  const result = tailByPid(1234, {
    maxTailLines: DEFAULT_MAX_TAIL_LINES,
    inspectPidFdImpl: (pid, fd, options) =>
      inspectPidFd(pid, fd, {
        ...options,
        platform: "linux",
        readlink: () => (fd === 1 ? "pipe:[998877]" : stderrPath),
      }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.stream, "stderr");
  assert.equal(result.tailExcerpt, "err-1\nerr-2");
  assert.equal(result.reason, null);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
