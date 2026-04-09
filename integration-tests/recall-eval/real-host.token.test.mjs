import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupCodexRunEnvironment,
  prepareCodexRunEnvironment,
} from "../../skills/isolated-context-run-codex/scripts/clean-room.mjs";
import { runExecRequest } from "../../skills/isolated-context-run-codex/scripts/run-exec.mjs";

const repoRoot = process.cwd();

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function buildTokenRunRequest(prepared, prompt) {
  return {
    backend: "exec-json",
    codex_command: "codex",
    task: { prompt },
    working_directory: prepared.workingDirectory,
    artifacts_dir: prepared.artifactsDir,
    env: prepared.env,
    extra_args: [],
  };
}

function withPreparedEnvironment(testContext) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recall-token-host-"));
  testContext.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepared = prepareCodexRunEnvironment({
    tempRoot,
    repo_root: repoRoot,
    skill_entries: [
      {
        sourceClass: "repo",
        skillName: "recall-eval",
        sourcePath: path.join(repoRoot, "skills", "recall-eval"),
      },
    ],
  });
  testContext.after(() => {
    cleanupCodexRunEnvironment(prepared);
  });

  return prepared;
}

test("token-backed real host recall-eval triggers on a valid queue request", (t) => {
  const prepared = withPreparedEnvironment(t);
  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    [
      "请按 recall-eval 的固定五段格式，评估 `integration-tests/recall-eval/fixtures/real-host/.recall/queue.yaml` 里 case `real_host.reject_missing_medium`。",
      "这次不是 live 模式，下面这段文本就是待评分 answer，请直接拿它打分，不要再等待新的 answer input：",
      "缺少 medium 时必须拒绝执行，需要先完善 queue，不能自行猜测 medium。",
    ].join("\n"),
  ));
  const rawEvents = readText(path.join(prepared.artifactsDir, "raw-events.jsonl"));

  assert.equal(result.ok, true);
  assert.match(result.result.final_text, /1\. Queue/);
  assert.match(result.result.final_text, /5\. Summary/);
  assert.match(result.result.final_text, /real_host\.reject_missing_medium/);
  assert.match(result.result.final_text, /Case Results/);
  assert.match(rawEvents, /integration-tests\/recall-eval\/fixtures\/real-host\/.recall\/queue\.yaml/);
});

test("token-backed real host recall-eval does not trigger on an unrelated prompt", (t) => {
  const prepared = withPreparedEnvironment(t);
  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    "Reply with exactly NO-RECALL and nothing else.",
  ));
  const rawEvents = readText(path.join(prepared.artifactsDir, "raw-events.jsonl"));

  assert.equal(result.ok, true);
  assert.match(result.result.final_text, /NO-RECALL/);
  assert.doesNotMatch(rawEvents, /1\. Queue/);
  assert.doesNotMatch(rawEvents, /real_host\.reject_missing_medium/);
});

test("token-backed real host recall-eval refuses broken queue definitions", (t) => {
  const prepared = withPreparedEnvironment(t);
  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    [
      "请检查 `integration-tests/recall-eval/fixtures/real-host/.recall/broken-missing-medium.yaml` 是否可以继续做 recall evaluation。",
      "不要猜测 medium，按 recall-eval 的规则回答。",
    ].join("\n"),
  ));
  const rawEvents = readText(path.join(prepared.artifactsDir, "raw-events.jsonl"));

  assert.equal(result.ok, true);
  assert.match(result.result.final_text, /缺少必填字段 `medium`|缺少 `medium`|缺少 medium/);
  assert.match(result.result.final_text, /refused|拒绝/);
  assert.match(rawEvents, /broken-missing-medium\.yaml/);
});

test("token-backed real host recall-eval discovers a target-local queue from a target path", (t) => {
  const prepared = withPreparedEnvironment(t);
  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    [
      "请按 recall-eval 的固定五段格式，评估 `AGENTS.md` 这个 target 对应的 recall queue。",
      "这次不是 live 模式，下面这段文本就是待评分 answer，请直接拿它打分，不要再等待新的 answer input：",
      "必须使用简体中文，并在每次回复末尾附带 [by=x-promptkit]。",
    ].join("\n"),
  ));
  const rawEvents = readText(path.join(prepared.artifactsDir, "raw-events.jsonl"));

  assert.equal(result.ok, true);
  assert.match(result.result.final_text, /1\. Queue/);
  assert.match(result.result.final_text, /`\.recall\/queue\.yaml`/);
  assert.match(result.result.final_text, /repo_agents\.cn_and_canary/);
  assert.match(result.result.final_text, /Case Results/);
  assert.match(rawEvents, /\.recall\/queue\.yaml/);
});

test("token-backed real host recall-eval supports batch live evaluation across multiple queues", (t) => {
  const prepared = withPreparedEnvironment(t);
  const result = runExecRequest(buildTokenRunRequest(
    prepared,
    [
      "请直接执行这条批量 live recall-eval 请求，不要列候选路径，也不要反问：",
      "queue 1: integration-tests/recall-eval/fixtures/real-host/.recall/queue.yaml",
      "queue 2: .recall/queue.yaml",
      "要求：",
      "- 使用这两个相对路径原样执行",
      "- 按批量 live 模式执行",
      "- 输出 Batch Recall Eval 包装结果",
      "- 不要改写成单 queue 报告",
    ].join("\n"),
  ));
  const rawEvents = readText(path.join(prepared.artifactsDir, "raw-events.jsonl"));

  assert.equal(result.ok, true);
  assert.match(result.result.final_text, /Batch Recall Eval/);
  assert.match(result.result.final_text, /integration-tests\/recall-eval\/fixtures\/real-host\/.recall\/queue\.yaml/);
  assert.match(result.result.final_text, /\.recall\/queue\.yaml/);
  assert.match(result.result.final_text, /run artifact=/);
  assert.match(rawEvents, /Batch Recall Eval|integration-tests\/recall-eval\/fixtures\/real-host\/.recall\/queue\.yaml/);
});
