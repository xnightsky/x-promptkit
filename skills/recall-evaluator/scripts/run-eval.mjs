#!/usr/bin/env node
import {
  buildLiveRunArtifactRecord,
  createLiveRunId,
  formatBatchRunEvalOutput,
  formatRunEvalOutput,
  loadRecallYaml,
  persistLiveRunArtifact,
  readAnswerInput,
  readAnswersFile,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "./lib.mjs";
import { executeRecallViaCarrier, isSupportedRecallCarrier } from "./carrier-adapter.mjs";

const VALUE_FLAGS = new Set([
  "--case",
  "--carrier",
  "--runs-dir",
  "--answer",
  "--answer-file",
  "--answers-file",
]);

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
const runsDir = parsedArgs.valueFor("--runs-dir");
const answer = parsedArgs.valueFor("--answer");
const answerFile = parsedArgs.valueFor("--answer-file");
const answersFile = parsedArgs.valueFor("--answers-file");
const batchMode = yamlPaths.length > 1;

if (yamlPaths.length === 0) {
  console.log(
    "Usage: node skills/recall-evaluator/scripts/run-eval.mjs <yaml-path|target-path> [<yaml-path|target-path> ...] [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live] [--carrier <carrier>] [--runs-dir <path>]",
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
  const persistedCases = [];
  const startedAt = new Date().toISOString();

  function pushPersistedCase(caseReport, effectiveCarrier, details) {
    if (!liveMode) {
      return;
    }

    persistedCases.push({
      caseId: caseReport.id,
      sourceRef: caseReport.effectiveSourceRef,
      carrier: effectiveCarrier ?? null,
      question: caseReport.caseValue?.question ?? null,
      answerText: details.answerText ?? null,
      score: details.score ?? null,
      rationale: details.rationale ?? null,
      status: details.status,
      timestamp: new Date().toISOString(),
      runtimeFailure: details.runtimeFailure ?? null,
    });
  }

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
      pushPersistedCase(caseReport, effectiveCarrier, {
        status: "refused",
        rationale: "carrier required before recall",
      });
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
      pushPersistedCase(caseReport, effectiveCarrier, {
        status: refusalKind === "refused" ? "refused" : "not_evaluated",
        rationale: caseReport.errors.join(", "),
      });
      continue;
    }

    const answerText = answersByCase[caseReport.id];
    let resolvedAnswerText = answerText;
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
      pushPersistedCase(caseReport, effectiveCarrier, {
        status: "refused",
        rationale: `unsupported carrier: \`${effectiveCarrier}\``,
      });
      continue;
    }

    if (typeof resolvedAnswerText !== "string" && liveMode) {
      const runtimeResult = executeRecallViaCarrier(caseReport, effectiveCarrier);
      if (!runtimeResult.ok) {
        const resultText =
          runtimeResult.kind === "unsupported_carrier"
            ? `refused | ${runtimeResult.reason}`
            : `not evaluated | ${runtimeResult.reason}`;
        caseItems.push({
          id: caseReport.id,
          result: resultText,
        });
        runtimeFailures.push(`\`${caseReport.id}\` ${runtimeResult.reason}`);
        pushPersistedCase(caseReport, effectiveCarrier, {
          status: runtimeResult.kind === "unsupported_carrier" ? "refused" : "not_evaluated",
          rationale: runtimeResult.reason,
          runtimeFailure:
            runtimeResult.kind === "unsupported_carrier" ? null : runtimeResult.reason,
        });
        continue;
      }

      resolvedAnswerText = runtimeResult.answerText;
    }

    if (typeof resolvedAnswerText !== "string") {
      caseItems.push({
        id: caseReport.id,
        result: "not evaluated | missing answer input",
      });
      pushPersistedCase(caseReport, effectiveCarrier, {
        status: "not_evaluated",
        rationale: "missing answer input",
      });
      continue;
    }

    const scored = scoreAnswer(caseReport, resolvedAnswerText);
    caseItems.push({
      id: caseReport.id,
      result: `score=${scored.score} | ${scored.rationale}`,
    });
    directlyEvaluable.push(`\`${caseReport.id}\``);
    pushPersistedCase(caseReport, effectiveCarrier, {
      answerText: resolvedAnswerText,
      score: scored.score,
      rationale: scored.rationale,
      status: "scored",
    });
  }

  let runArtifact = "none";
  if (liveMode) {
    // Only live runs produce persisted artifacts; score-only mode stays side-effect free.
    const runRecord = buildLiveRunArtifactRecord({
      runId: createLiveRunId(),
      mode: "live",
      startedAt,
      completedAt: new Date().toISOString(),
      queuePath: inputPath,
      selectedCaseId,
      carrierOverride: cliCarrier,
      cases: persistedCases,
    });
    runArtifact = persistLiveRunArtifact({
      runsDir,
      runRecord,
    }).relativeArtifactPath;
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
    runArtifact,
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
