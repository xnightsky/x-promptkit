#!/usr/bin/env node
// scripts/sync-handoff-core.mjs
//
// 把「AI CLI 交接」核心单一事实源 skills-def/dev-run/references/{backends,orchestration,scoping}.md
// 与 packages.schema.yaml 镜像进 CC 插件 extensions/claude-code/dev/{references,schemas}/，
// 供 ${CLAUDE_PLUGIN_ROOT}/{references,schemas}/* 运行时读。
// 跨轨道（skill vs 插件）分开安装、无法运行时共享，所以插件侧留一份提交入库的镜像；
// 源只有 skills-def/dev-run/references/ 那一份，改完跑 `npm run sync:handoff-core` 同步。
//
// 用法：
//   node scripts/sync-handoff-core.mjs           生成/覆盖镜像
//   node scripts/sync-handoff-core.mjs --check    只校验镜像是否与源一致（漂移则非零退出，供 npm run check 兜住）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// 日志统一用仓库相对 + 正斜杠路径（Windows 下 join 出反斜杠，防止日志/报错混入本机路径风格）。
const rel = (p) => relative(REPO_ROOT, p).replaceAll("\\", "/");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url)); // scripts/
const REPO_ROOT = dirname(SCRIPT_DIR);
const SRC_DIR = join(REPO_ROOT, "skills-def", "dev-run", "references");
const PLUGIN_DIR = join(REPO_ROOT, "extensions", "claude-code", "dev");

// 镜像清单。md 进插件 references/；yaml schema 进插件 schemas/（保持插件侧既有目录分工）。
// comment 标记镜像头的注释语法：md 用 HTML 注释（渲染不可见），yaml 用 #（yaml 不支持 HTML 注释）。
const MIRRORS = [
  { file: "backends.md", destDir: join(PLUGIN_DIR, "references"), comment: "html" },
  { file: "orchestration.md", destDir: join(PLUGIN_DIR, "references"), comment: "html" },
  { file: "scoping.md", destDir: join(PLUGIN_DIR, "references"), comment: "html" },
  { file: "packages.schema.yaml", destDir: join(PLUGIN_DIR, "schemas"), comment: "hash" },
];

// 静态镜像头。刻意不带 git 短哈希——让 --check 纯按内容比对，不因单纯的 commit 推进而误报漂移。
const HEADER_TEXT =
  "本文件由 scripts/sync-handoff-core.mjs 从 skills-def/dev-run/references/ 镜像生成，请勿手改；改源后跑 `npm run sync:handoff-core`。";
const HEADERS = {
  html: `<!-- ${HEADER_TEXT} -->\n\n`,
  hash: `# ${HEADER_TEXT}\n\n`,
};

const check = process.argv.includes("--check");
const failures = [];

for (const { file, destDir, comment } of MIRRORS) {
  const src = join(SRC_DIR, file);
  if (!existsSync(src)) {
    console.error(`MISSING SOURCE: skills-def/dev-run/references/${file}`);
    process.exit(1);
  }
  const expected = HEADERS[comment] + readFileSync(src, "utf8");
  const dest = join(destDir, file);

  if (check) {
    // 漂移判定：镜像缺失或内容与「头 + 源」不一致即失败。
    if (!existsSync(dest)) {
      failures.push(`${rel(destDir)}/${file}: 镜像缺失`);
    } else if (readFileSync(dest, "utf8") !== expected) {
      failures.push(`${rel(destDir)}/${file}: 与源不一致（跑 npm run sync:handoff-core）`);
    }
    continue;
  }

  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, expected);
  console.log(`SYNCED: skills-def/dev-run/references/${file} → ${rel(destDir)}/${file}`);
}

if (check) {
  if (failures.length === 0) {
    console.log("sync:handoff-core --check: PASS");
    process.exit(0);
  }
  console.error(["sync:handoff-core --check: FAIL", ...failures.map((f) => `- ${f}`)].join("\n"));
  process.exit(1);
}

console.log("\nDone. 插件侧 references/ 与 schemas/ 已与源同步。");
