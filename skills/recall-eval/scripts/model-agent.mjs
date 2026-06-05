// skills/recall-eval/scripts/model-agent.mjs
//
// recall-eval 的模型代理：读 prompt-context DSL → 内联 SKILL.md → 调模型。
// 不做打分、不管队列、不管报告。核心逻辑委托给 _shared/model-client。

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createClient } from "../../_shared/model-client.mjs";

/**
 * 运行一次 recall agent：读 sourceRef 指向的 SKILL.md → 拼 prompt → 调模型。
 *
 * @param {object} options
 * @param {string} options.sourceRef  - 要内联的 skill 文件路径（相对于 baseDir）
 * @param {string} options.question   - recall queue 中的问题
 * @param {object} options.provider   - provider 对象 { api, base_url, model, key, ... }
 * @param {number} [options.maxRetries=0]
 * @param {string} [options.baseDir]  - source_ref 的解析基准目录；约定为队列文件
 *   所在仓库根。不传时退回 process.cwd()（仅当从仓库根运行时两者恰好一致）。
 * @returns {Promise<{ok: boolean, answer?: string, reason?: string, retriesUsed?: number}>}
 */
export async function runRecallAgent({ sourceRef, question, provider, maxRetries = 0, baseDir = process.cwd() }) {
  // 读 source_ref 指向的 SKILL.md。
  // 按 baseDir(队列所在仓库根)解析,而不是进程 cwd——队列可能从任意工作目录
  // 被引用(例如仓库外调用绝对路径队列),按 cwd 解析会稳定 not found。
  const sourcePath = isAbsolute(sourceRef) ? sourceRef : resolve(baseDir, sourceRef);
  let skillContent;
  try {
    skillContent = readFileSync(sourcePath, "utf8");
  } catch {
    return { ok: false, reason: `source_ref not found: ${sourceRef} (resolved: ${sourcePath})` };
  }

  // 用 model-client 创建客户端：它负责加载 DSL + 拼 prompt + 调模型
  const client = createClient({
    provider,
    maxRetries,
    promptConfig: {
      skills: { items: [{ name: sourceRef, content: skillContent }] },
      injections: {
        beforeSkills: [
          "policy: clean-context-v1",
          "",
          "You may only answer using the skill content provided below.",
          "Answer the question based solely on what the skill defines.",
          "Do not invent, do not search, do not read files.",
        ].join("\n"),
      },
    },
  });

  // 直接用 client 提问
  const result = await client.ask(question);
  if (!result.ok) {
    return { ok: false, reason: result.reason, retriesUsed: maxRetries };
  }

  return { ok: true, answer: result.answer };
}
