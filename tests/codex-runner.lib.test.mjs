import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  REQUIRED_ENV_KEYS,
  normalizeCodexExecResult,
  resolveSkillViewEntries,
  validateProbeRequest,
  validateRunExecRequest,
  validateWorkspaceProfile,
} from "../scripts/isolated-context-run/codex/lib.mjs";

test("validateProbeRequest defaults codex_command for exec-json backend", () => {
  assert.deepEqual(validateProbeRequest({ backend: "exec-json" }), {
    backend: "exec-json",
    codexCommand: "codex",
  });
});

test("validateRunExecRequest requires task.prompt and env keys", () => {
  assert.throws(
    () =>
      validateRunExecRequest({
        backend: "exec-json",
        working_directory: "workspace",
        artifacts_dir: "artifacts",
        env: {},
        task: {},
        extra_args: [],
      }),
    /missing `task\.prompt`/,
  );

  assert.throws(
    () =>
      validateRunExecRequest({
        backend: "exec-json",
        working_directory: "workspace",
        artifacts_dir: "artifacts",
        env: Object.fromEntries(
          REQUIRED_ENV_KEYS.slice(1).map((key) => [key, path.join("tmp-env", key)]),
        ),
        task: { prompt: "hello" },
        extra_args: [],
      }),
    /missing `env\.HOME`/,
  );
});

test("validateRunExecRequest rejects unsupported extra_args", () => {
  assert.throws(
    () =>
      validateRunExecRequest({
        backend: "exec-json",
        working_directory: "workspace",
        artifacts_dir: "artifacts",
        env: Object.fromEntries(REQUIRED_ENV_KEYS.map((key) => [key, path.join("tmp-env", key)])),
        task: { prompt: "hello" },
        extra_args: ["--model", "gpt-5.4"],
      }),
    /unsupported `extra_args`/,
  );
});

test("normalizeCodexExecResult accepts a completed final_text and records non-fatal warnings", () => {
  const result = normalizeCodexExecResult({
    exitCode: 0,
    stdoutText: [
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.completed",
        status: "completed",
        result: { final_text: "isolated answer", refusal: false },
      }),
      "",
    ].join("\n"),
    stderrText: "",
    artifactsDirRel: "artifacts",
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.final_text, "isolated answer");
  assert.equal(result.execution.thread_id, null);
  assert.deepEqual(result.evidence.warnings, ["missing_thread_id"]);
});

test("normalizeCodexExecResult accepts final text from item.completed agent messages", () => {
  const result = normalizeCodexExecResult({
    exitCode: 0,
    stdoutText: [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_0",
          type: "agent_message",
          text: "workspace link ok",
        },
      }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
      "",
    ].join("\n"),
    stderrText: "",
    artifactsDirRel: "artifacts",
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.final_text, "workspace link ok");
  assert.equal(result.execution.thread_id, "thread-1");
  assert.deepEqual(result.evidence.warnings, []);
});

test("normalizeCodexExecResult classifies bad jsonl as contract failure", () => {
  const result = normalizeCodexExecResult({
    exitCode: 0,
    stdoutText: '{"type":"thread.started"}\n{not json}\n',
    stderrText: "",
    artifactsDirRel: "artifacts",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failure, {
    kind: "contract_failure",
    reason: "jsonl_unparseable",
  });
});

test("resolveSkillViewEntries applies source precedence and rejects same-tier duplicates", () => {
  const resolved = resolveSkillViewEntries([
    {
      sourceClass: "global",
      skillName: "demo-skill",
      sourcePath: "global/demo-skill",
    },
    {
      sourceClass: "repo",
      skillName: "demo-skill",
      sourcePath: "repo/demo-skill",
    },
    {
      sourceClass: "dev-path-mount",
      skillName: "demo-skill",
      sourcePath: "dev/demo-skill",
    },
  ]);

  assert.deepEqual(resolved, [
    {
      sourceClass: "dev-path-mount",
      skillName: "demo-skill",
      sourcePath: "dev/demo-skill",
    },
  ]);

  assert.throws(
    () =>
      resolveSkillViewEntries([
        {
          sourceClass: "repo",
          skillName: "duplicate",
          sourcePath: "repo-a/duplicate",
        },
        {
          sourceClass: "repo",
          skillName: "duplicate",
          sourcePath: "repo-b/duplicate",
        },
      ]),
    /same-tier duplicate skill: `duplicate`/,
  );
});

test("validateWorkspaceProfile rejects absolute seed sources and shell escape run_local", () => {
  assert.throws(
    () =>
      validateWorkspaceProfile({
        workspace: { mode: "minimal-seed" },
        seed: {
          copy: [{ from: path.join(path.sep, "tmp", "AGENTS.md"), to: "AGENTS.md" }],
        },
      }),
    /must be relative paths/,
  );

  assert.throws(
    () =>
      validateWorkspaceProfile({
        workspace: { mode: "minimal-seed" },
        seed: { copy: [{ from: "AGENTS.md", to: "AGENTS.md" }] },
        policy: { run_local: { allowed_roots: ["scripts/"] } },
        init: {
          steps: [
            {
              type: "run_local",
              command: "sh",
              args: ["-c", "echo nope"],
            },
          ],
        },
      }),
    /does not allow shell wrapper commands/,
  );
});
