# recall-eval: 从 carrier 到动态 agent 重构设计

日期：2026-06-05 | 状态：已确认（部分被 2026-06-06 修订）

> **修订记录（2026-06-06）**：`.recall/prompt-context.yaml` DSL 文件方案取消——该文件从未被运行时读取，且 `.recall/*.yaml` 会被 check-fixtures 当作召回契约 fixture 校验。上下文层声明改为内嵌进召回队列契约的 `context` 块；结构定义落地为独立 schema 文件（`skills/_shared/schemas/`、`skills/recall-eval/schemas/`）；Section 3 设想的 `PROMPT_CONTEXT_SCHEMA` JS 常量导出未实现，由 schema 文件替代；`SAMPLE-QUEUE.yaml` 迁至 `examples/queue.example.yaml`。详见 [2026-06-06-recall-context-layers-design.md](./2026-06-06-recall-context-layers-design.md)。

---

## 目标

用「动态拼装 agent prompt + 直接调模型」替代「子进程 carrier 桥接」方案，同时抽取共享的 model-runner 和 prompt-context 原语供其他 skill 复用。

---

## Section 1：文件职责划分

```
skills/
├── _shared/
│   ├── model-runner.mjs           🆕 共享：provider 加载 + callModel + 重试预算
│   └── prompt-context.mjs         🆕 共享：三层上下文拼装引擎（纯函数，不读文件）
│
└── recall-eval/
    ├── SKILL.md                   🔄 精简化：告诉 agent 什么时候调、怎么调 run-eval
    ├── EXAMPLES.md                🔄 精简化：调用示例
    ├── SAMPLE-QUEUE.yaml          ✅ 保留（2026-06-06 修订：迁至 examples/queue.example.yaml）
    ├── .recall/                   ✅ 保留（fixtures）
    │   └── prompt-context.yaml    ❌ 已取消（2026-06-06 修订：改为队列内嵌 context 块）
    └── scripts/
        ├── lib.mjs                ✅ 保留：校验/打分/格式化/YAML 加载
        ├── validate-schema.mjs    ✅ 保留
        ├── resolve-target.mjs     ✅ 保留
        ├── model-agent.mjs        🆕 内联 SKILL.md → 调 prompt-context + model-runner → 返回回答
        ├── run-eval.mjs           🔄 重构：编排层
        ├── replay-matrix.mjs      🔄 重构：callReplayModel 切到 _shared/model-runner
        └── carrier-adapter.mjs    ❌ 删除

skills/recall-evaluator/           ❌ 整个目录删除，资产归入 recall-eval/
```

| 模块 | 职责 | 依赖 |
|------|------|------|
| `_shared/model-runner` | provider 加载、协议适配（anthropic/openai/echo）、callModel + 重试预算 | 无 |
| `_shared/prompt-context` | 接收 config 对象 → 拼接三层 system prompt（纯字符串操作） | 无 |
| `model-agent` | 读 SKILL.md → 构造 config → buildSystemPrompt → callModel → { ok, answer } | model-runner、prompt-context |
| `run-eval` | 加载 queue → 校验 → 逐 case 调 model-agent → scoreAnswer → formatRunEvalOutput | model-agent、lib.mjs |

---

## Section 2：`skills/_shared/model-runner.mjs`

### API

```js
// provider 加载
const { active, skipped, noEnvFile } = loadProviders({ envFile?, env? })

// 调用模型（自动选择协议）
const answer = await callModel(provider, prompt, { maxRetries?, fetchImpl? })
```

### 协议适配

| api 值 | 协议 | 鉴权 |
|--------|------|------|
| `anthropic-messages` | POST /v1/messages | x-api-key |
| `openai-chat` | POST /chat/completions | Bearer |
| `echo` | 离线短路，回显 prompt | 无 |

### 重试预算

| 失败类型 | 检测 | maxRetries |
|----------|------|------------|
| rate_limited | HTTP 429 / quota | 2 |
| stream_closed | EOF / ECONNRESET / EPIPE | 1 |
| timeout | AbortError / ETIMEDOUT | 1 |
| bad_response | 4xx/5xx 非 429 | 0 |
| empty_response | 2xx content 为空 | 0 |

重试逻辑统一在 `callModel` 里，协议适配器不做重试。

---

## Section 3：`skills/_shared/prompt-context.mjs`

纯引擎，接收配置 → 输出 system prompt。不读文件、不解析 YAML。

```js
export function buildSystemPrompt(config) → string
export const PROMPT_CONTEXT_SCHEMA  → JSON Schema
```

### 配置 schema

```js
const config = {
  skills: {
    items: [
      { name: 'some-skill', content: '...' },           // 直接给内容
      { name: 'some-skill', path: 'skills/.../SKILL.md' }, // 或从文件读
    ],
    allowDiscovery: false,
    discoveryPool: ['skill-a', 'skill-b'],
  },

  repo: {
    enabled: true,
    content: '...',         // 字符串优先
    path: 'AGENTS.md',
    maxBytes: 8192,
  },

  global: {
    enabled: true,
    content: '...',
    path: '~/.agents/AGENTS.md',
    maxBytes: 4096,
  },

  injections: {
    beforeSkills: '',
    afterSkills: '',
  },
}
```

拼接顺序：`beforeSkills → skills items → afterSkills → repo → global → (allowDiscovery? discovery 提示)`

### recall-eval 的 YAML DSL

```yaml
# skills/recall-eval/.recall/prompt-context.yaml
skills:
  items: []
  allowDiscovery: false

repo:
  enabled: false

global:
  enabled: false

injections:
  beforeSkills: |
    policy: clean-context-v1
    answer_basis: memory-only
    You may only answer using the skill content provided below.
    No tools, no web search, no repository reads.
```

---

## Section 4：`skills/recall-eval/scripts/model-agent.mjs`

### API

```js
const result = await runRecallAgent({
  sourceRef: 'skills/recall-eval/SKILL.md',
  question: 'recall queue 缺少 medium 时，能否继续执行？',
  provider,
  maxRetries: 2,
})
// → { ok: true, answer: '...' }
// → { ok: false, reason: 'rate_limited', retriesUsed: 2 }
```

### 内部流程

1. `fs.readFileSync(sourceRef)` 读 SKILL.md 全文
2. 读 `.recall/prompt-context.yaml` 构造 config 对象（2026-06-06 修订：改为接收用例生效的 `context` 声明，经 `normalizeContextLayers` 映射）
3. `config.skills.items[0].content = SKILL.md 全文`
4. `buildSystemPrompt(config)` → system prompt
5. `system + "\n\n" + question` → `callModel(provider, fullPrompt, { maxRetries })` → { ok, answer }

不做的事：不打分、不管队列、不管报告、不解析 source_ref。

---

## Section 5：重构后的 `run-eval.mjs`

### 改动对照

| | 当前 | 重构后 |
|------|------|------|
| provider 加载 | 无 | `loadProviders()` |
| --live 执行 | `executeRecallViaCarrier()` | `runRecallAgent()` |
| --carrier 参数 | 有 | ❌ 删除 |
| 打分/报告 | `scoreAnswer()` / `formatRunEvalOutput()` | ✅ 不变 |

### 主流程（--live）

```
1. loadProviders() → active/skipped
      active 为空 → SKIP, exit 0

2. loadRecallYaml(path) → { data, caseReports }
      validateRecallData(data)

3. for each caseReport:
      if errors.length > 0 → "not evaluated | missing ...", continue
      result = runRecallAgent({ sourceRef, question, provider, maxRetries: 2 })
      if !result.ok → runtimeFailures.push(result.reason), continue
      scoreAnswer(case, result.answer) → { score, rationale }

4. formatRunEvalOutput({ yamlPath, integrityItems, caseItems, summary }) → stdout
```

### --live 行为变化

| | 旧（carrier） | 新（model-agent） |
|------|------|------|
| 执行方式 | spawnSync 子进程 | HTTP fetch 调模型 |
| clean-context | carrier-adapter 注入 | 钉死在 model-agent 代码（2026-06-06 修订：原设想的 DSL 驱动取消） |
| 落盘 | 无 | 无 |
| 输出 | 5 段报告 stdout | 不变 |

---

## 删除 / 不变清单

| 删除 | 原因 |
|------|------|
| `skills/recall-evaluator/` 整个目录 | 合并到 recall-eval/ |
| `carrier-adapter.mjs` | spawnSync 废弃 |
| 其余 scripts 移到 recall-eval/scripts/ | 路径迁移 |

| 不变 | 原因 |
|------|------|
| `lib.mjs` / `validate-schema.mjs` / `resolve-target.mjs` | 逻辑与 carrier 无关 |
| `.recall/*.yaml` / `SAMPLE-QUEUE.yaml` | 队列契约不变 |
| `integration-tests/recall-eval/` | 保留，导入路径调整 |
| `replay-matrix.mjs` | 保留，callReplayModel 切到 `_shared/model-runner` |

---

## 命名约定

- token 消耗组件：`-token-ittest-` 或 `-token-itutil-` 中缀
- 共享原语：`skills/_shared/` 下，无 token 标签
- 配置文件：~~`prompt-context.yaml`（YAML DSL 驱动）~~（2026-06-06 修订：取消，改为队列内嵌 `context` 块）；`provider` 矩阵沿用 `.recall-replay.env.yaml`
