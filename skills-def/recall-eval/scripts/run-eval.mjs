#!/usr/bin/env node
// skills-def/recall-eval/scripts/run-eval.mjs
//
// 召回评测 CLI 入口。
//
// 用法：
//   node scripts/run-eval.mjs <yaml-path|target-path>
//     [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live]
//   node scripts/run-eval.mjs <path1> <path2> ...  --live
//
// 核心逻辑见 evaluate-queue.mjs，本文件只做 CLI 解析 + 格式化输出。

import { formatBatchRunEvalOutput, formatRunEvalOutput } from "../lib/lib.mjs";
import { loadProviders } from "../lib/_shared/model-client.mjs";
import { evaluateQueueTarget } from "../lib/evaluate-queue.mjs";

// ── CLI 参数解析 ──

const VALUE_FLAGS = new Set([
  "--case", "--answer", "--answer-file", "--answers-file",
]);

function parseArgs(rawArgs) {
  const positionals = [];
  const values = {};
  const booleans = new Set();

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (VALUE_FLAGS.has(arg)) { values[arg] = rawArgs[++i] ?? null; continue; }
    if (arg === "--live") { booleans.add(arg); continue; }
    if (arg.startsWith("--")) continue;
    positionals.push(arg);
  }

  return { positionals, valueFor: (f) => values[f] ?? null, has: (f) => booleans.has(f) };
}

const args = parseArgs(process.argv.slice(2));
const yamlPaths = args.positionals;
const liveMode = args.has("--live");
const selectedCaseId = args.valueFor("--case");
const answer = args.valueFor("--answer");
const answerFile = args.valueFor("--answer-file");
const answersFile = args.valueFor("--answers-file");
const batchMode = yamlPaths.length > 1;

if (yamlPaths.length === 0) {
  console.log("Usage: node scripts/run-eval.mjs <yaml-path|target-path> [--case <id>] [--answer <text> | --answer-file <path> | --answers-file <json-path> | --live]");
  process.exit(1);
}
if (liveMode && (answer !== null || answerFile !== null || answersFile !== null)) {
  console.log("--live cannot be combined with direct answer inputs"); process.exit(1);
}
if (batchMode && !liveMode) {
  console.log("multiple yaml targets require --live"); process.exit(1);
}
if (batchMode && selectedCaseId !== null) {
  console.log("--case cannot be combined with multiple yaml targets"); process.exit(1);
}

// ── Provider（live 模式） ──

let provider = null;
if (liveMode) {
  const { active, skipped, noEnvFile } = loadProviders();
  if (noEnvFile || active.length === 0) {
    console.log("SKIP: no active provider available for live recall."); process.exit(0);
  }
  provider = active[0];
  for (const s of skipped) console.log(`  skip provider [${s.name}]: ${s.reason}`);
}

// ── 运行 ──

(async () => {
  const results = [];
  for (const p of yamlPaths) {
    try {
      results.push(await evaluateQueueTarget(p, { provider, liveMode, selectedCaseId, answer, answerFile, answersFile }));
    } catch (error) {
      console.log(error.message);
      process.exit(1);
    }
  }

  if (batchMode) {
    console.log(formatBatchRunEvalOutput({ mode: liveMode ? "live" : "score", targets: results }));
  } else {
    console.log(results[0].reportText);
  }
})();
