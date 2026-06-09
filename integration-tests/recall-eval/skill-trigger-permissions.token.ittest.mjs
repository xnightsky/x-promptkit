// integration-tests/recall-eval/skill-trigger-permissions.token.ittest.mjs
//
// Token 套件：验证 skill_trigger.permissions 从 queue YAML 到命令裁决的全链路。
//
// 4 个 case 覆盖：
//   A. permissions.allow_python3     — custom allow 放行 python3（不在默认白名单）
//   B. permissions.allow_subshell    — custom allow 放行 (cd * && *) 子 shell
//   C. permissions.default_cat       — merge 模式下默认 cat 依然可用
//   D. permissions.deny_blocks       — deny 拦截 cat /etc/*
//
// 验证逻辑：
//   - 如果 permissions 未正确透传 → A/B 被 BLOCK → score=0
//   - 如果 deny 未生效 → D 拿到真实 hostname → score=0
//   - 全部 score>=1 说明 allow/deny 全链路正确
//
// 用法：npm run iitest:token:skill-trigger-permissions
// 本套件消耗真实 AI token，不进入默认批量回归。

import test from "node:test";
import assert from "node:assert/strict";
import { loadEnabledProviders } from "../../skills-def/recall-eval/lib/replay-engine.mjs";
import { evaluateQueueTarget } from "../../skills-def/recall-eval/lib/evaluate-queue.mjs";

function selectTokenProviders() {
  try {
    return loadEnabledProviders().filter((p) => p.api !== "echo");
  } catch {
    return [];
  }
}

const QUEUE_PATH =
  "integration-tests/recall-eval/fixtures/skill-trigger-permissions/.recall/queue.yaml";

test("skill_trigger.permissions allow/deny end-to-end (4 cases)", async (t) => {
  // ── Gate: provider 矩阵 ──
  const providers = selectTokenProviders();
  if (providers.length === 0) {
    t.skip("no token-bearing providers are enabled");
    return;
  }

  const provider = providers[0];
  t.diagnostic(`provider: ${provider.id}(${provider.model})`);

  // ── 执行 ──
  const result = await evaluateQueueTarget(QUEUE_PATH, {
    provider,
    liveMode: true,
  });

  // ── 诊断：先输出每个 case 的结果（即使有 runtime failure）──
  for (const item of result.caseItems) {
    t.diagnostic(`  ${item.id}: ${item.result}`);
  }
  t.diagnostic(`  summary.runtimeFailures: ${result.summary.runtimeFailures}`);

  // ── 断言：无完整性失败 ──
  const integrityFails = result.integrityItems.filter((i) => i.status === "fail");
  assert.equal(
    integrityFails.length,
    0,
    `integrity failures: ${integrityFails.map((i) => `${i.id}: ${i.reason}`).join("; ")}`,
  );

  // ── 断言：每个 case 有 score（非 runtime failure）且 >= 1 ──
  assert.equal(result.caseItems.length, 4, "expected 4 case results");

  for (const item of result.caseItems) {
    const scoreMatch = item.result.match(/score=(\d+)/);
    assert.ok(
      scoreMatch,
      [
        `[${item.id}] no score in result (likely runtime failure)`,
        `  result: ${item.result}`,
      ].join("\n"),
    );
    const score = parseInt(scoreMatch[1], 10);
    assert.ok(
      score >= 1,
      [
        `[${item.id}] expected score >= 1, got ${score}`,
        `  result: ${item.result}`,
        item.id.includes("allow") || item.id.includes("default")
          ? "  → permissions.allow likely not passed through to runSkillTriggerAgent"
          : "  → permissions.deny likely not enforced",
      ].join("\n"),
    );
  }

  // ── 最后断言：无运行时失败 ──
  assert.equal(
    result.summary.runtimeFailures,
    "none",
    `runtime failures: ${result.summary.runtimeFailures}`,
  );
});
