import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const installDoc = readFileSync("cli/pi/extensions/pua/INSTALL.md", "utf8");
const posixItest = readFileSync("cli/pi/extensions/pua/pua.ittest.sh", "utf8");
const powershellItest = readFileSync("cli/pi/extensions/pua/pua.ittest.ps1", "utf8");

test("PUA POSIX integration test does not depend on Windows PowerShell package", () => {
  assert.doesNotMatch(posixItest, /pi-powershell/);
  assert.doesNotMatch(posixItest, /--tools powershell/);
});

test("PUA development baseline keeps PowerShell outside required cross-platform packages", () => {
  const baselineSection = installDoc.match(/## PUA 开发基线插件[\s\S]*?可选插件不进入默认集成测试前置检查：/);
  assert.ok(baselineSection, "INSTALL.md must contain the PUA development baseline section");
  assert.doesNotMatch(baselineSection[0], /@marcfargas\/pi-powershell/);
});

test("PUA PowerShell integration test treats pi-powershell as optional", () => {
  assert.doesNotMatch(powershellItest, /Label\s*=\s*"Windows PowerShell"/);
  assert.match(powershellItest, /\[SKIP\]/);
});
