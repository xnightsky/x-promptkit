import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const sourceDir = path.join(repoRoot, "runtime", "codex-bridge");
const targets = [
  path.join(repoRoot, "skills", "codex-bridge-minimax-worker-installer", "vendor", "codex-bridge"),
];

for (const targetDir of targets) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

console.log("Synced codex-bridge runtime to skill vendors.");
