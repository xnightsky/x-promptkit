import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexSource = readFileSync("cli/pi/extensions/pua/index.ts", "utf8");

test("PUA does not inject missing-tool prompts into agent system prompt", () => {
  assert.doesNotMatch(indexSource, /buildCapabilityDegradePrompt/);
  assert.doesNotMatch(indexSource, /Capability Degrade/);
});

test("PUA capability snapshot is cached until extension reload", () => {
  assert.match(indexSource, /if \(lastCapabilitySnapshot\) return lastCapabilitySnapshot;/);
  assert.doesNotMatch(indexSource, /lastCapabilitySnapshot\s*=\s*null/);
});

test("PUA listens to tool_call so subagent prompts can inherit PUA", () => {
  assert.match(indexSource, /pi\.on\("tool_call"/);
  assert.match(indexSource, /decorateSubagentInput/);
});
