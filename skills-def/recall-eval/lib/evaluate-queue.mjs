// skills-def/recall-eval/scripts/evaluate-queue.mjs
//
// 召回评测核心：读队列 → 验完整性 → 跑 live/offline → 打分 → 返回结构化结果。
//
// API（供集成测试 import）：
//   import { evaluateQueueTarget } from "./evaluate-queue.mjs"
//   const result = await evaluateQueueTarget("path/to/queue.yaml", { provider, liveMode: true })

import {
  formatRunEvalOutput,
  loadRecallYaml,
  readAnswerInput,
  readAnswersFile,
  scoreAnswer,
  scoreTriggerCase,
  validateRecallData,
} from "./lib.mjs";
import { dirname } from "node:path";
import { findRepoRoot } from "../../_shared/model-client.mjs";
import { runRecallAgent, runSkillTriggerAgent } from "./model-agent.mjs";

/**
 * 评测单个队列目标。
 *
 * @param {string} yamlPath                            - 队列 yaml 路径或 target 路径
 * @param {object} [opts]
 * @param {object} [opts.provider]                     - provider 对象（live 模式必填）
 * @param {boolean} [opts.liveMode=false]              - 是否 live 模式
 * @param {string} [opts.selectedCaseId=null]          - 单 case 筛选
 * @param {string} [opts.answer=null]                  - 直接答案文本
 * @param {string} [opts.answerFile=null]              - 答案文件路径
 * @param {string} [opts.answersFile=null]             - JSON 批量答案文件
 * @returns {Promise<{yamlPath, carrierLabel, integrityItems, caseItems, summary, reportText}>}
 */
export async function evaluateQueueTarget(yamlPath, opts = {}) {
  const {
    provider = null,
    liveMode = false,
    selectedCaseId = null,
    answer = null,
    answerFile = null,
    answersFile = null,
  } = opts;

  let loadedQueue;
  try {
    loadedQueue = loadRecallYaml(yamlPath);
  } catch (error) {
    throw new Error(`queue load failed: ${error.message}`);
  }

  const { path: inputPath, data } = loadedQueue;
  const sourceBaseDir = findRepoRoot(dirname(inputPath));
  const report = validateRecallData(data);

  let caseReports = report.caseReports;
  if (selectedCaseId) {
    caseReports = report.caseReports.filter((cr) => cr.id === selectedCaseId);
    if (caseReports.length === 0) {
      throw new Error(`No case found for id: ${selectedCaseId}`);
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
    if (caseReport.errors.length === 0) {
      integrityItems.push({ id: caseReport.id, status: "pass", reason: "required fields present" });
    } else {
      integrityItems.push({ id: caseReport.id, status: "fail", reason: caseReport.errors.join(", ") });
      queueFixesRequired.push(`\`${caseReport.id}\` ${caseReport.errors.join(", ")}`);
      caseItems.push({ id: caseReport.id, result: `not evaluated | ${caseReport.errors.join(", ")}` });
      continue;
    }

    let resolvedAnswerText = answersByCase[caseReport.id];

    if (typeof resolvedAnswerText !== "string" && liveMode) {
      if (!provider) {
        caseItems.push({ id: caseReport.id, result: "not evaluated | no provider" });
        runtimeFailures.push(`\`${caseReport.id}\` no provider`);
        continue;
      }

      // skill-trigger 模式：白名单 shell 自主执行
      if (caseReport.caseValue?.medium === "skill-trigger") {
        const triggerResult = await runSkillTriggerAgent({
          sourceRef: caseReport.effectiveSourceRef,
          question: caseReport.caseValue.question,
          provider,
          baseDir: sourceBaseDir,
        });

        if (!triggerResult.ok) {
          caseItems.push({ id: caseReport.id, result: `not evaluated | ${triggerResult.reason}` });
          runtimeFailures.push(`\`${caseReport.id}\` ${triggerResult.reason}`);
          continue;
        }

        // 用 scoreTriggerCase 打触发分 + 输出分
        const triggerScored = scoreTriggerCase(caseReport, triggerResult);
        caseItems.push({ id: caseReport.id, result: `score=${triggerScored.score} | ${triggerScored.rationale} | tc=${triggerResult.toolCalls?.length ?? 0}` });
        if (triggerScored.score >= 2) directlyEvaluable.push(`\`${caseReport.id}\``);
        continue;
      }

      // 默认：clean-context-v1 知识召回
      const result = await runRecallAgent({
        sourceRef: caseReport.effectiveSourceRef,
        question: caseReport.caseValue.question,
        provider,
        context: caseReport.effectiveContext ?? undefined,
        maxRetries: 2,
        baseDir: sourceBaseDir,
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

  const carrierLabel = liveMode && provider
    ? `\`${provider.name ?? provider.id}(${provider.model})\``
    : "`direct-answer`";

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
