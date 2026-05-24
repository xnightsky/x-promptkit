import test from "node:test";
import assert from "node:assert/strict";

import {
  detectFrustration,
  checkIntegrity,
  CommandHistory,
  buildCompactStateMarkdown,
  detectCompletionClaim,
  hasVerificationEvidence,
  analyzeTurn,
  resolveEnforcementConfig,
  DEFAULT_ENFORCEMENT_CONFIG,
} from "../cli/pi/extensions/pua/enforcement.ts";

// ═══════════════════════════════════════════════════════════════
// resolveEnforcementConfig
// ═══════════════════════════════════════════════════════════════

test("resolveEnforcementConfig returns defaults when no user config", () => {
  const config = resolveEnforcementConfig(undefined);
  assert.deepEqual(config, DEFAULT_ENFORCEMENT_CONFIG);
});

test("resolveEnforcementConfig merges user overrides", () => {
  const config = resolveEnforcementConfig({ enforcement_level: "enforce" });
  assert.equal(config.enforcement_level, "enforce");
  assert.equal(config.integrity_guard, true);
});

// ═══════════════════════════════════════════════════════════════
// detectFrustration
// ═══════════════════════════════════════════════════════════════

test("detectFrustration matches Chinese frustration phrases", () => {
  assert.equal(detectFrustration("为什么还不行啊"), true);
  assert.equal(detectFrustration("你到底行不行"), true);
  assert.equal(detectFrustration("怎么还是不行"), true);
  assert.equal(detectFrustration("试了这么多次了"), true);
});

test("detectFrustration matches English frustration phrases", () => {
  assert.equal(detectFrustration("why does this still not work"), true);
  assert.equal(detectFrustration("try harder"), true);
  assert.equal(detectFrustration("stop giving up"), true);
  assert.equal(detectFrustration("figure it out"), true);
});

test("detectFrustration ignores normal messages", () => {
  assert.equal(detectFrustration("please fix the bug in utils.ts"), false);
  assert.equal(detectFrustration("add a new feature"), false);
  assert.equal(detectFrustration("帮我看一下这个文件"), false);
  assert.equal(detectFrustration(""), false);
  assert.equal(detectFrustration("hi"), false);
});

// ═══════════════════════════════════════════════════════════════
// checkIntegrity
// ═══════════════════════════════════════════════════════════════

test("checkIntegrity passes normal file writes", () => {
  const result = checkIntegrity("edit", { path: "src/utils.ts" });
  assert.equal(result.level, "pass");
  assert.equal(result.block, false);
});

test("checkIntegrity advisory on test file writes", () => {
  const result = checkIntegrity("edit", { path: "tests/foo.test.ts" });
  assert.equal(result.level, "advisory");
  assert.equal(result.block, false);
  assert.match(result.reason, /四权分立/);
});

test("checkIntegrity advisory on CI writes", () => {
  const result = checkIntegrity("write", { path: ".github/workflows/ci.yml" });
  assert.equal(result.level, "advisory");
  assert.equal(result.block, false);
});

test("checkIntegrity denies hidden test contamination", () => {
  const result = checkIntegrity("edit", { path: "hidden_tests/secret.py" });
  assert.equal(result.level, "deny");
  assert.equal(result.block, true);
  assert.match(result.reason, /污染/);
});

test("checkIntegrity denies hidden solution via bash", () => {
  const result = checkIntegrity("bash", { command: "cat hidden_solution/answer.txt" });
  assert.equal(result.level, "deny");
  assert.equal(result.block, true);
});

test("checkIntegrity passes read-only tools", () => {
  const result = checkIntegrity("read", { path: "tests/foo.test.ts" });
  assert.equal(result.level, "pass");
});

test("checkIntegrity advisory on .env file in bash", () => {
  const result = checkIntegrity("bash", { command: "echo SECRET=x > .env.local" });
  assert.equal(result.level, "advisory");
  assert.match(result.reason, /秘密/);
});

// ═══════════════════════════════════════════════════════════════
// CommandHistory
// ═══════════════════════════════════════════════════════════════

test("CommandHistory does not flag first occurrence", () => {
  const h = new CommandHistory(5);
  h.push("npm test");
  assert.equal(h.isRepetitive("npm test"), false);
});

test("CommandHistory flags repetitive commands after 2+ similar", () => {
  const h = new CommandHistory(5);
  h.push("npm test --filter=auth");
  h.push("npm test --filter=user");
  // Same skeleton: npm test --filter=*
  assert.equal(h.isRepetitive("npm test --filter=admin"), true);
});

test("CommandHistory does not flag different commands", () => {
  const h = new CommandHistory(5);
  h.push("npm test");
  h.push("npm run build");
  h.push("cat README.md");
  assert.equal(h.isRepetitive("git status"), false);
});

test("CommandHistory clear resets state", () => {
  const h = new CommandHistory(5);
  h.push("npm test");
  h.push("npm test");
  h.push("npm test");
  h.clear();
  assert.equal(h.isRepetitive("npm test"), false);
});

// ═══════════════════════════════════════════════════════════════
// buildCompactStateMarkdown
// ═══════════════════════════════════════════════════════════════

test("buildCompactStateMarkdown produces valid markdown", () => {
  const md = buildCompactStateMarkdown({
    timestamp: "2026-05-24T12:00:00Z",
    pressure_level: "L2",
    failure_count: 3,
    current_flavor: "huawei",
    recent_failures: ["npm test", "npm run build"],
  });
  assert.match(md, /# PUA Builder Journal/);
  assert.match(md, /pressure_level: L2/);
  assert.match(md, /failure_count: 3/);
  assert.match(md, /current_flavor: huawei/);
  assert.match(md, /npm test/);
});

test("buildCompactStateMarkdown handles empty failures", () => {
  const md = buildCompactStateMarkdown({
    timestamp: "2026-05-24T12:00:00Z",
    pressure_level: "L0",
    failure_count: 0,
    current_flavor: "alibaba",
    recent_failures: [],
  });
  assert.match(md, /\(none\)/);
});

// ═══════════════════════════════════════════════════════════════
// detectCompletionClaim + hasVerificationEvidence + analyzeTurn
// ═══════════════════════════════════════════════════════════════

test("detectCompletionClaim matches Chinese completion phrases", () => {
  assert.equal(detectCompletionClaim("已完成修复"), true);
  assert.equal(detectCompletionClaim("问题已解决"), true);
  assert.equal(detectCompletionClaim("搞定了"), true);
});

test("detectCompletionClaim matches English completion phrases", () => {
  assert.equal(detectCompletionClaim("Done! The fix is applied."), true);
  assert.equal(detectCompletionClaim("I've fixed the issue."), true);
  assert.equal(detectCompletionClaim("All tests pass now."), true);
});

test("detectCompletionClaim ignores non-completion text", () => {
  assert.equal(detectCompletionClaim("Let me try another approach"), false);
  assert.equal(detectCompletionClaim("我再看看"), false);
});

test("hasVerificationEvidence detects successful bash", () => {
  assert.equal(
    hasVerificationEvidence([
      { toolName: "bash", isError: false, input: { command: "npm test" } },
    ]),
    true
  );
});

test("hasVerificationEvidence rejects failed bash", () => {
  assert.equal(
    hasVerificationEvidence([
      { toolName: "bash", isError: true, input: { command: "npm test" } },
    ]),
    false
  );
});

test("hasVerificationEvidence rejects non-verification tools", () => {
  assert.equal(
    hasVerificationEvidence([
      { toolName: "read", isError: false, input: { path: "foo.ts" } },
    ]),
    false
  );
});

test("analyzeTurn detects unverified completion", () => {
  const h = new CommandHistory(5);
  const result = analyzeTurn(
    "已完成修复，问题解决了。",
    [{ toolName: "read", isError: false }],
    h
  );
  assert.equal(result.unverifiedCompletion, true);
});

test("analyzeTurn passes verified completion", () => {
  const h = new CommandHistory(5);
  const result = analyzeTurn(
    "Done! All tests pass.",
    [{ toolName: "bash", isError: false, input: { command: "npm test" } }],
    h
  );
  assert.equal(result.unverifiedCompletion, false);
});

test("analyzeTurn detects loop from repeated failed commands", () => {
  const h = new CommandHistory(5);
  h.push("npm test");
  h.push("npm test");
  const result = analyzeTurn(
    "Let me try again",
    [{ toolName: "bash", isError: true, input: { command: "npm test" }, tool_name: "bash" }],
    h
  );
  assert.equal(result.loopDetected, true);
});
