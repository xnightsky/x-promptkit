import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const skillPath = path.join(repoRoot, "skills", "guided-review", "SKILL.md");
const helpPath = path.join(repoRoot, "skills", "guided-review", "HELP.md");
const examplesPath = path.join(repoRoot, "skills", "guided-review", "EXAMPLES.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("guided-review help companion keeps the compact help skeleton", () => {
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

test("guided-review skill routes explicit help requests to HELP.md", () => {
  const skill = read(skillPath);

  assert.match(skill, /### `help-mode`/);
  assert.match(skill, /independent `\$guided-review --help` snippet/);
  assert.match(skill, /respond with the compact help skeleton from \[HELP\.md\]/);
  assert.match(skill, /do not enter `review-guide`, `detail-clarifier`, or `return-to-review`/);
});

test("guided-review skill locks the rolling question workflow", () => {
  const skill = read(skillPath);

  assert.match(skill, /ask 1 to 2 high-value questions at a time, up to 2 to 4 total for the review point/);
  assert.match(skill, /Treat 2 to 4 as the total budget for the whole review point, not a per-turn quota/);
  assert.match(skill, /If you already have a partial answer, return it immediately/);
  assert.match(skill, /Do not wait until you have all 2 to 4 questions before replying/);
  assert.match(skill, /`Guiding Questions` is a rolling section/);
});

test("guided-review examples lock the help-mode positive and negative cases", () => {
  const examples = read(examplesPath);

  assert.match(examples, /## Case 00: help 请求走独立帮助骨架/);
  assert.match(examples, /先别开始，给我 `\$guided-review --help` 看看/);
  assert.match(examples, /输出包含 `Skill`、`When To Use`、`What To Provide`、`Quick Start`/);
  assert.match(examples, /不输出 `Current Review Point`/);
  assert.match(examples, /字符串 `\$guided-review --help` 是什么含义/);
  assert.match(examples, /`\$guided-review --hel`/);
});

test("guided-review examples lock the gradual disclosure flow", () => {
  const examples = read(examplesPath);

  assert.match(examples, /当前轮只提出 1 到 2 个高价值问题/);
  assert.match(examples, /只要已有部分答案、局部证据或一个风险信号，就立即返回给 reviewer/);
  assert.match(examples, /不等待凑满 4 个问题才开始回应/);
  assert.match(examples, /如果已有部分结论，先回答当前问题，再继续剩余问题/);
  assert.match(examples, /## Case 05: 循环提问并渐进披露/);
  assert.match(examples, /首轮只问 1 到 2 个当前最值钱的问题/);
});

test("guided-review skill locks interruption-based clarification and return-to-review", () => {
  const skill = read(skillPath);
  const examples = read(examplesPath);

  assert.match(skill, /### `detail-clarifier`/);
  assert.match(skill, /The reviewer may enter this mode by interrupting the current review to challenge your judgment or ask a code-knowledge question/);
  assert.match(skill, /Do not stop at explanation\. Translate the clarified detail back into review impact\./);
  assert.match(skill, /### `return-to-review`/);
  assert.match(examples, /## Case 02: reviewer 遇到技术细节盲点/);
  assert.match(examples, /最后切回 `return-to-review`/);
});

test("guided-review skill locks evidence escalation through official docs before public web sources", () => {
  const skill = read(skillPath);
  const examples = read(examplesPath);

  assert.match(
    skill,
    /1\. current code and call chain[\s\S]*2\. tests, fixtures, and comments[\s\S]*3\. repository docs[\s\S]*4\. official docs[\s\S]*5\. public web sources only when the earlier layers are insufficient/,
  );
  assert.match(examples, /## Case 03: 需要查官方资料再判断/);
  assert.match(examples, /查询官方文档或可信资料/);
  assert.match(examples, /把查询结果翻译成 review 影响/);
});

test("guided-review skill locks the ready-to-write comment structure", () => {
  const skill = read(skillPath);
  const examples = read(examplesPath);

  assert.match(skill, /When the direction is `ready-to-write comment`, add:/);
  assert.match(skill, /1\. `concern`/);
  assert.match(skill, /2\. `why it matters`/);
  assert.match(skill, /3\. `evidence`/);
  assert.match(skill, /4\. `suggested question or change`/);
  assert.match(examples, /## Case 04: 收束成 review comment/);
  assert.match(examples, /使用固定结构：/);
});

test("guided-review docs reject broad checklist sweeps as the default review entry", () => {
  const skill = read(skillPath);
  const help = read(helpPath);

  assert.match(skill, /Do not open with a broad checklist\./);
  assert.match(skill, /repository-wide checklist sweeps as the default starting point/);
  assert.match(help, /一上来就做仓库级 checklist 扫描/);
});
