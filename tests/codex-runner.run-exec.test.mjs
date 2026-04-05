import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const node = process.execPath;
const fixtureBinDir = path.join(cwd, "tests", "fixtures", "codex-runner", "fake-bin");
const runExecScript = path.join(cwd, "scripts", "isolated-context-run", "codex", "run-exec.mjs");

function createRunExecRequest(tempRoot) {
  const workingDirectory = path.join(tempRoot, "workspace");
  const artifactsDir = path.join(tempRoot, "artifacts");
  fs.mkdirSync(workingDirectory, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const env = {
    HOME: tempRoot,
    CODEX_HOME: path.join(tempRoot, ".codex"),
    PWD: workingDirectory,
    TMPDIR: path.join(tempRoot, ".tmp"),
    XDG_CONFIG_HOME: path.join(tempRoot, ".config"),
    XDG_CACHE_HOME: path.join(tempRoot, ".cache"),
    XDG_STATE_HOME: path.join(tempRoot, ".local", "state"),
  };

  for (const directory of Object.values(env)) {
    if (directory !== workingDirectory) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  return {
    backend: "exec-json",
    task: { prompt: "say hello" },
    working_directory: workingDirectory,
    artifacts_dir: artifactsDir,
    env,
    extra_args: [],
  };
}

function runExec(args = [], options = {}) {
  return execFileSync(node, [runExecScript, ...args], {
    cwd,
    encoding: "utf8",
    input: options.input,
    env: {
      ...process.env,
      PATH: `${fixtureBinDir}:${process.env.PATH}`,
      ...options.env,
    },
  });
}

test("run-exec returns the v0 contract for a successful exec-json run", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-run-exec-ok-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const output = runExec([], {
    input: JSON.stringify(createRunExecRequest(tempRoot)),
    env: { CODEX_FIXTURE_MODE: "run_ok" },
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.carrier, "isolated-context-run:codex");
  assert.equal(parsed.result.final_text, "fixture run ok");
  assert.equal(parsed.execution.turn_status, "completed");
});

test("run-exec supports --input files and classifies auth failures as environment failures", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-run-exec-auth-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const requestPath = path.join(tempRoot, "request.json");
  fs.writeFileSync(requestPath, JSON.stringify(createRunExecRequest(tempRoot)));

  const output = runExec(["--input", requestPath], {
    env: { CODEX_FIXTURE_MODE: "run_auth_failed" },
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.failure, {
    kind: "environment_failure",
    reason: "auth_failed",
  });
});

test("run-exec classifies malformed jsonl as contract failure", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-run-exec-bad-jsonl-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const output = runExec([], {
    input: JSON.stringify(createRunExecRequest(tempRoot)),
    env: { CODEX_FIXTURE_MODE: "run_bad_jsonl" },
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.failure, {
    kind: "contract_failure",
    reason: "jsonl_unparseable",
  });
});

test("run-exec exits 1 for invalid request payloads", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-run-exec-invalid-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const invalidRequest = createRunExecRequest(tempRoot);
  delete invalidRequest.task.prompt;

  assert.throws(
    () => runExec([], { input: JSON.stringify(invalidRequest) }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /missing `task\.prompt`/);
      return true;
    },
  );

  const extraArgsRequest = createRunExecRequest(tempRoot);
  extraArgsRequest.extra_args = ["--model", "gpt-5.4"];

  assert.throws(
    () => runExec([], { input: JSON.stringify(extraArgsRequest) }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /unsupported `extra_args`/);
      return true;
    },
  );
});
