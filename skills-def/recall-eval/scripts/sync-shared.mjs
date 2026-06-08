#!/usr/bin/env node
// skills-def/recall-eval/scripts/sync-shared.mjs
//
// 把 skills-def/_shared/ 中 recall-eval 依赖的模块内联到 lib/_shared/，
// 并修正 import 路径，使 skills add 安装后无需外部 _shared/ 目录。
//
// 用法：node scripts/sync-shared.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = dirname(SCRIPT_DIR);             // skills-def/recall-eval/
const SHARED_DIR = join(EVAL_DIR, "..", "_shared"); // skills-def/_shared/
const DEST_DIR = join(EVAL_DIR, "lib", "_shared");
const REPO_ROOT = join(EVAL_DIR, "..", "..");

// 取当前 HEAD commit 短哈希用于锁定版本
let GIT_REF = "unknown";
try {
  GIT_REF = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  // 检测工作区是否有未提交改动
  const stat = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  if (stat.length > 0) GIT_REF += "+uncommitted";
} catch { /* 非 git 环境忽略 */ }

// ── Step 1: 复制 _shared/ 模块 ──
const FILES = [
  "schema-validator.mjs",
  "prompt-context.mjs",
  "model-client.mjs",
  "model-runner.mjs",
];
const SCHEMAS = [
  "schemas/prompt-context-layers.schema.yaml",
];

mkdirSync(join(DEST_DIR, "schemas"), { recursive: true });

for (const file of FILES) {
  const src = join(SHARED_DIR, file);
  const dest = join(DEST_DIR, file);
  if (!existsSync(src)) {
    console.error(`MISSING: ${src}`);
    process.exit(1);
  }
  const srcRel = relative(REPO_ROOT, src);
  const content = readFileSync(src, "utf-8");
  // 若已有 sync header 则跳过，否则在首行注释后插入
  const header = [
    `// synced from ${srcRel} @ ${GIT_REF}`,
    `// DO NOT EDIT — run \`npm run recall:sync-shared\` to regenerate`,
    "",
  ].join("\n");
  if (content.startsWith("// synced from")) {
    writeFileSync(dest, content);
  } else {
    writeFileSync(dest, header + content);
  }
  console.log(`COPIED: _shared/${file} → lib/_shared/${file}`);
}

for (const schema of SCHEMAS) {
  const src = join(SHARED_DIR, schema);
  const dest = join(DEST_DIR, schema);
  if (!existsSync(src)) {
    console.error(`MISSING: ${src}`);
    process.exit(1);
  }
  cpSync(src, dest);
  console.log(`COPIED: _shared/${schema} → lib/_shared/${schema}`);
}

// ── Step 2: 修正 import 路径 ──
const PATH_FIXES = [
  {
    // lib/*.mjs: ../../_shared/ → ./_shared/
    files: [
      "lib/model-agent.mjs",
      "lib/replay-engine.mjs",
      "lib/lib.mjs",
      "lib/evaluate-queue.mjs",
    ],
    from: /"\.\.\/\.\.\/_shared\//g,
    to: '"./_shared/',
  },
  {
    // scripts/run-eval.mjs: ../../_shared/ → ../lib/_shared/
    files: ["scripts/run-eval.mjs"],
    from: /"\.\.\/\.\.\/_shared\//g,
    to: '"../lib/_shared/',
  },
];

for (const fix of PATH_FIXES) {
  for (const relPath of fix.files) {
    const fullPath = join(EVAL_DIR, relPath);
    if (!existsSync(fullPath)) {
      console.error(`MISSING: ${fullPath}`);
      process.exit(1);
    }
    const oldText = readFileSync(fullPath, "utf-8");
    const newText = oldText.replace(fix.from, fix.to);
    if (oldText !== newText) {
      writeFileSync(fullPath, newText);
      console.log(`FIXED: ${relPath}`);
    }
  }
}

// ── Step 3: 修正 lib/lib.mjs 的 LAYERS_SCHEMA_PATH ──
{
  const libPath = join(EVAL_DIR, "lib", "lib.mjs");
  const oldText = readFileSync(libPath, "utf-8");
  const newText = oldText.replace(
    'path.resolve(SCRIPT_DIR, "..", "..", "_shared", "schemas", "prompt-context-layers.schema.yaml")',
    'path.resolve(SCRIPT_DIR, "_shared", "schemas", "prompt-context-layers.schema.yaml")',
  );
  if (oldText !== newText) {
    writeFileSync(libPath, newText);
    console.log("FIXED: lib/lib.mjs LAYERS_SCHEMA_PATH");
  }
}

console.log("\nDone. recall-eval is now self-contained.");
console.log("Run: npm run recall:validate -- .recall/queue.yaml");
