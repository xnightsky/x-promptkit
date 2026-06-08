import {
  buildSseFrame,
  normalizeBaseUrl,
  parseErrorResponse,
} from "../responses-runtime.mjs";

const ANTHROPIC_VERSION = "2023-06-01";

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

function buildAnthropicHeaders(apiKey, stream) {
  return {
    "content-type": "application/json",
    accept: stream ? "text/event-stream" : "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
    "x-api-key": apiKey,
    authorization: `Bearer ${apiKey}`,
  };
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

export function createAnthropicMessagesAdapter() {
  return {
    buildUpstreamRequest({ body, runtimeConfig, profile }) {
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
        model: body.model || profile?.defaultModel || runtimeConfig.defaultModel,
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

      return {
        stream,
        model: anthropicBody.model,
        request: {
          apiKey: runtimeConfig.apiKey,
          baseUrl: profile?.baseUrl || runtimeConfig.baseUrl,
          body: anthropicBody,
          stream,
        },
      };
    },

    async sendUpstream(request) {
      const response = await fetch(new URL("v1/messages", normalizeBaseUrl(request.baseUrl)), {
        method: "POST",
        headers: buildAnthropicHeaders(request.apiKey, request.stream),
        body: JSON.stringify(request.stream ? { ...request.body, stream: true } : request.body),
      });

      if (!response.ok) {
        const message = await parseErrorResponse(response);
        const error = new Error(message);
        error.statusCode = response.status;
        throw error;
      }

      return response;
    },

    translateStreamChunk(chunk, context) {
      return anthropicEventToOpenAiStream(chunk, context);
    },

    translateFinalResponse(payload) {
      return mapAnthropicMessageToOpenAiResponse(payload);
    },
  };
}
