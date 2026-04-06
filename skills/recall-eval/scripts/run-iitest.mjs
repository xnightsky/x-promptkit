#!/usr/bin/env node
import { runIitestSuite } from "./iitest-lib.mjs";

const args = process.argv.slice(2);
const suitePath = args[0];

function valueFor(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

if (!suitePath) {
  console.log(
    "Usage: node skills/recall-eval/scripts/run-iitest.mjs <suite-yaml> [--case <id>] [--keep-workspace]",
  );
  process.exit(1);
}

const selectedCaseId = valueFor("--case");
const keepWorkspace = args.includes("--keep-workspace");

const result = runIitestSuite(suitePath, {
  caseIds: selectedCaseId ? [selectedCaseId] : [],
  keepWorkspace,
});

console.log(result.output);
process.exit(result.exitCode);
