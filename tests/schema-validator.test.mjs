import test from "node:test";
import assert from "node:assert/strict";

// _shared/schema-validator.mjs 的联合类型（`type: [..]`）能力与向后兼容回归。
// 风格：BDD（场景 / 预期）。报错文案是对外契约的一部分，断言固定文案。

import { validateAgainstSchema } from "../skills-def/_shared/schema-validator.mjs";

// validateAgainstSchema 返回 {path, format, message} 错误对象；这里只断言对外文案。
const v = (value, schema) =>
  validateAgainstSchema(value, schema, { basePath: "path" }).map((e) => e.message);

// 表达 string | string[] 的典型 schema（与 prompt-context-layers 的 path 同构）。
const PATH_SCHEMA = {
  type: ["string", "array"],
  pattern: "\\S",
  minItems: 1,
  items: { type: "string", pattern: "\\S" },
};

// 场景：联合类型两种合法形态。预期：均通过。
test("union type accepts both a string and an array of strings", () => {
  assert.deepEqual(v("AGENTS.md", PATH_SCHEMA), []);
  assert.deepEqual(v(["AGENTS.md", "AGENTS.ai.md"], PATH_SCHEMA), []);
});

// 场景：联合类型下，类型相关关键字按值的运行时类型择一触发。
test("union type applies type-specific keywords per the runtime value type", () => {
  // 字符串走 pattern（空白串按缺失报）。
  assert.deepEqual(v("  ", PATH_SCHEMA), ["missing `path`"]);
  // 数组走 minItems / items。
  assert.deepEqual(v([], PATH_SCHEMA), ["`path` must be a non-empty array"]);
  assert.deepEqual(v(["AGENTS.md", "  "], PATH_SCHEMA), ["missing `path[1]`"]);
  // 两种声明类型都不匹配。
  assert.deepEqual(v(123, PATH_SCHEMA), ["`path` must be a string or an array"]);
});

// 场景：单类型 schema（向后兼容）。预期：行为与联合能力引入前一致。
test("single-type schemas behave exactly as before", () => {
  const strSchema = { type: "string", pattern: "\\S" };
  assert.deepEqual(v("x", strSchema), []);
  assert.deepEqual(v("", strSchema), ["missing `path`"]);
  assert.deepEqual(v(5, strSchema), ["`path` must be a string"]);

  const intSchema = { type: "integer", minimum: 1 };
  assert.deepEqual(v(0, intSchema), ["`path` must be >= 1"]);
  assert.deepEqual(v(2, intSchema), []);
});

// 场景：未显式给 type 的 schema（向后兼容不变式）。预期：类型相关关键字一律不触发。
test("keywords stay dormant when no type is declared", () => {
  // pattern 不带 type：即便值是空白串也不触发（保留旧语义）。
  assert.deepEqual(v("  ", { pattern: "\\S" }), []);
  // minItems 不带 type：即便值是空数组也不触发。
  assert.deepEqual(v([], { minItems: 1 }), []);
});
