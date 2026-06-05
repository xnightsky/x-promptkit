// skills/_shared/prompt-context.mjs
//
// 三层上下文拼装引擎：纯函数，接收 config 对象，输出 system prompt 字符串。
// 不读文件、不解析 YAML——文件读取由调用方完成，content 字段直接传入。

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── 内部工具 ──

function readMaybe(filePath, cwd) {
  const abs = resolve(cwd, filePath.replace(/^~/, (process.env.HOME || "")));
  if (!existsSync(abs)) return "";
  return readFileSync(abs, "utf8");
}

function truncate(text, maxBytes) {
  if (!maxBytes || maxBytes <= 0) return text;
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return buf.slice(0, maxBytes).toString("utf8");
}

// ── 主入口 ──

/**
 * 从配置对象拼装 system prompt。
 *
 * @param {object} config
 * @param {object} config.skills
 * @param {Array<{name:string, content?:string, path?:string}>} config.skills.items
 * @param {boolean} config.skills.allowDiscovery
 * @param {string[]} config.skills.discoveryPool
 * @param {object} config.repo - { enabled, content?, path?, maxBytes? }
 * @param {object} config.global - { enabled, content?, path?, maxBytes? }
 * @param {object} config.injections - { beforeSkills?, afterSkills? }
 * @param {string} config.cwd - 路径解析基准目录
 * @returns {string}
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
  if (config.repo?.enabled) {
    let repoContent = config.repo.content;
    if (!repoContent && config.repo.path) {
      repoContent = readMaybe(config.repo.path, cwd);
    }
    if (repoContent) {
      parts.push(`### Repo Context\n\n${truncate(repoContent, config.repo.maxBytes)}`);
    }
  }

  // ── Layer 3: Global ──
  if (config.global?.enabled) {
    let globalContent = config.global.content;
    if (!globalContent && config.global.path) {
      globalContent = readMaybe(config.global.path, cwd);
    }
    if (globalContent) {
      parts.push(`### Global Context\n\n${truncate(globalContent, config.global.maxBytes)}`);
    }
  }

  // ── Skill discovery pool ──
  if (config.skills?.allowDiscovery && config.skills?.discoveryPool?.length) {
    const names = config.skills.discoveryPool.join(", ");
    parts.push(`\nAvailable skills (output LOAD_SKILL <name> to load): ${names}`);
  }

  return parts.join("\n\n---\n\n");
}
