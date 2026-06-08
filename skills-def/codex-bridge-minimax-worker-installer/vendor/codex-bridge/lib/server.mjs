import { createServer as createHttpServer } from "node:http";

import { loadBridgeConfig } from "./config.mjs";
import { createAnthropicMessagesAdapter } from "./adapters/anthropic-messages.mjs";
import {
  buildErrorResponse,
  buildOpenApiDocument,
  buildSseFrame,
  iterateSseEvents,
  parseResponsesRoute,
  readJsonBody,
  writeJson,
} from "./responses-runtime.mjs";

function createAdapter(runtimeConfig) {
  if (runtimeConfig.adapter === "anthropic-messages") {
    return createAnthropicMessagesAdapter();
  }
  throw new Error(`Unsupported CODEX_BRIDGE_ADAPTER: ${runtimeConfig.adapter}`);
}

function resolveProfile(runtimeConfig, profileName) {
  if (!runtimeConfig.profiles) {
    return null;
  }

  // Multi-profile adapters expose separate local prefixes such as `/coding`
  // and `/general`, but still share one runtime process and one adapter.
  const effectiveName = profileName || runtimeConfig.defaultProfile;
  const profile = runtimeConfig.profiles[effectiveName];
  if (!profile) {
    throw new Error(`Unknown bridge profile: ${effectiveName}`);
  }

  return {
    name: effectiveName,
    ...profile,
  };
}

async function handleResponses(req, res, runtimeConfig, adapter, profileName) {
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

  let profile;
  try {
    profile = resolveProfile(runtimeConfig, profileName);
  } catch (error) {
    writeJson(res, 404, buildErrorResponse(404, error.message, "not_found"));
    return;
  }

  const upstream = adapter.buildUpstreamRequest({
    body,
    runtimeConfig,
    profile,
  });

  if (upstream.stream) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-request-id": body.id || "",
      "x-accel-buffering": "no",
    });

    try {
      const response = await adapter.sendUpstream(upstream.request, runtimeConfig);
      let context = {};
      for await (const sseEvent of iterateSseEvents(response.body)) {
        let parsed;
        try {
          parsed = JSON.parse(sseEvent.data);
        } catch {
          continue;
        }

        // Each adapter translates its upstream streaming dialect into the
        // Responses SSE frames Codex already expects from local providers.
        const translated = adapter.translateStreamChunk(parsed, context);
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
            model: upstream.model,
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
    const response = await adapter.sendUpstream(upstream.request, runtimeConfig);
    const payload = await response.json();
    writeJson(res, 200, adapter.translateFinalResponse(payload, {}));
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
  const adapter = createAdapter(runtimeConfig);
  const { port } = runtimeConfig;

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const route = parseResponsesRoute(url.pathname);

    if (req.method === "GET" && url.pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/openapi.json") {
      writeJson(res, 200, buildOpenApiDocument(port, runtimeConfig));
      return;
    }

    if (req.method === "POST" && route.kind === "responses") {
      await handleResponses(req, res, runtimeConfig, adapter, route.profileName);
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
  const runtime = loadBridgeConfig({ cwd });
  if (!runtime.apiKey) {
    throw new Error("Bridge API key not set in .env or environment.");
  }

  if (runtime.adapter === "anthropic-messages" && !runtime.defaultModel) {
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
