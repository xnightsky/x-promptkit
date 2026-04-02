#!/usr/bin/env node
import {
  formatRunEvalOutput,
  loadRecallYaml,
  readAnswerInput,
  readAnswersFile,
  resolveEffectiveCarrier,
  scoreAnswer,
  validateRecallData,
} from "./lib.mjs";

const args = process.argv.slice(2);
const yamlPath = args[0];

function valueFor(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

if (!yamlPath) {
  console.log(
    "Usage: node scripts/recall-eval/run-eval.mjs <yaml-path> [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path>] [--carrier <carrier>]",
  );
  process.exit(1);
}

const selectedCaseId = valueFor("--case");
const cliCarrier = valueFor("--carrier");
const answer = valueFor("--answer");
const answerFile = valueFor("--answer-file");
const answersFile = valueFor("--answers-file");

const { path: inputPath, data } = loadRecallYaml(yamlPath);
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
  if (typeof answerText !== "string") {
    caseItems.push({
      id: caseReport.id,
      result: "not evaluated | missing answer input",
    });
    continue;
  }

  const scored = scoreAnswer(caseReport, answerText);
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

console.log(
  formatRunEvalOutput({
    yamlPath: inputPath,
    carrierLabel: `\`${carrierLabel}\``,
    integrityItems,
    caseItems,
    summary: {
      directlyEvaluable: directlyEvaluable.length > 0 ? directlyEvaluable.join(", ") : "none",
      refusedForMissingCarrier:
        refusedForMissingCarrier.length > 0 ? refusedForMissingCarrier.join(", ") : "none",
      queueFixesRequired: queueFixesRequired.length > 0 ? queueFixesRequired.join("; ") : "none",
    },
  }),
);
