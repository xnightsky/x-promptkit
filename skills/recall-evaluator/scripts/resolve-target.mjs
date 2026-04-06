#!/usr/bin/env node
import { loadRecallYaml, validateRecallData } from "./lib.mjs";

const args = process.argv.slice(2);
const yamlPath = args[0];
const caseFlagIndex = args.indexOf("--case");
const selectedCaseId = caseFlagIndex >= 0 ? args[caseFlagIndex + 1] : null;

if (!yamlPath) {
  console.log(
    "Usage: node skills/recall-evaluator/scripts/resolve-target.mjs <yaml-path> [--case <id>]",
  );
  process.exit(1);
}

const { path: inputPath, data } = loadRecallYaml(yamlPath);
const report = validateRecallData(data);
const queueSourceRef = typeof data?.source_ref === "string" ? data.source_ref : "unresolved";
const caseReports = selectedCaseId
  ? report.caseReports.filter((caseReport) => caseReport.id === selectedCaseId)
  : report.caseReports;

if (selectedCaseId && caseReports.length === 0) {
  console.log(`No case found for id: ${selectedCaseId}`);
  process.exit(1);
}

const lines = [];
lines.push(`Queue: ${inputPath}`);
lines.push(`Queue source_ref: ${queueSourceRef}`);

for (const caseReport of caseReports) {
  lines.push(
    `- ${caseReport.id}: ${caseReport.effectiveSourceRef ?? "unresolved"}${
      caseReport.errors.length > 0 ? ` | errors: ${caseReport.errors.join("; ")}` : ""
    }`,
  );
}

console.log(lines.join("\n"));
process.exit(0);
