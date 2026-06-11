---
name: recall-author
description: Use when the user asks about recall queue configuration — writing, reviewing, fixing, or interpreting `.recall/*.yaml` files that conform to `recall-queue.schema.yaml`. Use for queue authoring, reading existing queues (field semantics, scoring intent, source bindings), schema violations, broken fixtures, pre-submit validation, or answering "what does this queue test / what does this field mean" questions.
---

# Recall Author — 召回队列百科

面向人读的召回队列编写与解答手册。

- **本文件是人读百科**：从概念、场景到字段细节，教你写出合法 `.recall/*.yaml`
- **结构权威是 schema**：[`recall-queue.schema.yaml`](../recall-eval/schemas/recall-queue.schema.yaml) — 机器校验以此为准
- **执行侧用 recall-eval**：[`recall-eval/SKILL.md`](../recall-eval/SKILL.md) — 跑评测、看分数

## 这是什么

**召回队列（recall queue）**是一份 YAML 配置文件，回答一个问题：

> 某个 agent 在特定提示词下，能不能正确回忆出规定内容？

每个队列绑定一个被评测的提示词源（`source_ref`），包含若干评测用例（case），每个 case 定义：问什么、预期答什么、怎么打分。

用一句话概括：**把「agent 是否记住了正确的事」变成可复现的自动化评测。**

## 第一份队列（5 分钟上手）

### 第一步：确定你要测什么

你需要知道三件事：

1. **被评测的提示词在哪？** → 填 `source_ref`
2. **问 agent 什么问题？** → 填 `question`
3. **正确答案应该包含什么？** → 填 `expected.must_include`

### 第二步：写最小骨架

```yaml
version: 1
source_ref: prompts/my-skill.md          # 被评测的提示词
fallback_answer: 未明确                   # 评分规则无法裁决时的兜底
scoring:
  "2": 回答正确且关键边界完整
  "1": 方向正确但缺关键限制或表述偏弱
  "0": 回答错误、臆答、遗漏关键限制或答非所问
cases:
  - id: my_skill.core_rule               # 唯一 ID，推荐 domain.case_name
    question: 当 X 发生时 agent 应该做什么？
    medium: skill-mechanism              # 记忆介质类型
    # carrier 可选，缺省 direct（v0.6.0 起 carrier 解析层已下线）
    expected:
      must_include:
        - 必须包含的关键词
    score_rule:
      full: 明确答出正确行为
      partial: 只答出部分
      fail: 答错或答非所问
    tags: [selftest]
    source_scope: my-skill.md#规则节      # 缩小答案面到具体小节
```

### 第三步：校验

```bash
npm run recall:validate -- path/to/your-queue.yaml
```

输出 `PASS` = 结构合法，可以开始用。

## 场景速查

| 我想… | 关键字段 | 示例看这 |
|-------|---------|---------|
| 测 agent 是否记住某条规则 | `medium: skill-mechanism`, `must_include` 写规则关键词 | 上面最小骨架 |
| 测 agent 是否触发特定命令 | `medium: skill-trigger`, `trigger.must_run` | [`queue.example.yaml`](../recall-eval/examples/queue.example.yaml) |
| 测「子串表达不了」的题（等价改写、解释对不对） | `expected.judge` 裁定池（声明即打分） | [`judge` 段](#judge--具名裁定池声明即打分)、[`selftest-judge.yaml`](../recall-eval/.recall/selftest-judge.yaml) |
| 给某条判断放大权重 / 装刹车 / OR 组合 | `decision` 精调（`weight` / `knockout` / `verdict: [...]`） | [`decision` 段](#decision--具名字段裁决精调链路--唯一打分出口) |
| 控制评测时加载哪些提示词 | `context` 块 | [context 层声明](#context-层声明) |
| case 指向不同提示词源 | case 级 `source_ref` 覆盖队列级 | [`queue-with-case-source-override.yaml`](../recall-eval/.recall/queue-with-case-source-override.yaml) |
| 只检查结构不跑评测 | `npm run recall:validate` | [校验](#校验) |
| 跑真实评测看分数 | `npm run recall:run` | [recall-eval/SKILL.md](../recall-eval/SKILL.md) |

## 队列结构全景

```
queue.yaml
├── version              # 固定 1
├── source_ref           # 被评测提示词路径（case 可覆盖）
├── fallback_answer      # 评分兜底
├── context              # [可选] 提示词层声明
│   ├── repo             # [可选] 项目提示词层
│   │   ├── enabled      # boolean，是否加载
│   │   ├── path         # [可选] 文件路径（string | string[]）
│   │   └── max_bytes    # [可选] 截断字节数
│   └── global           # [可选] 全局提示词层
│       ├── enabled      # boolean，是否加载
│       ├── path         # 当 enabled=true 时必填
│       └── max_bytes    # [可选] 截断字节数
├── scoring              # { "0": ..., "1": ..., "2": ... }
├── judge                # [可选] judge 执行配置（grader / timeout_ms）
├── skill_trigger        # [可选] skill-trigger 模式的执行配置
│   ├── permissions      # [可选] 命令权限
│   │   ├── mode         # merge（默认）| override
│   │   ├── allow        # 允许的 glob patterns
│   │   └── deny         # 拒绝的 glob patterns（优先级高于 allow）
│   ├── max_steps        # [可选] 最大交互轮次（默认 5）
│   └── timeout_ms       # [可选] 单命令超时（默认 30000）
└── cases[]
    ├── id               # 唯一 ID
    ├── question         # 问题文本
    ├── medium           # 记忆介质
    ├── carrier          # [可选] 执行载体，缺省 direct
    ├── source_scope     # 缩小答案面
    ├── source_ref       # [可选] case 级覆盖
    ├── fallback_answer  # [可选] case 级覆盖
    ├── context          # [可选] 整块覆盖队列级（结构同队列级 context）
    ├── trigger          # [可选] skill-trigger 专用
    │   ├── must_run     # 必须触发的命令子串（至少 1 项）
    │   └── must_not_run # [可选] 禁止运行的命令子串
    ├── available_skills # [可选] skill-trigger 候选技能目录
    │   └── []
    │       ├── path     # 技能文件路径
    │       ├── name     # [可选] 显示名
    │       └── desc     # [可选] 描述
    ├── variants         # [可选] 变体
    ├── expected
    │   ├── must_include      # 必含关键词（至少 1 个）
    │   ├── any_must_include  # OR 语义：至少命中 1 个
    │   ├── should_include    # 加分项
    │   ├── must_not_include  # 红线：命中即 overreach
    │   ├── judge             # [可选] 具名裁定池：<名>: { rubric }，声明即参与打分
    │   └── decision          # [可选] 精调链路：<维名>: { eq|one_of|verdict, from, weight, knockout, absent }
    ├── score_rule
    │   ├── full    # 2 分标准
    │   ├── partial # 1 分标准
    │   └── fail    # 0 分标准
    └── tags              # 标签列表（至少 1 个）
```

## 字段详解

### 队列级

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | integer | ✅ | 固定 `1` |
| `source_ref` | string | 推荐 | 被评测提示词的相对路径；case 可覆盖；不写则每个 case 必须自己写 |
| `fallback_answer` | string | ✅ | 评分规则无法裁决时的兜底答案 |
| `scoring` | object | ✅ | `"0"` / `"1"` / `"2"` 三档的自然语言说明 |
| `cases` | array | ✅ | 评测用例列表，至少 1 个 |
| `context` | object | 可选 | repo/global 提示词层声明 |
| `judge` | object | 可选 | judge 执行配置：`grader`（裁判 provider id，缺省同被测）/ `timeout_ms` |

**`source_ref` 继承规则**：
- 队列级写了 → case 自动继承
- case 级写了 → 覆盖队列级（不合并）
- 两级都没写 → 校验报错

### 用例级

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一 ID；推荐 `domain.case_name` |
| `question` | string | ✅ | 向 agent 提出的问题 |
| `medium` | string | ✅ | 记忆介质：`global-memory` / `skill-trigger` / `skill-mechanism` |
| `carrier` | string | 可选 | 执行载体；缺省 `"direct"`（v0.6.0 起 carrier 解析层已下线） |
| `source_scope` | string | ✅ | 答案面范围，指向 `source_ref` 内的小节 |
| `expected` | object | ✅ | 判定锚点 |
| `score_rule` | object | ✅ | 评分规则 |
| `tags` | array | ✅ | 至少 1 个标签 |
| `source_ref` | string | 可选 | case 级覆盖队列级 |
| `fallback_answer` | string | 可选 | case 级覆盖队列级 |
| `context` | object | 可选 | **整块覆盖**队列级 context，不做深合并 |
| `trigger` | object | 可选 | `medium: skill-trigger` 专用 |
| `available_skills` | array | 可选 | `medium: skill-trigger` 可选技能目录 |
| `variants` | array | 可选 | 变体扩展 |

### `expected` — 答案判定锚点

| 字段 | 类型 | 必填 | 语义 |
|------|------|------|------|
| `must_include` | array | ✅ | 必须包含的关键文本；**至少 1 项** |
| `any_must_include` | array | 可选 | **OR 语义**：至少命中其中 1 项即满足 |
| `should_include` | array | 可选 | 加分项；缺了不致命但影响满分 |
| `must_not_include` | array | 可选 | **红线**：一旦命中 = overreach 或错误回想 |
| `judge` | object | 可选 | **具名裁定池**：一条判断依据一项，**声明即参与打分**；见 [`judge` 段](#judge--具名裁定池声明即打分) |

**`must_include` vs `any_must_include` 选型指南**：

| 场景 | 用哪个 |
|------|--------|
| 答案必须同时包含 A、B、C | `must_include: [A, B, C]`（AND 语义） |
| 答案只要提到 A 或 B 或 C 之一即可 | `any_must_include: [A, B, C]`（OR 语义） |

### `decision` — 具名字段裁决（精调链路 + 唯一打分出口）

给「路由类」召回打分：判答案在某个**具名维度**上选/答得对不对。它是**唯一打分出口**
（静态机：±weight 累加 + knockout 否决），也是**精调链路**——只写 `judge` 池不写 decision
照样打分（缺省隐式参与），要改权重/装刹车/OR 组合/抽字面字段时才写它。维度名**自定义**，
每维形状 `{ eq | one_of | verdict, from?, weight?, knockout?, absent? }`
（结构权威：`../recall-eval/schemas/recall-queue.schema.yaml`；设计权威：
`docs/specs/2026-06-11-decision-judge-verdict-design.md`）。

**命中器（每维恰一）**：

| 命中器 | 机器 | hit 判定 |
|------|------|------|
| `eq: <字面串>` | 字面机：从答案抽实际值 | `got == eq`（trim、大小写不敏感） |
| `one_of: [<字面>, ...]` | 字面机 | `got ∈ 集合`（任一等值） |
| `verdict: judge.<池键>` | 裁定机：查 judge 裁定表 | 裁定 = pass |
| `verdict: [judge.<a>, judge.<b>]` | 裁定机 OR | 任一 pass → ✓ |

`verdict` 值**强制 `judge.` 前缀**（不带=校验报错）；verdict 维禁 `from`。

**其余字段（缺省表 B）**：

| 字段 | 缺省 | 语义 |
|------|------|------|
| `from` | 行约定 `^<维名>: <值>$` | 抽取实际值的正则（含 1 个捕获组）；仅字面维 |
| `weight` | `2` | 命中 +weight / 答错 −weight |
| `knockout` | `false` | `true` 时该维非命中 → 整题 FAIL（无视累加） |
| `absent` | `zero` | 缺席映射：`zero`=在场零出力 / `pass`=视为 yes / `fail`=视为 no |

**打分**：三态（✓/✗/∅）先过 `absent` 映射，再进静态机求和（不封顶，可为负）；`knockout`
是「刹车」——装了它的维度非命中，整题直接出局，压过累加。报告强制带 coverage
`(evaluated/total)`：**不同 coverage 的 decision 分不可比**。

```yaml
expected:
  must_include: [recall-author]
  judge:
    ownership: { rubric: "是否说明归 author 侧?" }
    polite:    { rubric: "措辞礼貌?" }
    concise:   { rubric: "简洁?" }
  decision:
    chosen_skill: { eq: recall-author, knockout: true }       # 字面：选错直接失格
    skill_family: { one_of: [recall-author, recall-eval] }    # 字面 OR
    reasoning:    { verdict: judge.ownership, weight: 3 }     # 裁定引用 + 放大
    style_ok:     { verdict: [judge.polite, judge.concise], absent: fail }  # 裁定 OR + 缺席视为 no
```

**写作要点**：

- 维度名自取，契约不预设词表；字面维的维名参与行约定抽取，verdict 维的维名纯计分标签。
- 「同时满足多项」（AND）拆成**多条维度**各给 weight；「任一说法都算」用 `one_of`（字面）
  或 `verdict: [...]`（裁定）。
- 想「错了扣分但能救」用 `weight`；想「错了直接出局」用 `knockout`；想「不答也算错」用
  `absent: fail`。
- `decision` 与内容桶（`must_include` 等）**并列计分、互不覆盖**；无池且不写 `decision`
  则完全等同今天。

### `judge` — 具名裁定池（声明即打分）

给「子串结构上表达不了」的题用：等价改写、判断「是否正确解释了为什么」这类非关键词的东西。
形态是**具名裁定池**：一条判断依据一项 `<名>: { rubric }`，由 `runJudgeAgent`（policy
`judge-v1`）一个 case **一次批量调用**逐项裁出 pass/fail。

**核心契约一句话：AI 只产出具名布尔裁定，分数恒由 `decision` 静态机出口。** 想放大 AI，
就放大引用它那一维的 `weight`——永远不让它出分。（结构权威：
`../recall-eval/schemas/recall-queue.schema.yaml`；设计权威：
`docs/specs/2026-06-11-decision-judge-verdict-design.md`）

| 位置 | 字段 | 语义 |
|------|------|------|
| `expected.judge.<名>` | `rubric`（必填） | 这条依据验什么（judge 的提问） |
| 队列级 `judge` | `grader` / `timeout_ms`（均可选） | 裁判 provider（缺省同被测）与调用超时 |

**声明即参与（缺省表 A）**：池里没被任何 `decision` 维引用的项，自动成为隐式维
`{ verdict: judge.<名>, weight: 2, 无否决, absent: zero }` ——也就是说**只写池就已经在打分**
（每条 pass +2 / fail −2 / 缺席 0），`decision` 只在要精调时才写。

```yaml
# 最简形态：只写池，零 decision —— 全部缺省参与
expected:
  must_include: [recall-author]
  judge:
    ownership:    { rubric: "是否说明『写新队列』属于 author 侧?" }
    no_invention: { rubric: "是否没有臆造仓库里不存在的字段?" }

# 精调形态：引用项听精调，未引用项仍缺省参与
expected:
  judge:
    ownership: { rubric: "..." }
    polite:    { rubric: "..." }
    concise:   { rubric: "..." }
  decision:
    reasoning: { verdict: judge.ownership, weight: 3 }            # 放大
    style_ok:  { verdict: [judge.polite, judge.concise] }         # OR：任一 pass 即命中
```

**失败分层**：裁定 fail = 内容失败（−weight / knockout 失格）；judge 跑了但漏答某项 =
内容侧缺席（走该维 `absent` 映射）；无 grader / 调用失败 / 回答不可解析 = **环境失败**,
整 case 标 `not evaluated`，不进打分机、不压分。

### `score_rule` — 三档评分标准

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `full` | string | ✅ | 得 2 分：正确且边界完整 |
| `partial` | string | ✅ | 得 1 分：方向对但缺关键限制 |
| `fail` | string | ✅ | 得 0 分：错误、臆答或答非所问 |

**编写原则**：让任意 reviewer 读到 `score_rule` 就能独立判断该打几分，不需要额外上下文。

### `trigger` — skill-trigger 专用

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `must_run` | array | △ | 必须触发的命令子串列表（GREEN 用例用；至少 1 项） |
| `must_not_run` | array | △ | 禁止运行/不应越界读取的命令子串（RED 用例用；至少 1 项） |

> `must_run` 与 `must_not_run` **至少声明其一**（anyOf）：GREEN 用例用 `must_run` 断言「应触发」，
> RED 用例用 `must_not_run` 断言「不应触发 / 不应越界读取工作区外 skill 文件」。
> 运行时 `scoreTriggerCase` 对二者均支持——`must_run` 缺省即跳过触发匹配、只校验 `must_not_run`。

**示例**：

```yaml
medium: skill-trigger
trigger:
  must_run:
    - "npm run recall:validate"
    - "queue.yaml"
  must_not_run:
    - "curl"
```

### `skill_trigger` — 队列级执行配置（可选）

控制 skill-trigger 模式下模型可执行的命令范围。缺省使用内置默认 patterns。

| 字段 | 类型 | 说明 |
|------|------|------|
| `permissions` | object | 命令权限配置 |
| `permissions.mode` | string | `merge`（默认，追加到内置 patterns）\| `override`（完全替换） |
| `permissions.allow` | array | 允许的 glob patterns（`*` 匹配任意字符） |
| `permissions.deny` | array | 拒绝的 glob patterns（优先级高于 allow） |
| `max_steps` | integer | 最大交互轮次（默认 5） |
| `timeout_ms` | integer | 单命令执行超时（默认 30000ms） |

**示例**：

```yaml
skill_trigger:
  permissions:
    mode: merge
    allow:
      - "(cd * && *)"       # 子 shell 范式
      - "python3 *"
      - "uv *"
    deny:
      - "cat /etc/*"        # 即便 cat * 在默认里，/etc/ 下仍被拦
      - "* sudo *"
  max_steps: 10
  timeout_ms: 15000
```

**内置默认 allow patterns**（mode=merge 时自动包含）：
`node *`, `npm *`, `npx *`, `ls *`, `cat *`, `grep *`, `echo *`, `head *`, `tail *`, `wc *`, `find *`, `git log *`, `git diff *`, `git status *`（以及各自的无参形式）。

**匹配规则**：deny 优先 → allow 匹配 → 未命中则 BLOCK。

### `context` — 提示词层声明

控制评测时**是否加载**项目提示词（repo 层）和全局提示词（global 层）。

- **缺省** = 两层都不加载（clean-context-v1 基线）
- 结构权威：[`_shared/schemas/prompt-context-layers.schema.yaml`](../_shared/schemas/prompt-context-layers.schema.yaml)

```yaml
context:
  repo:
    enabled: true              # 显式布尔值
    path: AGENTS.md            # 可选；默认 AGENTS.md。也可写成有序列表（见下）
    max_bytes: 8192            # 可选；正整数。列表形态下作用于「每个文件」
  global:
    enabled: true
    path: ~/.pi/agent/AGENTS.md # enabled 时必填
    max_bytes: 4096
```

`path` 既可是单串，也可是有序文件列表（`string | string[]`），贴合「根 `AGENTS.md` + `AGENTS.ai.md` + 边界局部 `AGENTS.*.md`」这类多文件组合：

```yaml
context:
  repo:
    enabled: true
    path:                      # 列表按声明顺序读取
      - AGENTS.md
      - AGENTS.ai.md
    max_bytes: 8192            # 每个文件各自按 max_bytes 截断
```

列表形态语义：按序读取、**每个文件各自按 `max_bytes` 截断**、拼接时在每段前标注来源路径（`<!-- <path> -->`，用声明里的原始路径串）；缺失/空文件自动跳过。

**关键规则**：
- `enabled` 必须是显式布尔值，不能省略
- `global.enabled: true` → `path` 必填（全局提示词无跨平台默认路径；列表含 ≥1 项即满足）
- case 级 `context` **整块覆盖**队列级，不做深合并
- 自测队列的 `context` 路径必须指向手写 fixture（`fake-*.md`），不依赖真实提示词

## `medium` 决策树

```
要测什么？
├── agent 是否记住了某条规则/机制本身
│   → medium: skill-mechanism
│   → 评分靠 must_include 子串匹配
│
├── agent 是否会主动触发特定命令/工具（GREEN）或不应越界触发/读取（RED）
│   → medium: skill-trigger
│   → GREEN：trigger.must_run（应触发）；RED：trigger.must_not_run（不应触发）；至少其一
│   → 可选 available_skills 声明候选技能
│
└── agent 是否记住了全局知识（跨项目的长期记忆）
    → medium: global-memory
    → 通常需要 context.global.enabled: true
```

## 编写规则与红线

### 必填字段：缺一个就报错

| 缺失 | 报错 | 来源 |
|------|------|------|
| 队列缺 `cases` | schema FAIL | `recall-queue.schema.yaml` |
| case 缺 `medium` | integrity FAIL | SKILL.md |
| case 缺 `expected.must_include` | schema FAIL | schema case.expected.required |
| case 缺 `source_scope` | schema FAIL | schema case.required |
| `source_ref` 无处可解析 | integrity FAIL | lib.mjs 跨字段语义 |
| `skill-trigger` 既无 `trigger.must_run` 也无 `trigger.must_not_run` | integrity FAIL | lib.mjs 跨字段语义 |
| `verdict` 引用的池键不存在 / 不带 `judge.` 前缀 | integrity FAIL | lib.mjs 跨字段语义 |
| 一维声明的命中器不是恰一（`eq`/`one_of`/`verdict`） | integrity FAIL | lib.mjs 跨字段语义 |

### 七条铁律

1. **`medium` 必须显式写**，不从 `source_scope` 或题面推断
2. **`carrier` 可选，缺省 `"direct"`**：v0.6.0 起 carrier 解析层已下线
3. **`source_ref` ≠ `source_scope`**：前者绑定提示词源，后者缩小答案面
4. **不从目录反推 source**：队列放哪和它测谁没有隐式关系
5. **`context` 整块覆盖不深合并**：case 级 context 直接替换队列级
6. **自测队列隔离**：自测 context 路径指向手写 fixture，不依赖真实提示词变化
7. **AI 不出分**：judge 只产出具名布尔裁定（pass/fail），分数恒由 `decision` 静态机出口；放大 AI = 放大对应维的 `weight`

### 打分策略选择

| 策略 | 适用场景 | 写法 |
|------|---------|------------------|
| 子串匹配 | 答案形式确定、词表固定 | `must_include` 精确关键词，问题里钉死作答词表 |
| 具名字段（字面） | 答案按 `<维名>: <值>` 行作答、值可枚举 | `decision` 字面维（`eq` / `one_of`），可配 `weight`/`knockout` |
| AI 裁定 | 答案有多种等价表述、要判「解释对不对」这类非关键词内容 | `expected.judge` 池（声明即打分 ±2）；要放大/刹车再加 `decision` 精调 |

子串匹配型示例（问题里钉死词表）：
```yaml
question: 缺省时 context 的 repo 层和 global 层是否加载？请用「加载」或「不加载」作答。
expected:
  must_include:
    - 不加载
  must_not_include:
    - 默认加载
```

## 校验

```bash
# schema 校验（结构合法性）
npm run recall:validate -- <yaml-path>

# 直调脚本（仓库内）
node ../recall-eval/scripts/validate-schema.mjs <yaml-path>

# 完整校验（含 lint + fixture check）
npm run verify
```

## 常见反例

### ❌ 缺 `medium`

```yaml
cases:
  - id: bad.no_medium
    question: ...
    # medium 缺失 → schema FAIL
```

### ❌ `score_rule` 写成字符串而不是对象

```yaml
score_rule: 非法结构  # 必须是 { full, partial, fail }
```

### ❌ `context.global.enabled: true` 但缺 `path`

```yaml
context:
  global:
    enabled: true
    # path 缺失 → 语义校验 FAIL
```

### ❌ 用 `source_scope` 替代 `source_ref`

```yaml
- id: bad.no_source_ref
  # source_ref 缺失（队列级和 case 级都没有）
  source_scope: SKILL.md#某节  # source_scope 不是 source_ref
```

### ❌ `expected.must_include` 缺失

```yaml
expected:
  should_include:
    - 只有加分项  # must_include 是必填
```

### ❌ `verdict` 不带 `judge.` 前缀

```yaml
expected:
  judge:
    ownership: { rubric: "..." }
  decision:
    reasoning: { verdict: ownership }  # 必须写 judge.ownership → 校验 FAIL
```

### ❌ 一维同时声明两个命中器

```yaml
decision:
  d: { eq: recall-author, verdict: judge.ownership }  # eq/one_of/verdict 恰一 → 校验 FAIL
```

## 目录关系

```
recall-eval/                   # 执行侧（../recall-eval/）
├── schemas/
│   └── recall-queue.schema.yaml
├── examples/
│   └── queue.example.yaml
├── scripts/
├── .recall/
│   ├── queue.yaml
│   ├── broken-*.yaml
│   └── fake-*.md
└── lib/
    └── _shared/              # 内联的共享模块
        ├── schema-validator.mjs
        ├── prompt-context.mjs
        └── schemas/
            └── prompt-context-layers.schema.yaml

recall-author/                 # ← 本目录
├── SKILL.md                   # 人读百科
└── .recall/
    └── queue.yaml             # 自验队列
```

## 解答已有队列

当需要读懂一份已有队列时，按以下顺序：

1. 看 `source_ref` → 知道在测哪份提示词
2. 看 `context` → 知道评测时加载了哪些提示词层
3. 逐个 case 读 `question` + `source_scope` → 知道每道题考什么
4. 逐个 case 读 `score_rule` → 知道评判标准
5. 看 `expected.judge` 池与 `decision` 接线 → 知道哪些判断交给 AI 裁定、谁被放大（`weight`）、谁装了刹车（`knockout`）、未被引用的池项按缺省 ±2 默默参与
6. 检查有无 `medium: skill-trigger` 的 case → 知道哪些需要触发命令

## 参考

- 结构权威：[`recall-queue.schema.yaml`](../recall-eval/schemas/recall-queue.schema.yaml)
- context 结构权威：[`prompt-context-layers.schema.yaml`](../recall-eval/lib/_shared/schemas/prompt-context-layers.schema.yaml)（内联于 recall-eval）
- 执行侧契约：[`recall-eval/SKILL.md`](../recall-eval/SKILL.md)
- 用例与输出样例：[`recall-eval/EXAMPLES.md`](../recall-eval/EXAMPLES.md)
- 最小合法样例：[`queue.example.yaml`](../recall-eval/examples/queue.example.yaml)
- context 声明样例：[`context-layers.example.yaml`](../_shared/examples/context-layers.example.yaml)（仓库内）
