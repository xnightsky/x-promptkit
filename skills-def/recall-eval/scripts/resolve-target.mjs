#!/usr/bin/env node
// skills-def/recall-eval/scripts/resolve-target.mjs
//
// 召回队列 target 解析 CLI 入口。
//
// 读取并解析给定的 recall YAML(显式路径或目标发现)，输出队列级 source_ref
// 和每个 case 的有效 source_ref(队列级继承 + case 级覆盖的结果)。
// 同时展示每个 case 的校验错误(如有)。
//
// 用法：
//   node scripts/resolve-target.mjs <yaml-path|target-path> [--case <id>]

import { loadRecallYaml, validateRecallData } from "../lib/lib.mjs";

// 解析 CLI 参数：位置参数 0 为路径，--case 后跟 case id。
const args = process.argv.slice(2);
const yamlPath = args[0];
const caseFlagIndex = args.indexOf("--case");
const selectedCaseId = caseFlagIndex >= 0 ? args[caseFlagIndex + 1] : null;

if (!yamlPath) {
  console.log(
    "Usage: node scripts/resolve-target.mjs <yaml-path|target-path> [--case <id>]",
  );
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
