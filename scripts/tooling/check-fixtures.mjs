#!/usr/bin/env node
import { loadRecallYaml, validateRecallData } from "../../skills/recall-eval/scripts/lib.mjs";
import { classifyFixturePath, formatFailures, walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const yamlFiles = walkRepoFiles(rootDir, {
  extensions: [".yaml", ".yml"],
});
const failures = [];

for (const filePath of yamlFiles) {
  const fixture = classifyFixturePath(filePath);
  // 只校验 recall 契约 fixture。workspace harness(iitest)已整体移除，
  // 其他分类(如 integration-test yaml)不再做 schema 校验，直接跳过。
  if (!fixture || fixture.kind !== "recall") {
    continue;
  }

  const loaded = loadRecallYaml(filePath, rootDir);
  const report = validateRecallData(loaded.data);
  // 仓库同时保留合法 fixture 与「故意写坏」的契约 fixture。
  if (report.isValid !== fixture.expectValid) {
    failures.push(
      `${filePath}: expected ${fixture.expectValid ? "valid" : "invalid"} recall fixture`,
    );
  }
}

console.log(formatFailures("check:fixtures", failures));
process.exit(failures.length === 0 ? 0 : 1);
