import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// model-agent（召回评测的模型代理）的单元测试。
// 用 echo provider（离线短路，回显完整 prompt）验证 prompt 拼装行为：
// 纯 fake、不消耗真实 AI token，按测试边界约定属于单元测试。

import { runRecallAgent, runJudgeAgent } from "../skills-def/recall-eval/lib/model-agent.mjs";

const ECHO_PROVIDER = { api: "echo", model: "unit-test" };

// 构造一个带 source/repo/global 文件的临时基准目录。
function makeBaseDir() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-model-agent-"));
  fs.writeFileSync(path.join(baseDir, "SKILL.md"), "被召回的 skill 契约内容");
  fs.writeFileSync(path.join(baseDir, "AGENTS.md"), "项目提示词：仓库约束内容");
  fs.writeFileSync(path.join(baseDir, "global.md"), "全局提示词：用户全局记忆内容");
  return baseDir;
}

// 场景：不带 context 声明。预期：只注入 source_ref 与 clean-context 注入，无 repo/global 段。
test("runRecallAgent stays on the clean-context baseline without a context declaration", async () => {
  const baseDir = makeBaseDir();
  const result = await runRecallAgent({
    sourceRef: "SKILL.md",
    question: "契约内容是什么？",
    provider: ECHO_PROVIDER,
    baseDir,
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /policy: clean-context-v1/);
  assert.match(result.answer, /被召回的 skill 契约内容/);
  assert.doesNotMatch(result.answer, /Repo Context/);
  assert.doesNotMatch(result.answer, /Global Context/);
});

// 场景：context 声明启用 repo（缺省 path）与 global（显式 path）。预期：两层都进入 prompt。
test("runRecallAgent injects repo and global layers per the context declaration", async () => {
  const baseDir = makeBaseDir();
  const result = await runRecallAgent({
    sourceRef: "SKILL.md",
    question: "项目提示词说了什么？",
    provider: ECHO_PROVIDER,
    context: {
      repo: { enabled: true }, // path 缺省 → 约定默认 AGENTS.md（相对 baseDir）
      global: { enabled: true, path: path.join(baseDir, "global.md") },
    },
    baseDir,
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /### Repo Context\n\n项目提示词：仓库约束内容/);
  assert.match(result.answer, /### Global Context\n\n全局提示词：用户全局记忆内容/);
  // context 声明不放松 clean-context 红线
  assert.match(result.answer, /policy: clean-context-v1/);
});

// 场景：context 显式关闭两层。预期：与缺省行为一致。
test("runRecallAgent honors explicitly disabled layers", async () => {
  const baseDir = makeBaseDir();
  const result = await runRecallAgent({
    sourceRef: "SKILL.md",
    question: "契约内容是什么？",
    provider: ECHO_PROVIDER,
    context: {
      repo: { enabled: false },
      global: { enabled: false },
    },
    baseDir,
  });

  assert.equal(result.ok, true);
  assert.doesNotMatch(result.answer, /Repo Context/);
  assert.doesNotMatch(result.answer, /Global Context/);
});

// 场景：source_ref 指向不存在的文件。预期：ok=false 且报解析后的路径。
test("runRecallAgent reports a missing source_ref instead of guessing", async () => {
  const baseDir = makeBaseDir();
  const result = await runRecallAgent({
    sourceRef: "MISSING.md",
    question: "随便问",
    provider: ECHO_PROVIDER,
    baseDir,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /source_ref not found: MISSING\.md/);
});

// ── runJudgeAgent（judge-v1 裁定 agent，批量单发）──

// 场景：echo provider 回显完整批量裁定 prompt。预期：ok，output 与全部裁定项清单都进了 prompt。
test("runJudgeAgent assembles a batch verdict prompt carrying output and criteria", async () => {
  const result = await runJudgeAgent({
    output: "被评判的答案文本",
    items: [
      { name: "ownership", rubric: "是否说明归属?" },
      { name: "tone_ok", rubric: "语气是否克制?" },
    ],
    provider: ECHO_PROVIDER,
  });

  assert.equal(result.ok, true);
  assert.match(result.answer, /policy: judge-v1/);
  assert.match(result.answer, /<Output>\n被评判的答案文本\n<\/Output>/);
  assert.match(result.answer, /1\. ownership: 是否说明归属\?/);
  assert.match(result.answer, /2\. tone_ok: 语气是否克制\?/);
});

// 场景：无 grader provider。预期：ok=false，原因明确（evaluate-queue 据此走环境拦截）。
test("runJudgeAgent refuses without a grader provider", async () => {
  const result = await runJudgeAgent({ output: "x", items: [{ name: "a", rubric: "r" }], provider: null });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no grader provider/);
});

// 场景：裁定项清单为空。预期：ok=false，不发起调用（池非空才该走到这里）。
test("runJudgeAgent refuses an empty items list", async () => {
  const result = await runJudgeAgent({ output: "x", items: [], provider: ECHO_PROVIDER });
  assert.equal(result.ok, false);
  assert.match(result.reason, /items are empty/);
});
