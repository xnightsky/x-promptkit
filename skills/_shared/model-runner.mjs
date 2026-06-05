// skills/_shared/model-runner.mjs
//
// 共享模型传输原语：多协议 callModel + 重试预算。
// 纯传输层——不读文件、不发现配置、不依赖任何 skill 特定逻辑。

// ── 常量 ──

export const SUPPORTED_APIS = Object.freeze([
  "anthropic-messages",
  "openai-chat",
  "echo",
]);

// ── 协议适配（内部） ──

async function callAnthropic(p, prompt, signal) {
  const res = await fetch(`${p.base_url.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: p.model, max_tokens: p.max_tokens ?? 512, temperature: p.temperature ?? 0, messages: [{ role: "user", content: prompt }] }),
    signal,
  });
  if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: "RATE_LIMITED" });
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(`anthropic ${res.status}`), { code: "BAD_RESPONSE" });
  const text = (j.content || []).map(b => b.text || "").join("");
  if (!text.trim()) throw Object.assign(new Error("empty_response"), { code: "EMPTY_RESPONSE" });
  return text;
}

async function callOpenAIChat(p, prompt, signal) {
  const res = await fetch(`${p.base_url.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: p.model, temperature: p.temperature ?? 0, messages: [{ role: "user", content: prompt }] }),
    signal,
  });
  if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: "RATE_LIMITED" });
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(`openai-chat ${res.status}`), { code: "BAD_RESPONSE" });
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw Object.assign(new Error("empty_response"), { code: "EMPTY_RESPONSE" });
  return text;
}

function callEcho(provider, prompt) {
  return `[echo ${provider.model || "default"}]\n${prompt}`;
}

// ── 重试预算 ──

const RETRY_BUDGET = Object.freeze({
  RATE_LIMITED: 2,
  STREAM_CLOSED: 1,
  TIMEOUT: 1,
  BAD_RESPONSE: 0,
  EMPTY_RESPONSE: 0,
});

function classifyRetry(error) {
  if (error.code === "RATE_LIMITED") return "RATE_LIMITED";
  if (error.name === "AbortError" || error.message?.includes("timeout")) return "TIMEOUT";
  if (error.code === "ECONNRESET" || error.code === "EPIPE" || error.message?.includes("EOF")) return "STREAM_CLOSED";
  if (error.code === "EMPTY_RESPONSE") return "EMPTY_RESPONSE";
  if (error.code === "BAD_RESPONSE") return "BAD_RESPONSE";
  if (error.cause?.code === "ECONNRESET" || error.cause?.code === "EPIPE") return "STREAM_CLOSED";
  return "BAD_RESPONSE";
}

/**
 * 调用模型，带重试预算。echo 后端离线短路不重试。
 *
 * @param {object} provider - { api, base_url, model, key, timeout_ms?, temperature?, max_tokens? }
 * @param {string} prompt   - 完整提示词文本
 * @param {object} [options]
 * @param {number} [options.maxRetries=0] - 最大重试次数
 * @param {Function} [options.fetchImpl]  - 可注入的 fetch（测试用）
 * @returns {Promise<string>} 模型回答文本
 */
export async function callModel(provider, prompt, options = {}) {
  const {
    maxRetries = 0,
    fetchImpl = globalThis.fetch,
  } = options;

  if (provider.api === "echo") {
    return callEcho(provider, prompt);
  }

  // 用注入的 fetch 覆盖全局 fetch（仅在本次调用的闭包内生效）
  const _fetch = fetchImpl;

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeout_ms ?? 60000);
    try {
      // 把注入的 fetch 作为闭包变量传给协议适配器
      const fetcher = async (url, init) => _fetch(url, { ...init, signal: controller.signal });
      if (provider.api === "anthropic-messages") {
        const res = await fetcher(`${provider.base_url.replace(/\/$/, "")}/v1/messages`, {
          method: "POST",
          headers: { "x-api-key": provider.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: provider.model, max_tokens: provider.max_tokens ?? 512, temperature: provider.temperature ?? 0, messages: [{ role: "user", content: prompt }] }),
        });
        if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: "RATE_LIMITED" });
        const j = await res.json();
        if (!res.ok) throw Object.assign(new Error(`anthropic ${res.status}`), { code: "BAD_RESPONSE" });
        const text = (j.content || []).map(b => b.text || "").join("");
        if (!text.trim()) throw Object.assign(new Error("empty_response"), { code: "EMPTY_RESPONSE" });
        return text;
      }
      if (provider.api === "openai-chat") {
        const res = await fetcher(`${provider.base_url.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${provider.key}`, "content-type": "application/json" },
          body: JSON.stringify({ model: provider.model, temperature: provider.temperature ?? 0, messages: [{ role: "user", content: prompt }] }),
        });
        if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: "RATE_LIMITED" });
        const j = await res.json();
        if (!res.ok) throw Object.assign(new Error(`openai-chat ${res.status}`), { code: "BAD_RESPONSE" });
        const text = j.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) throw Object.assign(new Error("empty_response"), { code: "EMPTY_RESPONSE" });
        return text;
      }
      throw new Error(`unsupported api: ${provider.api}`);
    } catch (error) {
      lastError = error;
      const cls = classifyRetry(error);
      const budget = RETRY_BUDGET[cls] ?? 0;
      if (attempt >= budget || attempt >= maxRetries) break;
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw Object.assign(
    new Error(`callModel exhausted after ${maxRetries + 1} attempts: ${lastError?.message}`),
    { code: "RETRIES_EXHAUSTED", cause: lastError }
  );
}
