# recall-eval integration-tests

Overview: see [../README.md](../README.md). This directory holds token-backed integration coverage for recall evaluation.

These files are not the schema source of truth. Real recall fixtures live next to the prompt targets under `.recall/`.

## Current Suites

- `recall-replay.token.ittest.mjs`: token-backed provider-config replay that asserts the clean-context policy echo across enabled providers (self-skips without a configured provider config)
- `recall-live.token.ittest.mjs`: token-backed live recall over the real queue cases via `runRecallAgent` (self-skips without a token-bearing provider)

Naming: token-burning integration tests use the `*.token.ittest.mjs` suffix — the `.ittest.mjs` suffix keeps them out of the batch `npm run iitest` collector by construction.

## Provider-config replay

The replay suite tests the clean-context policy echo across enabled providers. It uses a hardcoded recall fixture (no external `.recall/` queue needed).

**Shared CLI** (`skills-def/recall-eval/lib/cli-provider.mjs`):
```
--provider <id>  选择 provider，覆盖 run.models（多次按序执行）
--model <id>     覆盖 provider 的 model（多次逐个测试）
--verbose        打印 provider / model 发现详情
--help, -h       帮助
```

**Usage**:
```bash
# 按 run.models 默认跑
npm run iitest:token:recall-replay

# 指定 provider（覆盖 run.models）
npm run iitest:token:recall-replay -- --provider kimi-code

# 指定 provider + 多个 model
npm run iitest:token:recall-replay -- --provider kimi-code --model kimi-for-coding --model kimi-k2.6 --verbose
```

## Execution Policy

- treat everything under this directory as real integration-test assets
- keep assertions focused on clean-context policy echo and recall scoring rather than long answer bodies
- classify runtime environment failures separately from content failures; bridge EOF / stream closed should not become a recall score
