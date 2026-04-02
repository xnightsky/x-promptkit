#!/usr/bin/env node
import { formatValidationReport, loadRecallYaml, validateRecallData } from "./lib.mjs";

const yamlPath = process.argv[2];

if (!yamlPath) {
  console.log("Usage: node scripts/recall-eval/validate-schema.mjs <yaml-path>");
  process.exit(1);
}

const { path: inputPath, data } = loadRecallYaml(yamlPath);
const report = validateRecallData(data);

console.log(formatValidationReport(inputPath, report));
process.exit(report.isValid ? 0 : 1);
