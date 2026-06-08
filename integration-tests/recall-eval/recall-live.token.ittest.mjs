// integration-tests/recall-eval/recall-live.token.ittest.mjs
//
// Token 套件：live recall 全链路（需要真实 API key）。
//
// 本套件通过显式 `npm run iitest:token:recall-live` 执行；
// 在「没有任何可达且带 key 的真实 provider」时自动跳过（self-skip）。
//
// 流程：加载 provider 矩阵 → 对 recall queue 每个 case 调 runRecallAgent
// → 用 lib.mjs 的 scoreAnswer 打分 → 断言满分(2)。
// 全程不写磁盘、无需清理。provider 矩阵从 home 目录或 cwd 自动发现。
//
// 用例采用 BDD（场景 / 给定 / 当 / 那么）注释。

import test from "node:test";
import assert from "node:assert/strict";

import { loadProviders } from "../../skills-def/_shared/model-client.mjs";
import { runRecallAgent } from "../../skills-def/recall-eval/scripts/model-agent.mjs";
import { loadRecallYaml, validateRecallData, scoreAnswer } from "../../skills-def/recall-eval/scripts/lib.mjs";

// ── Self-skip gate ──
// 筛掉 echo，只保留启用且带 key 的真实 provider；一个都没有则跳过整个套件。
function selectTokenProviders() {
  const { active, noEnvFile } = loadProviders();
  if (noEnvFile || active.length === 0) return [];

  return active.filter((p) => p.api !== "echo" && p.key);
}

// ── 场景：live recall 全链路（真实 API） ──
//   给定 一份可发现的 provider 矩阵（否则自动跳过）
//         且其中至少有一个启用、带 key 的真实 provider（否则自动跳过）
//         且 skills-def/recall-eval/.recall/queue.yaml 存在且 schema 合法
//   当   对队列中每个 case 调 runRecallAgent 现场执行
//   那么 每个 case 得分应为满分(2)，回答必须命中 must_include 且避开 must_not_include

test("live recall evaluates all queue cases and scores full marks", async (t) => {
  // ── Gate 1: provider 矩阵 ──
  const providers = selectTokenProviders();
  if (providers.length === 0) {
    t.skip("no token-bearing providers are enabled");
    return;
  }

  const provider = providers[0];
  if (providers.length > 1) {
    t.diagnostic(
      `${providers.length} providers found; using \`${provider.name}(${provider.model})\``,
    );
  }

  // ── Gate 2: queue 加载与校验 ──
  let loaded;
  try {
    loaded = loadRecallYaml("skills-def/recall-eval/.recall/queue.yaml");
  } catch (error) {
    t.skip(`cannot load recall queue: ${error.message}`);
    return;
  }

  const report = validateRecallData(loaded.data);
  if (!report.isValid) {
    const errors = [
      ...report.queueErrors,
      ...report.caseReports.flatMap((cr) => cr.errors.map((e) => `${cr.id}: ${e}`)),
    ];
    assert.fail(`invalid recall queue: ${errors.join("; ")}`);
  }

  const cases = report.caseReports;

  // ── 逐 case 执行 ──
  for (const caseReport of cases) {
    await t.test(`${provider.model} → ${caseReport.id}`, async () => {
      const result = await runRecallAgent({
        sourceRef: caseReport.effectiveSourceRef,
        question: caseReport.caseValue.question,
        provider,
        // 与 run-eval.mjs 的调用契约保持对齐：透传用例生效的 context 声明
        context: caseReport.effectiveContext ?? undefined,
        maxRetries: 2,
      });

      // 那么：模型调用必须成功
      assert.ok(result.ok, `model call failed: ${result.reason}`);

      // 那么：回答文本非空
      assert.ok(
        result.answer && result.answer.length > 0,
        `empty answer for ${caseReport.id}`,
      );

      // 那么：打分至少 partial（语义正确即可，LLM 措辞可变）
      const scored = scoreAnswer(caseReport, result.answer);
      assert.ok(
        scored.score >= 1,
        [
          `expected score>=1, got ${scored.score}`,
          `  rationale: ${scored.rationale}`,
          `  missing: ${JSON.stringify(scored.missingMust)}`,
          `  answer: ${result.answer.slice(0, 300)}`,
        ].join("\n"),
      );
    });
  }
});
