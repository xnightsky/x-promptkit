import { spawnSync } from "node:child_process";

export const SUBAGENT_CARRIER = "isolated-context-run:subagent";
export const DEFAULT_CLEAN_CONTEXT_POLICY = Object.freeze({
  id: "clean-context-v1",
  answer_basis: "memory-only",
  tools: "forbidden",
  web_search: "forbidden",
  repo_read: "forbidden",
});

const FAILURE_RETRY_BUDGET = Object.freeze({
  rate_limited: 2,
  bridge_stream_closed: 1,
  thread_limit: 0,
  unavailable: 0,
  environment_failure: 0,
});

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

function trimSpawnText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneCleanContextPolicy() {
  return { ...DEFAULT_CLEAN_CONTEXT_POLICY };
}

export function classifyRuntimeFailure(kind, reason) {
  const normalizedReason = String(reason ?? "").toLowerCase();

  if (kind === "missing_carrier" || kind === "unsupported_carrier") {
    return {
      failureClass: kind,
      retryable: false,
      maxRetries: 0,
    };
  }

  if (kind === "unavailable") {
    return {
      failureClass: "unavailable",
      retryable: false,
      maxRetries: FAILURE_RETRY_BUDGET.unavailable,
    };
  }

  if (
    /\b429\b/.test(normalizedReason) ||
    normalizedReason.includes("rate limit") ||
    normalizedReason.includes("too many requests") ||
    normalizedReason.includes("quota")
  ) {
    return {
      failureClass: "rate_limited",
      retryable: true,
      maxRetries: FAILURE_RETRY_BUDGET.rate_limited,
    };
  }

  if (
    normalizedReason.includes("thread limit") ||
    normalizedReason.includes("thread ceiling") ||
    normalizedReason.includes("too many threads") ||
    normalizedReason.includes("concurrency limit")
  ) {
    return {
      failureClass: "thread_limit",
      retryable: false,
      maxRetries: FAILURE_RETRY_BUDGET.thread_limit,
    };
  }

  if (
    normalizedReason.includes("bridge down") ||
    normalizedReason.includes("stream closed") ||
    normalizedReason.includes("broken pipe") ||
    normalizedReason.includes("eof") ||
    normalizedReason.includes("econnreset") ||
    normalizedReason.includes("epipe")
  ) {
    return {
      failureClass: "bridge_stream_closed",
      retryable: true,
      maxRetries: FAILURE_RETRY_BUDGET.bridge_stream_closed,
    };
  }

  return {
    failureClass: "environment_failure",
    retryable: false,
    maxRetries: FAILURE_RETRY_BUDGET.environment_failure,
  };
}

export function buildRuntimeFailure({ kind, reason, attempts = 1 }) {
  const classified = classifyRuntimeFailure(kind, reason);
  return {
    ok: false,
    kind,
    reason,
    failureClass: classified.failureClass,
    retryable: classified.retryable,
    maxRetries: classified.maxRetries,
    attempts,
    retriesUsed: Math.max(0, attempts - 1),
  };
}

export function formatRuntimeFailureReason(result) {
  if (!result || result.ok) {
    return "";
  }

  const retrySummary = `${result.retriesUsed}/${result.maxRetries}`;
  return `${result.reason} (class=${result.failureClass}, retries=${retrySummary})`;
}

export function runWithRuntimeRetries(runAttempt) {
  let attempts = 0;

  while (true) {
    attempts += 1;
    const result = runAttempt();
    if (result.ok) {
      return {
        ...result,
        attempts,
        retriesUsed: Math.max(0, attempts - 1),
      };
    }

    // Retry policy is failure-class driven so live recall runs normalize 429 / bridge EOF / thread limits consistently.
    const failure = buildRuntimeFailure({
      kind: result.kind,
      reason: result.reason,
      attempts,
    });
    if (!failure.retryable || attempts > failure.maxRetries) {
      return failure;
    }
  }
}

export function isSupportedRecallCarrier(carrier) {
  return carrier === SUBAGENT_CARRIER;
}

export function buildRecallRequest({ caseReport, carrier }) {
  return JSON.stringify({
    phase: "recall",
    source_ref: caseReport.effectiveSourceRef,
    question: caseReport.caseValue.question,
    prompt: caseReport.caseValue.question,
    carrier,
    case_id: caseReport.id,
    medium: caseReport.caseValue.medium,
    // Every live recall bridge sees the same policy object so runs stay comparable across hosts.
    context_policy: cloneCleanContextPolicy(),
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

export function executeRecallViaCarrier(caseReport, carrier, options = {}) {
  if (!isNonEmptyString(carrier)) {
    return buildRuntimeFailure({
      kind: "missing_carrier",
      reason: "carrier required before recall",
    });
  }

  if (!isSupportedRecallCarrier(carrier)) {
    return buildRuntimeFailure({
      kind: "unsupported_carrier",
      reason: `unsupported carrier: \`${carrier}\``,
    });
  }

  const env = options.env ?? process.env;
  const caseId = caseReport.id;

  return runWithRuntimeRetries(() => {
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
  });
}
