#!/usr/bin/env node
import { startBridgeServer } from "./lib/bridge.mjs";

function parseArgs(argv) {
  const options = {
    host: "0.0.0.0",
    port: 8000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = Number(argv[index + 1] ?? options.port);
      index += 1;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

try {
  const server = await startBridgeServer({
    cwd: process.cwd(),
    host: options.host,
    port: options.port,
  });

  console.log(`[PROXY] Loaded bridge on ${options.host}:${options.port}`);

  const shutdown = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error(`[FATAL] ${error.message}`);
  process.exit(1);
}
