// skills-def/recall-eval/scripts/lib.mjs
//
// recall-eval 技能的纯函数运行时库。
//
// 本模块是 recall-eval skill 契约的代码实现层，所有导出函数为纯逻辑、
// 无副作用(除文件 I/O)，供 CLI 入口(run-eval / validate-schema / resolve-target)
// 和测试套件共享。
//
// 模块功能分区：
//   ┌─ 路径解析层 ──────────────────────────────────────────────────────┐
//   │ resolveRecallInputPath / loadRecallYaml                             │
//   │   · 显式 YAML 路径 → 直接使用                                       │
//   │   · 目标文件/目录 → 发现其 .recall/queue.yaml                       │
//   ├─ 校验层 ──────────────────────────────────────────────────────────┤
//   │ validateRecallData                                                  │
//   │   · shape 校验由独立 schema 文件驱动(结构权威)：                   │
//   │     ../schemas/recall-queue.schema.yaml                             │
//   │     + _shared/schemas/prompt-context-layers.schema.yaml(context 块)│
//   │   · 代码只补 schema 表达不了的跨字段语义：                          │
//   │     生效 source_ref(队列级继承+用例级覆盖)、context 的 global path │
//   │   · 可选 context 块(队列级/用例级整块覆盖)：是否加载项目/全局提示词│
//   ├─ 打分层 ──────────────────────────────────────────────────────────┤
//   │ scoreAnswer / hasNonNegatedMatch                                    │
//   │   · 命中 must_not_include → 0 分                                   │
//   │   · 缺 must_include → 0 分                                         │
//   │   · must 全中 + should 全中 → 2 分                                 │
//   │   · must 全中 + should 不全 → 1 分                                 │
//   │   · 否定前缀检测：避免把"不能继续执行"误判为命中"继续执行"         │
//   ├─ carrier 解析层 ──────────────────────────────────────────────────┤
//   │ resolveEffectiveCarrier                                             │
//   │   · CLI --carrier > case.carrier，均无则返回 null                   │
//   └─ 输出格式化层 ────────────────────────────────────────────────────┘
//     formatValidationReport / formatRunEvalOutput / formatBatchRunEvalOutput
//
// 注意：本文件已彻底移除 --live 的本地落盘能力(原 .tmp/recall-runs 运行产物)，
// 不再依赖 node:crypto 或 carrier-adapter 的上下文策略；--live 的"现场执行"
// 逻辑仍保留在 run-eval.mjs 中。任何可复用的打分 / carrier 策略变更都应
// 沉淀到此共享层，而不是 CLI 入口。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateContextSemantics } from "../../_shared/prompt-context.mjs";
import { loadSchemaFile, validateAgainstSchema } from "../../_shared/schema-validator.mjs";

// ── Carrier 与 clean-context 策略常量 ──

// 唯一支持的 recall 执行载体标识。
export const SUBAGENT_CARRIER = "isolated-context-run:subagent";

// 固定 clean-context 策略：live recall 必须以「仅凭记忆、无工具、无搜索、
// 无仓库读取」的方式作答，Object.freeze 保证运行时不可篡改。
export const DEFAULT_CLEAN_CONTEXT_POLICY = Object.freeze({
  id: "clean-context-v1",
  answer_basis: "memory-only",
  tools: "forbidden",
  web_search: "forbidden",
  repo_read: "forbidden",
});

// ── 常量：队列 schema 约束 ──

// 队列契约的结构权威是独立 schema 文件（类 JSON Schema 子集）；
// 本文件只消费 schema，并补 schema 表达不了的跨字段语义
// （生效 source_ref 解析、context 的 global path 要求）。
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_SCHEMA_PATH = path.resolve(SCRIPT_DIR, "..", "schemas", "recall-queue.schema.yaml");
// 队列 schema 通过外部 $ref 复用 _shared 维护的 context 层声明结构
const LAYERS_SCHEMA_PATH = path.resolve(SCRIPT_DIR, "..", "..", "_shared", "schemas", "prompt-context-layers.schema.yaml");

const YAML_FILE_PATTERN = /\.ya?ml$/i;

// ── 内部工具函数 ──

// 判定 value 是否为非空字符串(去首尾空白后非零长度)。
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// 字符串数组归一化：过滤空字符串，非数组值返回空数组。
function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

// 同步读取 UTF-8 文件。
function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// ── 路径解析 ──

// 统一把路径分隔符转为正斜杠，保证跨平台输出一致。
function normalizePathForOutput(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

// 将相对路径解析为绝对路径。
export function resolveYamlPath(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, inputPath);
}

// 将用户传入的"目标路径"解析为真正的队列 YAML:
// - 直接给出 .yaml/.yml 文件时按显式文件处理;
// - 给出目录或普通文件时,向其所在目录下的 .recall/queue.yaml 发现队列。
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

// 读取并解析队列 YAML,返回原始文本、解析后的数据以及发现信息。
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

// 归一化单个用例的 expected 块（shape 校验由 schema 负责，这里只做打分用的数据整形）。
function normalizeExpected(caseValue) {
  const expected = caseValue?.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return { mustInclude: [], shouldInclude: [], mustNotInclude: [] };
  }

  return {
    mustInclude: normalizeStringList(expected.must_include),
    anyMustInclude: normalizeStringList(expected.any_must_include),  // 至少命中一项
    shouldInclude: normalizeStringList(expected.should_include),
    mustNotInclude: normalizeStringList(expected.must_not_include),
  };
}

// ── 校验层 ──

// 校验整个队列数据，逐用例汇总错误，并解析每个用例生效的 source_ref / context
// （均为：队列级继承 + 用例级整块覆盖）。
//
// shape 校验完全由 schema 文件驱动；错误按路径路由——
// `cases[i].*` 的错误以「用例相对路径」重渲染后归入对应用例
// （如 missing `medium`），其余归入队列级错误。
export function validateRecallData(data) {
  const report = {
    queueErrors: [],
    caseReports: [],
  };

  const schemaErrors = validateAgainstSchema(data, loadSchemaFile(QUEUE_SCHEMA_PATH), {
    registry: {
      "prompt-context-layers.schema.yaml": loadSchemaFile(LAYERS_SCHEMA_PATH),
    },
  });

  const caseErrorsByIndex = new Map();
  for (const error of schemaErrors) {
    const caseMatch = error.path.match(/^cases\[(\d+)\]\.(.+)$/);
    if (caseMatch) {
      const caseIndex = Number(caseMatch[1]);
      if (!caseErrorsByIndex.has(caseIndex)) caseErrorsByIndex.set(caseIndex, []);
      // 用 format 以用例相对路径重渲染消息（cases[0].medium → medium）
      caseErrorsByIndex.get(caseIndex).push(error.format(caseMatch[2]));
    } else {
      report.queueErrors.push(error.message);
    }
  }

  // 队列级 context 的跨字段语义（shape 已由 schema 的外部 $ref 覆盖）
  if (data?.context !== undefined) {
    report.queueErrors.push(...validateContextSemantics(data.context));
  }

  if (!Array.isArray(data?.cases)) {
    return {
      ...report,
      isValid: report.queueErrors.length === 0,
    };
  }

  const queueSourceRef = isNonEmptyString(data.source_ref) ? data.source_ref : null;
  const queueContext = data.context !== undefined ? data.context : null;

  for (const [index, caseValue] of data.cases.entries()) {
    const caseErrors = [...(caseErrorsByIndex.get(index) ?? [])];
    const caseId = isNonEmptyString(caseValue?.id) ? caseValue.id : `case-${index + 1}`;
    const effectiveSourceRef = isNonEmptyString(caseValue?.source_ref)
      ? caseValue.source_ref
      : queueSourceRef;
    // context 与 source_ref 同语义：用例级整块覆盖队列级，不做深合并。
    // 缺省为 null = 不加载任何 repo/global 提示词层（clean-context-v1 基线）。
    const effectiveContext = caseValue?.context !== undefined ? caseValue.context : queueContext;

    if (caseValue?.context !== undefined) {
      caseErrors.push(...validateContextSemantics(caseValue.context));
    }

    // skill-trigger 模式必须提供 trigger 块
    if (caseValue?.medium === "skill-trigger") {
      if (!caseValue?.trigger || typeof caseValue.trigger !== "object" || !Array.isArray(caseValue.trigger.must_run) || caseValue.trigger.must_run.length === 0) {
        caseErrors.push("skill-trigger medium requires a non-empty trigger.must_run list");
      }
    }

    if (!isNonEmptyString(effectiveSourceRef)) {
      caseErrors.push("missing effective `source_ref`");
    }

    const expected = normalizeExpected(caseValue);
    const scoreRule =
      caseValue?.score_rule && typeof caseValue.score_rule === "object" && !Array.isArray(caseValue.score_rule)
        ? caseValue.score_rule
        : null;

    report.caseReports.push({
      index,
      id: caseId,
      caseValue,
      effectiveSourceRef,
      effectiveContext,
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

// ── 输出格式化 ──

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

// ── Carrier 解析 ──

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

// ── 打分引擎 ──

// 将输入文本转为小写，用于大小写不敏感匹配。
function normalizeText(text) {
  return String(text ?? "").toLowerCase();
}

// 判断 phrase 是否以"非否定"的形式出现在 text 中,避免把"不能继续执行"误判为命中"继续执行"。
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
    // 否定前缀分两类：单字否定（紧邻词条，如「没深合并」）与二字否定词
    // （如「没有深合并」「不做深合并」「而非深合并」）。后者是真实模型回答的
    // 高频形态，漏判会把正确的否定表述误记为命中 must_not_include
    // （live 自测中实际踩到过「不做」「没有」两例）。
    const isNegated =
      prefix.endsWith("不") ||
      prefix.endsWith("别") ||
      prefix.endsWith("没") ||
      prefix.endsWith("勿") ||
      prefix.endsWith("不能") ||
      prefix.endsWith("不要") ||
      prefix.endsWith("不可") ||
      prefix.endsWith("不做") ||
      prefix.endsWith("不会") ||
      prefix.endsWith("不是") ||
      prefix.endsWith("没有") ||
      prefix.endsWith("并非") ||
      prefix.endsWith("而非");

    if (!isNegated) {
      return true;
    }

    searchFrom = index + normalizedPhrase.length;
  }

  return false;
}

// 依据 expected 与 score_rule 给答案打分:命中禁止项=0;must 全中=2;部分命中=1。
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
    // all must_include matched; check any_must_include (at least one)
    const anyList = caseReport.expected.anyMustInclude ?? []
    const anyMustHits = anyList.filter((item) =>
      normalizedAnswer.includes(item.toLowerCase()),
    );
    if (anyList.length > 0 && anyMustHits.length === 0) {
      score = 1;
      rationale = `${caseReport.scoreRule?.partial ?? "partial score"} | missing any: ${anyList.join(", ")}`;
    } else {
      score = 2;
      rationale = `${caseReport.scoreRule?.full ?? "full score"} | must_include matched`;
    }
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

// ── skill-trigger 评分 ──

/**
 * 对 skill-trigger 模式的 case 打分。
 * 检查：trigger.must_run 是否在 toolCalls 中出现（子串）,
 *       trigger.must_not_run 是否被触发,
 *       finalAnswer 是否符合 expected。
 */
export function scoreTriggerCase(caseReport, { toolCalls, finalAnswer }) {
  const commands = (toolCalls ?? []).map((tc) => tc.command ?? "").join("\n")
  const trigger = caseReport.caseValue?.trigger ?? {}
  const mustRun = Array.isArray(trigger.must_run) ? trigger.must_run : []
  const mustNotRun = Array.isArray(trigger.must_not_run) ? trigger.must_not_run : []

  // 检查禁止命令
  const forbiddenHits = mustNotRun.filter((forbidden) =>
    commands.includes(forbidden),
  )
  if (forbiddenHits.length > 0) {
    return {
      score: 0,
      rationale: `forbidden command triggered: ${forbiddenHits.join(", ")}`,
      triggerMatches: [],
      triggerMissing: mustRun,
    }
  }

  // 检查必须命令（子串匹配）
  const triggerMatches = []
  const triggerMissing = []
  for (const required of mustRun) {
    if (commands.includes(required)) {
      triggerMatches.push(required)
    } else {
      triggerMissing.push(required)
    }
  }

  if (triggerMissing.length > 0) {
    return {
      score: 0,
      rationale: `skill not triggered | missing: ${triggerMissing.join(", ")}`,
      triggerMatches,
      triggerMissing,
    }
  }

  // trigger 通过，检查输出
  const outputScore = scoreAnswer(caseReport, finalAnswer ?? "")
  return {
    ...outputScore,
    triggerMatches,
    triggerMissing,
  }
}

// ── 答案输入 ──

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

// 读取整队列答案文件(JSON:caseId -> answerText)。
export function readAnswersFile(filePath) {
  const raw = readFileUtf8(filePath);
  return JSON.parse(raw);
}

// 格式化单个队列目标的评测报告。
// 说明:已移除原 "run artifact" 行,因为不再有本地落盘产物。
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
// 说明:已移除原每个 target 摘要末尾的 "run artifact=..." 段。
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
