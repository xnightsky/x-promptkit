#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import { discoverPidByCommand } from "./lib.mjs";

function parseArgs(argv) {
  const parsed = {
    command_contains: [],
    exclude_pid: null,
  };
  const args = [...argv];

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--contains") {
      const value = args.shift();
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing value for `--contains`");
      }
      parsed.command_contains.push(value);
      continue;
    }
    if (token === "--exclude-pid") {
      const value = args.shift();
      if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new Error("missing integer value for `--exclude-pid`");
      }
      parsed.exclude_pid = Number(value);
      continue;
    }
    throw new Error(`unknown arg: ${token}`);
  }

  if (parsed.command_contains.length === 0) {
    throw new Error("usage: discover-pid.mjs --contains TOKEN [--contains TOKEN] [--exclude-pid PID]");
  }

  return parsed;
}

async function main() {
  try {
    const request = parseArgs(process.argv.slice(2));
    if (request.exclude_pid === null) {
      request.exclude_pid = process.pid;
    }
    process.stdout.write(`${JSON.stringify(discoverPidByCommand(request))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
