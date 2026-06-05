// skills/recall-eval/scripts/model-agent.mjs
//
// recall-eval 的模型代理：内联 source_ref 指向的 prompt 文本，按用例的
// context 声明拼装 repo/global 提示词层，再调模型。
// 不做打分、不管队列、不管报告。传输与拼装委托给 _shared/model-client。
//
// 策略边界：clean-context-v1 注入钉死在本文件（红线，不是配置项）；
// 队列契约能改的只有「加载哪些提示词层」（context 声明，结构定义见
// _shared/prompt-context.mjs），改不了 no-tools / no-reads 红线本身。

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createClient } from "../../_shared/model-client.mjs";
import { normalizeContextLayers } from "../../_shared/prompt-context.mjs";

/**
 * 运行一次 recall agent：读 sourceRef 指向的 prompt 文本 → 拼 prompt → 调模型。
 *
 * @param {object} options
 * @param {string} options.sourceRef  - 要内联的 skill 文件路径（相对于 baseDir）
 * @param {string} options.question   - recall queue 中的问题
 * @param {object} options.provider   - provider 对象 { api, base_url, model, key, ... }
 * @param {object} [options.context]  - 用例生效的 context 声明（snake_case 文件态）：
 *   是否加载项目提示词(repo)/全局提示词(global)；缺省 = 都不加载。
 * @param {number} [options.maxRetries=0]
 * @param {string} [options.baseDir]  - source_ref 与 context.repo.path 的解析基准
 *   目录；约定为队列文件所在仓库根。不传时退回 process.cwd()
 *   （仅当从仓库根运行时两者恰好一致）。
 * @returns {Promise<{ok: boolean, answer?: string, reason?: string, retriesUsed?: number}>}
 */
export async function runRecallAgent({ sourceRef, question, provider, context, maxRetries = 0, baseDir = process.cwd() }) {
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

  // context 声明（snake_case）→ 引擎 repo/global config（camelCase）。
  // 路径解析基准与 source_ref 一致(baseDir)，由 buildSystemPrompt 的 cwd 承担。
  const layers = normalizeContextLayers(context ?? {});

  // 用 model-client 创建客户端：promptConfig 在此构造，无文件级配置面
  const client = createClient({
    provider,
    maxRetries,
    promptConfig: {
      skills: { items: [{ name: sourceRef, content: skillContent }] },
      repo: layers.repo,
      global: layers.global,
      cwd: baseDir,
      injections: {
        beforeSkills: [
          "policy: clean-context-v1",
          "",
          "You may only answer using the context provided below.",
          "Answer the question based solely on what the provided context defines.",
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
