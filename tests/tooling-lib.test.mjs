import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyFixturePath,
  extractRelativeMarkdownLinks,
  findAbsolutePathMatches,
} from "../scripts/tooling/lib.mjs";

test("extractRelativeMarkdownLinks keeps repo-local links and strips anchors", () => {
  const links = extractRelativeMarkdownLinks(`
[docs](docs/README.md)
[section](./guide.md#top)
[external](https://example.com)
[anchor](#local)
`);

  assert.deepEqual(links, ["docs/README.md", "./guide.md"]);
});

test("findAbsolutePathMatches reports local absolute path strings", () => {
  const repoPath = ["/", "data/projects/x-promptkit/skills/recall-eval/SKILL.md"].join("");
  const tempPath = ["/", "tmp/workspace-123"].join("");
  const matches = findAbsolutePathMatches(`
Use ${repoPath} for the contract.
Do not keep ${tempPath} in committed fixtures.
`);

  assert.deepEqual(matches, [repoPath, tempPath]);
});

test("classifyFixturePath distinguishes recall queues from iitest suites", () => {
  assert.deepEqual(classifyFixturePath("skills/recall-eval/.recall/queue.yaml"), {
    kind: "recall",
    expectValid: true,
  });
  assert.deepEqual(classifyFixturePath("skills/recall-eval/.recall/broken-missing-medium.yaml"), {
    kind: "recall",
    expectValid: false,
  });
  assert.deepEqual(classifyFixturePath("iitests/recall-eval/smoke.test.yaml"), {
    kind: "iitest",
    expectValid: true,
  });
});
