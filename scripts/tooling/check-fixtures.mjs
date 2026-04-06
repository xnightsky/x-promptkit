#!/usr/bin/env node
import fs from "node:fs";
import YAML from "yaml";

import { validateIitestSuite } from "../../skills/recall-evaluator/scripts/iitest-lib.mjs";
import { loadRecallYaml, validateRecallData } from "../../skills/recall-evaluator/scripts/lib.mjs";
import { classifyFixturePath, formatFailures, walkRepoFiles } from "./lib.mjs";

const rootDir = process.cwd();
const yamlFiles = walkRepoFiles(rootDir, {
  extensions: [".yaml", ".yml"],
});
const failures = [];

for (const filePath of yamlFiles) {
  const fixture = classifyFixturePath(filePath);
  if (!fixture) {
    continue;
  }

  if (fixture.kind === "recall") {
    const loaded = loadRecallYaml(filePath, rootDir);
    const report = validateRecallData(loaded.data);
    // The repository keeps both valid fixtures and intentionally broken contract fixtures.
    if (report.isValid !== fixture.expectValid) {
      failures.push(
        `${filePath}: expected ${fixture.expectValid ? "valid" : "invalid"} recall fixture`,
      );
    }
    continue;
  }

  const suite = YAML.parse(fs.readFileSync(filePath, "utf8"));
  const report = validateIitestSuite(suite);
  if (report.isValid !== fixture.expectValid) {
    failures.push(`${filePath}: expected valid integration-test suite`);
  }
}

console.log(formatFailures("check:fixtures", failures));
process.exit(failures.length === 0 ? 0 : 1);
