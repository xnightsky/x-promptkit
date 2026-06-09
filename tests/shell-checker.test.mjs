import test from "node:test";
import assert from "node:assert/strict";
import { createShellChecker, globMatch, DEFAULT_ALLOW_PATTERNS } from "../skills-def/recall-eval/lib/model-agent.mjs";

// ── globMatch 基础行为 ──

test("globMatch: exact match without wildcard", () => {
  assert.equal(globMatch("ls", "ls"), true);
  assert.equal(globMatch("ls", "cat"), false);
});

test("globMatch: trailing wildcard matches any suffix", () => {
  assert.equal(globMatch("uv run pytest tests/", "uv run *"), true);
  assert.equal(globMatch("npm install lodash", "npm *"), true);
});

test("globMatch: trailing wildcard requires at least something after prefix", () => {
  // "ls" 不匹配 "ls *"（* 期望空格后有内容）
  assert.equal(globMatch("ls", "ls *"), false);
  assert.equal(globMatch("ls ", "ls *"), true);
});

test("globMatch: leading wildcard", () => {
  assert.equal(globMatch("foo install", "* install"), true);
  assert.equal(globMatch("npm install", "* install"), true);
  assert.equal(globMatch("npm run", "* install"), false);
});

test("globMatch: middle wildcard", () => {
  assert.equal(globMatch("git log --oneline main", "git * main"), true);
  assert.equal(globMatch("git diff main", "git * main"), true);
  assert.equal(globMatch("git status", "git * main"), false);
});

test("globMatch: multiple wildcards", () => {
  assert.equal(globMatch("(cd src && uv run pytest)", "(cd * && *)"), true);
  assert.equal(globMatch("(cd . && cat foo.txt)", "(cd * && *)"), true);
});

// ── createShellChecker: 默认行为（无配置，等价旧 isShellAllowed）──

test("default checker allows known commands", () => {
  const check = createShellChecker();
  assert.equal(check("cat README.md"), true);
  assert.equal(check("ls"), true);
  assert.equal(check("git status"), true);
  assert.equal(check("git log --oneline"), true);
  assert.equal(check("node script.js"), true);
});

test("default checker blocks unknown commands", () => {
  const check = createShellChecker();
  assert.equal(check("rm -rf /"), false);
  assert.equal(check("uv run pytest"), false);
  assert.equal(check("python cli.py"), false);
  assert.equal(check("sudo apt install"), false);
});

test("default checker allows 2>/dev/null suffix", () => {
  const check = createShellChecker();
  assert.equal(check("cat foo.txt 2>/dev/null"), true);
  assert.equal(check("git status 2>&1"), true);
});

test("default checker blocks empty input", () => {
  const check = createShellChecker();
  assert.equal(check(""), false);
  assert.equal(check("   "), false);
});

// ── createShellChecker: merge 模式 ──

test("merge mode adds user patterns to defaults", () => {
  const check = createShellChecker({
    mode: "merge",
    allow: ["uv *", "python *", "(cd * && *)"],
  });
  // 原有默认仍然生效
  assert.equal(check("cat README.md"), true);
  assert.equal(check("ls"), true);
  // 新追加的 patterns 生效
  assert.equal(check("uv run pytest tests/"), true);
  assert.equal(check("python cli.py --print-schema"), true);
  assert.equal(check("(cd src && uv run pytest)"), true);
});

test("merge is the default mode", () => {
  const check = createShellChecker({ allow: ["uv *"] });
  // 默认 patterns 仍然在
  assert.equal(check("cat foo"), true);
  // 追加的也在
  assert.equal(check("uv run something"), true);
});

// ── createShellChecker: override 模式 ──

test("override mode replaces defaults entirely", () => {
  const check = createShellChecker({
    mode: "override",
    allow: ["uv *", "python *"],
  });
  // 原有默认不再生效
  assert.equal(check("cat README.md"), false);
  assert.equal(check("ls"), false);
  // 只有用户声明的生效
  assert.equal(check("uv run pytest"), true);
  assert.equal(check("python script.py"), true);
});

// ── createShellChecker: deny 优先级 ──

test("deny patterns override allow", () => {
  const check = createShellChecker({
    allow: ["uv *", "(cd * && *)"],
    deny: ["* rm *", "* sudo *"],
  });
  // allow 通过
  assert.equal(check("uv run pytest"), true);
  // deny 拦截（即便子 shell 范式在 allow 里）
  assert.equal(check("(cd /etc && rm -rf everything)"), false);
  assert.equal(check("sudo cat /etc/passwd"), false);
});

test("deny blocks even default-allowed commands", () => {
  const check = createShellChecker({
    deny: ["cat /etc/*"],
  });
  assert.equal(check("cat README.md"), true);
  assert.equal(check("cat /etc/passwd"), false);
});

// ── createShellChecker: 子 shell 范式 ──

test("subshell pattern (cd dir && cmd) works with glob", () => {
  const check = createShellChecker({
    allow: ["(cd * && *)"],
    deny: ["* rm *"],
  });
  assert.equal(check("(cd src && cat main.py)"), true);
  assert.equal(check("(cd src && uv run pytest)"), true);
  // deny 仍拦危险命令
  assert.equal(check("(cd / && rm -rf everything)"), false);
});

// ── createShellChecker: 边界 case ──

test("checker handles commands with 2>/dev/null before matching", () => {
  const check = createShellChecker({ allow: ["uv *"] });
  assert.equal(check("uv run check 2>/dev/null"), true);
  assert.equal(check("uv run check 2>&1"), true);
});

test("empty permissions object uses defaults", () => {
  const check = createShellChecker({});
  assert.equal(check("cat foo"), true);
  assert.equal(check("rm foo"), false);
});
