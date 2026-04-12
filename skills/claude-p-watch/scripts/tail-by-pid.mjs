#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_MAX_TAIL_LINES, tailByPid } from "./lib.mjs";

function parseArgs(argv) {
  const args = [...argv];
  const pidToken = args.shift();
  if (typeof pidToken !== "string" || !/^\d+$/.test(pidToken)) {
    throw new Error("usage: tail-by-pid.mjs <pid> [--tail-lines N]");
  }

  let maxTailLines = DEFAULT_MAX_TAIL_LINES;
  while (args.length > 0) {
    const token = args.shift();
    if (token === "--tail-lines") {
      const value = args.shift();
      if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error("missing positive integer value for `--tail-lines`");
      }
      maxTailLines = Number(value);
      continue;
    }
    throw new Error(`unknown arg: ${token}`);
  }

  return {
    pid: Number(pidToken),
    maxTailLines,
  };
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(tailByPid(parsed.pid, {
      maxTailLines: parsed.maxTailLines,
    }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
