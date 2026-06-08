#!/usr/bin/env node
/* skills-def/recall-eval/scripts/migrate-v1-to-v2.mjs

v1 → v2 迁移脚本。

维护说明:
  - 本脚本覆盖 v1 所有已知字段；若未来 v1 新增字段需同步维护。
  - 迁移是纯函数：读 v1 YAML → 写 v2 YAML 到 stdout，不修改原文件。
  - 校验函数见 replay-engine.mjs 的 validateReplayMatrix()。

用法:
  node migrate-v1-to-v2.mjs <path-to-v1.yaml> > migrated-v2.yaml

── v1 vs v2 结构比对 ──

  v1 (deprecated)                    v2 (current)
  ─────────────────────────────────────────────────────────────
  version: 1                         version: 2

  defaults:                          defaults:
    max_tokens: 512                    maxTokens: 512
    timeout_ms: 60000                  timeoutMs: 60000

  providers:                         providers:
    - id: my-provider                  my-provider:
      enabled: true                      enabled: true
      api: openai-chat                   api: openai-chat
      base_url: https://...              baseUrl: https://...
      model: gpt-4o                      apiKey: sk-xxx
      apikey: sk-xxx                     models:
      headers:                             - id: gpt-4o
        x-custom: v                          headers:
    - id: another                               x-custom: v
      ...

  run:                               run:
    matrix: [a, b]                     models: [a, b]
*/

import { readFileSync } from "node:fs"
import { parse as parseYaml, stringify } from "yaml"
import { parseArgs } from "node:util"

const { positionals, values: flags } = parseArgs({
	allowPositionals: true,
	options: {
		help: { type: "boolean", short: "h" },
	},
})

if (flags.help || positionals.length === 0) {
	console.error("Usage: node migrate-v1-to-v2.mjs <path-to-v1.yaml>")
	process.exit(flags.help ? 0 : 1)
}

const srcPath = positionals[0]
let raw
try {
	const text = readFileSync(srcPath, "utf8")
	raw = parseYaml(text)
} catch (err) {
	console.error(`Failed to read ${srcPath}: ${err.message}`)
	process.exit(1)
}

if (!raw || typeof raw !== "object" || raw.version !== 1) {
	console.error("Not a valid v1 replay matrix")
	process.exit(1)
}

// ── 迁移 ──
const defaults = raw.defaults ?? {}
const v2 = {
	version: 2,
	defaults: {},
	providers: {},
	run: {},
}

// defaults: snake_case → camelCase
if (defaults.api) v2.defaults.api = defaults.api
if (defaults.temperature != null) v2.defaults.temperature = defaults.temperature
if (defaults.max_tokens != null) v2.defaults.maxTokens = defaults.max_tokens
if (defaults.timeout_ms != null) v2.defaults.timeoutMs = defaults.timeout_ms

if (!Object.keys(v2.defaults).length) delete v2.defaults

// providers: array → map
const providerList = Array.isArray(raw.providers) ? raw.providers : []
for (const p of providerList) {
	if (!p.id) continue
	const entry = {}
	if (p.enabled !== undefined) entry.enabled = p.enabled
	if (p.api) entry.api = p.api
	if (p.base_url) entry.baseUrl = p.base_url
	if (p.apikey || p.key_env || p.key) entry.apiKey = p.apikey || p.key_env || p.key
	if (p.model) entry.models = [{ id: p.model }]
	if (p.headers && typeof p.headers === "object") entry.models[0].headers = p.headers
	if (p.timeout_ms != null) entry.timeoutMs = p.timeout_ms
	if (p.temperature != null) entry.temperature = p.temperature
	if (p.max_tokens != null) entry.maxTokens = p.max_tokens
	v2.providers[p.id] = entry
}

// run.matrix → run.models
const matrix = raw.run?.matrix
if (Array.isArray(matrix) && matrix.length > 0) {
	v2.run.models = matrix
} else {
	delete v2.run
}

process.stdout.write(stringify(v2))
