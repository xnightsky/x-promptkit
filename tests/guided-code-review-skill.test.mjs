import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const skillPath = path.join(repoRoot, "skills", "guided-code-review", "SKILL.md");
const helpPath = path.join(repoRoot, "skills", "guided-code-review", "HELP.md");
const examplesPath = path.join(repoRoot, "skills", "guided-code-review", "EXAMPLES.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("guided-code-review help companion keeps the compact help skeleton", () => {
  const help = read(helpPath);

  for (const section of [
    "## Skill",
    "## When To Use",
    "## What It Does",
    "## What To Provide",
    "## Quick Start",
    "## Modes",
    "## Not For",
  ]) {
    assert.match(help, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(help, /Current Review Point/);
  assert.doesNotMatch(help, /Guiding Questions/);
  assert.doesNotMatch(help, /Review Direction/);
});

test("guided-code-review skill routes explicit help requests to HELP.md", () => {
  const skill = read(skillPath);

  assert.match(skill, /### `help-mode`/);
  assert.match(skill, /independent `\$guided-code-review --help` snippet/);
  assert.match(skill, /respond with the compact help skeleton from \[HELP\.md\]/);
  assert.match(skill, /do not enter `review-guide`, `detail-clarifier`, or `return-to-review`/);
});

test("guided-code-review examples lock the help-mode positive and negative cases", () => {
  const examples = read(examplesPath);

  assert.match(examples, /## Case 00: help 请求走独立帮助骨架/);
  assert.match(examples, /先别开始，给我 `\$guided-code-review --help` 看看/);
  assert.match(examples, /输出包含 `Skill`、`When To Use`、`What To Provide`、`Quick Start`/);
  assert.match(examples, /不输出 `Current Review Point`/);
  assert.match(examples, /字符串 `\$guided-code-review --help` 是什么含义/);
  assert.match(examples, /`\$guided-code-review --hel`/);
});
