#!/usr/bin/env node
// skills/recall-eval/scripts/run-eval.mjs
//
// 召回评测主 CLI 入口。
//
// 两种运行模式：
//   score-only: 直接传入答案文本（--answer / --answer-file / --answers-file）离线打分。
//   live:       通过模型现场执行召回再打分（--live）；结果内联在报告中。
//
// 用法：
//   node skills/recall-eval/scripts/run-eval.mjs <yaml-path|target-path>
//     [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live]
//   node skills/recall-eval/scripts/run-eval.mjs <path1> <path2> ...  --live

import {
  formatBatchRunEvalOutput,
  formatRunEvalOutput,
  loadRecallYaml,
  readAnswerInput,
  readAnswersFile,
  scoreAnswer,
  validateRecallData,
} from "./lib.mjs";
import { loadProviders } from "../../_shared/model-client.mjs";
import { runRecallAgent } from "./model-agent.mjs";

// 带值的 flag（下一个 arg 为其取值）。
const VALUE_FLAGS = new Set([
  "--case",
  "--answer",
  "--answer-file",
  "--answers-file",
]);

// 极简参数解析：区分"需要取值"的 flag、布尔 flag（--live）与位置参数（yaml 路径）。
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

    if (arg.startsWith("--")) continue;

    positionals.push(arg);
  }

  return {
    positionals,
    valueFor(flag) { return values[flag] ?? null; },
    has(flag) { return booleans.has(flag); },
  };
}

const parsedArgs = parseRunEvalArgs(process.argv.slice(2));
const yamlPaths = parsedArgs.positionals;
const liveMode = parsedArgs.has("--live");
const selectedCaseId = parsedArgs.valueFor("--case");
const answer = parsedArgs.valueFor("--answer");
const answerFile = parsedArgs.valueFor("--answer-file");
const answersFile = parsedArgs.valueFor("--answers-file");
const batchMode = yamlPaths.length > 1;

if (yamlPaths.length === 0) {
  console.log(
    "Usage: node skills/recall-eval/scripts/run-eval.mjs <yaml-path|target-path> [<yaml-path|target-path> ...] [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live]",
  );
  process.exit(1);
}

if (liveMode && (answer !== null || answerFile !== null || answersFile !== null)) {
  console.log("--live cannot be combined with direct answer inputs");
  process.exit(1);
}

if (batchMode && !liveMode) {
  console.log("multiple yaml targets require --live");
  process.exit(1);
}

if (batchMode && selectedCaseId !== null) {
  console.log("--case cannot be combined with multiple yaml targets");
  process.exit(1);
}

// ── Load providers for live mode ──
let provider = null;
if (liveMode) {
  const { active, skipped, noEnvFile } = loadProviders();
  if (noEnvFile || active.length === 0) {
    console.log("SKIP: no active provider available for live recall.");
    process.exit(0);
  }
  provider = active[0];
  if (skipped.length > 0) {
    for (const s of skipped) console.log(`  skip provider [${s.name}]: ${s.reason}`);
  }
}

// 评测单个队列目标。
async function evaluateQueueTarget(yamlPath) {
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
    caseReports = report.caseReports.filter((cr) => cr.id === selectedCaseId);
    if (caseReports.length === 0) {
      console.log(`No case found for id: ${selectedCaseId}`);
      process.exit(1);
    }
  }

  let answersByCase = {};
  if (selectedCaseId) {
    const directAnswer = readAnswerInput({ answer, answerFile });
    if (directAnswer !== null) answersByCase[selectedCaseId] = directAnswer;
  } else if (answersFile) {
    answersByCase = readAnswersFile(answersFile);
  }

  const integrityItems = [];
  const caseItems = [];
  const directlyEvaluable = [];
  const queueFixesRequired = [];
  const runtimeFailures = [];

  for (const caseReport of caseReports) {
    // 完整性检查
    if (caseReport.errors.length === 0) {
      integrityItems.push({ id: caseReport.id, status: "pass", reason: "required fields present" });
    } else {
      integrityItems.push({ id: caseReport.id, status: "fail", reason: caseReport.errors.join(", ") });
      queueFixesRequired.push(`\`${caseReport.id}\` ${caseReport.errors.join(", ")}`);
      caseItems.push({ id: caseReport.id, result: `not evaluated | ${caseReport.errors.join(", ")}` });
      continue;
    }

    let resolvedAnswerText = answersByCase[caseReport.id];

    // --live 模式：通过 model-agent 现场执行
    if (typeof resolvedAnswerText !== "string" && liveMode) {
      const result = await runRecallAgent({
        sourceRef: caseReport.effectiveSourceRef,
        question: caseReport.caseValue.question,
        provider,
        maxRetries: 2,
      });

      if (!result.ok) {
        caseItems.push({ id: caseReport.id, result: `not evaluated | ${result.reason}` });
        runtimeFailures.push(`\`${caseReport.id}\` ${result.reason}`);
        continue;
      }

      resolvedAnswerText = result.answer;
    }

    if (typeof resolvedAnswerText !== "string") {
      caseItems.push({ id: caseReport.id, result: "not evaluated | missing answer input" });
      continue;
    }

    const scored = scoreAnswer(caseReport, resolvedAnswerText);
    caseItems.push({ id: caseReport.id, result: `score=${scored.score} | ${scored.rationale}` });
    directlyEvaluable.push(`\`${caseReport.id}\``);
  }

  const carrierLabel = liveMode ? `\`${provider.name}(${provider.model})\`` : "`direct-answer`";

  const summary = {
    directlyEvaluable: directlyEvaluable.length > 0 ? directlyEvaluable.join(", ") : "none",
    refusedForMissingCarrier: "none",
    queueFixesRequired: queueFixesRequired.length > 0 ? queueFixesRequired.join("; ") : "none",
    runtimeFailures: runtimeFailures.length > 0 ? runtimeFailures.join("; ") : "none",
  };

  const reportText = formatRunEvalOutput({
    yamlPath: inputPath,
    carrierLabel,
    integrityItems,
    caseItems,
    summary,
  });

  return {
    yamlPath: inputPath,
    summary,
    carrierLabel,
    integrityItems,
    caseItems,
    reportText,
  };
}

(async () => {
  const targetResults = [];
  for (const yamlPath of yamlPaths) {
    targetResults.push(await evaluateQueueTarget(yamlPath));
  }

  if (batchMode) {
    console.log(formatBatchRunEvalOutput({ mode: liveMode ? "live" : "score", targets: targetResults }));
  } else {
    console.log(formatRunEvalOutput({
      yamlPath: targetResults[0].yamlPath,
      carrierLabel: targetResults[0].carrierLabel,
      integrityItems: targetResults[0].integrityItems,
      caseItems: targetResults[0].caseItems,
      summary: targetResults[0].summary,
    }));
  }
})();
