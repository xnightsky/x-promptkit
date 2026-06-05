// skills/recall-eval/scripts/model-agent.mjs
//
// recall-eval 的模型代理：读 prompt-context DSL → 内联 SKILL.md → 调模型。
// 不做打分、不管队列、不管报告。核心逻辑委托给 _shared/model-client。

import { readFileSync } from "node:fs";
import { createClient } from "../../_shared/model-client.mjs";

/**
 * 运行一次 recall agent：读 sourceRef 指向的 SKILL.md → 拼 prompt → 调模型。
 *
 * @param {object} options
 * @param {string} options.sourceRef  - 要内联的 skill 文件路径（相对于仓库根）
 * @param {string} options.question   - recall queue 中的问题
 * @param {object} options.provider   - provider 对象 { api, base_url, model, key, ... }
 * @param {number} [options.maxRetries=0]
 * @returns {Promise<{ok: boolean, answer?: string, reason?: string, retriesUsed?: number}>}
 */
export async function runRecallAgent({ sourceRef, question, provider, maxRetries = 0 }) {
  // 读 source_ref 指向的 SKILL.md
  let skillContent;
  try {
    skillContent = readFileSync(sourceRef, "utf8");
  } catch {
    return { ok: false, reason: `source_ref not found: ${sourceRef}` };
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
