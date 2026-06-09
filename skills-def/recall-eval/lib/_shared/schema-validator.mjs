// synced from skills-def\_shared\schema-validator.mjs @ 39260ad
// DO NOT EDIT — run `npm run recall:sync-shared` to regenerate
// skills-def/_shared/schema-validator.mjs

/*
  极简 JSON Schema 子集校验器：让仓库内的 yaml 数据结构以独立 schema 文件
  （类 JSON Schema 形态）作为结构权威，校验代码只消费 schema，
  不再手写逐字段 shape 检查。

  能力边界（机制层）：只实现仓库 schema 文件实际用到的关键字子集——
    type / required / properties /
    additionalProperties（false=禁止开放 key；或一个子 schema=约束每个开放 key 的值）/
    minProperties / items / minItems / minimum / pattern / $ref / $defs
  `type` 既可是单个类型名，也可是一组类型名（联合，标准 JSON Schema 的 `type: [..]`）：
    值匹配其中任意一个即通过，类型相关关键字（pattern/items/minimum/...）按值的运行时
    类型与声明允许类型（declaredAllows）择一触发——藉此表达 `string | array` 这类形态。
  刻意不支持 if-then、oneOf 等组合关键字；schema 表达不了的跨字段语义
  （例如「global.enabled 时必须给 path」）留在调用方代码里。

  BDD：
    Given  value 符合 schema
    When   validateAgainstSchema
    Then   返回 []（空数组 = 合法）。
    Given  object 缺一个 required key
    When   校验
    Then   返回一条错误，format(相对路径) 渲染为 "missing `<key>`"。
    Given  additionalProperties 是子 schema、对象含未在 properties 声明的开放 key
    When   校验
    Then   每个开放 key 的「值」都按该子 schema 递归校验（decision 块靠此约束维度内形状）。
    Given  object 属性数 < minProperties
    When   校验
    Then   报 "`<path>` must have at least N properties"。

  报错文案是对外契约的一部分（召回 fixture、EXAMPLES.md 与测试断言依赖
  "missing `medium`"、"`score_rule` must be an object" 这类固定格式），
  调整格式前先核对 skills-def/recall-eval 的契约文档与测试。
*/

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// ── schema 文件加载（带缓存） ──

const schemaCache = new Map();

/**
 * 读取并解析一个 yaml schema 文件，按绝对路径缓存。
 * schema 文件视为静态资产：进程内不感知磁盘上的后续修改。
 *
 * BDD：
 *   Given  同一 absolutePath 第二次调用
 *   When   loadSchemaFile
 *   Then   命中缓存、不再读盘（故进程内改 schema 文件不生效，需重启）。
 */
export function loadSchemaFile(absolutePath) {
  if (!schemaCache.has(absolutePath)) {
    schemaCache.set(absolutePath, parseYaml(readFileSync(absolutePath, "utf8")));
  }
  return schemaCache.get(absolutePath);
}

// ── 内部工具 ──

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(path, key) {
  return path ? `${path}.${key}` : String(key);
}

// `type` 可为单个类型名，或一组类型名（联合，标准 JSON Schema 的 `type: [..]`）。
// 联合 = 值匹配其中任意一个即通过（用于表达 `string | array` 这类形态）。
function typeMatches(value, type) {
  if (Array.isArray(type)) return type.some((t) => typeMatches(value, t));
  switch (type) {
    case "object": return isPlainObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    default: throw new Error(`unsupported schema type: ${type}`);
  }
}

function typeLabel(type) {
  if (Array.isArray(type)) return type.map(typeLabel).join(" or ");
  return type === "object" ? "an object"
    : type === "array" ? "an array"
      : type === "string" ? "a string"
        : type === "boolean" ? "a boolean"
          : type === "integer" ? "an integer"
            : "a number";
}

// schema 声明是否允许某具体类型 t（供联合类型下按需触发类型相关关键字）。
// 约定：未显式给 `type` 时返回 false——保持「无 type 则不触发该类型关键字」旧语义，
// 因此把守卫从 `schema.type === t` 换成 declaredAllows(schema, t) 对单类型 schema 完全等价。
function declaredAllows(schema, t) {
  if (schema.type === undefined) return false;
  return Array.isArray(schema.type) ? schema.type.includes(t) : schema.type === t;
}

// 错误对象同时携带 path 与 format：调用方可用 format 以「相对路径」重渲染
// 消息（例如把 `cases[0].medium` 的错误归到该用例名下并显示为 missing `medium`），
// 不需要去解析 message 字符串。
function pushError(ctx, path, format) {
  ctx.errors.push({ path, format, message: format(path || ctx.rootName) });
}

// 解析 $ref："#/$defs/x"（文档内）或 "file.yaml#/$defs/x" / "file.yaml"
// （externals 注册表内的其他 schema 文档；跨文档后内部 $ref 以该文档为根）。
function resolveRef(ref, ctx) {
  let doc = ctx.root;
  let pointer = ref;

  if (!ref.startsWith("#")) {
    const [file, fragment = ""] = ref.split("#");
    doc = ctx.registry[file];
    if (!doc) throw new Error(`unresolved external schema: ${file}`);
    pointer = fragment;
  } else {
    pointer = ref.slice(1);
  }

  let target = doc;
  if (pointer && pointer !== "/") {
    for (const part of pointer.replace(/^\//, "").split("/")) {
      target = target?.[part];
    }
  }
  if (target === undefined) throw new Error(`unresolved schema pointer: ${ref}`);
  return { schema: target, root: doc };
}

function walk(value, schema, path, ctx) {
  if (schema === true || schema === undefined || schema === null) return;

  if (schema.$ref) {
    const { schema: target, root } = resolveRef(schema.$ref, ctx);
    walk(value, target, path, { ...ctx, root });
    return;
  }

  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    pushError(ctx, path, (p) => `\`${p}\` must be ${typeLabel(schema.type)}`);
    return; // 类型不符时不再深入，避免派生噪音错误
  }

  if (declaredAllows(schema, "string") && typeof value === "string" && schema.pattern !== undefined) {
    if (!new RegExp(schema.pattern).test(value)) {
      // 约定：pattern "\S"（非空串）失败按「缺失」报——沿用召回契约里
      // 空白字符串等同字段缺失的旧语义。其他 pattern 按通用文案报。
      if (schema.pattern === "\\S") {
        pushError(ctx, path, (p) => `missing \`${p}\``);
      } else {
        pushError(ctx, path, (p) => `\`${p}\` must match pattern ${schema.pattern}`);
      }
    }
  }

  if (
    (declaredAllows(schema, "integer") || declaredAllows(schema, "number")) &&
    typeof value === "number" &&
    schema.minimum !== undefined &&
    value < schema.minimum
  ) {
    pushError(ctx, path, (p) => `\`${p}\` must be >= ${schema.minimum}`);
  }

  if (declaredAllows(schema, "object") && isPlainObject(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      pushError(
        ctx,
        path,
        (p) => `\`${p}\` must have at least ${schema.minProperties} ${schema.minProperties === 1 ? "property" : "properties"}`,
      );
    }
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) {
        pushError(ctx, joinPath(path, key), (p) => `missing \`${p}\``);
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined) {
        walk(value[key], subSchema, joinPath(path, key), ctx);
      }
    }
    // additionalProperties 两种语义：
    //   === false        → 禁止任何未在 properties 声明的 key
    //   是一个子 schema  → 允许开放 key，但每个未声明 key 的「值」须匹配该子 schema
    //                      （decision 块即靠此：维度名自定义，维度内形状受约束）
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) {
          pushError(ctx, joinPath(path, key), (p) => `unknown field \`${p}\``);
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) {
          walk(value[key], schema.additionalProperties, joinPath(path, key), ctx);
        }
      }
    }
  }

  if (declaredAllows(schema, "array") && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      pushError(
        ctx,
        path,
        schema.minItems === 1
          ? (p) => `\`${p}\` must be a non-empty array`
          : (p) => `\`${p}\` must have at least ${schema.minItems} items`,
      );
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => walk(item, schema.items, `${path}[${index}]`, ctx));
    }
  }
}

// ── 主入口 ──

/**
 * 用 schema 校验一个值，返回错误对象数组（空数组 = 合法）。
 *
 * @param {*} value
 * @param {object} schema - 已解析的 schema 文档（loadSchemaFile 的返回值）
 * @param {object} [options]
 * @param {object} [options.registry] - 外部 $ref 注册表：文件名 → 已解析 schema 文档
 * @param {string} [options.basePath] - 错误路径前缀（如 "context"）
 * @param {string} [options.rootName="document"] - 根节点自身报错时的占位名
 * @returns {Array<{path: string, message: string, format: (relativePath: string) => string}>}
 */
export function validateAgainstSchema(value, schema, options = {}) {
  const { registry = {}, basePath = "", rootName = "document" } = options;
  const ctx = { root: schema, registry, errors: [], rootName };
  walk(value, schema, basePath, ctx);
  return ctx.errors;
}
