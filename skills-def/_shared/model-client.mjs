// skills-def/_shared/model-client.mjs
//
// 共享模型客户端：配置发现、provider 加载、client 工厂。
// 聚合 model-runner（传输）与 prompt-context（拼装），暴露高层 API。
//
// 使用方式：
//   import { loadProviders, createClient } from "./model-client.mjs";
//
//   // 方式 A：从矩阵文件自动发现 provider
//   const client = createClient({ promptConfig: { /* ... */ } });
//   const { ok, answer } = await client.ask("问题文本");
//
//   // 方式 B：用指定 provider 直接问
//   const client = createClient({ provider, promptConfig: { /* ... */ } });
//   const { ok, answer } = await client.ask("问题文本");

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { callModel } from "./model-runner.mjs";
import { buildSystemPrompt } from "./prompt-context.mjs";

// ── 常量 ──

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const REPLAY_MATRIX_FILENAMES = Object.freeze([
  ".recall-replay.env.yaml",
  ".recall-replay.env.yml",
  ".recall-replay.env",
]);

const DEFAULT_DEFAULTS = Object.freeze({
  api: "echo",
  temperature: 0,
  max_tokens: 512,
  timeout_ms: 60000,
});

// ── 路径展开 ──

/**
 * 把配置里的 `~` 前缀展开为用户 home 目录。
 *
 * 为什么需要:`~` 展开是 shell 的行为,Node 与 Windows 都不会自动做——
 * `RECALL_REPLAY_MATRIX=~/.recall-replay.env.yaml` 在 Windows 上会被当成
 * 名为 `~` 的普通目录,导致配置静默失效。这里做一层显式转换,
 * 让 POSIX / Windows 行为一致。
 *
 * 边界:只处理 `~`、`~/`、`~\` 前缀;`~user` 形式依赖系统用户数据库,刻意不支持。
 */
export function expandHomePath(inputPath, homeDir = homedir()) {
  if (typeof inputPath !== "string" || inputPath.length === 0) return inputPath;
  if (inputPath === "~") return homeDir;
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

// ── 仓库根发现 ──

export function findRepoRoot(startDir, fileExists = (t) => existsSync(t)) {
  let current = startDir;
  while (true) {
    if (fileExists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

// ── Provider 加载 ──

/**
 * 按优先级发现矩阵文件（RECALL_REPLAY_MATRIX 环境变量 >
 * cwd > repo root > skill dir > home），用 yaml 库解析，
 * 返回 active / skipped provider 列表。
 */
export function loadProviders(options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    fileExists = (t) => existsSync(t),
    skillDir = SCRIPT_DIR,
    homeDir = homedir(),
    fileReader = (t) => readFileSync(t, "utf8"),
  } = options;

  // 发现矩阵文件;override 先做 `~` 展开,否则 Windows 上指向不存在的字面目录
  const override = expandHomePath(env.RECALL_REPLAY_MATRIX, homeDir);
  const candidates = [cwd, findRepoRoot(cwd, fileExists), skillDir, homeDir];
  const seen = new Set();
  let matrixPath = null;

  if (override && fileExists(override)) {
    matrixPath = override;
  } else {
    for (const dir of candidates) {
      if (!dir || seen.has(dir)) continue;
      seen.add(dir);
      for (const name of REPLAY_MATRIX_FILENAMES) {
        const p = join(dir, name);
        if (fileExists(p)) { matrixPath = p; break; }
      }
      if (matrixPath) break;
    }
  }

  if (!matrixPath) return { active: [], skipped: [], noEnvFile: true };

  // 用 yaml 库解析标准 YAML 格式
  let cfg;
  try {
    cfg = parseYaml(fileReader(matrixPath));
  } catch {
    return { active: [], skipped: [], noEnvFile: false, parseError: true };
  }

  const rawProviders = Array.isArray(cfg.providers) ? cfg.providers : [];
  const defaults = { ...DEFAULT_DEFAULTS, ...(cfg.defaults ?? {}) };
  const matrix = Array.isArray(cfg.run?.matrix) && cfg.run.matrix.length > 0
    ? cfg.run.matrix
    : rawProviders.filter(p => p.enabled !== false).map(p => p.id).filter(Boolean);

  const providerMap = {};
  for (const p of rawProviders) {
    if (p.id) providerMap[p.id] = p;
  }

  const active = [];
  const skipped = [];

  for (const name of matrix) {
    const p = providerMap[name];
    if (!p) { skipped.push({ name, reason: "matrix 引用了未定义的 provider" }); continue; }

    // apikey 解析：优先 env[apikey] → 其次 apikey 本身（兼容 inline key）
    // 向后兼容旧字段 key_env
    let key = null;
    const rawKey = p.apikey || p.key_env || p.key;
    if (rawKey) {
      key = env[rawKey] || rawKey;
    }
    if (!key && p.api !== "echo") {
      const label = p.apikey || p.key_env;
      skipped.push({ name, reason: label ? `环境变量 ${label} 未设置` : "无 apikey" });
      continue;
    }

    active.push({
      name,
      api: p.api ?? defaults.api,
      base_url: p.base_url ?? "",
      model: p.model ?? "",
      key: key ?? "",
      timeout_ms: p.timeout_ms ?? defaults.timeout_ms,
      temperature: p.temperature ?? defaults.temperature,
      max_tokens: p.max_tokens ?? defaults.max_tokens,
    });
  }

  return { active, skipped, noEnvFile: false };
}

// ── Client 工厂 ──

/**
 * 创建一个模型客户端。若未显式传入 provider，则从矩阵文件自动发现。
 *
 * @param {object} [options]
 * @param {object} [options.provider]    - 显式指定的 provider（跳过自动发现）
 * @param {object} [options.promptConfig] - 传给 buildSystemPrompt 的上下文配置
 * @param {object} [options.providerOptions] - 透传给 loadProviders 的选项
 * @param {number} [options.maxRetries=0] - 默认重试次数
 * @returns {{ ask, provider, promptConfig }}
 */
export function createClient(options = {}) {
  const {
    provider: explicitProvider,
    promptConfig = {},
    providerOptions = {},
    maxRetries = 0,
  } = options;

  let resolvedProvider = explicitProvider ?? null;
  let skipped = [];
  let noEnvFile = false;

  // 未显式指定 provider 时自动发现
  if (!resolvedProvider) {
    const result = loadProviders(providerOptions);
    if (!result.noEnvFile && result.active.length > 0) {
      resolvedProvider = result.active[0];
    }
    noEnvFile = result.noEnvFile;
    skipped = result.skipped ?? [];
  }

  return {
    provider: resolvedProvider,
    promptConfig,
    skipped,
    noEnvFile,

    /**
     * 用当前 client 的 provider + promptConfig 提问。
     * @param {string} question - 问题文本
     * @param {object} [askOptions]
     * @param {number} [askOptions.maxRetries] - 覆盖默认重试次数
     * @returns {Promise<{ok: boolean, answer?: string, reason?: string}>}
     */
    async ask(question, askOptions = {}) {
      if (!resolvedProvider) {
        return { ok: false, reason: noEnvFile ? "no provider matrix found" : "no active provider available" };
      }

      const system = buildSystemPrompt(promptConfig);
      const fullPrompt = promptConfig.injections?.beforeSkills
        ? `${system}\n\n---\n\nQuestion: ${question}\n\nAnswer based on the context above.`
        : system
          ? `${system}\n\nQuestion: ${question}`
          : question;

      try {
        const answer = await callModel(resolvedProvider, fullPrompt, {
          maxRetries: askOptions.maxRetries ?? maxRetries,
        });
        return { ok: true, answer: answer.trim() };
      } catch (error) {
        return { ok: false, reason: `model call failed: ${error.message}` };
      }
    },
  };
}
