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
  parseJudgeVerdicts,
  readAnswerInput,
  readAnswersFile,
  scoreAnswer,
  scoreTriggerCase,
  validateRecallData,
} from "./lib.mjs";
import { dirname } from "node:path";
import { findRepoRoot } from "./_shared/model-client.mjs";
import { runJudgeAgent, runRecallAgent, runSkillTriggerAgent } from "./model-agent.mjs";

// 把 scoreAnswer 返回的 decision 累加分格式化成报告后缀。
// 无 decision → 空串（内容线行为不变）；有则并列展示总分、coverage 与逐维命中。
// coverage 红线：不同 coverage 的 decision 分不可比，故 (evaluated/total) 强制展示。
function formatDecisionSuffix(decision) {
  if (!decision) return "";
  const coverage = `(${decision.evaluated}/${decision.total})`;
  const head = decision.score === "FAIL"
    ? `decision=FAIL(knockout @${decision.knockout}) ${coverage}`
    : `decision=${decision.score >= 0 ? "+" : ""}${decision.score} ${coverage}`;
  const dims = decision.perDim
    .map((d) => {
      const sign = d.contribution >= 0 ? "+" : "";
      const mark = d.hit ? "✓" : "✗";
      const got = d.got === null ? "∅" : d.got;
      return `${d.name}=${got}(${sign}${d.contribution})${mark}`;
    })
    .join(" ");
  return ` | ${head} | ${dims}`;
}

// 解析 grader provider：队列级 judge.grader 指名时从已启用 provider 列表按名查，
// 找不到或未指名则回落被测 provider（一个 case 一次调用一个裁判）。
function resolveGrader(provider, providers, judgeConfig) {
  const graderId = judgeConfig && typeof judgeConfig.grader === "string" ? judgeConfig.grader : null;
  if (graderId) {
    const hit = (providers ?? []).find((p) => (p.name ?? p.id) === graderId);
    if (hit) return hit;
  }
  return provider ?? null;
}

// judge 裁定获取（设计 §9）：池非空 → 一次批量调用 → 具名裁定表。
// 环境失败（无 grader / 调用失败 / 回答不可解析）不进打分机——返回 { failed }，
// 由调用方把整 case 标 not evaluated（「环境失败不压分」的既有红线）。
// judge 成功跑了但漏答的键不在表里 = 内容侧缺席，由打分机按 absent 映射处理。
async function collectVerdicts(caseReport, answerText, { provider, providers, judgeConfig }) {
  const pool = caseReport.expected.judgePool;
  if (!pool) return { verdicts: {} };

  const grader = resolveGrader(provider, providers, judgeConfig);
  if (!grader) {
    return { failed: "judge required but no grader available" };
  }
  const items = Object.entries(pool).map(([name, rubric]) => ({ name, rubric }));
  const jr = await runJudgeAgent({
    output: answerText,
    items,
    provider: grader,
    maxRetries: 2,
    timeoutMs: judgeConfig?.timeout_ms,
  });
  if (!jr.ok) return { failed: jr.reason };
  const parsed = parseJudgeVerdicts(jr.answer);
  if (!parsed.ok) return { failed: parsed.reason };
  return { verdicts: parsed.verdicts };
}

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
 * @returns {Promise<{yamlPath, modelLabel, integrityItems, caseItems, summary, reportText}>}
 */
export async function evaluateQueueTarget(yamlPath, opts = {}) {
  const {
    provider = null,
    liveMode = false,
    selectedCaseId = null,
    answer = null,
    answerFile = null,
    answersFile = null,
    providers = [],   // 已启用 provider 全列表（队列级 judge.grader 按名解析用）
  } = opts;

  let loadedQueue;
  try {
    loadedQueue = loadRecallYaml(yamlPath);
  } catch (error) {
    throw new Error(`queue load failed: ${error.message}`);
  }

  const { path: inputPath, absolutePath, data } = loadedQueue;
  const sourceBaseDir = findRepoRoot(dirname(absolutePath));
  const yamlDir = dirname(absolutePath);
  const report = validateRecallData(data, yamlDir);

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

      // skill-trigger 模式：权限控制 shell 自主执行
      if (caseReport.caseValue?.medium === "skill-trigger") {
        // 从队列顶层 skill_trigger.permissions 读取权限配置
        const skillTriggerConfig = data.skill_trigger || {}
        const triggerResult = await runSkillTriggerAgent({
          availableSkills: Array.isArray(caseReport.caseValue?.available_skills)
            ? caseReport.caseValue.available_skills
            : [{ name: caseReport.effectiveSourceRef || "skill", path: caseReport.effectiveSourceRef }],
          question: caseReport.caseValue.question,
          provider,
          baseDir: sourceBaseDir,
          maxSteps: skillTriggerConfig.max_steps ?? undefined,
          timeoutMs: skillTriggerConfig.timeout_ms ?? undefined,
          permissions: skillTriggerConfig.permissions ?? undefined,
        });

        if (!triggerResult.ok) {
          caseItems.push({ id: caseReport.id, result: `not evaluated | ${triggerResult.reason}` });
          runtimeFailures.push(`\`${caseReport.id}\` ${triggerResult.reason}`);
          continue;
        }

        // judge 裁定池（若 expected.judge 非空）：trigger 通过后对最终答案做具名裁定，
        // 补足 must_run 子串证明不了的语义校验（如"是否真的读懂了附件内容"）。
        // 无池时 collectVerdicts 直接返回空裁定、不调用 grader，零额外开销。
        const collected = await collectVerdicts(caseReport, triggerResult.finalAnswer ?? "", {
          provider,
          providers,
          judgeConfig: data.judge,
        });
        if (collected.failed) {
          caseItems.push({ id: caseReport.id, result: `not evaluated | ${collected.failed}` });
          runtimeFailures.push(`\`${caseReport.id}\` ${collected.failed}`);
          continue;
        }

        // 用 scoreTriggerCase 打触发分 + 输出分（含 judge 裁定）
        const triggerScored = scoreTriggerCase(caseReport, triggerResult, { verdicts: collected.verdicts });
        caseItems.push({ id: caseReport.id, result: `score=${triggerScored.score} | ${triggerScored.rationale}${formatDecisionSuffix(triggerScored.decision)} | tc=${triggerResult.toolCalls?.length ?? 0}` });
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

    // judge 裁定获取（池非空才真正调用）；环境失败 → 整 case not evaluated，不进打分机
    const collected = await collectVerdicts(caseReport, resolvedAnswerText, {
      provider,
      providers,
      judgeConfig: data.judge,
    });
    if (collected.failed) {
      caseItems.push({ id: caseReport.id, result: `not evaluated | ${collected.failed}` });
      runtimeFailures.push(`\`${caseReport.id}\` ${collected.failed}`);
      continue;
    }
    const scored = scoreAnswer(caseReport, resolvedAnswerText, { verdicts: collected.verdicts });
    caseItems.push({ id: caseReport.id, result: `score=${scored.score} | ${scored.rationale}${formatDecisionSuffix(scored.decision)}` });
    directlyEvaluable.push(`\`${caseReport.id}\``);
  }

  const modelLabel = liveMode && provider
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
    modelLabel,
    integrityItems,
    caseItems,
    summary,
  });

  return {
    yamlPath: inputPath,
    summary,
    modelLabel,
    integrityItems,
    caseItems,
    reportText,
  };
}
