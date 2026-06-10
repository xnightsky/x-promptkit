// skills-def/recall-eval/scripts/lib.mjs
//
// recall-eval 技能的纯函数运行时库。
//
// 本模块是 recall-eval skill 契约的代码实现层，所有导出函数为纯逻辑、
// 无副作用(除文件 I/O)，供 CLI 入口(run-eval / validate-schema / resolve-target)
// 和测试套件共享。
//
// 模块功能分区：
//   ┌─ 路径解析层 ──────────────────────────────────────────────────────┐
//   │ resolveRecallInputPath / loadRecallYaml                             │
//   │   · 显式 YAML 路径 → 直接使用                                       │
//   │   · 目标文件/目录 → 发现其 .recall/queue.yaml                       │
//   ├─ 校验层 ──────────────────────────────────────────────────────────┤
//   │ validateRecallData                                                  │
//   │   · shape 校验由独立 schema 文件驱动(结构权威)：                   │
//   │     ../schemas/recall-queue.schema.yaml                             │
//   │     + _shared/schemas/prompt-context-layers.schema.yaml(context 块)│
//   │   · 代码只补 schema 表达不了的跨字段语义：                          │
//   │     生效 source_ref(队列级继承+用例级覆盖)、context 的 global path │
//   │   · 可选 context 块(队列级/用例级整块覆盖)：是否加载项目/全局提示词│
//   ├─ 打分层 ──────────────────────────────────────────────────────────┤
//   │ scoreAnswer / hasNonNegatedMatch                                    │
//   │   · 命中 must_not_include → 0 分                                   │
//   │   · 缺 must_include → 0 分                                         │
//   │   · must 全中 + should 全中 → 2 分                                 │
//   │   · must 全中 + should 不全 → 1 分                                 │
//   │   · 否定前缀检测：避免把"不能继续执行"误判为命中"继续执行"         │
//   ├─ carrier 解析层 ──────────────────────────────────────────────────┤
//   │   · CLI --carrier > case.carrier，均无则返回 null                   │
//   └─ 输出格式化层 ────────────────────────────────────────────────────┘
//     formatValidationReport / formatRunEvalOutput / formatBatchRunEvalOutput
//
// 注意：本文件已彻底移除 --live 的本地落盘能力(原 .tmp/recall-runs 运行产物)，
// 不再依赖 node:crypto 或 carrier-adapter 的上下文策略；--live 的"现场执行"
// 逻辑仍保留在 run-eval.mjs 中。任何可复用的打分 / carrier 策略变更都应
// 沉淀到此共享层，而不是 CLI 入口。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateContextSemantics } from "./_shared/prompt-context.mjs";
import { loadSchemaFile, validateAgainstSchema } from "./_shared/schema-validator.mjs";

// ── Carrier 与 clean-context 策略常量 ──

// 唯一支持的 recall 执行载体标识。

// 固定 clean-context 策略：live recall 必须以「仅凭记忆、无工具、无搜索、
// 无仓库读取」的方式作答，Object.freeze 保证运行时不可篡改。
export const DEFAULT_CLEAN_CONTEXT_POLICY = Object.freeze({
  id: "clean-context-v1",
  answer_basis: "memory-only",
  tools: "forbidden",
  web_search: "forbidden",
  repo_read: "forbidden",
});

// ── 常量：队列 schema 约束 ──

// 队列契约的结构权威是独立 schema 文件（类 JSON Schema 子集）；
// 本文件只消费 schema，并补 schema 表达不了的跨字段语义
// （生效 source_ref 解析、context 的 global path 要求）。
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_SCHEMA_PATH = path.resolve(SCRIPT_DIR, "..", "schemas", "recall-queue.schema.yaml");
// 队列 schema 通过外部 $ref 复用 _shared 维护的 context 层声明结构
const LAYERS_SCHEMA_PATH = path.resolve(SCRIPT_DIR, "_shared", "schemas", "prompt-context-layers.schema.yaml");

const YAML_FILE_PATTERN = /\.ya?ml$/i;

// ── 内部工具函数 ──

// 判定 value 是否为非空字符串(去首尾空白后非零长度)。
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// 字符串数组归一化：过滤空字符串，非数组值返回空数组。
function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

// 同步读取 UTF-8 文件。
function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// ── 路径解析 ──

// 统一把路径分隔符转为正斜杠，保证跨平台输出一致。
function normalizePathForOutput(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

// 将相对路径解析为绝对路径。
export function resolveYamlPath(inputPath, cwd = process.cwd()) {
  return path.resolve(cwd, inputPath);
}

// 将用户传入的"目标路径"解析为真正的队列 YAML:
// - 直接给出 .yaml/.yml 文件时按显式文件处理;
// - 给出目录或普通文件时,向其所在目录下的 .recall/queue.yaml 发现队列。
export function resolveRecallInputPath(inputPath, cwd = process.cwd()) {
  const absoluteInputPath = resolveYamlPath(inputPath, cwd);

  if (YAML_FILE_PATTERN.test(inputPath)) {
    return {
      path: normalizePathForOutput(inputPath),
      absolutePath: absoluteInputPath,
      discovery: {
        mode: "explicit_yaml",
        originalInputPath: inputPath,
      },
    };
  }

  if (!fs.existsSync(absoluteInputPath)) {
    throw new Error(`Cannot resolve target path: ${inputPath}`);
  }

  const inputStats = fs.statSync(absoluteInputPath);
  const targetRoot = inputStats.isDirectory()
    ? absoluteInputPath
    : inputStats.isFile()
      ? path.dirname(absoluteInputPath)
      : null;
  const discoveryMode = inputStats.isDirectory()
    ? "target_directory"
    : inputStats.isFile()
      ? "target_file"
      : "unsupported_target";

  if (!targetRoot) {
    throw new Error(`Unsupported target path: ${inputPath}`);
  }

  const discoveredQueuePath = path.join(targetRoot, ".recall", "queue.yaml");
  if (!fs.existsSync(discoveredQueuePath) || !fs.statSync(discoveredQueuePath).isFile()) {
    throw new Error(
      `No target-local queue found for target: ${inputPath} (expected ${normalizePathForOutput(path.relative(cwd, discoveredQueuePath))})`,
    );
  }

  return {
    path: normalizePathForOutput(path.relative(cwd, discoveredQueuePath)),
    absolutePath: discoveredQueuePath,
    discovery: {
      mode: discoveryMode,
      originalInputPath: inputPath,
    },
  };
}

// 读取并解析队列 YAML,返回原始文本、解析后的数据以及发现信息。
export function loadRecallYaml(inputPath, cwd = process.cwd()) {
  const resolvedInput = resolveRecallInputPath(inputPath, cwd);
  const absolutePath = resolvedInput.absolutePath;
  const raw = readFileUtf8(absolutePath);
  const data = YAML.parse(raw);

  return {
    path: resolvedInput.path,
    absolutePath,
    raw,
    data,
    discovery: resolvedInput.discovery,
  };
}

// 归一化单个用例的 expected 块（shape 校验由 schema 负责，这里只做打分用的数据整形）。
function normalizeExpected(caseValue) {
  const expected = caseValue?.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return { mustInclude: [], shouldInclude: [], mustNotInclude: [] };
  }

  const judgePool = normalizeJudgePool(expected.judge);
  return {
    mustInclude: normalizeStringList(expected.must_include),
    anyMustInclude: normalizeStringList(expected.any_must_include),  // 至少命中一项
    shouldInclude: normalizeStringList(expected.should_include),
    mustNotInclude: normalizeStringList(expected.must_not_include),
    judgePool,  // 具名裁定池 { 键: rubric }；缺省 undefined
    // decision 接收池：未被引用的池项生成缺省隐式维（声明即参与打分）
    decision: normalizeDecision(expected.decision, judgePool),
  };
}

// 归一化具名裁定池：{ 键: {rubric} } → { 键: rubric 文本 }。shape 由 schema 保证。
function normalizeJudgePool(judge) {
  if (!judge || typeof judge !== "object" || Array.isArray(judge)) {
    return undefined;
  }
  const pool = {};
  for (const [name, spec] of Object.entries(judge)) {
    if (isNonEmptyString(spec?.rubric)) pool[name] = spec.rubric.trim();
  }
  return Object.keys(pool).length > 0 ? pool : undefined;
}

// verdict 引用值 → 剥掉强制的 judge. 前缀得池键；非法形态返回 null（恰一/前缀校验在
// validateRecallData 报错，这里宽容处理保证打分函数可独立测试）。
function stripVerdictRef(ref) {
  if (typeof ref !== "string") return null;
  return ref.startsWith("judge.") && ref.length > "judge.".length ? ref.slice("judge.".length) : null;
}

// 归一化 decision 块（精调链路）+ 缺省隐式维（声明即参与）：
//   显式维：{ 维名: {eq|one_of|verdict, from, weight, knockout, absent} } → 数组项
//   隐式维：池里未被任何显式维引用的裁定 → { verdict:[键], weight 2, 无否决, absent zero }
// 命中器恰一/前缀/引用存在等合法性在 validateRecallData 报错；这里宽容归一化，
// 保证打分函数可独立测试。缺省补齐：weight=2、knockout=false、absent=zero。
function normalizeDecision(decision, judgePool) {
  const dims = [];
  const referenced = new Set();
  if (decision && typeof decision === "object" && !Array.isArray(decision)) {
    for (const [name, spec] of Object.entries(decision)) {
      const verdictRefs = typeof spec?.verdict === "string"
        ? [spec.verdict]
        : Array.isArray(spec?.verdict) ? spec.verdict : null;
      // 引用统一剥 judge. 前缀存池键；非法前缀项丢弃（校验层已报错）
      const verdictKeys = verdictRefs
        ? verdictRefs.map(stripVerdictRef).filter((key) => key !== null)
        : null;
      if (verdictKeys) for (const key of verdictKeys) referenced.add(key);
      dims.push({
        name,
        eq: typeof spec?.eq === "string" ? spec.eq : null,
        oneOf: Array.isArray(spec?.one_of) ? spec.one_of.filter(isNonEmptyString) : null,
        verdict: verdictKeys && verdictKeys.length > 0 ? verdictKeys : null,
        from: typeof spec?.from === "string" ? spec.from : null,
        weight: Number.isInteger(spec?.weight) && spec.weight >= 1 ? spec.weight : 2,
        knockout: spec?.knockout === true,
        absent: spec?.absent === "pass" || spec?.absent === "fail" ? spec.absent : "zero",
      });
    }
  }
  // 缺省参与：未被精调引用的池项各生成一个隐式维（维名=池键，缺省表 A 的 ±2 由此兑现）
  if (judgePool) {
    for (const key of Object.keys(judgePool)) {
      if (!referenced.has(key)) {
        dims.push({
          name: key, eq: null, oneOf: null, verdict: [key],
          from: null, weight: 2, knockout: false, absent: "zero", implicit: true,
        });
      }
    }
  }
  return dims.length > 0 ? dims : undefined;
}

// ── 校验层 ──

// 校验整个队列数据，逐用例汇总错误，并解析每个用例生效的 source_ref / context
// （均为：队列级继承 + 用例级整块覆盖）。
//
// shape 校验完全由 schema 文件驱动；错误按路径路由——
// `cases[i].*` 的错误以「用例相对路径」重渲染后归入对应用例
// （如 missing `medium`），其余归入队列级错误。
//
// @param {object} data — 解析后的 YAML 数据
// @param {string} [yamlDir] — 队列文件所在目录；传入时 source_ref 相对路径
export function validateRecallData(data, yamlDir) {
  const report = {
    queueErrors: [],
    caseReports: [],
  };

  const schemaErrors = validateAgainstSchema(data, loadSchemaFile(QUEUE_SCHEMA_PATH), {
    registry: {
      "prompt-context-layers.schema.yaml": loadSchemaFile(LAYERS_SCHEMA_PATH),
    },
  });

  const caseErrorsByIndex = new Map();
  for (const error of schemaErrors) {
    const caseMatch = error.path.match(/^cases\[(\d+)\]\.(.+)$/);
    if (caseMatch) {
      const caseIndex = Number(caseMatch[1]);
      if (!caseErrorsByIndex.has(caseIndex)) caseErrorsByIndex.set(caseIndex, []);
      // 用 format 以用例相对路径重渲染消息（cases[0].medium → medium）
      caseErrorsByIndex.get(caseIndex).push(error.format(caseMatch[2]));
    } else {
      report.queueErrors.push(error.message);
    }
  }

  // 队列级 context 的跨字段语义（shape 已由 schema 的外部 $ref 覆盖）
  if (data?.context !== undefined) {
    report.queueErrors.push(...validateContextSemantics(data.context));
  }

  if (!Array.isArray(data?.cases)) {
    return {
      ...report,
      isValid: report.queueErrors.length === 0,
    };
  }

  const queueSourceRef = isNonEmptyString(data.source_ref) ? data.source_ref : null;
  const queueContext = data.context !== undefined ? data.context : null;

  for (const [index, caseValue] of data.cases.entries()) {
    const caseErrors = [...(caseErrorsByIndex.get(index) ?? [])];
    const caseId = isNonEmptyString(caseValue?.id) ? caseValue.id : `case-${index + 1}`;
    let effectiveSourceRef = isNonEmptyString(caseValue?.source_ref)
      ? caseValue.source_ref
      : queueSourceRef;
    // source_ref 相对路径 → 以队列文件目录为基准解析为绝对路径
    // 使 .recall/queue.yaml 可以用 ../SKILL.md 指向同 skill 的 SKILL.md
    if (isNonEmptyString(effectiveSourceRef) && yamlDir && !path.isAbsolute(effectiveSourceRef)) {
      effectiveSourceRef = path.resolve(yamlDir, effectiveSourceRef);
    }
    // context 与 source_ref 同语义：用例级整块覆盖队列级，不做深合并。
    // 缺省为 null = 不加载任何 repo/global 提示词层（clean-context-v1 基线）。
    const effectiveContext = caseValue?.context !== undefined ? caseValue.context : queueContext;

    if (caseValue?.context !== undefined) {
      caseErrors.push(...validateContextSemantics(caseValue.context));
    }

    // skill-trigger 模式必须提供 trigger 块
    if (caseValue?.medium === "skill-trigger") {
      if (!caseValue?.trigger || typeof caseValue.trigger !== "object" || !Array.isArray(caseValue.trigger.must_run) || caseValue.trigger.must_run.length === 0) {
        caseErrors.push("skill-trigger medium requires a non-empty trigger.must_run list");
      }
    }

    // decision×judge 跨字段（schema 子集表达不了恰一/枚举/引用关系，在此兜底）：
    //   每维命中器(eq/one_of/verdict)恰一；verdict 强制 judge.<池键> 前缀且键必须存在于池；
    //   verdict 维禁 from；absent 限 zero/pass/fail 三枚举。
    //   孤儿池项不报错——未被引用的裁定是缺省隐式参与者（见 normalizeDecision / 设计 §8）。
    const rawDecision = caseValue?.expected?.decision;
    const rawJudgePool = caseValue?.expected?.judge;
    const poolKeys = rawJudgePool && typeof rawJudgePool === "object" && !Array.isArray(rawJudgePool)
      ? Object.keys(rawJudgePool)
      : [];
    if (rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision)) {
      for (const [dimName, spec] of Object.entries(rawDecision)) {
        if (!spec || typeof spec !== "object" || Array.isArray(spec)) continue; // shape 由 schema 报
        const matchers = ["eq", "one_of", "verdict"].filter((k) => spec[k] !== undefined);
        if (matchers.length !== 1) {
          caseErrors.push(`decision \`${dimName}\` must declare exactly one of eq/one_of/verdict`);
        }
        if (spec.verdict !== undefined) {
          if (spec.from !== undefined) {
            caseErrors.push(`decision \`${dimName}\` with verdict cannot use \`from\``);
          }
          const refs = typeof spec.verdict === "string" ? [spec.verdict]
            : Array.isArray(spec.verdict) ? spec.verdict : [];
          for (const ref of refs) {
            if (typeof ref !== "string") continue; // items shape 由 schema 报
            const key = stripVerdictRef(ref);
            if (key === null) {
              caseErrors.push(`decision \`${dimName}\`.verdict must use the \`judge.<name>\` form (got \`${ref}\`)`);
            } else if (!poolKeys.includes(key)) {
              caseErrors.push(`missing \`expected.judge.${key}\``);
            }
          }
        }
        if (spec.absent !== undefined && !["zero", "pass", "fail"].includes(spec.absent)) {
          caseErrors.push(`decision \`${dimName}\`.absent must be one of zero/pass/fail`);
        }
      }
    }

    if (!isNonEmptyString(effectiveSourceRef)) {
      caseErrors.push("missing effective `source_ref`");
    }

    const expected = normalizeExpected(caseValue);
    const scoreRule =
      caseValue?.score_rule && typeof caseValue.score_rule === "object" && !Array.isArray(caseValue.score_rule)
        ? caseValue.score_rule
        : null;

    report.caseReports.push({
      index,
      id: caseId,
      caseValue,
      effectiveSourceRef,
      effectiveContext,
      errors: caseErrors,
      expected,
      scoreRule,
    });
  }

  const isValid =
    report.queueErrors.length === 0 && report.caseReports.every((caseReport) => caseReport.errors.length === 0);

  return {
    ...report,
    isValid,
  };
}

// ── 输出格式化 ──

// 把校验结果格式化为 PASS/FAIL 文本报告。
export function formatValidationReport(yamlPath, report) {
  const lines = [];

  if (report.isValid) {
    lines.push(`PASS ${yamlPath}`);
  } else {
    lines.push(`FAIL ${yamlPath}`);
  }

  for (const error of report.queueErrors) {
    lines.push(`- queue: ${error}`);
  }

  for (const caseReport of report.caseReports) {
    if (caseReport.errors.length === 0) {
      continue;
    }

    for (const error of caseReport.errors) {
      lines.push(`- ${caseReport.id}: ${error}`);
    }
  }

  return lines.join("\n");
}

// ── 打分引擎 ──

// 将输入文本转为小写，用于大小写不敏感匹配。
function normalizeText(text) {
  return String(text ?? "").toLowerCase();
}

// 判断 phrase 是否以"非否定"的形式出现在 text 中,避免把"不能继续执行"误判为命中"继续执行"。
function hasNonNegatedMatch(text, phrase) {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  let searchFrom = 0;

  while (searchFrom < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedPhrase, searchFrom);
    if (index === -1) {
      return false;
    }

    const prefix = normalizedText.slice(Math.max(0, index - 2), index);
    // 否定前缀分两类：单字否定（紧邻词条，如「没深合并」）与二字否定词
    // （如「没有深合并」「不做深合并」「而非深合并」）。后者是真实模型回答的
    // 高频形态，漏判会把正确的否定表述误记为命中 must_not_include
    // （live 自测中实际踩到过「不做」「没有」两例）。
    const isNegated =
      prefix.endsWith("不") ||
      prefix.endsWith("别") ||
      prefix.endsWith("没") ||
      prefix.endsWith("勿") ||
      prefix.endsWith("不能") ||
      prefix.endsWith("不要") ||
      prefix.endsWith("不可") ||
      prefix.endsWith("不做") ||
      prefix.endsWith("不会") ||
      prefix.endsWith("不是") ||
      prefix.endsWith("没有") ||
      prefix.endsWith("并非") ||
      prefix.endsWith("而非");

    if (!isNegated) {
      return true;
    }

    searchFrom = index + normalizedPhrase.length;
  }

  return false;
}

// 转义正则元字符，用于把维度名安全嵌进默认抽取正则。
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 从答案文本里抽取某具名维度的实际值。
// 有 from 用作者正则（取首个捕获组）；否则走约定 `^<维度名>: <值>$`。
// 无匹配 / 正则非法 / 捕获组缺失 → 返回 null（视为「缺席」，与任何 eq 判不等）。
function extractDecisionValue(answerText, name, fromRegex) {
  const text = String(answerText ?? "");
  let re;
  if (fromRegex) {
    try {
      re = new RegExp(fromRegex, "im");
    } catch {
      return null;  // 非法正则不升级为队列错误，按缺席处理（v1 边界）
    }
  } else {
    re = new RegExp(`^\\s*${escapeRegExp(name)}\\s*:\\s*(\\S.*?)\\s*$`, "im");
  }
  const match = re.exec(text);
  if (!match) return null;
  return match[1] !== undefined ? match[1].trim() : null;
}

// decision 静态打分机（唯一打分出口，设计 §7）：
// 逐维 三态(✓/✗/∅) → 缺席映射(absent) → +weight / −weight / 0 累加；
// 任一 knockout 维非✓ → 整题 FAIL（压过求和）。
// 缺席者在场零出力：进 perDim 与 coverage 分母，不出权重。
// 环境失败不会到达这里——evaluate-queue 在跑分前拦截为 not evaluated，
// 所以本函数看到的缺席永远是内容侧的（答案没写该行 / judge 跑了但漏答某项）。
function scoreDecision(decisionDims, answerText, verdicts = {}) {
  const perDim = [];
  let knockoutFail = null;
  let sum = 0;
  let evaluated = 0;
  for (const dim of decisionDims) {
    let state; // "hit" | "miss" | "absent"
    let got;
    if (Array.isArray(dim.verdict) && dim.verdict.length > 0) {
      // 裁定机（OR 真值表）：任一 pass → ✓；无 pass 且 ≥1 fail → ✗；全缺席 → ∅
      const states = dim.verdict.map((key) => verdicts[key]?.pass);
      if (states.some((s) => s === true)) { state = "hit"; got = "pass"; }
      else if (states.some((s) => s === false)) { state = "miss"; got = "fail"; }
      else { state = "absent"; got = null; }
    } else {
      // 字面机：from 正则或行约定抽值，再与 eq / one_of 等值比对（trim+大小写不敏感）
      got = extractDecisionValue(answerText, dim.name, dim.from);
      if (got === null) {
        state = "absent";
      } else {
        const targets = Array.isArray(dim.oneOf) && dim.oneOf.length > 0 ? dim.oneOf : [dim.eq];
        state = targets.some((t) => normalizeText(got) === normalizeText(t ?? "")) ? "hit" : "miss";
      }
    }
    // 缺席映射（进打分机前执行）：pass=缺席视为 yes；fail=视为 no；zero=在场零出力
    if (state === "absent" && dim.absent === "pass") state = "hit";
    else if (state === "absent" && dim.absent === "fail") state = "miss";

    const hit = state === "hit";
    const contribution = hit ? dim.weight : state === "miss" ? -dim.weight : 0;
    if (state !== "absent") evaluated += 1;
    const want = Array.isArray(dim.verdict) && dim.verdict.length > 0
      ? `judge:${dim.verdict.join("|")}`
      : Array.isArray(dim.oneOf) && dim.oneOf.length > 0 ? dim.oneOf.join("|") : dim.eq;
    perDim.push({ name: dim.name, want, got, hit, weight: dim.weight, contribution });
    if (dim.knockout && !hit && knockoutFail === null) knockoutFail = dim.name;
    sum += contribution;
  }
  // coverage：不同 coverage 的 decision 分不可比（红线），渲染层强制展示 evaluated/total
  return knockoutFail !== null
    ? { score: "FAIL", knockout: knockoutFail, perDim, evaluated, total: decisionDims.length }
    : { score: sum, perDim, evaluated, total: decisionDims.length };
}

// 依据 expected 与 score_rule 给答案打分:命中禁止项=0;must 全中=2;部分命中=1。
// 若用例有 decision 维（显式精调或 judge 池隐式参与），额外返回 decision 累加分
// （与内容分并列，不并入 headline）。opts.verdicts 为 judge 批量调用的具名裁定表，
// 由 evaluate-queue 注入；离线/无裁定时缺省空表（verdict 维按缺席处理）。
export function scoreAnswer(caseReport, answerText, opts = {}) {
  const { verdicts = {} } = opts;
  const normalizedAnswer = normalizeText(answerText);
  const mustHits = caseReport.expected.mustInclude.filter((item) =>
    normalizedAnswer.includes(item.toLowerCase()),
  );
  const missingMust = caseReport.expected.mustInclude.filter(
    (item) => !mustHits.includes(item),
  );
  const shouldHits = caseReport.expected.shouldInclude.filter((item) =>
    normalizedAnswer.includes(item.toLowerCase()),
  );
  const mustNotHits = caseReport.expected.mustNotInclude.filter((item) =>
    hasNonNegatedMatch(answerText, item),
  );

  let score = 0;
  let rationale = caseReport.scoreRule?.fail ?? "failed score rule";

  if (mustNotHits.length > 0) {
    score = 0;
    rationale = `${caseReport.scoreRule?.fail ?? "failed score rule"} | must_not_include hit: ${mustNotHits.join(", ")}`;
  } else if (missingMust.length === 0) {
    // all must_include matched; check any_must_include (at least one)
    const anyList = caseReport.expected.anyMustInclude ?? []
    const anyMustHits = anyList.filter((item) =>
      normalizedAnswer.includes(item.toLowerCase()),
    );
    if (anyList.length > 0 && anyMustHits.length === 0) {
      score = 1;
      rationale = `${caseReport.scoreRule?.partial ?? "partial score"} | missing any: ${anyList.join(", ")}`;
    } else {
      score = 2;
      rationale = `${caseReport.scoreRule?.full ?? "full score"} | must_include matched`;
    }
  } else if (mustHits.length > 0 || shouldHits.length > 0) {
    score = 1;
    rationale = `${caseReport.scoreRule?.partial ?? "partial score"} | missing: ${missingMust.join(", ")}`;
  }

  const result = {
    score,
    rationale,
    missingMust,
    mustNotHits,
  };
  // decision 维存在时附带累加分；不存在则 result 无 decision 字段，老用例逐字节不变。
  if (caseReport.expected.decision) {
    result.decision = scoreDecision(caseReport.expected.decision, answerText, verdicts);
  }
  return result;
}

// ── AI judge 裁定解析（verdict：具名布尔裁定，分数恒由 decision 静态机出口）──

// 从文本中抽取第一个「平衡」的 JSON 对象：容忍 ```json 围栏与前后散文，
// 用括号配平 + 字符串态机扫描，避免贪婪正则把后续花括号一起吞掉。
// 抽不出或 JSON.parse 失败 → null（按「无裁决」处理，不抛）。
function extractFirstJsonObject(text) {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// 解析 judge 批量回答 → 具名裁定表 { 键: {pass, reason} }（设计 §9 的兜底口全集）。
// 逐键宽容：
//   值是对象   → raw = 值.pass，reason = 值.reason；
//   值是布尔   → raw = 值（简写容忍）；
//   raw 布尔   → pass = raw；raw 字符串 → ^(true|yes|pass|y)$ 大小写不敏感兜底；
//   其余形态   → 该键丢弃（= 该裁定缺席）。
// 清单里有、回答里没有的键自然不在表里 = 缺席。缺席永远不等于 pass——
// 「默认放行」陷阱在结构上不存在（verdict 必须显式判 pass 才 +weight）。
// 抽不出 JSON / parse 失败 → { ok:false }，evaluate-queue 据此走环境拦截（not evaluated）。
export function parseJudgeVerdicts(text) {
  const obj = extractFirstJsonObject(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, reason: "judge response not parseable as JSON" };
  }
  const verdicts = {};
  for (const [name, value] of Object.entries(obj)) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value.pass : value;
    let pass;
    if (typeof raw === "boolean") pass = raw;
    else if (typeof raw === "string") pass = /^(true|yes|pass|y)$/i.test(raw.trim());
    else continue; // 无法识别 → 该裁定缺席
    const reason = value && typeof value === "object" && typeof value.reason === "string" ? value.reason : "";
    verdicts[name] = { pass, reason };
  }
  return { ok: true, verdicts };
}

// ── skill-trigger 评分 ──

/**
 * 对 skill-trigger 模式的 case 打分。
 * 检查：trigger.must_run 是否在 toolCalls 中出现（子串）,
 *       trigger.must_not_run 是否被触发,
 *       finalAnswer 是否符合 expected。
 */
export function scoreTriggerCase(caseReport, { toolCalls, finalAnswer }) {
  const commands = (toolCalls ?? []).map((tc) => tc.command ?? "").join("\n")
  const trigger = caseReport.caseValue?.trigger ?? {}
  const mustRun = Array.isArray(trigger.must_run) ? trigger.must_run : []
  const mustNotRun = Array.isArray(trigger.must_not_run) ? trigger.must_not_run : []

  // 检查禁止命令
  const forbiddenHits = mustNotRun.filter((forbidden) =>
    commands.includes(forbidden),
  )
  if (forbiddenHits.length > 0) {
    return {
      score: 0,
      rationale: `forbidden command triggered: ${forbiddenHits.join(", ")}`,
      triggerMatches: [],
      triggerMissing: mustRun,
    }
  }

  // 检查必须命令（子串匹配）
  const triggerMatches = []
  const triggerMissing = []
  for (const required of mustRun) {
    if (commands.includes(required)) {
      triggerMatches.push(required)
    } else {
      triggerMissing.push(required)
    }
  }

  if (triggerMissing.length > 0) {
    return {
      score: 0,
      rationale: `skill not triggered | missing: ${triggerMissing.join(", ")}`,
      triggerMatches,
      triggerMissing,
    }
  }

  // trigger 通过，检查输出
  const outputScore = scoreAnswer(caseReport, finalAnswer ?? "")
  return {
    ...outputScore,
    triggerMatches,
    triggerMissing,
  }
}

// ── 答案输入 ──

// 读取直接传入的答案：优先 --answer，其次 --answer-file。
export function readAnswerInput({ answer, answerFile }) {
  if (isNonEmptyString(answer)) {
    return answer;
  }

  if (isNonEmptyString(answerFile)) {
    return readFileUtf8(answerFile).trimEnd();
  }

  return null;
}

// 读取整队列答案文件(JSON:caseId -> answerText)。
export function readAnswersFile(filePath) {
  const raw = readFileUtf8(filePath);
  return JSON.parse(raw);
}

// 格式化单个队列目标的评测报告。
// 说明:已移除原 "run artifact" 行,因为不再有本地落盘产物。
export function formatRunEvalOutput({
  yamlPath,
  modelLabel,
  integrityItems,
  caseItems,
  summary,
}) {
  const lines = [];
  lines.push("1. Queue");
  lines.push(`- \`${yamlPath}\``);
  lines.push("");
  lines.push("2. Integrity Check");
  for (const item of integrityItems) {
    lines.push(`- \`${item.id}\`: ${item.status} | ${item.reason}`);
  }
  lines.push("");
  lines.push("3. Case Results");
  for (const item of caseItems) {
    lines.push(`- \`${item.id}\`: ${item.result}`);
  }
  lines.push("");
  lines.push("4. Summary");
  lines.push(`- directly evaluable: ${summary.directlyEvaluable}`);
  lines.push(`- queue fixes required: ${summary.queueFixesRequired}`);
  lines.push(`- runtime failures: ${summary.runtimeFailures ?? "none"}`);
  return lines.join("\n");
}

// 格式化多个队列目标的批量评测报告。
// 说明:已移除原每个 target 摘要末尾的 "run artifact=..." 段。
export function formatBatchRunEvalOutput({ mode, targets }) {
  const lines = [];
  lines.push("Batch Recall Eval");
  lines.push(`- targets: \`${targets.length}\``);
  lines.push(`- mode: \`${mode}\``);
  lines.push("");
  lines.push("Target Summary");

  for (const target of targets) {
    lines.push(
      `- \`${target.yamlPath}\`: directly evaluable=${target.summary.directlyEvaluable}; queue fixes required=${target.summary.queueFixesRequired}; runtime failures=${target.summary.runtimeFailures ?? "none"}`,
    );
  }

  lines.push("");
  lines.push("Target Reports");
  for (const [index, target] of targets.entries()) {
    lines.push(`## \`${target.yamlPath}\``);
    lines.push(target.reportText);
    if (index < targets.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}
