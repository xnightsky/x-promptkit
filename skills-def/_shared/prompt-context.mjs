// skills-def/_shared/prompt-context.mjs
//
// 三层上下文拼装引擎：纯函数，接收 config 对象，输出 system prompt 字符串。
// content 字段直接传入时不读文件；仅当 item 只给 path 时做兜底读取。
//
// 能力边界（机制层）：本模块只提供 skills-def/repo/global 三层的拼装能力与
// context 声明的结构定义；是否加载哪一层、加载什么路径，一律由调用方决定，
// 引擎不内置任何策略。策略（如 recall-eval 的 clean-context-v1）钉死在调用方代码。
// 各共享模块的边界划分见 ./README.md。

/*
  ── 本文件维护两种结构，别混淆 ──

    1) 输入声明结构   context: { repo|global: { enabled, path?, max_bytes? } }
         path 可为单串或有序列表（string | string[]）——列表按序读取、各文件各自截断、
         拼接时标注来源；权威 = schema 文件 schemas/prompt-context-layers.schema.yaml；
         本文件底部那段注释只是镜像，不是权威。
    2) 输出 prompt 结构   buildSystemPrompt 拼出来的 system prompt（下面这张「输出模板」）
         权威 = buildSystemPrompt 本身；改 prompt 长相 = 改其拼接代码。

  ── 输出模板 ──
  各段按下列顺序拼接，段间以一行 "---" 分隔（真实分隔符是 "\n\n---\n\n"）；
  缺失 / 未启用的段整段跳过。下面这份示例同时启用 skills + repo + global + 发现池，
  且 repo 层的 path 是有序列表 [AGENTS.md, AGENTS.ai.md]（多文件形态，见层内拼接说明）：

      <injections.beforeSkills 原文>

      ---

      ### my-skill

      <my-skill 正文>

      ---

      ### Repo Context

      <!-- AGENTS.md -->
      <AGENTS.md 内容，按 maxBytes 逐文件截断>

      <!-- AGENTS.ai.md -->
      <AGENTS.ai.md 内容，按 maxBytes 逐文件截断>

      ---

      ### Global Context

      <全局提示词内容，按 maxBytes 截断>

      ---

      Available skills (cat the path to read full docs): alpha - 做A (skills/alpha), beta

  段类型只有三种写法（这就是「不止一种格式」之处）：
      · 注入段     injections.beforeSkills / afterSkills —— 原文照插，无任何包裹
      · 标题段     "### <名字>\n\n<内容>" —— skills.items 各项、Repo Context、Global Context 都走它
      · 发现池段   "Available skills (cat the path to read full docs): <逗号分隔列表>"
                   列表每项两种形态：
                       字符串    "beta"
                       对象      "alpha - 做A (skills/alpha)"   即 name [- desc] [(path)]

  Repo / Global 标题段的「内容」本身可由多个文件拼接（path 为列表时）：各文件按声明顺序、
  各自按 maxBytes 截断，段间以空行分隔，且每段前插一行来源标注 "<!-- <声明路径> -->"
  （用声明里的原始路径串，不解析绝对路径）。path 为单串时不加标注——与历史单 path 输出逐字节一致。
*/

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchemaFile, validateAgainstSchema } from "./schema-validator.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// context 层声明的结构权威：独立 schema 文件（类 JSON Schema 子集）
const LAYERS_SCHEMA_PATH = resolve(SCRIPT_DIR, "schemas", "prompt-context-layers.schema.yaml");

// ── 内部工具 ──

// `~` 前缀展开：shell 行为，Node 与 Windows 都不会自动做；Windows 上 HOME
// 常未设置（只有 USERPROFILE），直接用 process.env.HOME 会静默落空，
// 因此统一走 os.homedir()。只支持 `~`、`~/`、`~\` 前缀，`~user` 形式刻意不支持。
function expandHome(filePath) {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

function readMaybe(filePath, cwd) {
  const abs = resolve(cwd, expandHome(filePath));
  if (!existsSync(abs)) return "";
  return readFileSync(abs, "utf8");
}

function truncate(text, maxBytes) {
  if (!maxBytes || maxBytes <= 0) return text;
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return buf.slice(0, maxBytes).toString("utf8");
}

// 读取一层的 path 声明（string | string[]）并拼成一段内容。
// 数组按声明顺序读取，每个文件各自按 maxBytes 截断，空内容（缺文件/空文件）跳过。
// 多文件形态（pathSpec 为数组）下，每段前插一行来源标注 `<!-- <声明路径> -->`，
// 便于排查哪份提示词贡献了哪段；标注用声明里的原始路径串，不解析绝对路径（不泄露本机路径）。
// 单字符串形态不加标注——与历史单 path 输出逐字节一致。
function readContextSource(pathSpec, cwd, maxBytes) {
  const labeled = Array.isArray(pathSpec);
  const paths = labeled ? pathSpec : [pathSpec];
  const segments = [];
  for (const p of paths) {
    const text = truncate(readMaybe(p, cwd), maxBytes);
    if (!text) continue;
    segments.push(labeled ? `<!-- ${p} -->\n${text}` : text);
  }
  return segments.join("\n\n");
}

// ── 主入口 ──

/**
 * 从配置对象拼装 system prompt。
 *
 * @param {object} config
 * @param {object} config.skills
 * @param {Array<{name:string, content?:string, path?:string}>} config.skills.items - 内联加载的 skill 列表
 * @param {boolean} config.skills.allowDiscovery - 是否启用发现池
 * @param {Array<string|{name:string, desc?:string, path?:string}>} config.skills.discoveryPool
 *   - 字符串形式：仅 skill 名称
 *   - 对象形式：{name, desc?, path?} — skill-trigger 模式推荐，模型可通过 cat path 读取详情
 * @param {object} config.repo - { enabled, content?, path?: string|string[], maxBytes? }
 * @param {object} config.global - { enabled, content?, path?: string|string[], maxBytes? }
 * @param {object} config.injections - { beforeSkills?, afterSkills? }
 * @param {string} config.cwd - 路径解析基准目录
 * @returns {string}
 *
 * BDD（输出模板见文件顶部）：
 *   Given  skills.items=[a,b]、repo.enabled=true、global.enabled=false
 *   When   buildSystemPrompt(config)
 *   Then   得 "### a … --- ### b … --- ### Repo Context …"，global 段因未启用整段省略。
 *   Given  某层 enabled=true，但 content 与 path 都解析为空
 *   When   拼装该层
 *   Then   该层整段跳过——不产出空的 "### Repo Context" 头（见各 if(content) 卫语句）。
 *   Given  某层只给 path、未给 content
 *   When   拼装该层
 *   Then   以 readContextSource(path, cwd, maxBytes) 兜底读文件（path 经 ~ 展开为 home，
 *          相对 cwd 解析）。path 为列表时按序读取、各文件各自按 maxBytes 截断、每段前标注来源。
 */
export function buildSystemPrompt(config = {}) {
  const cwd = config.cwd || process.cwd();
  const parts = [];

  // ── Injections: beforeSkills ──
  if (config.injections?.beforeSkills) {
    parts.push(config.injections.beforeSkills);
  }

  // ── Layer 1: Skills ──
  for (const item of (config.skills?.items ?? [])) {
    const name = item.name || "unnamed-skill";
    let content = item.content;
    if (!content && item.path) {
      content = readMaybe(item.path, cwd);
    }
    if (content) {
      parts.push(`### ${name}\n\n${content}`);
    }
  }

  // ── Injections: afterSkills ──
  if (config.injections?.afterSkills) {
    parts.push(config.injections.afterSkills);
  }

  // ── Layer 2: Repo ──
  // 内联 content 整体按 maxBytes 截断（历史语义）；否则从 path（单串或列表）读取，
  // 列表各文件已在 readContextSource 内逐文件截断，此处不再二次截断。
  if (config.repo?.enabled) {
    let repoContent = config.repo.content
      ? truncate(config.repo.content, config.repo.maxBytes)
      : config.repo.path
        ? readContextSource(config.repo.path, cwd, config.repo.maxBytes)
        : "";
    if (repoContent) {
      parts.push(`### Repo Context\n\n${repoContent}`);
    }
  }

  // ── Layer 3: Global ──
  if (config.global?.enabled) {
    let globalContent = config.global.content
      ? truncate(config.global.content, config.global.maxBytes)
      : config.global.path
        ? readContextSource(config.global.path, cwd, config.global.maxBytes)
        : "";
    if (globalContent) {
      parts.push(`### Global Context\n\n${globalContent}`);
    }
  }

  // ── Skill discovery pool ──
  if (config.skills?.allowDiscovery && config.skills?.discoveryPool?.length) {
    const names = config.skills.discoveryPool
      .map((item) => {
        if (typeof item === "object") {
          const parts = [item.name]
          if (item.desc) parts.push(`- ${item.desc}`)
          if (item.path) parts.push(`(${item.path})`)
          return parts.join(" ")
        }
        return item
      })
      .join(", ");
    parts.push(`\nAvailable skills (cat the path to read full docs): ${names}`);
  }

  return parts.join("\n\n---\n\n");
}

// ── context 层声明：结构定义 ──
//
// 文件态声明形式（yaml/JSON 中书写，snake_case），供召回队列等调用方契约内嵌：
//
//   context:
//     repo:   { enabled: true, path: ["AGENTS.md", "AGENTS.ai.md"], max_bytes: 8192 }
//     global: { enabled: true, path: "~/.claude/CLAUDE.md", max_bytes: 4096 }
//
// path 可为单串或有序列表（string | string[]）：列表按序读取、各文件各自按 max_bytes 截断、
// 拼接时标注来源；贴合「根 AGENTS.md + AGENTS.ai.md + 边界局部 AGENTS.*.md」多文件组合。
//
// 结构权威是独立 schema 文件 schemas/prompt-context-layers.schema.yaml
// （人读样例见 examples/context-layers.example.yaml）；这里只补 schema
// 表达不了的跨字段语义。「哪个用例该不该开哪层」属于调用方策略，不做判断。

const CONTEXT_LAYER_KEYS = Object.freeze(["repo", "global"]);

// 判断是否为普通对象（排除数组/null）。
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// path 声明（string | string[]）是否可用：非空白字符串，或含 ≥1 非空白字符串项的数组。
function hasUsablePath(path) {
  if (typeof path === "string") return path.trim().length > 0;
  if (Array.isArray(path)) return path.some((p) => typeof p === "string" && p.trim().length > 0);
  return false;
}

// 把 path 声明归一为「可用 path」：字符串原样返回；数组过滤掉空白项后返回；
// 无可用项返回 undefined（调用方据此决定是否落默认值）。
function normalizePath(path) {
  if (typeof path === "string") return path.trim().length > 0 ? path : undefined;
  if (Array.isArray(path)) {
    const cleaned = path.filter((p) => typeof p === "string" && p.trim().length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return undefined;
}

/**
 * 跨字段语义校验（schema 子集表达不了的部分）：
 * `global.enabled: true` 必须显式给 `path`——全局提示词没有跨平台默认路径；
 * repo 层允许省略 path（约定默认 AGENTS.md，相对解析基准目录）。
 *
 * @param {*} context - context 层声明
 * @param {string} [basePath="context"] - 错误消息中的路径前缀
 * @returns {string[]}
 *
 * BDD：
 *   Given  global.enabled=true 但未给 path（或 path 为空白串）
 *   When   校验
 *   Then   返回一条 "missing `context.global.path`"（全局提示词无跨平台默认路径）。
 *   Given  repo.enabled=true 但未给 path
 *   When   校验
 *   Then   放行——repo 省略 path 是合法的，落约定默认 AGENTS.md（见 normalizeContextLayers）。
 */
export function validateContextSemantics(context, basePath = "context") {
  if (!isPlainObject(context)) return [];

  const globalLayer = context.global;
  if (
    isPlainObject(globalLayer) &&
    globalLayer.enabled === true &&
    !hasUsablePath(globalLayer.path)
  ) {
    return [`missing \`${basePath}.global.path\` (no cross-platform default for the global prompt)`];
  }
  return [];
}

/**
 * 校验一份 context 层声明（shape 走 schema 文件 + 跨字段语义），
 * 返回错误消息数组（空数组 = 合法）。
 */
export function validateContextLayers(context) {
  const shapeErrors = validateAgainstSchema(context, loadSchemaFile(LAYERS_SCHEMA_PATH), {
    basePath: "context",
  }).map((error) => error.message);

  return [...shapeErrors, ...validateContextSemantics(context)];
}

/**
 * 把文件态声明（snake_case）映射为 buildSystemPrompt 的 repo/global config
 * （camelCase）。path 可为单串或列表，归一时过滤掉空白项；repo 层无可用 path 时
 * 落到约定默认值 AGENTS.md。输入应已通过 validateContextLayers；对非法输入不做修复，仅尽力映射。
 *
 * @returns {{repo?: object, global?: object}}
 *
 * BDD：
 *   Given  repo:{enabled:true}（无 path）、global:{enabled:true, path:"~/x", max_bytes:4096}
 *   When   归一化
 *   Then   得 { repo:{enabled:true, path:"AGENTS.md"}, global:{enabled:true, path:"~/x", maxBytes:4096} }
 *          —— repo 省略 path 落默认 AGENTS.md；snake_case max_bytes → camelCase maxBytes。
 *   Given  repo:{enabled:true, path:["AGENTS.md","", "AGENTS.ai.md"]}
 *   When   归一化
 *   Then   path 过滤空白项得 ["AGENTS.md","AGENTS.ai.md"]，原样透传给 config.path（列表形态）。
 *   Given  某层非普通对象（数组/null/缺失）
 *   When   归一化
 *   Then   跳过该层（不写进结果），由调用方按未启用处理。
 */
export function normalizeContextLayers(context) {
  if (!isPlainObject(context)) return {};

  const normalized = {};

  for (const layer of CONTEXT_LAYER_KEYS) {
    const value = context[layer];
    if (!isPlainObject(value)) continue;

    const config = { enabled: value.enabled === true };
    // path 可为单串或列表：归一后取可用 path；repo 层无可用 path 时落默认 AGENTS.md。
    const path = normalizePath(value.path) ?? (layer === "repo" ? "AGENTS.md" : undefined);
    if (path !== undefined) config.path = path;
    if (Number.isInteger(value.max_bytes) && value.max_bytes > 0) {
      config.maxBytes = value.max_bytes;
    }

    normalized[layer] = config;
  }

  return normalized;
}
