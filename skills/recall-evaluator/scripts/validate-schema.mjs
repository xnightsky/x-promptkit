#!/usr/bin/env node
import { formatValidationReport, loadRecallYaml, validateRecallData } from "./lib.mjs";

const yamlPath = process.argv[2];

if (!yamlPath) {
  console.log("Usage: node skills/recall-evaluator/scripts/validate-schema.mjs <yaml-path|target-path>");
  process.exit(1);
}

let loadedQueue;
try {
  loadedQueue = loadRecallYaml(yamlPath);
} catch (error) {
  console.log(error.message);
  process.exit(1);
}

const { path: inputPath, data } = loadedQueue;
const report = validateRecallData(data);

console.log(formatValidationReport(inputPath, report));
process.exit(report.isValid ? 0 : 1);
