# recall-eval skill-trigger 模式设计

> 2026-06-08 | 调研 + 设计 | x-promptkit

## 目标

扩展 recall-eval 从单一「知识召回」验证到两种模式：

| 模式 | medium | 策略 | 验证方式 |
|------|--------|------|---------|
| 知识召回 | `skill-mechanism` / `global-memory` | `clean-context-v1`：no tools / no web / no reads | 模型从注入文本中回答，匹配 `expected.must_include` |
| 技能触发 | `skill-trigger` | `skill-trigger-v1`：可执行白名单 shell | 模型自主决策调工具 → 检查 tool call 链 + 输出 |

两者并行，不修改 `clean-context-v1`。

## 信源调研

### 行业对照

| 框架 | trigger 检测 | 输出检测 | 命令白名单 | 评分粒度 |
|------|-------------|---------|-----------|---------|
| **Braintrust** | `tool_calls` assertion（名称+参数） | `output` assertion | ❌ 靠 sandbox | 自定义 |
| **Promptfoo** | `assert-function-call` | `assert-contained` | ❌ | pass/fail |
| **Anthropic evals** | `tool_use` block match | `Grader` 打分 | sandbox | correct/partial/incorrect |
| **LangSmith** | trace.events filter | assert on output | ❌ | 自定义 |
| **我们的设计** | `trigger.must_run` 子串匹配 | `expected.must_include` | ✅ agent 层拦截 | full/partial/fail |

### 验证结论

- `trigger.must_run` + `expected.must_include` 双轨对齐 Braintrust / Promptfoo 主流做法
- 子串匹配（非 exact）是行业共识——模型输出天然不精确
- `must_not_run`（禁止命令检测）是我们独有，其他框架无显式禁止
- 白名单过滤在 agent 层实现比依赖外部 sandbox 更轻量

## 新增策略：`skill-trigger-v1`

```
policy: skill-trigger-v1
  - 可执行白名单 shell 命令
  - 不能修改文件（禁止 rm, mv, >, >>）
  - 不能访问网络
  - 不能运行未知命令
  - 回答来自工具执行结果
  - 白名单命令前缀：node, ls, cat, grep, echo, head, tail, wc, find, git(log/diff/status)
```

与 `clean-context-v1` 不可混用——一个 case 只能选一种 `medium`。

## 架构

```
evaluate-queue.mjs
├── case medium: skill-trigger
│   ├── model-agent.runSkillTriggerAgent()
│   │   ├── policy: skill-trigger-v1
│   │   ├── tools: [shell(whitelist)]    ← 新增
│   │   ├── maxSteps: 5                   ← 最多 5 轮 tool call
│   │   ├── 每轮：模型决策 → 白名单检查 → 执行 → 结果回传
│   │   └── 返回 { toolCalls, finalAnswer }
│   └── scoring
│       ├── trigger 检测：toolCalls 包含 trigger.must_run（子串）
│       ├── 禁止检测：toolCalls 不含 trigger.must_not_run
│       └── 输出检测：finalAnswer 匹配 expected
│
├── case medium: skill-mechanism
│   └── model-agent.runRecallAgent()
│       └── policy: clean-context-v1（不变）
│
└── case medium: global-memory
    └── model-agent.runRecallAgent()
        └── policy: clean-context-v1（不变）
```

## Queue 新增字段

### `trigger` 块（仅 `skill-trigger` 生效）

```yaml
cases:
  - id: example.trigger_case
    medium: skill-trigger
    trigger:
      must_run:                    # 必须执行的命令子串
        - "validate-schema.mjs"
        - "queue.yaml"
      must_not_run:                # 禁止执行的命令子串
        - "rm"
        - "curl"
    expected:
      must_include:                # 最终回答应包含
        - "PASS"
      should_include:
        - "integrity"
      must_not_include:
        - "FAIL"
    score_rule:
      full: 触发了正确命令且输出符合预期
      partial: 触发了命令但输出不完整或格式问题
      fail: 未触发命令、触发了禁止命令、或输出错误
```

### schema 扩展

`schemas/recall-queue.schema.yaml` 新增 `trigger` 字段（仅 `medium: skill-trigger` 生效）：

```yaml
trigger:
  type: object
  required: [must_run]
  properties:
    must_run:
      type: array
      items: { type: string }
    must_not_run:
      type: array
      items: { type: string }
```

## 自举测试

recall-eval 能验证自己是否被正确触发：

```yaml
# .recall/selftest-trigger.yaml
version: 1
source_ref: skills-def/recall-eval/SKILL.md
fallback_answer: 未触发
scoring:
  "2": full
  "1": partial
  "0": fail
cases:
  - id: recall_eval.self_trigger_validate
    question: |
      验证 skills-def/recall-eval/.recall/queue.yaml 的完整性。
      请使用 recall-eval skill 来完成这个任务。
    medium: skill-trigger
    carrier: isolated-context-run:subagent
    trigger:
      must_run:
        - "validate-schema.mjs"
        - "queue.yaml"
      must_not_run:
        - "rm"
    expected:
      must_include:
        - "recall_eval.reject_missing_medium"
        - "recall_eval.reject_missing_carrier"
      must_not_include:
        - "FAIL"
    score_rule:
      full: 触发 validate-schema.mjs 且 queue.yaml 通过校验
      partial: 触发但输出不完整
      fail: 未触发或校验失败
    tags: [selftest, trigger, bootstrap]
    source_scope: SKILL.md#validation-strategy

  - id: recall_eval.self_trigger_live
    question: |
      用 live 模式评测 queue.yaml 的召回能力。
      请使用 recall-eval skill 的 run-eval.mjs --live。
    medium: skill-trigger
    carrier: isolated-context-run:subagent
    trigger:
      must_run:
        - "run-eval.mjs"
        - "--live"
        - "queue.yaml"
      must_not_run:
        - "rm"
        - "--answer"
    expected:
      must_include:
        - "score="
      must_not_include:
        - "not evaluated"
        - "missing answer input"
    score_rule:
      full: 触发 run-eval.mjs --live 且所有 case 可评测
      partial: 触发但部分 case 未评测
      fail: 未触发或全部 case 未评测
    tags: [selftest, trigger, bootstrap]
    source_scope: SKILL.md#live-clean-context-policy
```

## model-agent 新增能力

### `runSkillTriggerAgent`

```js
/**
 * 技能触发模式 agent。
 *
 * @param {object} opts
 * @param {string} opts.sourceRef      - skill 文件内容
 * @param {string} opts.scenario       - 触发场景描述
 * @param {object} opts.provider       - AI model provider
 * @param {string[]} opts.whitelist    - 白名单命令前缀
 * @param {number} opts.maxSteps       - 最大 tool call 轮次 (default 5)
 * @param {number} opts.timeoutMs      - 单次命令超时
 * @param {string} opts.baseDir        - 工作目录
 * @returns {Promise<{toolCalls: Array, finalAnswer: string}>}
 */
export async function runSkillTriggerAgent(opts) { ... }
```

### 白名单过滤

```js
const DEFAULT_WHITELIST = [
  "node", "ls", "cat", "grep", "echo", "head", "tail",
  "wc", "find", "git log", "git diff", "git status",
]

function isAllowed(command) {
  const trimmed = command.trim()
  // 禁止危险符号
  if (/[;|&><`$(){}]/.test(trimmed)) return false
  // 白名单前缀
  return DEFAULT_WHITELIST.some(prefix => trimmed.startsWith(prefix))
}
```

### tool call 格式

模型返回的 tool use block：

```json
{
  "type": "tool_use",
  "name": "shell",
  "input": {
    "command": "node skills-def/recall-eval/scripts/validate-schema.mjs skills-def/recall-eval/.recall/queue.yaml"
  }
}
```

执行后追加到上下文：

```json
{
  "type": "tool_result",
  "tool_use_id": "...",
  "content": "PASS: queue.yaml validated successfully\n...",
  "exit_code": 0
}
```

## 实现清单

| 阶段 | 文件 | 变更 |
|------|------|------|
| 1. schema | `schemas/recall-queue.schema.yaml` | 新增 `trigger` 字段 |
| 2. model-agent | `lib/model-agent.mjs` | 新增 `runSkillTriggerAgent` + 白名单过滤 |
| 3. evaluate | `lib/evaluate-queue.mjs` | `medium: skill-trigger` 分支 |
| 4. lib | `lib/lib.mjs` | 新增 `scoreTriggerCase`、`validateTriggerExpected` |
| 5. examples | `examples/queue.example.yaml` | 新增 skill-trigger 示例 |
| 6. selftest | `.recall/selftest-trigger.yaml` | 新增自举测试队列 |
| 7. docs | `SKILL.md` | 补充 `skill-trigger` 策略说明 |

## 验收

1. `npm run recall:run -- .recall/selftest-trigger.yaml --live`
   - 模型触发 validate-schema.mjs → score=2
2. `npm run recall:run -- .recall/selftest-trigger.yaml --live`
   - 模型触发 run-eval.mjs --live → score=2
3. skill-trigger case 未触发时 → score=0
4. skill-trigger case 触发了禁止命令 → score=0
5. 不传 `trigger` 的 skill-trigger case → 校验失败

## 实现心得

### prompt 策略

skill-trigger 模式**不注入 sourceRef 内容**——否则模型可以直接从注入的 prompt
中回答，不需要执行命令。正确做法：只告诉模型文件路径，迫使其使用 shell 读取。

### trigger 匹配

`must_run` 是子串匹配，非 exact match。模型可能按 SKILL.md 文档中的推荐入口
执行 `npm run recall:validate` 而非直接 `node validate-schema.mjs`，两者都应
被视为触发成功。设计 `trigger.must_run` 时用最通用的子串（如文件名而非完整命令）。

### 白名单

需要包含 `npm` 和 `npx`——SKILL.md 文档推荐使用 npm scripts，模型自然会优先尝试。
允许无害后缀 `2>/dev/null` 避免模型因 stderr 重定向被拦截而卡死。

### scoreAnswer 陷阱

`must_not_include` 会被 `normalizeText` 做 `toLowerCase` 后再做子串匹配。
像 "FAIL" 这样的关键词会被结果文本中的任意位置命中（包括"验证不含 FAIL 错误"）。
对 skill-trigger 模式建议用更精确的短语如 "validation failed"。
