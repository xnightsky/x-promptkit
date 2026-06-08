#!/usr/bin/env node
// skills-def/recall-eval/scripts/validate-schema.mjs
//
// 召回队列 schema 校验 CLI 入口。
//
// 读取并解析给定的 recall YAML(显式路径或目标发现)，逐字段校验
// 顶层结构(scoring 三档、cases 非空)和每个 case 的必填字段(id / question /
// medium / carrier / expected / score_rule / tags / source_scope / source_ref)，
// 将结果格式化为 PASS/FAIL 文本并输出到 stdout。
//
// 退出码 0 = 校验通过，1 = 校验失败或解析错误。
//
// 用法：
//   node skills-def/recall-eval/scripts/validate-schema.mjs <yaml-path|target-path>

import { formatValidationReport, loadRecallYaml, validateRecallData } from "./lib.mjs";

const yamlPath = process.argv[2];

if (!yamlPath) {
  console.log("Usage: node skills-def/recall-eval/scripts/validate-schema.mjs <yaml-path|target-path>");
  process.exit(1);
}

// 读取 yaml，执行全量校验，格式化输出。
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
