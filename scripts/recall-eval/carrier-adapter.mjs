import { spawnSync } from "node:child_process";

export const SUBAGENT_CARRIER = "isolated-context-run:subagent";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function caseScopedEnvKey(baseKey, caseId) {
  const normalizedCaseId = String(caseId ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return normalizedCaseId.length > 0 ? `${baseKey}_${normalizedCaseId}` : baseKey;
}

function readCaseScopedEnv(env, baseKey, caseId) {
  const specificKey = caseScopedEnvKey(baseKey, caseId);
  return env[specificKey] ?? env[baseKey] ?? null;
}

function isTruthyEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}

export function buildRecallRequest({ caseReport, carrier }) {
  return [
    "You are the recall-evaluator runtime bridge.",
    "Only answer the question using the explicit target bound by `source_ref`.",
    "Do not explain your process.",
    "Do not emit headings, summaries, or markdown wrappers.",
    "Return only the answer body.",
    "",
    `source_ref: ${caseReport.effectiveSourceRef}`,
    `medium: ${caseReport.caseValue.medium}`,
    `carrier: ${carrier}`,
    `question: ${caseReport.caseValue.question}`,
  ].join("\n");
}

function runCommandBridge(command, request, env) {
  const shell = env.RECALL_EVAL_SUBAGENT_SHELL || env.SHELL || "/bin/sh";
  const result = spawnSync(shell, ["-lc", command], {
    env,
    encoding: "utf8",
    input: request,
  });

  if (result.status !== 0) {
    return {
      ok: false,
      kind: "environment_failure",
      reason: `carrier execution failed: ${result.stderr.trim() || `command exited with ${result.status}`}`,
    };
  }

  const answerText = result.stdout.trim();
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

export function executeRecallViaCarrier(caseReport, carrier, options = {}) {
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
  const caseId = caseReport.id;

  if (isTruthyEnv(readCaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_UNAVAILABLE", caseId))) {
    return {
      ok: false,
      kind: "unavailable",
      reason: "carrier unavailable in current environment",
    };
  }

  if (isTruthyEnv(readCaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_FAIL", caseId))) {
    const failureDetail =
      readCaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_ERROR", caseId) ?? "environment failure";
    return {
      ok: false,
      kind: "environment_failure",
      reason: `carrier execution failed: ${failureDetail}`,
    };
  }

  const request = buildRecallRequest({ caseReport, carrier });
  if (typeof options.subagentExecutor === "function") {
    try {
      const answerText = String(options.subagentExecutor({ caseReport, carrier, request }) ?? "").trim();
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

  const executorCommand = readCaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_EXECUTOR_COMMAND", caseId);
  if (isNonEmptyString(executorCommand)) {
    return runCommandBridge(executorCommand, request, env);
  }

  const responseText = readCaseScopedEnv(env, "RECALL_EVAL_SUBAGENT_RESPONSE", caseId);
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
