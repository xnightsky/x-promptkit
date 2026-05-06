export function buildSseFrame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

export function buildErrorResponse(statusCode, message, type = "internal_error") {
  return {
    error: {
      message,
      type,
      status_code: statusCode,
    },
  };
}

export async function parseErrorResponse(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const message = json?.error?.message || json?.message || text;
    return message || `Upstream request failed with status ${response.status}`;
  } catch {
    return text || `Upstream request failed with status ${response.status}`;
  }
}

export async function* iterateSseEvents(stream) {
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

export function parseResponsesRoute(pathname) {
  const directMatch = pathname.match(/^\/(?:(v1)\/)?responses$/u);
  if (directMatch) {
    return {
      kind: "responses",
      profileName: null,
    };
  }

  const profileMatch = pathname.match(/^\/([^/]+)\/(?:(v1)\/)?responses$/u);
  if (profileMatch) {
    return {
      kind: "responses",
      profileName: profileMatch[1],
    };
  }

  return {
    kind: "other",
    profileName: null,
  };
}

export function buildOpenApiDocument(port, runtimeConfig) {
  const paths = {
    "/responses": { post: { operationId: "handleResponses" } },
    "/v1/responses": { post: { operationId: "handleResponsesV1" } },
    "/healthz": { get: { operationId: "health" } },
  };

  for (const profileName of Object.keys(runtimeConfig.profiles ?? {})) {
    paths[`/${profileName}/responses`] = { post: { operationId: `handle${profileName}Responses` } };
    paths[`/${profileName}/v1/responses`] = {
      post: { operationId: `handle${profileName}ResponsesV1` },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "codex-bridge",
      version: "0.1.0",
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    paths,
  };
}
