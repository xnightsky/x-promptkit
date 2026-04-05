#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { readJsonInputFromArgs, validateProbeRequest } from "./lib.mjs";

function runProbeRequest(request, options = {}) {
  const normalized = validateProbeRequest(request);
  const env = options.env ?? process.env;

  if (normalized.backend !== "exec-json") {
    return {
      ok: true,
      backend: normalized.backend,
      available: false,
      facts: {
        codex_command: normalized.codexCommand,
        codex_version: null,
        exec_supported: false,
        json_supported: false,
      },
      failure: {
        kind: "unavailable",
        reason: "backend_not_supported",
      },
    };
  }

  const versionResult = spawnSync(normalized.codexCommand, ["--version"], {
    encoding: "utf8",
    env,
  });

  if (versionResult.error?.code === "ENOENT") {
    return {
      ok: true,
      backend: normalized.backend,
      available: false,
      facts: {
        codex_command: normalized.codexCommand,
        codex_version: null,
        exec_supported: false,
        json_supported: false,
      },
      failure: {
        kind: "unavailable",
        reason: "codex_command_missing",
      },
    };
  }

  if (versionResult.status !== 0) {
    return {
      ok: true,
      backend: normalized.backend,
      available: false,
      facts: {
        codex_command: normalized.codexCommand,
        codex_version: null,
        exec_supported: false,
        json_supported: false,
      },
      failure: {
        kind: "environment_failure",
        reason: "version_probe_failed",
      },
    };
  }

  const helpResult = spawnSync(normalized.codexCommand, ["exec", "--help"], {
    encoding: "utf8",
    env,
  });

  if (helpResult.status !== 0) {
    return {
      ok: true,
      backend: normalized.backend,
      available: false,
      facts: {
        codex_command: normalized.codexCommand,
        codex_version: versionResult.stdout.trim() || null,
        exec_supported: false,
        json_supported: false,
      },
      failure: {
        kind: "unavailable",
        reason: "exec_subcommand_unavailable",
      },
    };
  }

  if (!helpResult.stdout.includes("--json")) {
    return {
      ok: true,
      backend: normalized.backend,
      available: false,
      facts: {
        codex_command: normalized.codexCommand,
        codex_version: versionResult.stdout.trim() || null,
        exec_supported: true,
        json_supported: false,
      },
      failure: {
        kind: "unavailable",
        reason: "json_flag_unavailable",
      },
    };
  }

  return {
    ok: true,
    backend: normalized.backend,
    available: true,
    facts: {
      codex_command: normalized.codexCommand,
      codex_version: versionResult.stdout.trim() || null,
      exec_supported: true,
      json_supported: true,
    },
    failure: null,
  };
}

function main() {
  try {
    const request = readJsonInputFromArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(runProbeRequest(request))}\n`);
  } catch (error) {
    process.stderr.write(`invalid JSON input: ${error.message}\n`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runProbeRequest };
