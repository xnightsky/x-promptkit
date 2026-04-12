import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const node = process.execPath;
const repoRoot = process.cwd();
const discoverPidScript = fileURLToPath(
  new URL("../skills/claude-p-watch/scripts/discover-pid.mjs", import.meta.url),
);

test("discover-pid returns the newest matching running process", async (t) => {
  const uniqueToken = `claude-p-watch-discover-${Date.now()}`;
  const child = spawn(
    node,
    ["-e", "setTimeout(() => {}, 60000)", uniqueToken],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );

  t.after(() => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  const result = JSON.parse(
    execFileSync(node, [discoverPidScript, "--contains", uniqueToken], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.pid, child.pid);
  assert.match(result.command, new RegExp(uniqueToken));
});
