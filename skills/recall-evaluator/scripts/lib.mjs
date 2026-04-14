import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { DEFAULT_CLEAN_CONTEXT_POLICY } from "./carrier-adapter.mjs";

const REQUIRED_TOP_LEVEL_FIELDS = ["version", "fallback_answer", "scoring", "cases"];
const REQUIRED_SCORE_KEYS = ["0", "1", "2"];
const REQUIRED_SCORE_RULE_KEYS = ["full", "partial", "fail"];
const YAML_FILE_PATTERN = /\.ya?ml$/i;
export const DEFAULT_LIVE_RUNS_DIR = "./.tmp/recall-runs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizePathForOutput(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

export function resolveYamlPath(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, inputPath);
}

export function resolveRecallInputPath(inputPath, cwd = process.cwd()) {
  const absoluteInputPath = resolveYamlPath(inputPath, cwd);

  if (YAML_FILE_PATTERN.test(inputPath)) {
    return {
      path: normalizePathForOutput(inputPath),
      absolutePath: absoluteInputPath,
      discovery: {
        mode: "explicit_yaml",
        originalInputPath: inputPath,
      },
    };
  }

  if (!fs.existsSync(absoluteInputPath)) {
    throw new Error(`Cannot resolve target path: ${inputPath}`);
  }

  const inputStats = fs.statSync(absoluteInputPath);
  const targetRoot = inputStats.isDirectory()
    ? absoluteInputPath
    : inputStats.isFile()
      ? path.dirname(absoluteInputPath)
      : null;
  const discoveryMode = inputStats.isDirectory()
    ? "target_directory"
    : inputStats.isFile()
      ? "target_file"
      : "unsupported_target";

  if (!targetRoot) {
    throw new Error(`Unsupported target path: ${inputPath}`);
  }

  const discoveredQueuePath = path.join(targetRoot, ".recall", "queue.yaml");
  if (!fs.existsSync(discoveredQueuePath) || !fs.statSync(discoveredQueuePath).isFile()) {
    throw new Error(
      `No target-local queue found for target: ${inputPath} (expected ${normalizePathForOutput(path.relative(cwd, discoveredQueuePath))})`,
    );
  }

  return {
    path: normalizePathForOutput(path.relative(cwd, discoveredQueuePath)),
    absolutePath: discoveredQueuePath,
    discovery: {
      mode: discoveryMode,
      originalInputPath: inputPath,
    },
  };
}

export function loadRecallYaml(inputPath, cwd = process.cwd()) {
  const resolvedInput = resolveRecallInputPath(inputPath, cwd);
  const absolutePath = resolvedInput.absolutePath;
  const raw = readFileUtf8(absolutePath);
  const data = YAML.parse(raw);

  return {
    path: resolvedInput.path,
    absolutePath,
    raw,
    data,
    discovery: resolvedInput.discovery,
  };
}

function validateTopLevel(data, report) {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (data?.[field] === undefined) {
      report.queueErrors.push(`missing top-level field \`${field}\``);
    }
  }

  if (data?.scoring && typeof data.scoring === "object" && !Array.isArray(data.scoring)) {
    for (const key of REQUIRED_SCORE_KEYS) {
      if (!isNonEmptyString(data.scoring[key])) {
        report.queueErrors.push(`missing scoring key \`${key}\``);
      }
    }
  } else if (data?.scoring !== undefined) {
    report.queueErrors.push("top-level `scoring` must be an object");
  }

  if (!Array.isArray(data?.cases) || data.cases.length === 0) {
    report.queueErrors.push("top-level `cases` must be a non-empty array");
  }
}

function validateExpected(caseValue, caseErrors) {
  const expected = caseValue?.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    caseErrors.push("missing `expected`");
    return {
      mustInclude: [],
      shouldInclude: [],
      mustNotInclude: [],
    };
  }

  const mustInclude = normalizeStringList(expected.must_include);
  const shouldInclude = normalizeStringList(expected.should_include);
  const mustNotInclude = normalizeStringList(expected.must_not_include);

  if (mustInclude.length === 0) {
    caseErrors.push("missing `expected.must_include`");
  }

  if (expected.should_include !== undefined && !Array.isArray(expected.should_include)) {
    caseErrors.push("`expected.should_include` must be an array when present");
  }

  if (expected.must_not_include !== undefined && !Array.isArray(expected.must_not_include)) {
    caseErrors.push("`expected.must_not_include` must be an array when present");
  }

  return {
    mustInclude,
    shouldInclude,
    mustNotInclude,
  };
}

function validateScoreRule(caseValue, caseErrors) {
  const scoreRule = caseValue?.score_rule;
  if (scoreRule === undefined) {
    caseErrors.push("missing `score_rule`");
    return null;
  }

  if (typeof scoreRule !== "object" || Array.isArray(scoreRule)) {
    caseErrors.push("`score_rule` must be an object");
    return null;
  }

  for (const key of REQUIRED_SCORE_RULE_KEYS) {
    if (!isNonEmptyString(scoreRule[key])) {
      caseErrors.push(`missing \`score_rule.${key}\``);
    }
  }

  return scoreRule;
}

export function validateRecallData(data) {
  const report = {
    queueErrors: [],
    caseReports: [],
  };

  validateTopLevel(data, report);

  if (!Array.isArray(data?.cases)) {
    return {
      ...report,
      isValid: report.queueErrors.length === 0,
    };
  }

  const queueSourceRef = isNonEmptyString(data.source_ref) ? data.source_ref : null;

  for (const [index, caseValue] of data.cases.entries()) {
    const caseErrors = [];
    const caseId = isNonEmptyString(caseValue?.id) ? caseValue.id : `case-${index + 1}`;
    const effectiveSourceRef = isNonEmptyString(caseValue?.source_ref)
      ? caseValue.source_ref
      : queueSourceRef;

    if (!isNonEmptyString(caseValue?.id)) {
      caseErrors.push("missing `id`");
    }

    if (!isNonEmptyString(caseValue?.question)) {
      caseErrors.push("missing `question`");
    }

    if (!isNonEmptyString(caseValue?.medium)) {
      caseErrors.push("missing `medium`");
    }

    if (!isNonEmptyString(caseValue?.carrier)) {
      caseErrors.push("missing `carrier`");
    }

    const expected = validateExpected(caseValue, caseErrors);
    const scoreRule = validateScoreRule(caseValue, caseErrors);

    if (!Array.isArray(caseValue?.tags) || normalizeStringList(caseValue.tags).length === 0) {
      caseErrors.push("missing `tags`");
    }

    if (!isNonEmptyString(caseValue?.source_scope)) {
      caseErrors.push("missing `source_scope`");
    }

    if (!isNonEmptyString(effectiveSourceRef)) {
      caseErrors.push("missing effective `source_ref`");
    }

    report.caseReports.push({
      index,
      id: caseId,
      caseValue,
      effectiveSourceRef,
      errors: caseErrors,
      expected,
      scoreRule,
    });
  }

  const isValid =
    report.queueErrors.length === 0 && report.caseReports.every((caseReport) => caseReport.errors.length === 0);

  return {
    ...report,
    isValid,
  };
}

export function formatValidationReport(yamlPath, report) {
  const lines = [];

  if (report.isValid) {
    lines.push(`PASS ${yamlPath}`);
  } else {
    lines.push(`FAIL ${yamlPath}`);
  }

  for (const error of report.queueErrors) {
    lines.push(`- queue: ${error}`);
  }

  for (const caseReport of report.caseReports) {
    if (caseReport.errors.length === 0) {
      continue;
    }

    for (const error of caseReport.errors) {
      lines.push(`- ${caseReport.id}: ${error}`);
    }
  }

  return lines.join("\n");
}

export function resolveEffectiveCarrier(caseReport, cliCarrier) {
  if (isNonEmptyString(cliCarrier)) {
    return cliCarrier;
  }

  if (isNonEmptyString(caseReport?.caseValue?.carrier)) {
    return caseReport.caseValue.carrier;
  }

  return null;
}

function normalizeText(text) {
  return String(text ?? "").toLowerCase();
}

function hasNonNegatedMatch(text, phrase) {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  let searchFrom = 0;

  while (searchFrom < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedPhrase, searchFrom);
    if (index === -1) {
      return false;
    }

    const prefix = normalizedText.slice(Math.max(0, index - 2), index);
    const isNegated =
      prefix.endsWith("不") ||
      prefix.endsWith("别") ||
      prefix.endsWith("没") ||
      prefix.endsWith("勿") ||
      prefix.endsWith("不能") ||
      prefix.endsWith("不要") ||
      prefix.endsWith("不可");

    if (!isNegated) {
      return true;
    }

    searchFrom = index + normalizedPhrase.length;
  }

  return false;
}

export function scoreAnswer(caseReport, answerText) {
  const normalizedAnswer = normalizeText(answerText);
  const mustHits = caseReport.expected.mustInclude.filter((item) =>
    normalizedAnswer.includes(item.toLowerCase()),
  );
  const missingMust = caseReport.expected.mustInclude.filter(
    (item) => !mustHits.includes(item),
  );
  const shouldHits = caseReport.expected.shouldInclude.filter((item) =>
    normalizedAnswer.includes(item.toLowerCase()),
  );
  const mustNotHits = caseReport.expected.mustNotInclude.filter((item) =>
    hasNonNegatedMatch(answerText, item),
  );

  let score = 0;
  let rationale = caseReport.scoreRule?.fail ?? "failed score rule";

  if (mustNotHits.length > 0) {
    score = 0;
    rationale = `${caseReport.scoreRule?.fail ?? "failed score rule"} | must_not_include hit: ${mustNotHits.join(", ")}`;
  } else if (missingMust.length === 0) {
    score = 2;
    rationale = `${caseReport.scoreRule?.full ?? "full score"} | must_include matched`;
  } else if (mustHits.length > 0 || shouldHits.length > 0) {
    score = 1;
    rationale = `${caseReport.scoreRule?.partial ?? "partial score"} | missing: ${missingMust.join(", ")}`;
  }

  return {
    score,
    rationale,
    missingMust,
    mustNotHits,
  };
}

export function readAnswerInput({ answer, answerFile }) {
  if (isNonEmptyString(answer)) {
    return answer;
  }

  if (isNonEmptyString(answerFile)) {
    return readFileUtf8(answerFile).trimEnd();
  }

  return null;
}

export function readAnswersFile(filePath) {
  const raw = readFileUtf8(filePath);
  return JSON.parse(raw);
}

export function createLiveRunId(now = new Date(), suffix = randomUUID()) {
  const timestampPart = now.toISOString().replace(/[:.]/g, "-");
  return `recall-run-${timestampPart}-${suffix}`;
}

export function resolveRunsDir(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, isNonEmptyString(inputPath) ? inputPath : DEFAULT_LIVE_RUNS_DIR);
}

export function buildLiveRunArtifactRecord({
  runId,
  mode,
  startedAt,
  completedAt,
  queuePath,
  selectedCaseId,
  carrierOverride,
  contextPolicy = DEFAULT_CLEAN_CONTEXT_POLICY,
  cases,
}) {
  return {
    version: 1,
    run_id: runId,
    mode,
    started_at: startedAt,
    completed_at: completedAt,
    queue_path: queuePath,
    selected_case_id: selectedCaseId ?? null,
    carrier_override: carrierOverride ?? null,
    context_policy: contextPolicy ? { ...contextPolicy } : null,
    cases: cases.map((item) => ({
      case_id: item.caseId,
      source_ref: item.sourceRef ?? null,
      carrier: item.carrier ?? null,
      question: item.question ?? null,
      answer_text: item.answerText ?? null,
      score: item.score ?? null,
      rationale: item.rationale ?? null,
      status: item.status,
      timestamp: item.timestamp,
      // Persist structured failure metadata so environment failure never looks like a bad recall score.
      runtime_failure: item.runtimeFailure
        ? {
            kind: item.runtimeFailure.kind,
            class: item.runtimeFailure.failureClass,
            reason: item.runtimeFailure.reason,
            retryable: item.runtimeFailure.retryable,
            attempts: item.runtimeFailure.attempts,
            retries_used: item.runtimeFailure.retriesUsed,
            max_retries: item.runtimeFailure.maxRetries,
          }
        : null,
    })),
  };
}

export function persistLiveRunArtifact({ runsDir, runRecord, cwd = process.cwd() }) {
  const resolvedRunsDir = resolveRunsDir(runsDir, cwd);
  const runDirectory = path.join(resolvedRunsDir, runRecord.run_id);
  const artifactPath = path.join(runDirectory, "result.json");

  fs.mkdirSync(runDirectory, { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(runRecord, null, 2)}\n`);

  return {
    runsDir: resolvedRunsDir,
    runDirectory,
    artifactPath,
    relativeArtifactPath: normalizePathForOutput(path.relative(cwd, artifactPath)),
  };
}

export function formatRunEvalOutput({
  yamlPath,
  carrierLabel,
  integrityItems,
  caseItems,
  summary,
}) {
  const lines = [];
  lines.push("1. Queue");
  lines.push(`- \`${yamlPath}\``);
  lines.push("");
  lines.push("2. Carrier");
  lines.push(`- ${carrierLabel}`);
  lines.push("");
  lines.push("3. Integrity Check");
  for (const item of integrityItems) {
    lines.push(`- \`${item.id}\`: ${item.status} | ${item.reason}`);
  }
  lines.push("");
  lines.push("4. Case Results");
  for (const item of caseItems) {
    lines.push(`- \`${item.id}\`: ${item.result}`);
  }
  lines.push("");
  lines.push("5. Summary");
  lines.push(`- directly evaluable: ${summary.directlyEvaluable}`);
  lines.push(`- refused for missing carrier: ${summary.refusedForMissingCarrier}`);
  lines.push(`- queue fixes required: ${summary.queueFixesRequired}`);
  lines.push(`- runtime failures: ${summary.runtimeFailures ?? "none"}`);
  lines.push(`- run artifact: ${summary.runArtifact ?? "none"}`);
  return lines.join("\n");
}

export function formatBatchRunEvalOutput({ mode, targets }) {
  const lines = [];
  lines.push("Batch Recall Eval");
  lines.push(`- targets: \`${targets.length}\``);
  lines.push(`- mode: \`${mode}\``);
  lines.push("");
  lines.push("Target Summary");

  for (const target of targets) {
    lines.push(
      `- \`${target.yamlPath}\`: directly evaluable=${target.summary.directlyEvaluable}; refused for missing carrier=${target.summary.refusedForMissingCarrier}; queue fixes required=${target.summary.queueFixesRequired}; runtime failures=${target.summary.runtimeFailures ?? "none"}; run artifact=${target.summary.runArtifact ?? "none"}`,
    );
  }

  lines.push("");
  lines.push("Target Reports");
  for (const [index, target] of targets.entries()) {
    lines.push(`## \`${target.yamlPath}\``);
    lines.push(target.reportText);
    if (index < targets.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}
