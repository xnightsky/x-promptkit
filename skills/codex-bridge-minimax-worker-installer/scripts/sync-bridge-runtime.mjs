#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseDependencies(pyprojectText) {
  const match = pyprojectText.match(/dependencies\s*=\s*\[(?<body>[\s\S]*?)\]/m);
  if (!match?.groups?.body) {
    return [];
  }

  return [...match.groups.body.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

const bridgeDir = process.argv[2];
if (!bridgeDir) {
  fail("Usage: sync-bridge-runtime.mjs <bridge-dir>");
}

const pyprojectPath = path.join(bridgeDir, "pyproject.toml");
if (!existsSync(pyprojectPath)) {
  fail(`Missing pyproject.toml at ${pyprojectPath}`);
}

const venvDir = path.join(bridgeDir, ".venv");
const pythonBin = path.join(venvDir, "bin", "python");
const dependencies = parseDependencies(readFileSync(pyprojectPath, "utf8"));

if (!existsSync(venvDir)) {
  run("python3", ["-m", "venv", venvDir], bridgeDir);
}

if (!existsSync(pythonBin)) {
  fail(`Missing bridge Python runtime after venv creation: ${pythonBin}`);
}
if (dependencies.length === 0) {
  fail(`No dependencies declared in ${pyprojectPath}`);
}

// Keep the installer self-contained: provision the vendored bridge runtime
// directly from its pyproject instead of requiring an external uv install.
run(
  pythonBin,
  ["-m", "pip", "install", "--disable-pip-version-check", ...dependencies],
  bridgeDir,
);
