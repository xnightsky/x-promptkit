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
import { createClient } from "./_shared/model-client.mjs";
import { buildSystemPrompt, normalizeContextLayers } from "./_shared/prompt-context.mjs";

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

// ── skill-trigger-v1：权限控制 shell agent ──

// 默认允许的命令 glob patterns（Claude Code 风格通配符匹配）。
// 用户通过 queue.yaml 的 skill_trigger.permissions 可追加或覆盖。
export const DEFAULT_ALLOW_PATTERNS = [
  "node *", "node",
  "npm *", "npm",
  "npx *", "npx",
  "ls *", "ls",
  "cat *",
  "grep *",
  "echo *", "echo",
  "head *", "tail *",
  "wc *",
  "find *",
  "git log *", "git log",
  "git diff *", "git diff",
  "git status *", "git status",
]

// 从 SKILL.md 的 YAML frontmatter 解析 name / description
function readSkillMeta(skillPath, baseDir) {
  const fullPath = isAbsolute(skillPath) ? skillPath : resolve(baseDir, skillPath)
  try {
    const text = readFileSync(fullPath, "utf8")
    const m = text.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!m) return {}
    // 极简 YAML 解析器：name: xxx / description: yyy（首行匹配）
    const meta = {}
    for (const line of m[1].split("\n")) {
      const nm = line.match(/^name:\s*(.+)$/)
      if (nm) { meta.name = nm[1].trim(); continue }
      const dm = line.match(/^description:\s*(.+)$/)
      if (dm) { meta.description = dm[1].trim(); continue }
    }
    return meta
  } catch {
    return {}
  }
}

/**
 * 简易 glob 匹配：仅支持 `*` 通配符（匹配任意字符序列，含空格）。
 * 不引入外部依赖；覆盖 recall-eval 沙箱内的命令匹配需求。
 *
 * 例：globMatch("uv run pytest tests/", "uv run *") === true
 *     globMatch("ls", "ls *") === false（"ls" 没有尾部参数）
 *     globMatch("ls", "ls") === true
 */
export function globMatch(text, pattern) {
  // 把 pattern 按 * 分割成字面片段，逐段匹配
  const parts = pattern.split("*")
  if (parts.length === 1) return text === pattern // 无通配符 → 严格相等

  let pos = 0
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    if (i === 0) {
      // 首段必须是前缀
      if (!text.startsWith(seg)) return false
      pos = seg.length
    } else if (i === parts.length - 1) {
      // 末段必须是后缀
      if (!text.endsWith(seg)) return false
      // 末段可以是空串（pattern 以 * 结尾），此时 endsWith("") 永远 true
      if (seg.length > 0 && text.length - pos < seg.length) return false
    } else {
      // 中间段：找第一个出现位置
      const idx = text.indexOf(seg, pos)
      if (idx === -1) return false
      pos = idx + seg.length
    }
  }
  return true
}

/**
 * 创建命令权限检查器。
 *
 * @param {object} [permissions] - skill_trigger.permissions 配置
 * @param {string} [permissions.mode="merge"] - "merge"（追加到默认）| "override"（替换默认）
 * @param {string[]} [permissions.allow] - 允许的 glob patterns
 * @param {string[]} [permissions.deny] - 拒绝的 glob patterns（优先级高于 allow）
 * @returns {(command: string) => boolean}
 */
export function createShellChecker(permissions = {}) {
  const { mode = "merge", allow = [], deny = [] } = permissions

  // 合并 allow patterns：merge 模式追加到默认，override 模式只用用户声明
  const effectiveAllow = mode === "override"
    ? [...allow]
    : [...DEFAULT_ALLOW_PATTERNS, ...allow]

  return (command) => {
    const trimmed = command.trim()
    if (!trimmed) return false

    // 清理无害的 stderr 重定向后缀
    const cleaned = trimmed
      .replace(/\s*2>\/?dev\/null\s*$/, "")
      .replace(/\s*2>&1\s*$/, "")
      .trim()

    if (!cleaned) return false

    // deny 优先：命中任一 deny pattern → BLOCK
    if (deny.some((p) => globMatch(cleaned, p))) return false

    // allow 匹配：命中任一 allow pattern → ALLOW
    if (effectiveAllow.some((p) => globMatch(cleaned, p))) return true

    // 未命中 → BLOCK
    return false
  }
}

// 向后兼容：无配置时等价于旧 isShellAllowed 行为（仅 DEFAULT_ALLOW_PATTERNS）
function isShellAllowed(command) {
  return createShellChecker()(command)
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
 * 技能触发模式 agent：给定候选技能目录，模型自主选择并执行。
 *
 * @param {object} opts
 * @param {Array<{name:string, desc?:string, path:string}>} opts.availableSkills - 候选技能目录
 * @param {string} opts.question
 * @param {object} opts.provider
 * @param {string} [opts.baseDir]
 * @param {number} [opts.maxSteps=5]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts.permissions] - 命令权限配置（来自 queue.yaml skill_trigger.permissions）
 * @param {string} [opts.permissions.mode="merge"] - "merge" | "override"
 * @param {string[]} [opts.permissions.allow] - 允许的 glob patterns
 * @param {string[]} [opts.permissions.deny] - 拒绝的 glob patterns
 * @returns {Promise<{ok: boolean, toolCalls?: Array, finalAnswer?: string, reason?: string}>}
 */
export async function runSkillTriggerAgent({
  availableSkills = [], question, provider, baseDir = process.cwd(),
  maxSteps = 5, timeoutMs = 30000, permissions,
}) {
  // 解析候选技能目录：自动读 SKILL.md frontmatter（name/description），显式覆盖优先
  const resolvedSkills = availableSkills.map((s) => {
    const meta = readSkillMeta(s.path, baseDir)
    return {
      name: s.name || meta.name || s.path,
      desc: s.desc || meta.description || "",
      path: s.path,
    }
  })

  // 构造权限检查器
  const shellChecker = createShellChecker(permissions)

  // 计算生效的 allow patterns（用于 prompt 告知模型）
  const { mode = "merge", allow: userAllow = [] } = permissions || {}
  const effectiveAllowForPrompt = mode === "override"
    ? userAllow
    : [...DEFAULT_ALLOW_PATTERNS, ...userAllow]

  // 用 buildSystemPrompt 构造 system prompt，包含候选技能目录
  const rawPrompt = buildSystemPrompt({
    skills: {
      allowDiscovery: true,
      discoveryPool: resolvedSkills,
    },
    injections: {
      beforeSkills: [
        "policy: skill-trigger-v1",
        "",
        "You are evaluating which skill to trigger. Pick the best skill from the list,",
        "then cat its path to read the full documentation, and follow its instructions.",
      ].join("\n"),
      afterSkills: [
        "",
        `Allowed command patterns: ${effectiveAllowForPrompt.join(", ")}`,
        "To run a command, output:",
        "<tool_call>",
        '{"command": "<your command here>"}',
        "</tool_call>",
        "Commands are matched against glob patterns (* = any characters).",
        "After you have gathered enough information, give your final answer.",
      ].join("\n"),
    },
    cwd: baseDir,
  })

  const toolCalls = []
  const messages = [{ role: "user", content: question }]

  // 用 model-client 创建 client
  const systemPrompt = rawPrompt
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
      if (!shellChecker(call.command)) {
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
