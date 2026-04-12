import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const node = process.execPath;
const repoRoot = process.cwd();
const tailScript = fileURLToPath(
  new URL("../skills/claude-p-watch/scripts/tail-by-pid.mjs", import.meta.url),
);
const serial = { concurrency: false };

function runTail(pid, tailLines = 3) {
  return JSON.parse(
    execFileSync(node, [tailScript, String(pid), "--tail-lines", String(tailLines)], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("tail-by-pid captures stdout tail when fd1 targets a regular file", serial, async (t) => {
  if (process.platform !== "linux") {
    t.skip("tail-by-pid only supports linux /proc probing in this phase");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-tail-file-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const stdoutPath = path.join(tempRoot, "stdout.log");
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const writer = spawn(
    node,
    [
      "-e",
      [
        "let index = 0;",
        "const timer = setInterval(() => {",
        "  process.stdout.write(`OUT:${index}\\n`);",
        "  index += 1;",
        "  if (index === 6) {",
        "    clearInterval(timer);",
        "    process.exit(0);",
        "  }",
        "}, 80);",
      ].join(" "),
    ],
    {
      stdio: ["ignore", stdoutFd, "ignore"],
    },
  );

  t.after(() => {
    fs.closeSync(stdoutFd);
    if (!writer.killed) {
      writer.kill("SIGTERM");
    }
  });

  await wait(260);
  const result = runTail(writer.pid, 2);

  assert.equal(result.ok, true);
  assert.equal(result.stream, "stdout");
  assert.match(result.tailExcerpt, /OUT:/);
  assert.equal(result.tailExcerpt.split("\n").filter(Boolean).length <= 2, true);

  await new Promise((resolve) => writer.once("close", resolve));
});

test("tail-by-pid falls back to stderr when stdout cannot be captured", serial, async (t) => {
  if (process.platform !== "linux") {
    t.skip("tail-by-pid only supports linux /proc probing in this phase");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-tail-stderr-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const stderrPath = path.join(tempRoot, "stderr.log");
  const stderrFd = fs.openSync(stderrPath, "a");
  const writer = spawn(
    node,
    [
      "-e",
      [
        "let index = 0;",
        "const timer = setInterval(() => {",
        "  process.stderr.write(`ERR:${index}\\n`);",
        "  index += 1;",
        "  if (index === 4) {",
        "    clearInterval(timer);",
        "    process.exit(0);",
        "  }",
        "}, 100);",
      ].join(" "),
    ],
    {
      stdio: ["ignore", "pipe", stderrFd],
    },
  );

  writer.stdout.resume();
  t.after(() => {
    fs.closeSync(stderrFd);
    if (!writer.killed) {
      writer.kill("SIGTERM");
    }
  });

  await wait(220);
  const result = runTail(writer.pid, 2);

  assert.equal(result.ok, true);
  assert.equal(result.stream, "stderr");
  assert.match(result.tailExcerpt, /ERR:/);
  assert.equal(result.tailExcerpt.split("\n").filter(Boolean).length <= 2, true);

  await new Promise((resolve) => writer.once("close", resolve));
});
