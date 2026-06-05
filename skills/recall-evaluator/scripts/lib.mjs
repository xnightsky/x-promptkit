import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// 召回评测的纯函数库：负责解析/校验队列 YAML、解析目标路径、按规则打分以及格式化输出。
// 注意：本文件已彻底移除 --live 的本地落盘能力（原 .tmp/recall-runs 运行产物），
// 不再依赖 node:crypto 或 carrier-adapter 的上下文策略；--live 的“现场执行”逻辑仍保留在 run-eval.mjs 中。

// 召回评测队列的必填顶层字段。
const REQUIRED_TOP_LEVEL_FIELDS = ["version", "fallback_answer", "scoring", "cases"];
// 评分表必须覆盖 0/1/2 三档。
const REQUIRED_SCORE_KEYS = ["0", "1", "2"];
// 每个用例的 score_rule 必须给出 full/partial/fail 三种说明。
const REQUIRED_SCORE_RULE_KEYS = ["full", "partial", "fail"];
const YAML_FILE_PATTERN = /\.ya?ml$/i;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// 统一把路径分隔符转为正斜杠，保证跨平台输出一致。
function normalizePathForOutput(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

export function resolveYamlPath(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, inputPath);
}

// 将用户传入的“目标路径”解析为真正的队列 YAML：
// - 直接给出 .yaml/.yml 文件时按显式文件处理；
// - 给出目录或普通文件时，向其所在目录下的 .recall/queue.yaml 发现队列。
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

// 读取并解析队列 YAML，返回原始文本、解析后的数据以及发现信息。
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

// 校验队列顶层结构：必填字段、scoring 三档、cases 非空。
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

// 校验单个用例的 expected 块，并归一化 must/should/must_not 列表。
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

// 校验单个用例的 score_rule 块，必须包含 full/partial/fail。
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

// 校验整个队列数据，逐用例汇总错误，并解析每个用例生效的 source_ref（支持队列级继承与用例级覆盖）。
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

// 把校验结果格式化为 PASS/FAIL 文本报告。
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

// 解析最终生效的 carrier：CLI 覆盖优先于队列/用例自带的 carrier。
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

// 判断 phrase 是否以“非否定”的形式出现在 text 中，避免把“不能继续执行”误判为命中“继续执行”。
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

// 依据 expected 与 score_rule 给答案打分：命中禁止项=0；must 全中=2；部分命中=1。
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

// 读取直接传入的答案：优先 --answer，其次 --answer-file。
export function readAnswerInput({ answer, answerFile }) {
  if (isNonEmptyString(answer)) {
    return answer;
  }

  if (isNonEmptyString(answerFile)) {
    return readFileUtf8(answerFile).trimEnd();
  }

  return null;
}

// 读取整队列答案文件（JSON：caseId -> answerText）。
export function readAnswersFile(filePath) {
  const raw = readFileUtf8(filePath);
  return JSON.parse(raw);
}

// 格式化单个队列目标的评测报告。
// 说明：已移除原 “run artifact” 行，因为不再有本地落盘产物。
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

// 格式化多个队列目标的批量评测报告。
// 说明：已移除原每个 target 摘要末尾的 “run artifact=...” 段。
export function formatBatchRunEvalOutput({ mode, targets }) {
  const lines = [];
  lines.push("Batch Recall Eval");
  lines.push(`- targets: \`${targets.length}\``);
  lines.push(`- mode: \`${mode}\``);
  lines.push("");
  lines.push("Target Summary");

  for (const target of targets) {
    lines.push(
      `- \`${target.yamlPath}\`: directly evaluable=${target.summary.directlyEvaluable}; refused for missing carrier=${target.summary.refusedForMissingCarrier}; queue fixes required=${target.summary.queueFixesRequired}; runtime failures=${target.summary.runtimeFailures ?? "none"}`,
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
