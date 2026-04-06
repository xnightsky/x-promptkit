import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REQUIRED_ENV_KEYS = [
  "HOME",
  "CODEX_HOME",
  "PWD",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
];

const ALLOWED_TURN_STATUS = new Set(["completed", "failed", "interrupted", "unknown"]);
const ALLOWED_STEP_TYPES = new Set([
  "mkdir",
  "copy",
  "write_file",
  "template_file",
  "run_local",
]);
const SHELL_WRAPPER_COMMANDS = new Set(["sh", "bash", "zsh"]);
const SOURCE_PRECEDENCE = [
  "global",
  "repo",
  "passed-in",
  "dev-path-mount",
];
const SOURCE_RANK = new Map(SOURCE_PRECEDENCE.map((sourceClass, index) => [sourceClass, index]));

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing \`${label}\``);
  }
}

function isRelativeRepoPath(candidate) {
  return (
    typeof candidate === "string" &&
    candidate.length > 0 &&
    !path.isAbsolute(candidate) &&
    !candidate.split("/").includes("..") &&
    !candidate.split(path.sep).includes("..")
  );
}

function buildFailure(kind, reason) {
  return { kind, reason };
}

function inferEnvironmentReason(text) {
  const normalized = text.toLowerCase();

  if (normalized.includes("unauthorized") || normalized.includes("auth")) {
    return "auth_failed";
  }
  if (normalized.includes("network") || normalized.includes("econn") || normalized.includes("timeout")) {
    return "network_failed";
  }
  if (normalized.includes("provider") || normalized.includes("upstream") || normalized.includes("model")) {
    return "provider_failed";
  }
  if (normalized.includes("sandbox")) {
    return "sandbox_denied";
  }
  if (normalized.includes("approval pending")) {
    return "approval_pending";
  }
  if (normalized.includes("approval denied")) {
    return "approval_denied";
  }

  return null;
}

function normalizeArtifactsDirRel(artifactsDirRel = "artifacts") {
  return artifactsDirRel.replace(/\\/g, "/");
}

function extractAgentMessageText(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.type === "agent_message" && typeof item.text === "string" && item.text.length > 0) {
    return item.text;
  }

  if (!Array.isArray(item.content)) {
    return null;
  }

  const textParts = item.content
    .map((entry) => {
      if (typeof entry?.text === "string") {
        return entry.text;
      }
      return null;
    })
    .filter((entry) => typeof entry === "string" && entry.length > 0);

  return textParts.length > 0 ? textParts.join("\n") : null;
}

function needsWindowsShell(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function resolveWindowsCommandPath(command, env = process.env) {
  if (process.platform !== "win32" || path.extname(command).length > 0 || command.includes(path.sep)) {
    return command;
  }

  const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "where", command], {
    encoding: "utf8",
    env,
  });

  if (result.status !== 0) {
    return command;
  }

  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preferredSuffixes = [".cmd", ".bat", ".exe", ".ps1"];

  // Scoop/npm installs often expose an extensionless POSIX shim first on
  // Windows. We must prefer a native Windows entrypoint so `spawnSync` does
  // not trip on the shell wrapper with EPERM.
  for (const suffix of preferredSuffixes) {
    const match = candidates.find((candidate) => candidate.toLowerCase().endsWith(suffix));
    if (match) {
      return match;
    }
  }

  return candidates[0] ?? command;
}

function spawnWindowsPowerShellScript(scriptPath, args, options = {}) {
  const shellArgs = ["-NoLogo", "-NoProfile", "-File", scriptPath, ...args];
  const pwshResult = spawnSync("pwsh.exe", shellArgs, options);

  if (pwshResult.error?.code !== "ENOENT") {
    return pwshResult;
  }

  return spawnSync("powershell.exe", shellArgs, options);
}

export function spawnCodexProcess(command, args, options = {}) {
  const env = options.env ?? process.env;
  if (needsWindowsShell(command)) {
    // Batch files are not directly executable through CreateProcess; routing
    // them through `cmd.exe /c` preserves argument boundaries without `shell: true`.
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", command, ...args], {
      ...options,
    });
  }

  if (process.platform === "win32") {
    const resolvedCommand = resolveWindowsCommandPath(command, env);
    if (/\.ps1$/i.test(resolvedCommand)) {
      return spawnWindowsPowerShellScript(resolvedCommand, args, {
        ...options,
        env,
      });
    }

    if (resolvedCommand !== command) {
      if (needsWindowsShell(resolvedCommand)) {
        return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", resolvedCommand, ...args], {
          ...options,
          env,
        });
      }

      return spawnSync(resolvedCommand, args, {
        ...options,
        env,
      });
    }
  }

  return spawnSync(command, args, options);
}

export function readJsonInputFromArgs(argv, stdinText = null) {
  const args = [...argv];
  const inputFlagIndex = args.indexOf("--input");

  if (inputFlagIndex !== -1) {
    const inputPath = args[inputFlagIndex + 1];
    assertNonEmptyString(inputPath, "input file path");
    return JSON.parse(fs.readFileSync(inputPath, "utf8"));
  }

  return JSON.parse(stdinText ?? fs.readFileSync(0, "utf8"));
}

export function validateProbeRequest(request) {
  assertObject(request, "probe request");
  assertNonEmptyString(request.backend, "backend");

  if ("codex_command" in request && typeof request.codex_command !== "string") {
    throw new Error("`codex_command` must be a string");
  }
  if (typeof request.codex_command === "string" && request.codex_command.trim().length === 0) {
    throw new Error("`codex_command` must be a non-empty string");
  }

  return {
    backend: request.backend,
    codexCommand: request.codex_command ?? "codex",
  };
}

export function validateRunExecRequest(request) {
  assertObject(request, "run-exec request");
  assertNonEmptyString(request.backend, "backend");
  assertObject(request.task, "task");
  assertNonEmptyString(request.task.prompt, "task.prompt");
  assertNonEmptyString(request.working_directory, "working_directory");
  assertNonEmptyString(request.artifacts_dir, "artifacts_dir");
  assertObject(request.env, "env");

  for (const key of REQUIRED_ENV_KEYS) {
    assertNonEmptyString(request.env[key], `env.${key}`);
  }

  if (!Array.isArray(request.extra_args)) {
    throw new Error("`extra_args` must be an array");
  }
  if (request.extra_args.length > 0) {
    throw new Error("unsupported `extra_args`");
  }

  if ("codex_command" in request && typeof request.codex_command !== "string") {
    throw new Error("`codex_command` must be a string");
  }

  return {
    backend: request.backend,
    codexCommand: request.codex_command ?? "codex",
    task: {
      prompt: request.task.prompt,
    },
    workingDirectory: request.working_directory,
    artifactsDir: request.artifacts_dir,
    env: request.env,
    extraArgs: request.extra_args,
  };
}

export function normalizeCodexExecResult({
  exitCode,
  stdoutText,
  stderrText,
  artifactsDirRel = "artifacts",
}) {
  const normalizedArtifactsDir = normalizeArtifactsDirRel(artifactsDirRel);
  const lines = stdoutText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings = [];
  const parsedEvents = [];

  // `codex exec --json` is still backend-specific. We normalize only the
  // minimal facts the repo contract needs and keep malformed JSONL as a
  // contract failure instead of guessing from partial output.
  for (const line of lines) {
    try {
      parsedEvents.push(JSON.parse(line));
    } catch {
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
          exit_code: exitCode,
        },
        evidence: {
          events_seen: [],
          raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
          stdout: `${normalizedArtifactsDir}/stdout.txt`,
          stderr: `${normalizedArtifactsDir}/stderr.txt`,
          warnings: [],
        },
        failure: buildFailure("contract_failure", "jsonl_unparseable"),
      };
    }
  }

  const eventsSeen = [];
  let threadId = null;
  let turnStatus = "unknown";
  let finalText = null;
  let refusal = false;
  let failureFromEvents = null;

  for (const event of parsedEvents) {
    if (typeof event?.type === "string") {
      if (!eventsSeen.includes(event.type)) {
        eventsSeen.push(event.type);
      }
    } else {
      warnings.push("unknown_event_types_present");
    }

    if (!threadId && typeof event?.thread_id === "string") {
      threadId = event.thread_id;
    }

    if (event?.type === "turn.completed") {
      turnStatus = event.status ?? "completed";
      finalText = event.result?.final_text ?? event.final_text ?? finalText;
      refusal = event.result?.refusal ?? event.refusal ?? refusal;
    }

    if (event?.type === "item.completed") {
      const agentMessageText = extractAgentMessageText(event.item);
      if (typeof agentMessageText === "string" && agentMessageText.length > 0) {
        finalText = agentMessageText;
      }
    }

    if (event?.type === "turn.failed") {
      turnStatus = event.status ?? "failed";
      const eventReason = inferEnvironmentReason(
        [event.error?.category, event.error?.message].filter(Boolean).join(" "),
      );
      if (eventReason) {
        failureFromEvents = buildFailure("environment_failure", eventReason);
      }
    }
  }

  if (!threadId) {
    warnings.push("missing_thread_id");
  }
  if (!eventsSeen.includes("turn.completed") && turnStatus === "completed") {
    warnings.push("missing_turn_completed");
  }

  if (!ALLOWED_TURN_STATUS.has(turnStatus)) {
    return {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: "exec-json",
      result: {
        final_text: null,
        refusal: false,
      },
      execution: {
        thread_id: threadId,
        turn_status: "failed",
        exit_code: exitCode,
      },
      evidence: {
        events_seen: eventsSeen,
        raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
        stdout: `${normalizedArtifactsDir}/stdout.txt`,
        stderr: `${normalizedArtifactsDir}/stderr.txt`,
        warnings,
      },
      failure: buildFailure("contract_failure", "invalid_turn_status"),
    };
  }

  const combinedFailureText = `${stderrText}\n${stdoutText}`;
  const inferredEnvironmentReason = inferEnvironmentReason(combinedFailureText);

  if (exitCode !== 0) {
    return {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: "exec-json",
      result: {
        final_text: null,
        refusal,
      },
      execution: {
        thread_id: threadId,
        turn_status: "failed",
        exit_code: exitCode,
      },
      evidence: {
        events_seen: eventsSeen,
        raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
        stdout: `${normalizedArtifactsDir}/stdout.txt`,
        stderr: `${normalizedArtifactsDir}/stderr.txt`,
        warnings,
      },
      failure:
        failureFromEvents ??
        buildFailure(
          "environment_failure",
          inferredEnvironmentReason ?? "process_exit_nonzero",
        ),
    };
  }

  if (lines.length === 0) {
    return {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: "exec-json",
      result: {
        final_text: null,
        refusal: false,
      },
      execution: {
        thread_id: threadId,
        turn_status: "failed",
        exit_code: exitCode,
      },
      evidence: {
        events_seen: eventsSeen,
        raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
        stdout: `${normalizedArtifactsDir}/stdout.txt`,
        stderr: `${normalizedArtifactsDir}/stderr.txt`,
        warnings,
      },
      failure: buildFailure("environment_failure", "empty_response"),
    };
  }

  if (typeof finalText !== "string" || finalText.length === 0) {
    return {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: "exec-json",
      result: {
        final_text: null,
        refusal,
      },
      execution: {
        thread_id: threadId,
        turn_status: turnStatus === "unknown" ? "failed" : turnStatus,
        exit_code: exitCode,
      },
      evidence: {
        events_seen: eventsSeen,
        raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
        stdout: `${normalizedArtifactsDir}/stdout.txt`,
        stderr: `${normalizedArtifactsDir}/stderr.txt`,
        warnings,
      },
      failure: buildFailure("contract_failure", "missing_final_text"),
    };
  }

  if (turnStatus === "failed") {
    return {
      ok: false,
      carrier: "isolated-context-run:codex",
      backend: "exec-json",
      result: {
        final_text: null,
        refusal,
      },
      execution: {
        thread_id: threadId,
        turn_status: turnStatus,
        exit_code: exitCode,
      },
      evidence: {
        events_seen: eventsSeen,
        raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
        stdout: `${normalizedArtifactsDir}/stdout.txt`,
        stderr: `${normalizedArtifactsDir}/stderr.txt`,
        warnings,
      },
      failure: failureFromEvents ?? buildFailure("contract_failure", "missing_failure_payload"),
    };
  }

  return {
    ok: true,
    carrier: "isolated-context-run:codex",
    backend: "exec-json",
    result: {
      final_text: finalText,
      refusal,
    },
    execution: {
      thread_id: threadId,
      turn_status: turnStatus,
      exit_code: exitCode,
    },
    evidence: {
      events_seen: eventsSeen,
      raw_event_log: `${normalizedArtifactsDir}/raw-events.jsonl`,
      stdout: `${normalizedArtifactsDir}/stdout.txt`,
      stderr: `${normalizedArtifactsDir}/stderr.txt`,
      warnings,
    },
    failure: null,
  };
}

export function resolveSkillViewEntries(entries) {
  const winners = new Map();

  for (const entry of entries) {
    assertObject(entry, "skill entry");
    assertNonEmptyString(entry.sourceClass, "entry.sourceClass");
    assertNonEmptyString(entry.skillName, "entry.skillName");
    assertNonEmptyString(entry.sourcePath, "entry.sourcePath");

    if (!SOURCE_RANK.has(entry.sourceClass)) {
      throw new Error(`unsupported source class: \`${entry.sourceClass}\``);
    }

    const existing = winners.get(entry.skillName);
    if (!existing) {
      winners.set(entry.skillName, entry);
      continue;
    }

    const nextRank = SOURCE_RANK.get(entry.sourceClass);
    const currentRank = SOURCE_RANK.get(existing.sourceClass);

    // Same-tier duplicates must fail loudly so the resolved skill view stays
    // auditable; declaration order must not become an implicit override rule.
    if (nextRank === currentRank) {
      throw new Error(`same-tier duplicate skill: \`${entry.skillName}\``);
    }

    if (nextRank > currentRank) {
      winners.set(entry.skillName, entry);
    }
  }

  return [...winners.values()].sort((left, right) => left.skillName.localeCompare(right.skillName));
}

export function validateWorkspaceProfile(profile) {
  assertObject(profile, "workspace profile");

  const mode = profile.workspace?.mode ?? "minimal-seed";
  if (mode !== "minimal-seed") {
    return profile;
  }

  const copyEntries = profile.seed?.copy ?? [];
  if (!Array.isArray(copyEntries)) {
    throw new Error("`seed.copy` must be an array");
  }

  for (const entry of copyEntries) {
    assertObject(entry, "seed.copy entry");
    if (!isRelativeRepoPath(entry.from) || !isRelativeRepoPath(entry.to)) {
      throw new Error("`seed.copy` entries must be relative paths");
    }
  }

  const steps = profile.init?.steps ?? [];
  if (!Array.isArray(steps)) {
    throw new Error("`init.steps` must be an array");
  }

  for (const step of steps) {
    assertObject(step, "init step");
    assertNonEmptyString(step.type, "init step type");

    if (!ALLOWED_STEP_TYPES.has(step.type)) {
      throw new Error(`unsupported init step type: \`${step.type}\``);
    }

    if (step.type === "run_local") {
      // `run_local` is the narrow escape hatch for repository-owned setup
      // helpers. Shell wrappers would turn it into an unbounded command hook.
      assertNonEmptyString(step.command, "run_local.command");
      if (SHELL_WRAPPER_COMMANDS.has(step.command)) {
        throw new Error("run_local does not allow shell wrapper commands");
      }
      if (!Array.isArray(step.args)) {
        throw new Error("`run_local.args` must be an array");
      }

      const allowedRoots = profile.policy?.run_local?.allowed_roots ?? [];
      if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
        throw new Error("`policy.run_local.allowed_roots` must be a non-empty array");
      }

      const targetScript = step.args[0];
      if (typeof targetScript === "string") {
        const normalizedScript = targetScript.replace(/\\/g, "/");
        const allowed = allowedRoots.some((root) => normalizedScript.startsWith(root));
        if (!allowed) {
          throw new Error("run_local target must stay inside an allowed root");
        }
      }

      continue;
    }

    for (const key of ["path", "from", "to"]) {
      if (key in step && !isRelativeRepoPath(step[key])) {
        throw new Error(`\`${step.type}.${key}\` must be a relative path`);
      }
    }
  }

  return profile;
}

export function writeExecutionArtifacts(artifactsDir, result, stdoutText, stderrText) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, "raw-events.jsonl"), stdoutText);
  fs.writeFileSync(path.join(artifactsDir, "stdout.txt"), stdoutText);
  fs.writeFileSync(path.join(artifactsDir, "stderr.txt"), stderrText);
  fs.writeFileSync(
    path.join(artifactsDir, "evidence.json"),
    `${JSON.stringify(result.evidence, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(artifactsDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}
