// skills-def/recall-eval/lib/model-agent.mjs
//
// recall-eval 的模型代理：两种模式
//   - runRecallAgent: clean-context-v1（知识召回）
//   - runSkillTriggerAgent: skill-trigger-v1（白名单 shell）
//
// 不做打分、不管队列。传输与拼装委托给 _shared/model-client。

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

// ── skill-trigger-v1：白名单 shell agent ──

const DEFAULT_WHITELIST = [
  "node", "npm", "npx", "ls", "cat", "grep", "echo", "head", "tail",
  "wc", "find", "git log", "git diff", "git status",
]

function isShellAllowed(command) {
  const trimmed = command.trim()
  if (!trimmed) return false
  // 允许无害的后缀：2>/dev/null, 2>&1
  const cleaned = trimmed.replace(/\s*2>\/?dev\/null\s*$/, "").replace(/\s*2>&1\s*$/, "").trim()
  // 禁止管道、重定向、后台等
  if (/[;|>`$(){}\\]/.test(cleaned)) return false
  return DEFAULT_WHITELIST.some((prefix) => cleaned.startsWith(prefix))
}

function parseToolCalls(text) {
  const results = []
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
  let match
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.command) results.push(parsed)
    } catch { /* skip malformed */ }
  }
  return results
}

/**
 * 技能触发模式 agent：给模型 skill 内容 + 场景，让其自主决定执行命令。
 *
 * @returns {Promise<{ok: boolean, toolCalls?: Array, finalAnswer?: string, reason?: string}>}
 */
export async function runSkillTriggerAgent({
  sourceRef, question, provider, baseDir = process.cwd(),
  maxSteps = 5, timeoutMs = 30000,
}) {
  const sourcePath = isAbsolute(sourceRef) ? sourceRef : resolve(baseDir, sourceRef)

  const systemPrompt = [
    "policy: skill-trigger-v1",
    "",
    "",
    "You have access to a read-only shell to inspect files and run commands.",
    `Skill file: ${sourceRef}`,
    "",
    "<tool_call>",
    '{"command": "<your command here>"}',
    "</tool_call>",
    "",
    `Allowed commands: ${DEFAULT_WHITELIST.join(", ")}`,
    "Pipes, redirects, and shell metacharacters are forbidden.",
    "Do NOT read files except via tool_call. Do NOT invent answers.",
    "After you have gathered enough information from tool outputs, give your final answer.",
  ].join("\n")

  const toolCalls = []
  const messages = [{ role: "user", content: question }]

  // 用 model-client 创建 client（直接调 callModel，手动做多轮）
  const callWithPrompt = async (prompt) => {
    const client = createClient({ provider, maxRetries: 0 })
    const fullPrompt = systemPrompt + "\n\n" + prompt
    return client.ask(fullPrompt)
  }

  for (let step = 0; step < maxSteps; step++) {
    // 构造当前轮次的 prompt：历史 + 当前消息
    let prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n")

    const result = await callWithPrompt(prompt)
    if (!result.ok) {
      return { ok: false, reason: result.reason, toolCalls }
    }

    const answer = result.answer

    // 检查是否有 tool_call
    const calls = parseToolCalls(answer)
    if (calls.length === 0) {
      // 没有 tool call → 最终回答
      return { ok: true, toolCalls, finalAnswer: answer }
    }

    // 执行 tool calls
    for (const call of calls) {
      if (!isShellAllowed(call.command)) {
        messages.push({ role: "assistant", content: answer })
        messages.push({
          role: "user",
          content: `<tool_result>\ncommand: ${call.command}\nerror: command not allowed by whitelist\n</tool_result>`,
        })
        toolCalls.push({ command: call.command, stdout: "", exitCode: -1, allowed: false })
        continue
      }

      try {
        const stdout = execSync(call.command, {
          cwd: baseDir,
          timeout: timeoutMs,
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        })
        toolCalls.push({ command: call.command, stdout, exitCode: 0, allowed: true })
        messages.push({ role: "assistant", content: answer })
        messages.push({
          role: "user",
          content: `<tool_result>\ncommand: ${call.command}\nexit_code: 0\n${stdout}</tool_result>`,
        })
      } catch (error) {
        const stderr = error.stderr || error.message || ""
        const exitCode = error.status ?? 1
        toolCalls.push({ command: call.command, stdout: stderr, exitCode, allowed: true })
        messages.push({ role: "assistant", content: answer })
        messages.push({
          role: "user",
          content: `<tool_result>\ncommand: ${call.command}\nexit_code: ${exitCode}\n${stderr}</tool_result>`,
        })
      }
    }
  }

  // 达到 maxSteps 上限
  return { ok: true, toolCalls, finalAnswer: "(max steps reached)" }
}
