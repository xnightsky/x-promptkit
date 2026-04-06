import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const node = process.execPath;
const fixtureBinDir = path.join(cwd, "tests", "fixtures", "codex-runner", "fake-bin");
const fixtureCodexCommand =
  process.platform === "win32" ? path.join(fixtureBinDir, "codex.cmd") : "codex";
const probeScript = path.join(cwd, "skills", "isolated-context-run-codex", "scripts", "probe.mjs");

function runProbe(args = [], options = {}) {
  return execFileSync(node, [probeScript, ...args], {
    cwd,
    encoding: "utf8",
    input: options.input,
    env: {
      ...process.env,
      PATH: `${fixtureBinDir}${path.delimiter}${process.env.PATH}`,
      ...options.env,
    },
  });
}

test("probe accepts stdin json and reports exec-json availability", () => {
  const output = runProbe([], {
    input: JSON.stringify({ backend: "exec-json", codex_command: fixtureCodexCommand }),
    env: { CODEX_FIXTURE_MODE: "probe_ok" },
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.available, true);
  assert.equal(parsed.facts.exec_supported, true);
  assert.equal(parsed.facts.json_supported, true);
});

test("probe supports --input files and returns unavailable for missing codex command", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-probe-request-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const inputPath = path.join(tempRoot, "probe.json");
  fs.writeFileSync(inputPath, JSON.stringify({ backend: "exec-json", codex_command: "missing-codex" }));

  const output = runProbe(["--input", inputPath], {
    env: { PATH: process.env.PATH },
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.available, false);
  assert.deepEqual(parsed.failure, {
    kind: "unavailable",
    reason: "codex_command_missing",
  });
});

test("probe reports missing exec subcommand and json flag separately", () => {
  const execUnavailable = JSON.parse(
    runProbe([], {
      input: JSON.stringify({ backend: "exec-json", codex_command: fixtureCodexCommand }),
      env: { CODEX_FIXTURE_MODE: "exec_missing" },
    }),
  );
  assert.deepEqual(execUnavailable.failure, {
    kind: "unavailable",
    reason: "exec_subcommand_unavailable",
  });

  const jsonUnavailable = JSON.parse(
    runProbe([], {
      input: JSON.stringify({ backend: "exec-json", codex_command: fixtureCodexCommand }),
      env: { CODEX_FIXTURE_MODE: "json_flag_missing" },
    }),
  );
  assert.deepEqual(jsonUnavailable.failure, {
    kind: "unavailable",
    reason: "json_flag_unavailable",
  });
});

test("probe exits 1 for invalid json input", () => {
  assert.throws(
    () => runProbe([], { input: "{not-json}" }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /invalid JSON input/);
      return true;
    },
  );
});
