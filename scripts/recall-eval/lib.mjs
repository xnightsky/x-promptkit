import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const REQUIRED_TOP_LEVEL_FIELDS = ["version", "fallback_answer", "scoring", "cases"];
const REQUIRED_SCORE_KEYS = ["0", "1", "2"];
const REQUIRED_SCORE_RULE_KEYS = ["full", "partial", "fail"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function resolveYamlPath(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, inputPath);
}

export function loadRecallYaml(inputPath, cwd = process.cwd()) {
  const absolutePath = resolveYamlPath(inputPath, cwd);
  const raw = readFileUtf8(absolutePath);
  const data = YAML.parse(raw);

  return {
    path: inputPath,
    absolutePath,
    raw,
    data,
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
  return lines.join("\n");
}
