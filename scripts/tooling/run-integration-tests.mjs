#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const testFiles = walkRepoFiles(rootDir, {
  extensions: [".mjs"],
}).filter((filePath) => {
  const normalizedPath = filePath.split(path.sep).join("/");
  // 烧 token 的集成测试按约定命名为 `*.token.ittest.mjs`，`.ittest.mjs` 后缀
  // 天然不匹配下面的 `.test.mjs` 收集规则；保留 `.token.test.mjs` 排除项是
  // 防御旧命名回流——一旦有人误用旧名，也不会在批量入口里烧 token。
  return (
    normalizedPath.startsWith("integration-tests/") &&
    normalizedPath.endsWith(".test.mjs") &&
    !normalizedPath.endsWith(".token.test.mjs")
  );
});

if (testFiles.length === 0) {
  // 非 token 集成测试当前可以为空（token 套件走显式 iitest:token:* 入口，
  // md 协议资产不经 node --test 执行）。空集是有意状态而非故障：按 SKIP
  // 退出 0，让 `npm run verify` 在该状态下仍可达成；新增非 token 集成
  // 测试后本入口自动恢复收集。
  console.log("iitest: SKIP — no non-token integration test files under integration-tests/");
  process.exit(0);
}

// Integration tests create temp workspaces, artifacts, and harness-managed
// environments. Run them serially so shared fixture assumptions stay stable.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
