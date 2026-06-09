import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

// _shared/prompt-context.mjs（三层拼装引擎 + context 层声明结构）的单元测试。
// 风格：BDD（场景 / 预期）。
// 结构权威是 skills-def/_shared/schemas/prompt-context-layers.schema.yaml；
// 这里同时锁定「样例文件与 schema 持续一致」这一约定。

import {
  buildSystemPrompt,
  normalizeContextLayers,
  validateContextLayers,
  validateContextSemantics,
} from "../skills-def/_shared/prompt-context.mjs";

const cwd = process.cwd();

// 场景：完整合法的 context 层声明。预期：无错误。
test("validateContextLayers accepts a fully specified declaration", () => {
  const errors = validateContextLayers({
    repo: { enabled: true, path: "AGENTS.md", max_bytes: 8192 },
    global: { enabled: true, path: "~/.claude/CLAUDE.md", max_bytes: 4096 },
  });

  assert.deepEqual(errors, []);
});

// 场景：_shared/examples 的样例文件。预期：始终通过 schema 校验（样例必须随结构定义维护）。
test("validateContextLayers accepts the maintained example file", () => {
  const examplePath = path.join(cwd, "skills-def", "_shared", "examples", "context-layers.example.yaml");
  const example = YAML.parse(fs.readFileSync(examplePath, "utf8"));

  assert.deepEqual(validateContextLayers(example), []);
});

// 场景：声明不是对象。预期：报 context 必须为对象。
test("validateContextLayers rejects a non-object declaration", () => {
  assert.deepEqual(validateContextLayers("repo"), ["`context` must be an object"]);
});

// 场景：出现 repo/global 之外的层。预期：报 unknown field。
test("validateContextLayers rejects unknown layers", () => {
  const errors = validateContextLayers({ repo: { enabled: false }, session: { enabled: true } });

  assert.deepEqual(errors, ["unknown field `context.session`"]);
});

// 场景：层缺少显式 enabled 布尔值。预期：报 missing enabled。
test("validateContextLayers requires an explicit boolean enabled per layer", () => {
  assert.deepEqual(validateContextLayers({ repo: {} }), ["missing `context.repo.enabled`"]);
  assert.deepEqual(validateContextLayers({ repo: { enabled: "yes" } }), [
    "`context.repo.enabled` must be a boolean",
  ]);
});

// 场景：global 启用却没给 path。预期：schema 之外的跨字段语义报错。
test("validateContextLayers requires a path when the global layer is enabled", () => {
  const errors = validateContextLayers({ global: { enabled: true } });

  assert.deepEqual(errors, [
    "missing `context.global.path` (no cross-platform default for the global prompt)",
  ]);
});

// 场景：max_bytes 非正整数。预期：报最小值约束。
test("validateContextLayers rejects a non-positive max_bytes", () => {
  const errors = validateContextLayers({ repo: { enabled: true, max_bytes: 0 } });

  assert.deepEqual(errors, ["`context.repo.max_bytes` must be >= 1"]);
});

// 场景：跨字段语义单独使用（shape 已由 schema 覆盖的调用方）。预期：只报语义错误。
test("validateContextSemantics only reports the global path rule", () => {
  assert.deepEqual(validateContextSemantics({ global: { enabled: true } }), [
    "missing `context.global.path` (no cross-platform default for the global prompt)",
  ]);
  assert.deepEqual(validateContextSemantics({ global: { enabled: false } }), []);
  assert.deepEqual(validateContextSemantics(null), []);
});

// 场景：声明（snake_case）映射为引擎 config（camelCase）。预期：repo 缺省 path 落 AGENTS.md。
test("normalizeContextLayers maps the declaration to engine config", () => {
  const normalized = normalizeContextLayers({
    repo: { enabled: true, max_bytes: 8192 },
    global: { enabled: true, path: "~/.claude/CLAUDE.md" },
  });

  assert.deepEqual(normalized, {
    repo: { enabled: true, path: "AGENTS.md", maxBytes: 8192 },
    global: { enabled: true, path: "~/.claude/CLAUDE.md" },
  });
});

// 场景：空声明 / 非对象。预期：返回空映射，不抛错。
test("normalizeContextLayers returns an empty mapping for absent declarations", () => {
  assert.deepEqual(normalizeContextLayers({}), {});
  assert.deepEqual(normalizeContextLayers(undefined), {});
});

// 场景：repo/global 层启用且文件存在。预期：拼出 Repo/Global Context 段。
test("buildSystemPrompt assembles enabled repo and global layers from files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-context-"));
  fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "repo 提示词内容");
  fs.writeFileSync(path.join(tempDir, "global.md"), "全局提示词内容");

  const prompt = buildSystemPrompt({
    skills: { items: [{ name: "demo-skill", content: "skill 内容" }] },
    repo: { enabled: true, path: "AGENTS.md" },
    global: { enabled: true, path: path.join(tempDir, "global.md") },
    cwd: tempDir,
  });

  assert.match(prompt, /### demo-skill/);
  assert.match(prompt, /### Repo Context\n\nrepo 提示词内容/);
  assert.match(prompt, /### Global Context\n\n全局提示词内容/);
});

// 场景：层未启用或缺省。预期：不出现对应段落（clean-context 基线）。
test("buildSystemPrompt omits disabled or undeclared layers", () => {
  const prompt = buildSystemPrompt({
    skills: { items: [{ name: "demo-skill", content: "skill 内容" }] },
    repo: { enabled: false, path: "AGENTS.md" },
  });

  assert.doesNotMatch(prompt, /Repo Context/);
  assert.doesNotMatch(prompt, /Global Context/);
});

// 场景：repo 层超出 maxBytes。预期：按 UTF-8 字节截断。
test("buildSystemPrompt truncates layer content beyond maxBytes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-context-trunc-"));
  fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "abcdefgh");

  const prompt = buildSystemPrompt({
    repo: { enabled: true, path: "AGENTS.md", maxBytes: 4 },
    cwd: tempDir,
  });

  assert.match(prompt, /### Repo Context\n\nabcd(?!e)/);
});

// ── path 列表（string | string[]） ──

// 场景：path 为有序列表。预期：schema 通过（联合类型）。
test("validateContextLayers accepts a list of paths", () => {
  const errors = validateContextLayers({
    repo: { enabled: true, path: ["AGENTS.md", "AGENTS.ai.md"], max_bytes: 8192 },
  });

  assert.deepEqual(errors, []);
});

// 场景：path 为空数组 / 含空白项 / 非 string|array。预期：分别命中 minItems / pattern / type 报错。
test("validateContextLayers rejects degenerate path lists", () => {
  assert.deepEqual(validateContextLayers({ repo: { enabled: true, path: [] } }), [
    "`context.repo.path` must be a non-empty array",
  ]);
  assert.deepEqual(validateContextLayers({ repo: { enabled: true, path: ["AGENTS.md", "  "] } }), [
    "missing `context.repo.path[1]`",
  ]);
  assert.deepEqual(validateContextLayers({ repo: { enabled: true, path: 123 } }), [
    "`context.repo.path` must be a string or an array",
  ]);
});

// 场景：global 启用且给 path 列表。预期：跨字段语义放行（列表含可用项即满足「必须给 path」）。
test("validateContextSemantics accepts a global path list", () => {
  assert.deepEqual(
    validateContextSemantics({ global: { enabled: true, path: ["~/a.md", "~/b.md"] } }),
    [],
  );
  // 空数组等同未给 path：仍按缺失报。
  assert.deepEqual(validateContextSemantics({ global: { enabled: true, path: [] } }), [
    "missing `context.global.path` (no cross-platform default for the global prompt)",
  ]);
});

// 场景：声明里 path 为列表且含空白项。预期：归一化过滤空白项，列表原样透传给 config.path。
test("normalizeContextLayers passes through a cleaned path list", () => {
  const normalized = normalizeContextLayers({
    repo: { enabled: true, path: ["AGENTS.md", "  ", "AGENTS.ai.md"] },
  });

  assert.deepEqual(normalized, {
    repo: { enabled: true, path: ["AGENTS.md", "AGENTS.ai.md"] },
  });
});

// 场景：repo path 为多文件列表。预期：按声明顺序拼接、各文件各自按 maxBytes 截断、每段前标注来源路径。
test("buildSystemPrompt assembles an ordered, per-file-truncated, source-labeled path list", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-context-list-"));
  fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "ROOT-abcdef");
  fs.writeFileSync(path.join(tempDir, "AGENTS.ai.md"), "AI-uvwxyz");

  const prompt = buildSystemPrompt({
    repo: { enabled: true, path: ["AGENTS.md", "AGENTS.ai.md"], maxBytes: 5 },
    cwd: tempDir,
  });

  // 各文件各自截断到 5 字节（ROOT- / AI-uv），按序拼接，每段前有来源标注。
  assert.match(
    prompt,
    /### Repo Context\n\n<!-- AGENTS\.md -->\nROOT-\n\n<!-- AGENTS\.ai\.md -->\nAI-uv/,
  );
});

// 场景：path 列表里某文件缺失（空内容）。预期：跳过该段，不留空标注。
test("buildSystemPrompt skips missing files within a path list", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-context-list-miss-"));
  fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "only-root");

  const prompt = buildSystemPrompt({
    repo: { enabled: true, path: ["missing.md", "AGENTS.md"], cwd: tempDir },
    cwd: tempDir,
  });

  assert.match(prompt, /### Repo Context\n\n<!-- AGENTS\.md -->\nonly-root/);
  assert.doesNotMatch(prompt, /missing\.md/);
});
