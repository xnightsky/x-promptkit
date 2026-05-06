import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimaxi.com/anthropic";

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

function defaultReadEnvFile(cwd) {
  const envFile = path.join(cwd, ".env");
  try {
    return parseEnvText(readFileSync(envFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function resolveAdapter(env) {
  if (env.CODEX_BRIDGE_ADAPTER) {
    return env.CODEX_BRIDGE_ADAPTER;
  }

  // MiniMax already shipped before the runtime became multi-adapter aware.
  // Keep its old `.env` files bootable by inferring the historical adapter.
  if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_MODEL || env.ANTHROPIC_BASE_URL) {
    return "anthropic-messages";
  }

  return "";
}

export function loadBridgeConfig({
  cwd = process.cwd(),
  env = process.env,
  readEnvFile = defaultReadEnvFile,
} = {}) {
  const fileEnv = readEnvFile(cwd);
  const merged = { ...fileEnv, ...env };
  const adapter = resolveAdapter(merged);

  if (adapter === "anthropic-messages") {
    return {
      adapter,
      apiKey: merged.ANTHROPIC_AUTH_TOKEN || "",
      defaultModel: merged.ANTHROPIC_MODEL || "",
      baseUrl: merged.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL,
      profiles: null,
      defaultProfile: null,
    };
  }

  throw new Error(
    "CODEX_BRIDGE_ADAPTER not set. Expected anthropic-messages in .env or environment.",
  );
}
