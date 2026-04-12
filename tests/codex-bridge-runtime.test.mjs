import test from "node:test";
import assert from "node:assert/strict";

import {
  anthropicEventToOpenAiStream,
  convertInputToAnthropic,
  convertToolsToAnthropic,
  mapAnthropicMessageToOpenAiResponse,
  parseEnvText,
} from "../skills/codex-bridge-minimax-worker-installer/vendor/codex-bridge/lib/bridge.mjs";

test("parseEnvText strips comments and quotes", () => {
  assert.deepEqual(
    parseEnvText(`
# comment
ANTHROPIC_AUTH_TOKEN='sk-test'
ANTHROPIC_MODEL=MiniMax-M2.7
ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
`),
    {
      ANTHROPIC_AUTH_TOKEN: "sk-test",
      ANTHROPIC_MODEL: "MiniMax-M2.7",
      ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
    },
  );
});

test("convertInputToAnthropic folds tool history into anthropic messages", () => {
  const result = convertInputToAnthropic({
    input: [
      { role: "developer", content: "follow repo contract" },
      { role: "user", content: "hi" },
      {
        type: "function_call",
        call_id: "call_1",
        name: "read_file",
        arguments: "{\"path\":\"README.md\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "file contents",
      },
      { role: "assistant", content: [{ type: "output_text", text: "done" }] },
    ],
  });

  assert.equal(result.developerContent, "follow repo contract");
  assert.deepEqual(result.messages, [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "read_file",
          input: { path: "README.md" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call_1",
          content: "file contents",
        },
      ],
    },
    { role: "assistant", content: "done" },
  ]);
});

test("convertToolsToAnthropic keeps only function tools", () => {
  assert.deepEqual(
    convertToolsToAnthropic([
      {
        type: "function",
        function: {
          name: "run",
          description: "execute",
          parameters: { properties: { cmd: { type: "string" } } },
        },
      },
      { type: "web_search" },
    ]),
    [
      {
        name: "run",
        description: "execute",
        input_schema: {
          type: "object",
          properties: { cmd: { type: "string" } },
        },
      },
    ],
  );
});

test("anthropicEventToOpenAiStream translates text and tool stream events", () => {
  let context = {};
  const frames = [];

  for (const event of [
    { type: "message_start", message: { id: "msg_1", model: "MiniMax", usage: { input_tokens: 12 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "call_1", name: "run" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"cmd\":\"ls\"}" } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", usage: { output_tokens: 8 } },
    { type: "message_stop" },
  ]) {
    const translated = anthropicEventToOpenAiStream(event, context);
    context = translated.context;
    frames.push(translated.sse);
  }

  const stream = frames.join("");
  assert.match(stream, /response\.created/);
  assert.match(stream, /response\.output_text\.delta/);
  assert.match(stream, /response\.function_call_arguments\.done/);
  assert.match(stream, /"total_tokens":20/);
});

test("mapAnthropicMessageToOpenAiResponse preserves tool calls and usage", () => {
  const mapped = mapAnthropicMessageToOpenAiResponse({
    id: "msg_1",
    model: "MiniMax-M2.7",
    content: [
      { type: "text", text: "hello" },
      { type: "tool_use", id: "call_1", name: "run", input: { cmd: "pwd" } },
    ],
    usage: {
      input_tokens: 3,
      output_tokens: 9,
    },
  });

  assert.equal(mapped.output.length, 2);
  assert.equal(mapped.output[0].type, "message");
  assert.equal(mapped.output[1].type, "function_call");
  assert.equal(mapped.usage.total_tokens, 12);
});
