#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

import {
  normalizeCodexExecResult,
  readJsonInputFromArgs,
  validateRunExecRequest,
  writeExecutionArtifacts,
} from "./lib.mjs";
import { normalizeProcessSpawnFailure } from "./normalize-failure.mjs";
import { normalizeExecTrace } from "./normalize-trace.mjs";

function runnerMisconfiguration(reason) {
  return {
    ok: false,
    carrier: "isolated-context-run:codex",
    backend: "exec-json",
    result: {
      final_text: null,
      refusal: false,
    },
    execution: {
      thread_id: null,
      turn_status: "failed",
      exit_code: 1,
    },
    evidence: {
      events_seen: [],
      raw_event_log: "artifacts/raw-events.jsonl",
      stdout: "artifacts/stdout.txt",
      stderr: "artifacts/stderr.txt",
      warnings: [],
    },
    failure: {
      kind: "runner_misconfiguration",
      reason,
    },
  };
}

function ensurePreparedDirectories(request) {
  if (!fs.existsSync(request.workingDirectory) || !fs.statSync(request.workingDirectory).isDirectory()) {
    return runnerMisconfiguration("missing_working_directory");
  }

  if (!fs.existsSync(request.artifactsDir) || !fs.statSync(request.artifactsDir).isDirectory()) {
    return runnerMisconfiguration("missing_artifacts_dir");
  }

  try {
    fs.accessSync(request.artifactsDir, fs.constants.W_OK);
  } catch {
    return runnerMisconfiguration("artifacts_dir_unwritable");
  }

  return null;
}

export function runExecRequest(request, options = {}) {
  const normalized = validateRunExecRequest(request);
  const configurationFailure = ensurePreparedDirectories(normalized);

  if (configurationFailure) {
    writeExecutionArtifacts(normalized.artifactsDir, configurationFailure, "", "");
    return configurationFailure;
  }

  if (normalized.backend !== "exec-json") {
    const result = {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: normalized.backend,
      result: {
        final_text: null,
        refusal: false,
      },
      execution: {
        thread_id: null,
        turn_status: "failed",
        exit_code: 0,
      },
      evidence: {
        events_seen: [],
        raw_event_log: "artifacts/raw-events.jsonl",
        stdout: "artifacts/stdout.txt",
        stderr: "artifacts/stderr.txt",
        warnings: [],
      },
      failure: {
        kind: "unavailable",
        reason: "backend_not_supported",
      },
    };
    writeExecutionArtifacts(normalized.artifactsDir, result, "", "");
    return result;
  }

  // The runner consumes a prepared workspace and environment. Request-shape
  // errors already exited earlier; everything below is normalized into the
  // stdout business contract instead of process exit codes.
  const childResult = spawnSync(
    normalized.codexCommand,
    ["exec", "--json", ...normalized.extraArgs, normalized.task.prompt],
    {
      cwd: normalized.workingDirectory,
      encoding: "utf8",
      env: {
        ...(options.env ?? process.env),
        ...normalized.env,
      },
    },
  );

  if (childResult.error) {
    const failure = normalizeProcessSpawnFailure(childResult.error);
    const result = {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: normalized.backend,
      result: {
        final_text: null,
        refusal: false,
      },
      execution: {
        thread_id: null,
        turn_status: "failed",
        exit_code: 1,
      },
      evidence: {
        events_seen: [],
        raw_event_log: "artifacts/raw-events.jsonl",
        stdout: "artifacts/stdout.txt",
        stderr: "artifacts/stderr.txt",
        warnings: [],
      },
      failure,
    };
    writeExecutionArtifacts(normalized.artifactsDir, result, "", childResult.error.message ?? "");
    return result;
  }

  const stdoutText = childResult.stdout ?? "";
  const stderrText = childResult.stderr ?? "";
  const result = normalizeExecTrace({
    exitCode: childResult.status ?? 0,
    stdoutText,
    stderrText,
    artifactsDirRel: "artifacts",
  });
  writeExecutionArtifacts(normalized.artifactsDir, result, stdoutText, stderrText);
  return result;
}

function main() {
  try {
    const request = readJsonInputFromArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(runExecRequest(request))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
