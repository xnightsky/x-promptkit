import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

import {
  formatRunEvalOutput,
  loadRecallYaml,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "./lib.mjs";
import { SUBAGENT_CARRIER } from "./carrier-adapter.mjs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function caseScopedEnvKey(baseKey, caseId, phase) {
  const normalizedCaseId = String(caseId ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const normalizedPhase = String(phase ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const suffixParts = [normalizedPhase, normalizedCaseId].filter((part) => part.length > 0);

  return suffixParts.length > 0 ? `${baseKey}_${suffixParts.join("_")}` : baseKey;
}

function readPhaseScopedEnv(env, baseKey, caseId, phase) {
  const specificKey = caseScopedEnvKey(baseKey, caseId, phase);
  const phaseKey = caseScopedEnvKey(baseKey, null, phase);
  return env[specificKey] ?? env[phaseKey] ?? env[baseKey] ?? null;
}

function isTruthyEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}

function trimSpawnText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function loadIitestSuite(inputPath, cwd = process.cwd()) {
  const absolutePath = path.resolve(cwd, inputPath);
  const raw = readFileUtf8(absolutePath);
  const data = YAML.parse(raw);

  return {
    path: inputPath,
    absolutePath,
    raw,
    data,
  };
}

export function validateIitestSuite(data) {
  const errors = [];

  if (!isNonEmptyString(data?.name)) {
    errors.push("missing `name`");
  }

  if (!isNonEmptyString(data?.queue)) {
    errors.push("missing `queue`");
  }

  if (!isNonEmptyString(data?.fixture_ref)) {
    errors.push("missing `fixture_ref`");
  }

  if (!isNonEmptyString(data?.task_prompt)) {
    errors.push("missing `task_prompt`");
  }

  if (!Array.isArray(data?.cases) || normalizeStringList(data.cases).length === 0) {
    errors.push("missing `cases`");
  }

  const workspaceAssert = data?.workspace_assert;
  if (workspaceAssert !== undefined) {
    if (!workspaceAssert || typeof workspaceAssert !== "object" || Array.isArray(workspaceAssert)) {
      errors.push("`workspace_assert` must be an object");
    } else {
      if (
        workspaceAssert.must_exist !== undefined &&
        !Array.isArray(workspaceAssert.must_exist)
      ) {
        errors.push("`workspace_assert.must_exist` must be an array when present");
      }

      if (
        workspaceAssert.file_contains !== undefined &&
        !Array.isArray(workspaceAssert.file_contains)
      ) {
        errors.push("`workspace_assert.file_contains` must be an array when present");
      }

      for (const item of workspaceAssert.file_contains ?? []) {
        if (!isNonEmptyString(item?.path) || !isNonEmptyString(item?.text)) {
          errors.push("`workspace_assert.file_contains` items must include `path` and `text`");
          break;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function createWorkspaceFromFixture(fixtureRef, cwd = process.cwd()) {
  const fixtureAbsolutePath = path.resolve(cwd, fixtureRef);
  const fixtureStats = fs.statSync(fixtureAbsolutePath);

  if (!fixtureStats.isDirectory()) {
    throw new Error("fixture_ref must point to a directory");
  }

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recall-iitest-workspace-"));
  fs.cpSync(fixtureAbsolutePath, workspaceRoot, { recursive: true });

  return {
    fixtureAbsolutePath,
    workspaceRoot,
  };
}

export function remapSourceRefToWorkspace(sourceRef, fixtureAbsolutePath, workspaceRoot) {
  if (!isNonEmptyString(sourceRef)) {
    return sourceRef;
  }

  const [sourcePath, anchor = ""] = sourceRef.split("#");
  const absoluteSourcePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(fixtureAbsolutePath, sourcePath);

  let remappedPath = absoluteSourcePath;
  if (absoluteSourcePath === fixtureAbsolutePath || absoluteSourcePath.startsWith(`${fixtureAbsolutePath}${path.sep}`)) {
    remappedPath = path.join(workspaceRoot, path.relative(fixtureAbsolutePath, absoluteSourcePath));
  }

  return anchor.length > 0 ? `${remappedPath}#${anchor}` : remappedPath;
}

export function verifyWorkspaceAssert(workspaceRoot, workspaceAssert) {
  const failures = [];
  if (!workspaceAssert) {
    return {
      ok: true,
      failures,
    };
  }

  for (const relativePath of workspaceAssert.must_exist ?? []) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`missing workspace path \`${relativePath}\``);
    }
  }

  for (const item of workspaceAssert.file_contains ?? []) {
    const absolutePath = path.join(workspaceRoot, item.path);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`missing workspace file \`${item.path}\``);
      continue;
    }

    const content = readFileUtf8(absolutePath);
    if (!content.includes(item.text)) {
      failures.push(`workspace file \`${item.path}\` does not include \`${item.text}\``);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function buildIitestSubagentRequest({
  phase,
  prompt,
  workspaceRoot,
  sourceRef,
  carrier,
  caseId,
  medium,
}) {
  return JSON.stringify({
    phase,
    prompt,
    workspace_root: workspaceRoot,
    source_ref: sourceRef,
    carrier,
    case_id: caseId,
    medium,
  });
}

function runCommandBridge(command, request, env) {
  const result = spawnSync(command, {
    env,
    encoding: "utf8",
    input: request,
    shell: env.RECALL_EVAL_SUBAGENT_SHELL || true,
  });
  const stderrText = trimSpawnText(result.stderr);

  if (result.error) {
    return {
      ok: false,
      kind: "environment_failure",
      reason: `carrier execution failed: ${stderrText || result.error.message}`,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      kind: "environment_failure",
      reason: `carrier execution failed: ${stderrText || `command exited with ${result.status}`}`,
    };
  }

  const answerText = trimSpawnText(result.stdout);
  if (!isNonEmptyString(answerText)) {
    return {
      ok: false,
      kind: "environment_failure",
      reason: "carrier execution failed: empty response",
    };
  }

  return {
    ok: true,
    answerText,
  };
}

export function executeIitestSubagentPhase(
  { phase, prompt, workspaceRoot, sourceRef, carrier, caseId, medium },
  options = {},
) {
  if (!isNonEmptyString(carrier)) {
    return {
      ok: false,
      kind: "missing_carrier",
      reason: "carrier required before recall",
    };
  }

  if (carrier !== SUBAGENT_CARRIER) {
    return {
      ok: false,
      kind: "unsupported_carrier",
      reason: `unsupported carrier: \`${carrier}\``,
    };
  }

  const env = options.env ?? process.env;
  if (isTruthyEnv(readPhaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_UNAVAILABLE", caseId, phase))) {
    return {
      ok: false,
      kind: "unavailable",
      reason: "carrier unavailable in current environment",
    };
  }

  if (isTruthyEnv(readPhaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_FAIL", caseId, phase))) {
    const failureDetail =
      readPhaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_ERROR", caseId, phase) ?? "environment failure";
    return {
      ok: false,
      kind: "environment_failure",
      reason: `carrier execution failed: ${failureDetail}`,
    };
  }

  const request = buildIitestSubagentRequest({
    phase,
    prompt,
    workspaceRoot,
    sourceRef,
    carrier,
    caseId,
    medium,
  });

  if (typeof options.subagentExecutor === "function") {
    try {
      const answerText = String(options.subagentExecutor(JSON.parse(request)) ?? "").trim();
      if (!isNonEmptyString(answerText)) {
        return {
          ok: false,
          kind: "environment_failure",
          reason: "carrier execution failed: empty response",
        };
      }
      return {
        ok: true,
        answerText,
      };
    } catch (error) {
      return {
        ok: false,
        kind: "environment_failure",
        reason: `carrier execution failed: ${error.message}`,
      };
    }
  }

  const executorCommand = readPhaseScopedEnv(
    env,
    "RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND",
    caseId,
    phase,
  );
  if (isNonEmptyString(executorCommand)) {
    return runCommandBridge(executorCommand, request, env);
  }

  const responseText = readPhaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_RESPONSE", caseId, phase);
  if (isNonEmptyString(responseText)) {
    return {
      ok: true,
      answerText: responseText.trim(),
    };
  }

  return {
    ok: false,
    kind: "unavailable",
    reason: "carrier unavailable in current environment",
  };
}

function formatIitestOutput({
  queuePath,
  carrierLabel,
  taskLines,
  caseItems,
  summary,
}) {
  const lines = [];
  lines.push("1. Queue");
  lines.push(`- \`${queuePath}\``);
  lines.push("");
  lines.push("2. Carrier");
  lines.push(`- \`${carrierLabel}\``);
  lines.push("");
  lines.push("3. Task Execution");
  for (const line of taskLines) {
    lines.push(`- ${line}`);
  }
  lines.push("");
  lines.push("4. Case Results");
  for (const item of caseItems) {
    lines.push(`- \`${item.id}\`: ${item.result}`);
  }
  lines.push("");
  lines.push("5. Summary");
  lines.push(`- executed cases: ${summary.executedCases}`);
  lines.push(`- directly evaluable: ${summary.directlyEvaluable}`);
  lines.push(`- runtime failures: ${summary.runtimeFailures}`);
  lines.push(`- workspace cleaned: ${summary.workspaceCleaned}`);
  return lines.join("\n");
}

export function runIitestSuite(suitePath, options = {}) {
  const suite = loadIitestSuite(suitePath, options.cwd);
  const suiteValidation = validateIitestSuite(suite.data);
  if (!suiteValidation.isValid) {
    return {
      ok: false,
      exitCode: 1,
      output: suiteValidation.errors.join("\n"),
    };
  }

  const queue = loadRecallYaml(suite.data.queue, options.cwd);
  const queueReport = validateRecallData(queue.data);
  if (!queueReport.isValid) {
    return {
      ok: false,
      exitCode: 1,
      output: formatRunEvalOutput({
        yamlPath: queue.path,
        carrierLabel: `\`${suite.data.carrier ?? "unresolved"}\``,
        integrityItems: queueReport.caseReports.map((caseReport) => ({
          id: caseReport.id,
          status: caseReport.errors.length === 0 ? "pass" : "fail",
          reason:
            caseReport.errors.length === 0
              ? "required fields present"
              : caseReport.errors.join(", "),
        })),
        caseItems: [],
        summary: {
          directlyEvaluable: "none",
          refusedForMissingCarrier: "none",
          queueFixesRequired:
            queueReport.caseReports
              .filter((caseReport) => caseReport.errors.length > 0)
              .map((caseReport) => `\`${caseReport.id}\` ${caseReport.errors.join(", ")}`)
              .join("; ") || "none",
          runtimeFailures: "none",
        },
      }),
    };
  }

  const requestedCases = normalizeStringList(options.caseIds ?? []);
  const selectedCaseIds =
    requestedCases.length > 0 ? requestedCases : normalizeStringList(suite.data.cases);
  const caseReports = queueReport.caseReports.filter((caseReport) =>
    selectedCaseIds.includes(caseReport.id),
  );

  if (caseReports.length !== selectedCaseIds.length) {
    const missingCaseIds = selectedCaseIds.filter(
      (caseId) => !caseReports.some((caseReport) => caseReport.id === caseId),
    );
    return {
      ok: false,
      exitCode: 1,
      output: `Missing case ids: ${missingCaseIds.join(", ")}`,
    };
  }

  const workspace = createWorkspaceFromFixture(suite.data.fixture_ref, options.cwd);
  const carrierLabel =
    suite.data.carrier ??
    caseReports
      .map((caseReport) => caseReport.caseValue?.carrier)
      .find((carrier) => isNonEmptyString(carrier)) ??
    "unresolved";

  let workspaceCleaned = "no";
  let result;
  try {
    const firstCase = caseReports[0];
    const firstSourceRef = remapSourceRefToWorkspace(
      firstCase.effectiveSourceRef,
      workspace.fixtureAbsolutePath,
      workspace.workspaceRoot,
    );
    const taskCarrier = resolveEffectiveCarrier(firstCase, suite.data.carrier ?? null);
    const taskResult = executeIitestSubagentPhase(
      {
        phase: "task",
        prompt: suite.data.task_prompt,
        workspaceRoot: workspace.workspaceRoot,
        sourceRef: firstSourceRef,
        carrier: taskCarrier,
        caseId: firstCase.id,
        medium: firstCase.caseValue.medium,
      },
      options,
    );

    const taskLines = [
      `workspace: \`${workspace.workspaceRoot}\``,
      `setup: pass | copied fixture \`${suite.data.fixture_ref}\``,
    ];
    const caseItems = [];
    const directlyEvaluable = [];
    const runtimeFailures = [];

    if (!taskResult.ok) {
      taskLines.push(`task: fail | ${taskResult.reason}`);
      taskLines.push("workspace assert: not run");
      for (const caseReport of caseReports) {
        caseItems.push({
          id: caseReport.id,
          result: `not evaluated | task phase failed: ${taskResult.reason}`,
        });
        runtimeFailures.push(`\`${caseReport.id}\` task phase failed: ${taskResult.reason}`);
      }
    } else {
      taskLines.push(`task: pass | ${taskResult.answerText}`);
      const workspaceAssertReport = verifyWorkspaceAssert(
        workspace.workspaceRoot,
        suite.data.workspace_assert,
      );
      if (!workspaceAssertReport.ok) {
        taskLines.push(`workspace assert: fail | ${workspaceAssertReport.failures.join(", ")}`);
        for (const caseReport of caseReports) {
          caseItems.push({
            id: caseReport.id,
            result: `not evaluated | workspace assert failed: ${workspaceAssertReport.failures.join(", ")}`,
          });
          runtimeFailures.push(
            `\`${caseReport.id}\` workspace assert failed: ${workspaceAssertReport.failures.join(", ")}`,
          );
        }
      } else {
        taskLines.push("workspace assert: pass");
        for (const caseReport of caseReports) {
          const remappedSourceRef = remapSourceRefToWorkspace(
            caseReport.effectiveSourceRef,
            workspace.fixtureAbsolutePath,
            workspace.workspaceRoot,
          );
          const recallCarrier = resolveEffectiveCarrier(caseReport, suite.data.carrier ?? null);
          const recallResult = executeIitestSubagentPhase(
            {
              phase: "recall",
              prompt: caseReport.caseValue.question,
              workspaceRoot: workspace.workspaceRoot,
              sourceRef: remappedSourceRef,
              carrier: recallCarrier,
              caseId: caseReport.id,
              medium: caseReport.caseValue.medium,
            },
            options,
          );

          if (!recallResult.ok) {
            caseItems.push({
              id: caseReport.id,
              result: `not evaluated | ${recallResult.reason}`,
            });
            runtimeFailures.push(`\`${caseReport.id}\` ${recallResult.reason}`);
            continue;
          }

          const scored = scoreAnswer(caseReport, recallResult.answerText);
          caseItems.push({
            id: caseReport.id,
            result: `score=${scored.score} | ${scored.rationale}`,
          });
          if (scored.score === 2) {
            directlyEvaluable.push(`\`${caseReport.id}\``);
          }
        }
      }
    }

    const output = formatIitestOutput({
      queuePath: queue.path,
      carrierLabel,
      taskLines,
      caseItems,
      summary: {
        executedCases:
          caseReports.length > 0 ? caseReports.map((caseReport) => `\`${caseReport.id}\``).join(", ") : "none",
        directlyEvaluable: directlyEvaluable.length > 0 ? directlyEvaluable.join(", ") : "none",
        runtimeFailures: runtimeFailures.length > 0 ? runtimeFailures.join("; ") : "none",
        workspaceCleaned,
      },
    });

    const success =
      runtimeFailures.length === 0 &&
      caseItems.length === caseReports.length &&
      caseItems.every((item) => item.result.startsWith("score=2"));

    result = {
      ok: success,
      exitCode: success ? 0 : 1,
      output,
    };
  } finally {
    if (options.keepWorkspace === true) {
      workspaceCleaned = "no";
    } else {
      fs.rmSync(workspace.workspaceRoot, { recursive: true, force: true });
      workspaceCleaned = "yes";
    }
  }

  result.output = result.output.replace(/workspace cleaned: .+$/, `workspace cleaned: ${workspaceCleaned}`);
  return result;
}
