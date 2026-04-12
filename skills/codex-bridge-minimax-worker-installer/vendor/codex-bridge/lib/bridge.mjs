import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://api.minimaxi.com/anthropic";
const ANTHROPIC_VERSION = "2023-06-01";

function stripMatchingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value.at(-1);
    if ((first === "'" || first === "\"") && first === last) {
      return value.slice(1, -1);
    }
  }

  return value;
}

export function parseEnvText(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripMatchingQuotes(line.slice(separatorIndex + 1).trim());
    result[key] = value;
  }

  return result;
}

export function loadBridgeEnv({ cwd = process.cwd(), env = process.env } = {}) {
  const envFile = path.join(cwd, ".env");
  let fileEnv = {};

  try {
    fileEnv = parseEnvText(readFileSync(envFile, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    apiKey: env.ANTHROPIC_AUTH_TOKEN || fileEnv.ANTHROPIC_AUTH_TOKEN || "",
    defaultModel: env.ANTHROPIC_MODEL || fileEnv.ANTHROPIC_MODEL || "",
    baseUrl: env.ANTHROPIC_BASE_URL || fileEnv.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL,
  };
}

function textFromContentBlock(block) {
  if (typeof block === "string") {
    return block;
  }

  if (!block || typeof block !== "object") {
    return String(block ?? "");
  }

  const blockType = block.type ?? "";
  if (blockType === "input_text" || blockType === "output_text" || blockType === "text") {
    return typeof block.text === "string" ? block.text : "";
  }

  return "";
}

export function convertInputToAnthropic(body) {
  const developerChunks = [];
  const inputValue = body?.input ?? "";

  if (typeof inputValue === "string") {
    return { messages: [{ role: "user", content: inputValue }], developerContent: "" };
  }

  if (!Array.isArray(inputValue)) {
    return {
      messages: [{ role: "user", content: String(inputValue) }],
      developerContent: "",
    };
  }

  const items = [];

  for (const item of inputValue) {
    if (!item || typeof item !== "object") {
      items.push({ role: "user", content: String(item) });
      continue;
    }

    const itemType = item.type ?? "";
    const role = item.role ?? "";

    if (role === "developer") {
      const content = item.content;
      if (Array.isArray(content)) {
        developerChunks.push(content.map(textFromContentBlock).filter(Boolean).join("\n"));
      } else if (typeof content === "string") {
        developerChunks.push(content);
      } else if (content != null) {
        developerChunks.push(String(content));
      }
      continue;
    }

    if (itemType === "function_call") {
      const callId = item.call_id || item.id || "";
      const name = item.name || "";
      const argumentsValue = item.arguments ?? "{}";
      let input = argumentsValue;

      try {
        input =
          typeof argumentsValue === "string" ? JSON.parse(argumentsValue) : argumentsValue;
      } catch {
        input = { raw: String(argumentsValue) };
      }

      items.push({
        role: "assistant",
        content: {
          type: "tool_use",
          id: callId,
          name,
          input,
        },
      });
      continue;
    }

    if (itemType === "function_call_output") {
      items.push({
        role: "user",
        content: {
          type: "tool_result",
          tool_use_id: item.call_id || "",
          content: String(item.output ?? ""),
        },
      });
      continue;
    }

    if (role === "user" || role === "assistant") {
      const content = item.content;
      if (typeof content === "string") {
        items.push({ role, content });
      } else if (Array.isArray(content)) {
        const text = content.map(textFromContentBlock).filter(Boolean).join("\n");
        if (text) {
          items.push({ role, content: text });
        }
      } else {
        items.push({ role, content: String(content ?? "") });
      }
      continue;
    }

    if (itemType === "input_text") {
      items.push({ role: "user", content: String(item.text ?? "") });
      continue;
    }

    items.push({ role: "user", content: String(item) });
  }

  const messages = [];
  for (const item of items) {
    const previous = messages.at(-1);
    if (previous && previous.role === item.role) {
      const existing = previous.content;
      const incoming = item.content;

      if (typeof existing === "string") {
        previous.content =
          typeof incoming === "string"
            ? `${existing}\n${incoming}`
            : [{ type: "text", text: existing }, incoming];
      } else if (Array.isArray(existing)) {
        existing.push(
          typeof incoming === "string" ? { type: "text", text: incoming } : incoming,
        );
      }
      continue;
    }

    messages.push({
      role: item.role,
      content: typeof item.content === "object" ? [item.content] : item.content,
    });
  }

  if (messages.length > 0 && messages[0].role !== "user") {
    messages.unshift({ role: "user", content: "(continue)" });
  }

  return {
    messages,
    developerContent: developerChunks.filter(Boolean).join("\n"),
  };
}

export function convertToolsToAnthropic(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  const anthropicTools = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") {
      continue;
    }

    if (tool.type !== "function") {
      continue;
    }

    const anthropicTool = {
      name: tool.name || "",
      description: tool.description || "",
      input_schema: tool.parameters || { type: "object", properties: {} },
    };

    if (tool.function && typeof tool.function === "object") {
      anthropicTool.name = tool.function.name || anthropicTool.name;
      anthropicTool.description = tool.function.description || anthropicTool.description;
      anthropicTool.input_schema = tool.function.parameters || anthropicTool.input_schema;
    }

    if (!anthropicTool.name) {
      continue;
    }

    if (!anthropicTool.input_schema || typeof anthropicTool.input_schema !== "object") {
      anthropicTool.input_schema = { type: "object", properties: {} };
    }

    if (!anthropicTool.input_schema.type) {
      anthropicTool.input_schema.type = "object";
    }

    anthropicTools.push(anthropicTool);
  }

  return anthropicTools.length > 0 ? anthropicTools : null;
}

function buildSseFrame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function anthropicEventToOpenAiStream(event, context = {}) {
  const nextContext = {
    messageId: context.messageId ?? null,
    model: context.model ?? null,
    state:
      context.state ?? {
        textBlockIndices: new Set(),
        toolUseIndices: new Map(),
        doneIndices: new Set(),
        accumulatedText: new Map(),
        usage: { input_tokens: 0, output_tokens: 0 },
        outputIndexCounter: 0,
        idxToOutputIndex: new Map(),
      },
  };

  const { state } = nextContext;
  const eventType = event?.type;

  if (eventType === "message_start") {
    nextContext.messageId = event.message?.id ?? nextContext.messageId;
    nextContext.model = event.message?.model ?? nextContext.model;
    if (event.message?.usage) {
      state.usage.input_tokens = event.message.usage.input_tokens ?? 0;
    }

    return {
      context: nextContext,
      sse: buildSseFrame({
        type: "response.created",
        response: {
          id: nextContext.messageId,
          object: "response",
          model: nextContext.model,
          created_at: Math.floor(Date.now() / 1000),
          status: "in_progress",
          output: [],
        },
      }),
    };
  }

  if (eventType === "content_block_start") {
    const block = event.content_block ?? {};
    const index = event.index ?? 0;

    if (block.type === "text") {
      const outputIndex = state.outputIndexCounter;
      state.outputIndexCounter += 1;
      state.idxToOutputIndex.set(index, outputIndex);
      state.textBlockIndices.add(index);
      state.accumulatedText.set(index, "");

      const itemId = `msg_${nextContext.messageId}_${outputIndex}`;
      return {
        context: nextContext,
        sse:
          buildSseFrame({
            type: "response.output_item.added",
            output_index: outputIndex,
            item: {
              id: itemId,
              type: "message",
              role: "assistant",
              status: "in_progress",
              content: [],
            },
          }) +
          buildSseFrame({
            type: "response.content_part.added",
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: "output_text", text: "" },
          }),
      };
    }

    if (block.type === "tool_use") {
      const outputIndex = state.outputIndexCounter;
      state.outputIndexCounter += 1;
      state.idxToOutputIndex.set(index, outputIndex);
      state.toolUseIndices.set(index, {
        id: block.id ?? "",
        name: block.name ?? "",
        arguments: "",
      });

      const itemId = `fc_${nextContext.messageId}_${outputIndex}`;
      return {
        context: nextContext,
        sse: buildSseFrame({
          type: "response.output_item.added",
          output_index: outputIndex,
          item: {
            type: "function_call",
            id: itemId,
            call_id: block.id ?? "",
            name: block.name ?? "",
            arguments: "",
            status: "in_progress",
          },
        }),
      };
    }

    return { context: nextContext, sse: "" };
  }

  if (eventType === "content_block_delta") {
    const delta = event.delta ?? {};
    const index = event.index ?? 0;
    const outputIndex = state.idxToOutputIndex.get(index) ?? index;

    if (delta.type === "text_delta") {
      const chunk = delta.text ?? "";
      state.accumulatedText.set(index, `${state.accumulatedText.get(index) ?? ""}${chunk}`);
      return {
        context: nextContext,
        sse: buildSseFrame({
          type: "response.output_text.delta",
          item_id: `msg_${nextContext.messageId}_${outputIndex}`,
          output_index: outputIndex,
          content_index: 0,
          delta: chunk,
        }),
      };
    }

    if (delta.type === "input_json_delta") {
      const chunk = delta.partial_json ?? "";
      const toolState = state.toolUseIndices.get(index);
      if (toolState) {
        toolState.arguments += chunk;
      }

      return {
        context: nextContext,
        sse: buildSseFrame({
          type: "response.function_call_arguments.delta",
          item_id: `fc_${nextContext.messageId}_${outputIndex}`,
          output_index: outputIndex,
          delta: chunk,
        }),
      };
    }

    return { context: nextContext, sse: "" };
  }

  if (eventType === "content_block_stop") {
    const index = event.index ?? 0;
    const outputIndex = state.idxToOutputIndex.get(index) ?? index;

    if (state.textBlockIndices.has(index) && !state.doneIndices.has(index)) {
      state.doneIndices.add(index);
      const itemId = `msg_${nextContext.messageId}_${outputIndex}`;
      const finalText = state.accumulatedText.get(index) ?? "";
      return {
        context: nextContext,
        sse:
          buildSseFrame({
            type: "response.output_text.done",
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            text: finalText,
          }) +
          buildSseFrame({
            type: "response.content_part.done",
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: "output_text", text: finalText },
          }) +
          buildSseFrame({
            type: "response.output_item.done",
            output_index: outputIndex,
            item: {
              id: itemId,
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: finalText }],
            },
          }),
      };
    }

    if (state.toolUseIndices.has(index) && !state.doneIndices.has(index)) {
      state.doneIndices.add(index);
      const toolState = state.toolUseIndices.get(index);
      const itemId = `fc_${nextContext.messageId}_${outputIndex}`;
      return {
        context: nextContext,
        sse:
          buildSseFrame({
            type: "response.function_call_arguments.done",
            item_id: itemId,
            output_index: outputIndex,
            arguments: toolState.arguments,
          }) +
          buildSseFrame({
            type: "response.output_item.done",
            output_index: outputIndex,
            item: {
              type: "function_call",
              id: itemId,
              call_id: toolState.id,
              name: toolState.name,
              arguments: toolState.arguments,
              status: "completed",
            },
          }),
      };
    }

    return { context: nextContext, sse: "" };
  }

  if (eventType === "message_delta") {
    if (event.usage) {
      state.usage.output_tokens = event.usage.output_tokens ?? 0;
    }

    return { context: nextContext, sse: "" };
  }

  if (eventType === "message_stop") {
    const output = [];
    for (const index of state.textBlockIndices) {
      const outputIndex = state.idxToOutputIndex.get(index) ?? index;
      output.push([
        outputIndex,
        {
          type: "message",
          id: `msg_${nextContext.messageId}_${outputIndex}`,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: state.accumulatedText.get(index) ?? "" }],
        },
      ]);
    }

    for (const [index, toolState] of state.toolUseIndices.entries()) {
      const outputIndex = state.idxToOutputIndex.get(index) ?? index;
      output.push([
        outputIndex,
        {
          type: "function_call",
          id: `fc_${nextContext.messageId}_${outputIndex}`,
          call_id: toolState.id,
          name: toolState.name,
          arguments: toolState.arguments,
          status: "completed",
        },
      ]);
    }

    output.sort((left, right) => left[0] - right[0]);
    const usage = {
      input_tokens: state.usage.input_tokens,
      output_tokens: state.usage.output_tokens,
      total_tokens: state.usage.input_tokens + state.usage.output_tokens,
    };

    return {
      context: nextContext,
      sse: buildSseFrame({
        type: "response.completed",
        response: {
          id: nextContext.messageId,
          object: "response",
          model: nextContext.model,
          created_at: Math.floor(Date.now() / 1000),
          status: "completed",
          output: output.map(([, item]) => item),
          usage,
        },
      }),
    };
  }

  return { context: nextContext, sse: "" };
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function buildAnthropicHeaders(apiKey, stream) {
  return {
    "content-type": "application/json",
    accept: stream ? "text/event-stream" : "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
    "x-api-key": apiKey,
    authorization: `Bearer ${apiKey}`,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function buildErrorResponse(statusCode, message, type = "internal_error") {
  return {
    error: {
      message,
      type,
      status_code: statusCode,
    },
  };
}

async function parseErrorResponse(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const message = json?.error?.message || json?.message || text;
    return message || `Upstream request failed with status ${response.status}`;
  } catch {
    return text || `Upstream request failed with status ${response.status}`;
  }
}

async function* iterateSseEvents(stream) {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += Buffer.from(chunk).toString("utf8");

    while (true) {
      const delimiterMatch = buffer.match(/\r?\n\r?\n/u);
      if (!delimiterMatch || delimiterMatch.index == null) {
        break;
      }

      const delimiterIndex = delimiterMatch.index;
      const delimiterLength = delimiterMatch[0].length;
      const rawEvent = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + delimiterLength);

      const lines = rawEvent.split(/\r?\n/u);
      let eventName = "";
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      const data = dataLines.join("\n");
      if (!data || data === "[DONE]") {
        continue;
      }

      yield { event: eventName, data };
    }
  }
}

export async function requestAnthropic({
  body,
  apiKey,
  baseUrl,
  stream = false,
}) {
  const response = await fetch(new URL("v1/messages", normalizeBaseUrl(baseUrl)), {
    method: "POST",
    headers: buildAnthropicHeaders(apiKey, stream),
    body: JSON.stringify(stream ? { ...body, stream: true } : body),
  });

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return response;
}

export function mapAnthropicMessageToOpenAiResponse(message) {
  const output = [];
  let outputIndex = 0;

  for (const block of message.content ?? []) {
    if (block?.type === "text") {
      output.push({
        type: "message",
        id: `msg_${message.id}_${outputIndex}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: block.text ?? "" }],
      });
      outputIndex += 1;
      continue;
    }

    if (block?.type === "tool_use") {
      output.push({
        type: "function_call",
        id: `fc_${message.id}_${outputIndex}`,
        call_id: block.id ?? "",
        name: block.name ?? "",
        arguments: JSON.stringify(block.input ?? {}),
        status: "completed",
      });
      outputIndex += 1;
    }
  }

  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;
  return {
    id: message.id,
    object: "response",
    model: message.model,
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    output,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

function buildOpenApiDocument(port) {
  return {
    openapi: "3.1.0",
    info: {
      title: "codex-bridge",
      version: "0.1.0",
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    paths: {
      "/responses": { post: { operationId: "handleResponses" } },
      "/v1/responses": { post: { operationId: "handleResponsesV1" } },
      "/healthz": { get: { operationId: "health" } },
    },
  };
}

async function handleResponses(req, res, runtimeConfig) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(
      res,
      400,
      buildErrorResponse(400, `Invalid JSON body: ${error.message}`, "invalid_request_error"),
    );
    return;
  }

  const { apiKey, defaultModel, baseUrl } = runtimeConfig;
  const model = body.model || defaultModel;
  const maxOutputTokens = body.max_output_tokens || body.max_tokens || 4096;
  const temperature = body.temperature;
  let instructions = body.instructions || body.system;
  const stream = Boolean(body.stream);

  const { messages, developerContent } = convertInputToAnthropic(body);
  const tools = convertToolsToAnthropic(body.tools);
  if (developerContent) {
    instructions = instructions ? `${developerContent}\n${instructions}` : developerContent;
  }

  const anthropicBody = {
    model,
    messages,
    max_tokens: maxOutputTokens,
  };
  if (typeof temperature === "number") {
    anthropicBody.temperature = temperature;
  }
  if (instructions) {
    anthropicBody.system = instructions;
  }
  if (tools) {
    anthropicBody.tools = tools;
  }

  if (stream) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-request-id": body.id || "",
      "x-accel-buffering": "no",
    });

    try {
      const upstream = await requestAnthropic({
        body: anthropicBody,
        apiKey,
        baseUrl,
        stream: true,
      });

      let context = {};
      for await (const sseEvent of iterateSseEvents(upstream.body)) {
        let parsed;
        try {
          parsed = JSON.parse(sseEvent.data);
        } catch {
          continue;
        }

        const translated = anthropicEventToOpenAiStream(parsed, context);
        context = translated.context;
        if (translated.sse) {
          res.write(translated.sse);
        }
      }
    } catch (error) {
      const responseId = `err_${Math.floor(Date.now() / 1000)}`;
      res.write(
        buildSseFrame({
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            model,
            created_at: Math.floor(Date.now() / 1000),
            status: "failed",
            error: {
              message: error.message,
              type: error.statusCode === 400 ? "invalid_request_error" : "server_error",
            },
            output: [],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          },
        }),
      );
    }

    res.end();
    return;
  }

  try {
    const upstream = await requestAnthropic({
      body: anthropicBody,
      apiKey,
      baseUrl,
      stream: false,
    });
    const message = await upstream.json();
    writeJson(res, 200, mapAnthropicMessageToOpenAiResponse(message));
  } catch (error) {
    const statusCode = error.statusCode === 400 ? 400 : 500;
    writeJson(
      res,
      statusCode,
      buildErrorResponse(
        statusCode,
        error.message,
        statusCode === 400 ? "invalid_request_error" : "internal_error",
      ),
    );
  }
}

export function createBridgeServer(runtimeConfig) {
  const { port } = runtimeConfig;
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/openapi.json") {
      writeJson(res, 200, buildOpenApiDocument(port));
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === "/responses" || url.pathname === "/v1/responses")
    ) {
      await handleResponses(req, res, runtimeConfig);
      return;
    }

    writeJson(res, 404, buildErrorResponse(404, `Not found: ${url.pathname}`, "not_found"));
  });
}

export async function startBridgeServer({
  cwd = process.cwd(),
  host = "0.0.0.0",
  port = 8000,
} = {}) {
  const runtime = loadBridgeEnv({ cwd });
  if (!runtime.apiKey) {
    throw new Error("ANTHROPIC_AUTH_TOKEN not set in .env or environment.");
  }
  if (!runtime.defaultModel) {
    throw new Error("ANTHROPIC_MODEL not set in .env or environment.");
  }

  const server = createBridgeServer({
    ...runtime,
    cwd,
    host,
    port,
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}
