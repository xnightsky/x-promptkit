// skills-def/recall-eval/scripts/cli-provider.mjs
//
// 共享 CLI：provider 选择与参数解析。
// recall-replay.token.ittest.mjs 和 run-eval.mjs 共用。
//
// 用法：
//   import { parseProviderArgs, resolveProviders, showProviderHelp } from "./cli-provider.mjs"
//
//   const opts = parseProviderArgs(process.argv.slice(2))
//   if (opts.help) { showProviderHelp(); process.exit(0) }
//   const matrix = parseProviderConfig(...)
//   const targets = resolveProviders(matrix, opts)
//   // targets = [{ provider, model, label }, ...]

import { parseArgs } from "node:util"
import { selectEnabledProviders } from "./replay-engine.mjs"

// ── CLI 解析 ──

export function parseProviderArgs(rawArgs) {
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs
	const { values } = parseArgs({
		args,
		options: {
			provider: { type: "string", multiple: true },
			model: { type: "string", multiple: true },
			verbose: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		strict: false,
	})
	return {
		providerFilter: values.provider ?? [],
		modelFilter: values.model ?? [],
		verbose: values.verbose ?? false,
		help: values.help ?? false,
	}
}

// ── 帮助 ──

export function showProviderHelp() {
	console.log(`
Usage: --provider <id> [--model <id> ...] [--verbose] [--help]

Options:
  --provider <id>   选择 provider，覆盖 run.models（可多次指定，按序执行）
  --model <id>      覆盖 provider 的 model（可多次指定，逐个测试）
  --verbose         打印 provider / model 发现详情
  --help, -h        显示此帮助
`)
}

// ── Provider 解析 ──

/**
 * 根据 matrix 和 CLI 参数解析出要运行的目标列表。
 *
 * @param {object} matrix          - parseProviderConfig 产出的规范化矩阵
 * @param {object} opts
 * @param {string[]} opts.providerFilter - --provider 值列表
 * @param {string[]} opts.modelFilter    - --model 值列表
 * @param {boolean}  opts.verbose        - 是否打印详情（到 stderr）
 * @returns {{ provider: object, model: string, label: string }[]}
 */
export function resolveProviders(matrix, opts = {}) {
	const { providerFilter = [], modelFilter = [], verbose = false } = opts

	// --provider 指定时覆盖 run.models，在全量 enabled 中直接筛选
	const skipMatrix = providerFilter.length > 0
	const allProviders = selectEnabledProviders(matrix, { skipMatrix }).filter(
		(p) => p.api !== "echo",
	)

	if (verbose) {
		console.error(`[verbose] run.models: ${JSON.stringify(matrix.run?.matrix ?? [])}`)
		console.error(`[verbose] enabled providers: ${allProviders.map((p) => p.id + "(" + p.model + ")").join(", ")}`)
	}

	let candidates
	const extraOverrides = {}  // --provider 中的 / 语法提取的 model
	if (providerFilter.length > 0) {
		candidates = providerFilter
			.map((raw) => {
				const slash = raw.indexOf("/")
				if (slash < 0) return allProviders.find((p) => p.id === raw)
				const pid = raw.slice(0, slash)
				const mid = raw.slice(slash + 1)
				extraOverrides[pid] = mid
				return allProviders.find((p) => p.id === pid)
			})
			.filter(Boolean)
		if (candidates.length === 0) {
			const avail = allProviders.map((p) => p.id).join(", ")
			throw new Error(`--provider ${providerFilter.join(",")} did not match any enabled provider (available: ${avail})`)
		}
		if (verbose) {
			console.error(`[verbose] --provider override: running ${candidates.map((p) => p.id).join(", ")}`)
		}
	} else {
		candidates = allProviders
	}

	if (candidates.length === 0) {
		throw new Error("no token-bearing providers are enabled")
	}

	// 展开 model：--model > --provider 的 / > run.models 的 / > 拒绝歧义
	const overrides = { ...(matrix.run?._modelOverrides ?? {}), ...extraOverrides }
	const targets = []
	for (const provider of candidates) {
		const hasMultiple = Array.isArray(provider.models) && provider.models.length > 1
		const overrideModel = overrides[provider.id]

		if (modelFilter.length > 0) {
			// --model 显式指定，逐个
			for (const modelId of modelFilter) {
				targets.push({ provider: { ...provider, model: modelId }, model: modelId, label: `${provider.id}/${modelId}` })
			}
		} else if (overrideModel) {
			// run.models 用了 / 语法
			targets.push({ provider: { ...provider, model: overrideModel }, model: overrideModel, label: `${provider.id}/${overrideModel}` })
		} else if (hasMultiple) {
			// 多 model provider 未指定 → 拒绝
			const list = provider.models.join(", ")
			throw new Error(
				`provider '${provider.id}' has multiple models (${list}). Use '${provider.id}/<model>' or --model to select one.`,
			)
		} else {
			targets.push({ provider, model: provider.model, label: provider.id })
		}
	}
	return targets
}
