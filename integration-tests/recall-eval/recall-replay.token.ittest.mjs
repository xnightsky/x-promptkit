import test from "node:test"
import assert from "node:assert/strict"

import { parseProviderArgs, resolveProviders, showProviderHelp } from "../../skills-def/recall-eval/lib/cli-provider.mjs"
import {
  loadProviderConfig,
  validateProviderConfig,
} from "../../skills-def/recall-eval/lib/replay-engine.mjs"
import { evaluateQueueTarget } from "../../skills-def/recall-eval/lib/evaluate-queue.mjs"

// ───────────────────────────────────────────────────────────────────────────
// Token 套件：端到端 recall-eval（需要真实密钥）
//
// 用法：
//   npm run iitest:token:recall-replay -- --provider <id> --model <a> --model <b> --verbose
//
// 本套件不进入默认回归。
// ───────────────────────────────────────────────────────────────────────────

const cliOpts = parseProviderArgs(process.argv.slice(2))
if (cliOpts.help) { showProviderHelp(); process.exit(0) }

test("recall-eval live replay with real queue", async (t) => {
  // 1. 加载 provider config
  let loaded
  try {
    loaded = loadProviderConfig()
  } catch (error) {
    t.skip(`no provider config available: ${error.message}`)
    return
  }

  const { config } = loaded
  const { ok, errors } = validateProviderConfig(config)
  assert.ok(ok, `invalid provider config: ${errors.join("; ")}`)

  // 2. 解析 provider targets
  let targets
  try {
    targets = resolveProviders(config, cliOpts)
  } catch (error) {
    t.skip(error.message)
    return
  }

  // 3. skill 自带的 selftest queue
  const queuePath = "skills-def/recall-eval/.recall/queue.yaml"

  // 4. 每个 provider 跑全链路
  for (const { provider, label } of targets) {
    await t.test(label, async () => {
      const result = await evaluateQueueTarget(queuePath, {
        provider,
        liveMode: true,
      })

      // 完整性检查
      const failures = result.integrityItems.filter(i => i.status === "fail")
      assert.equal(failures.length, 0,
        `integrity failures: ${failures.map(i => `${i.id}: ${i.reason}`).join("; ")}`)

      // 队列不需要修复
      assert.equal(result.summary.queueFixesRequired, "none",
        `queue fixes required: ${result.summary.queueFixesRequired}`)

      // 无运行时失败
      assert.equal(result.summary.runtimeFailures, "none",
        `runtime failures: ${result.summary.runtimeFailures}`)

      // 每个 case 满分
      for (const item of result.caseItems) {
        assert.ok(item.result.startsWith("score=2"),
          `${label} ${item.id}: ${item.result}`)
      }
    })
  }
})
