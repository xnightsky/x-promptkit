#!/usr/bin/env node
import {
  formatBatchRunEvalOutput,
  formatRunEvalOutput,
  loadRecallYaml,
  readAnswerInput,
  readAnswersFile,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "./lib.mjs";
import {
  executeRecallViaCarrier,
  formatRuntimeFailureReason,
  isSupportedRecallCarrier,
} from "./carrier-adapter.mjs";

// 召回评测 CLI 入口。
// 重要：--live 仅表示“通过 carrier 现场执行召回再打分”，本工具不再向本地磁盘落盘任何运行产物。
// 因此原先的 --runs-dir 选项与 .tmp/recall-runs/result.json 落盘逻辑已整体删除。
const VALUE_FLAGS = new Set([
  "--case",
  "--carrier",
  "--answer",
  "--answer-file",
  "--answers-file",
]);

// 极简参数解析：区分需要取值的 flag、布尔 flag 与位置参数。
function parseRunEvalArgs(rawArgs) {
  const positionals = [];
  const values = {};
  const booleans = new Set();

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (VALUE_FLAGS.has(arg)) {
      values[arg] = rawArgs[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--live") {
      booleans.add(arg);
      continue;
    }

    if (arg.startsWith("--")) {
      continue;
    }

    positionals.push(arg);
  }

  return {
    positionals,
    valueFor(flag) {
      return values[flag] ?? null;
    },
    has(flag) {
      return booleans.has(flag);
    },
  };
}

const parsedArgs = parseRunEvalArgs(process.argv.slice(2));
const yamlPaths = parsedArgs.positionals;
const liveMode = parsedArgs.has("--live");
const selectedCaseId = parsedArgs.valueFor("--case");
const cliCarrier = parsedArgs.valueFor("--carrier");
const answer = parsedArgs.valueFor("--answer");
const answerFile = parsedArgs.valueFor("--answer-file");
const answersFile = parsedArgs.valueFor("--answers-file");
const batchMode = yamlPaths.length > 1;

if (yamlPaths.length === 0) {
  console.log(
    "Usage: node skills/recall-evaluator/scripts/run-eval.mjs <yaml-path|target-path> [<yaml-path|target-path> ...] [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live] [--carrier <carrier>]",
  );
  process.exit(1);
}

// --live 走 carrier 现场执行，与直接传入答案互斥。
if (liveMode && (answer !== null || answerFile !== null || answersFile !== null)) {
  console.log("--live cannot be combined with direct answer inputs");
  process.exit(1);
}

// 批量（多个队列目标）只在 --live 下有意义。
if (batchMode && !liveMode) {
  console.log("multiple yaml targets require --live");
  process.exit(1);
}

if (batchMode && selectedCaseId !== null) {
  console.log("--case cannot be combined with multiple yaml targets");
  process.exit(1);
}

// 评测单个队列目标：完整性检查 -> 逐用例解析答案（直接答案/现场执行）-> 打分 -> 汇总。
function evaluateQueueTarget(yamlPath) {
  let loadedQueue;
  try {
    loadedQueue = loadRecallYaml(yamlPath);
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }

  const { path: inputPath, data } = loadedQueue;
  const report = validateRecallData(data);

  let caseReports = report.caseReports;
  if (selectedCaseId) {
    caseReports = report.caseReports.filter((caseReport) => caseReport.id === selectedCaseId);
    if (caseReports.length === 0) {
      console.log(`No case found for id: ${selectedCaseId}`);
      process.exit(1);
    }
  }

  let answersByCase = {};
  if (selectedCaseId) {
    const directAnswer = readAnswerInput({ answer, answerFile });
    if (directAnswer !== null) {
      answersByCase[selectedCaseId] = directAnswer;
    }
  } else if (answersFile) {
    answersByCase = readAnswersFile(answersFile);
  }

  const integrityItems = [];
  const caseItems = [];
  const directlyEvaluable = [];
  const refusedForMissingCarrier = [];
  const queueFixesRequired = [];
  const runtimeFailures = [];

  for (const caseReport of caseReports) {
    if (caseReport.errors.length === 0) {
      integrityItems.push({
        id: caseReport.id,
        status: "pass",
        reason: "required fields present",
      });
    } else {
      integrityItems.push({
        id: caseReport.id,
        status: "fail",
        reason: caseReport.errors.join(", "),
      });
      queueFixesRequired.push(`\`${caseReport.id}\` ${caseReport.errors.join(", ")}`);
    }

    const effectiveCarrier = resolveEffectiveCarrier(caseReport, cliCarrier);
    if (!effectiveCarrier) {
      caseItems.push({
        id: caseReport.id,
        result: "refused | carrier required before recall",
      });
      refusedForMissingCarrier.push(`\`${caseReport.id}\``);
      continue;
    }

    if (caseReport.errors.length > 0) {
      const refusalKind = caseReport.errors.some((error) => error.includes("`carrier`"))
        ? "refused"
        : "not evaluated";
      caseItems.push({
        id: caseReport.id,
        result: `${refusalKind} | ${caseReport.errors.join(", ")}`,
      });
      if (refusalKind === "refused") {
        refusedForMissingCarrier.push(`\`${caseReport.id}\``);
      }
      continue;
    }

    const answerText = answersByCase[caseReport.id];
    let resolvedAnswerText = answerText;
    // 显式指定了不支持的 carrier 覆盖时，直接拒绝，不进入现场执行。
    if (
      typeof resolvedAnswerText !== "string" &&
      typeof cliCarrier === "string" &&
      !isSupportedRecallCarrier(effectiveCarrier)
    ) {
      caseItems.push({
        id: caseReport.id,
        result: `refused | unsupported carrier: \`${effectiveCarrier}\``,
      });
      runtimeFailures.push(`\`${caseReport.id}\` unsupported carrier: \`${effectiveCarrier}\``);
      continue;
    }

    // --live 且无直接答案：通过 carrier 现场执行获取答案；环境/执行失败与队列错误分开记账。
    if (typeof resolvedAnswerText !== "string" && liveMode) {
      const runtimeResult = executeRecallViaCarrier(caseReport, effectiveCarrier);
      if (!runtimeResult.ok) {
        const resultText =
          runtimeResult.kind === "unsupported_carrier"
            ? `refused | ${runtimeResult.reason}`
            : `not evaluated | ${formatRuntimeFailureReason(runtimeResult)}`;
        caseItems.push({
          id: caseReport.id,
          result: resultText,
        });
        runtimeFailures.push(`\`${caseReport.id}\` ${formatRuntimeFailureReason(runtimeResult)}`);
        continue;
      }

      resolvedAnswerText = runtimeResult.answerText;
    }

    if (typeof resolvedAnswerText !== "string") {
      caseItems.push({
        id: caseReport.id,
        result: "not evaluated | missing answer input",
      });
      continue;
    }

    const scored = scoreAnswer(caseReport, resolvedAnswerText);
    caseItems.push({
      id: caseReport.id,
      result: `score=${scored.score} | ${scored.rationale}`,
    });
    directlyEvaluable.push(`\`${caseReport.id}\``);
  }

  const carrierLabel =
    cliCarrier ??
    caseReports
      .map((caseReport) => caseReport.caseValue?.carrier)
      .find((carrier) => typeof carrier === "string") ??
    "unresolved";

  const summary = {
    directlyEvaluable: directlyEvaluable.length > 0 ? directlyEvaluable.join(", ") : "none",
    refusedForMissingCarrier:
      refusedForMissingCarrier.length > 0 ? refusedForMissingCarrier.join(", ") : "none",
    queueFixesRequired: queueFixesRequired.length > 0 ? queueFixesRequired.join("; ") : "none",
    runtimeFailures: runtimeFailures.length > 0 ? runtimeFailures.join("; ") : "none",
  };

  return {
    yamlPath: inputPath,
    summary,
    reportText: formatRunEvalOutput({
      yamlPath: inputPath,
      carrierLabel: `\`${carrierLabel}\``,
      integrityItems,
      caseItems,
      summary,
    }),
  };
}

const targetResults = yamlPaths.map((yamlPath) => evaluateQueueTarget(yamlPath));

if (batchMode) {
  console.log(
    formatBatchRunEvalOutput({
      mode: liveMode ? "live" : "score",
      targets: targetResults,
    }),
  );
} else {
  console.log(targetResults[0].reportText);
}
