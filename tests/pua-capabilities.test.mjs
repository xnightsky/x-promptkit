import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCapabilitySnapshot,
  buildCapabilityEnhancementPrompt,
  decorateSubagentInput,
  formatCapabilityStatus,
} from "../cli/pi/extensions/pua/capabilities.js";

test("buildCapabilitySnapshot recognizes the PUA baseline tools", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: [
      "read",
      "write",
      "bash",
      "web_search",
      "code_search",
      "fetch_content",
      "get_search_content",
      "mcp",
      "powershell",
      "pwsh-start-job",
      "subagent",
      "set_plan",
      "ask_user",
    ],
    skills: ["pua", "ask-user"],
  });

  assert.equal(snapshot.hasRead, true);
  assert.equal(snapshot.hasWrite, true);
  assert.equal(snapshot.hasShell, true);
  assert.equal(snapshot.hasWebSearch, true);
  assert.equal(snapshot.hasFetchContent, true);
  assert.equal(snapshot.hasMcpProxy, true);
  assert.equal(snapshot.hasPowerShell, true);
  assert.equal(snapshot.hasBackgroundJobs, true);
  assert.equal(snapshot.hasSubagents, true);
  assert.equal(snapshot.hasPlan, true);
  assert.equal(snapshot.hasAskUser, true);
  assert.deepEqual(snapshot.visibilityNotes, []);
});

test("buildCapabilitySnapshot reports unknown visibility without inferring missing baseline tools", () => {
  const snapshot = buildCapabilitySnapshot({});

  assert.equal(snapshot.hasWebSearch, false);
  assert.equal(snapshot.hasShell, false);
  assert.match(snapshot.visibilityNotes.join("\n"), /未获得 PI 可见工具列表/);
  assert.doesNotMatch(snapshot.visibilityNotes.join("\n"), /read 工具/);
});

test("buildCapabilitySnapshot detects MCP direct tools from tool metadata", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "bash", "github_get_issue"],
    allTools: [
      { name: "github_get_issue", source: "pi-mcp-adapter" },
      { name: "local_tool", source: "builtin" },
    ],
  });

  assert.equal(snapshot.hasMcpProxy, false);
  assert.equal(snapshot.hasMcpDirectTools, true);
  assert.equal(snapshot.hasMcp, true);
});

test("buildCapabilitySnapshot ignores tools that are only present in the full registry", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "write"],
    allTools: [
      { name: "bash" },
      { name: "web_search" },
      { name: "github_get_issue", source: "pi-mcp-adapter" },
      { name: "powershell" },
    ],
  });

  assert.deepEqual(snapshot.tools, ["read", "write"]);
  assert.equal(snapshot.hasShell, false);
  assert.equal(snapshot.hasWebSearch, false);
  assert.equal(snapshot.hasMcpDirectTools, false);
  assert.equal(snapshot.hasMcp, false);
  assert.equal(snapshot.hasPowerShell, false);
});

test("buildCapabilitySnapshot does not emit missing-tool negative lists", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "write"],
  });
  const text = snapshot.visibilityNotes.join("\n");

  assert.equal(text, "");
});

test("formatCapabilityStatus summarizes enabled capabilities and visibility", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "write", "bash", "web_search", "fetch_content", "subagent"],
  });
  const text = formatCapabilityStatus(snapshot);

  assert.match(text, /Capability: read, write, shell, web, fetch, subagent/);
  assert.match(text, /Visibility: collected/);
});

test("formatCapabilityStatus does not turn absent runtime metadata into missing read", () => {
  const text = formatCapabilityStatus(buildCapabilitySnapshot({}));

  assert.match(text, /Capability: not collected/);
  assert.match(text, /Visibility:/);
  assert.doesNotMatch(text, /read 工具/);
  assert.doesNotMatch(text, /none visible/);
});

test("buildCapabilityEnhancementPrompt emits positive prompts for visible capabilities only", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "write", "subagent", "web_search", "fetch_content", "mcp", "set_plan", "powershell"],
  });
  const text = buildCapabilityEnhancementPrompt(snapshot);

  assert.match(text, /\[PUA 能力增强\]/);
  assert.match(text, /Sub-agent 也不养闲/);
  assert.match(text, /搜索/);
  assert.match(text, /MCP/);
  assert.match(text, /计划/);
  assert.match(text, /PowerShell/);
  assert.doesNotMatch(text, /未检测到/);
  assert.doesNotMatch(text, /缺失/);
});

test("buildCapabilityEnhancementPrompt ignores capabilities hidden in the full registry", () => {
  const snapshot = buildCapabilitySnapshot({
    selectedTools: ["read", "write"],
    allTools: ["subagent", "web_search", "mcp", "powershell"],
  });
  const text = buildCapabilityEnhancementPrompt(snapshot);

  assert.equal(text, "");
});

test("decorateSubagentInput appends a PUA capsule to subagent prompt fields once", () => {
  const input = {
    prompt: "Investigate the failing integration test.",
    metadata: { id: "task-1" },
  };

  const changed = decorateSubagentInput(input, {
    flavor: "alibaba",
    level: 2,
    failureCount: 3,
  });
  const changedAgain = decorateSubagentInput(input, {
    flavor: "alibaba",
    level: 2,
    failureCount: 3,
  });

  assert.equal(changed, true);
  assert.equal(changedAgain, false);
  assert.match(input.prompt, /\[PUA-SUBAGENT-INJECTED\]/);
  assert.match(input.prompt, /当前 flavor: alibaba/);
  assert.match(input.prompt, /压力等级: L2/);
  assert.match(input.prompt, /三条红线/);
  assert.match(input.prompt, /Investigate the failing integration test\./);
});

test("decorateSubagentInput decorates nested task prompt fields", () => {
  const input = {
    tasks: [
      { prompt: "Read the API docs." },
      { input: { message: "Review the implementation." } },
    ],
  };

  assert.equal(decorateSubagentInput(input, { flavor: "huawei", level: 0, failureCount: 0 }), true);
  assert.match(input.tasks[0].prompt, /\[PUA-SUBAGENT-INJECTED\]/);
  assert.match(input.tasks[1].input.message, /\[PUA-SUBAGENT-INJECTED\]/);
});
