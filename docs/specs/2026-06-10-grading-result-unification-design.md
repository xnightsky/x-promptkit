# recall-eval 判分层统一为 GradingResult + check 注册表设计

日期：2026-06-10 | 状态：已被部分取代（2026-06-11 修订）

> **修订记录（2026-06-11）**：本文的 judge 接入方案（§3.5 触发源/`scoring: semantic` 类别/headline 权威/escalation decider/threshold 机制）整体退场，由
> [2026-06-11-decision-judge-verdict-design.md](./2026-06-11-decision-judge-verdict-design.md) 取代——judge 改为具名裁定池（verdict），
> 经 `decision` 静态机单出口计分。本文仍有效的部分：promptfoo 调研结论（§3.1/3.2 的 GradingResult/注册表概念）、§6 `hasNonNegatedMatch` 共存裁决。

修订对象：`skills-def/recall-eval/lib/lib.mjs` 的判分层（`scoreAnswer` / `scoreTriggerCase` / `scoreDecision` / `hasNonNegatedMatch`）。

调研依据：promptfoo 判分内核（`src/assertions/index.ts` 的 `ASSERTION_HANDLERS`/`runAssertion`/`runAssertions`、`src/assertions/assertionsResult.ts` 的加权聚合、`src/matchers/llmGrading.ts` 与 `src/prompts/grading.ts` 的 `llm-rubric`）。本设计**只吸收其核心概念，以本仓库自有的薄实现落地，不引入 promptfoo 依赖**。

---

## 1. 目标

把判分层从「三套各自为政的返回形状 + 单体 if 链」收敛为「统一结果单元 + 小 check 函数 + 加权聚合」，并新增一个**自写的 model-judge check**，使 `score_rule` 第一次有裁判消费。

两条具体目标：

1. **结构统一**：`scoreAnswer` / `scoreTriggerCase` / `scoreDecision` 内部都走「check → 统一 `GradingResult` → 聚合」，新增一种检查 = 加一个 check + 注册一行，不再改主判分函数。
2. **语义判分**：内容判分从「子串 + 手写否定前缀」升级为「子串（确定性）+ 可选 model-judge（语义）」；judge 用现有 `_shared/model-runner.mjs` 的 `callModel`，零新增依赖。

非目标（本轮明确不做）：

- 不引入 promptfoo / Inspect AI 任何运行时依赖。
- 不做 assert-set 递归嵌套、derivedMetrics、remote grading、provider 矩阵抽象（promptfoo 的重壳）。
- 不动 carrier、clean-context 红线、context 层注入、失败分层（queue-def/runtime/content）这些已稳定的上层结构。
- 不做覆盖度（C 段，已搁置）。

---

## 2. 现状基线（改造前必须保住的对外契约）

`lib.mjs` 三个判分函数的**对外返回形状**被单测死锁，重构必须逐字节保持（除非该测试随分叉一起改）：

- `scoreAnswer(caseReport, answerText)` → `{ score: 0|1|2, rationale: string, missingMust: string[], mustNotHits: string[], decision? }`
  - 锁定来源：`tests/recall-eval.lib.test.mjs`（partial=1、否定不算越界=2、decision 各场景、无 decision 时不带该字段）。
- `decision` 子对象 → `{ score: number|'FAIL', knockout?: string, perDim: [{name,want,got,hit,weight,contribution}] }`。
- `scoreTriggerCase(caseReport, {toolCalls, finalAnswer})` → 触发不中 `{score:0, rationale, triggerMatches, triggerMissing}`；触发通过则 `{...scoreAnswer 结果, triggerMatches, triggerMissing}`。
- 报告渲染：`evaluate-queue.mjs` 的 `formatDecisionSuffix` 消费 `decision.score`/`decision.perDim`；`caseItems[].result` 形如 `score=2 | <rationale>` / `score=2 | ... | decision=+5 | ...`。

**判据**：本重构是「内部换骨架、对外不变形」。除 §6 分叉涉及的否定测试外，`npm test` 全部既有断言必须继续通过。

---

## 3. 主流程

### 3.1 统一结果单元 `CheckResult`（对应 promptfoo `GradingResult`）

内部新增一个归一化结果形状，**仅在判分层内部流转**，不直接对外暴露：

```
CheckResult = {
  pass: boolean,        // 该 check 是否通过
  score: number,        // 归一化 0..1
  reason: string,       // 人读理由
  weight: number,       // 聚合权重，默认 1；0 = 只报数不影响成败（metric-only）
  metric?: string,      // 命名分组（decision 维度用）
  detail?: object,      // 透传给对外形状的原始数据（如 missing 列表、perDim）
}
```

### 3.2 check 注册表（对应 `ASSERTION_HANDLERS`）

每种检查是一个纯/异步函数 `(params) => CheckResult | Promise<CheckResult>`，按 key 注册：

- `must_include`：所有 must 项子串命中 → pass，score=命中数/总数；缺项进 `detail.missing`。
- `any_must_include`：至少 1 项命中 → pass。
- `should_include`：命中即加分；缺不致命（weight 影响满分，不影响 pass）。
- `must_not_include`：命中禁止项 → fail（score 0）。**否定语义处理见 §6 分叉**。
- `decision`：双极累加 + knockout（见 §3.4）。
- `judge`（新增，可选）：model-graded，见 §3.5。
- `trigger`（skill-trigger 专用）：`must_run` 子串全中且 `must_not_run` 未触发 → pass。

`not-` 取反（对应 promptfoo `not-` 前缀）：统一在分发层翻转 `pass` 与 `score`（`score → 1-score`），**不再在各 check 内写否定分支**。

### 3.3 聚合（对应 `AssertionsResult.testResult`）

一个 case 的内容判分 = 各 check 的 `CheckResult` 加权聚合：

- 命中禁止项类（`must_not_include` fail、`judge` 显式 fail）= 硬否决 → case 内容分落 0。
- 否则按 `must`/`any`/`should` 的命中情况映射回 `0|1|2`（保持 §2 既有语义：must 全中且 any/should 满足 → 2；must 全中但 any/should 缺 → 1；must 缺项但有部分命中 → 1；全缺 → 0）。
- **对外仍输出 `0|1|2`**：0..1 聚合分只在内部用于排序/judge 阈值；展示层做 `0..1 → 0|1|2` 映射，保证 §2 契约不变。

### 3.4 `decision` check

逻辑与现状 `scoreDecision` 完全一致（逐维 命中=+weight / 答错=-weight / 缺席=0，knockout 未命中 → 整题 FAIL），只是改为「一组 `metric` 命名的 sub-check + 一个 veto 聚合函数」表达。对外 `decision` 子对象形状不变。

### 3.5 `judge` check —— 它在本体系里到底怎么操作

**重新定位（依用户澄清）**：子串/decision 是**低成本判断层**——它没坏,只是**有些场景它结构上表达不了**（答案多种等价措辞、rubric 是「是否正确解释了为什么」而非某个关键词）。AI judge 不是给确定层「加装饰」,而是**当低成本层满足不了场景时接管判断**。所以本节真正要设计的两件事是:**谁触发 judge、判分权威归谁**。

#### (1) 判断分层

| 层 | 判分器 | 成本 | 性质 |
|---|---|---|---|
| Tier-0 | 子串 + decision | 低 | 确定、离线、可复现 |
| Tier-1 | AI judge（`callModel`） | 高 | 语义、live |

Tier-0 永远先跑（它便宜）。Tier-1 是否介入、介入后谁说了算,由**触发源**决定。

#### (2) 谁触发 judge —— 三个触发源

| # | 触发源 | 含义 | 判分权威 | 进可复现基线? | v1 |
|---|---|---|---|---|---|
| 1 | **作者结构性声明**（case 标 `scoring: semantic` + `expected.judge`） | 作者已知子串表达不了这题 | **judge**（子串降为可选预过滤） | 否（语义类） | ✅ |
| 2 | **自动升级**（Tier-0 落边界:partial / 否定存疑 / 改写嫌疑） | 便宜层拿不准,叫裁判定夺 | judge（仅在边界带内改判） | 否 | 契约预留,实现推后 |
| 3 | **调用方强制**（`--judge` / audit 模式） | 全量复判 | 子串不变,judge 并列旁证 | 是 | ✅ |
| — | 未触发（缺省） | 子串够用 | 子串 | 是 | ✅ |

触发源 #1 是「场景满足不了」的正解,是本轮主投入；#2 是省 token 的「cheap-first → escalate-on-doubt」优化,需要一个边界检测器,留契约、实现推后（后续可无契约改动地加）；#3 是审计旁路。

#### (3) 怎么对接 —— determinism 凭什么不被破坏

关键洞察:**「可复现」是 case 类的属性,不是全系统的属性。**

- 子串权威的 case = **确定性类**:离线、可复现,自测全落在这一类 → 模型波动动不了自测结果（守住 clean-context「同 policy 才可比」红线）。
- judge 权威的 case = **语义类**:显式 live、**不进**可复现基线,本就预期随模型变。
- **触发源 = 分类器**:它既决定 judge 跑不跑,也决定这个 case 属于哪一类、headline 听谁的。一个队列可同时含两类 case,报告分区呈现。

#### (4) judge 的两种身份（厘清「第二个 decision」的边界）

我上一版把 judge 一律当「并列旁证」,只覆盖了下面第二种,漏了第一种:

- 触发源 #2 / #3 → judge 是**并列旁证**,像 `decision`,**不动 headline**；渲染成后缀:
  ```
  - `case-x`: score=2 | full | must_include matched | judge=pass(0.9) "rubric 全满足"
  ```
- 触发源 #1 → judge 是**该 case 的 headline 权威**,子串退位为预过滤;`score=` 直接由 judge 的 pass/score 经阈值映射得到。这才是「便宜层满足不了 → 接管」的兑现。

#### (5) 对接点（dispatch 数据流，落 `evaluate-queue.mjs`）

```
Tier-0 子串/decision 永远先算
        │
   escalation decider  ← 输入:case 的 scoring 声明 + Tier-0 结果 + 调用方 flag
        │ 决定: 跑不跑 judge / 跑则属哪个触发源
   ┌────┴────┐
 不跑        跑 judge(callModel, rubric)
   │           │
headline=子串   按触发源 combine:#1 judge 当 headline / #2 边界改判 / #3 并列旁证
        │
   formatJudgeSuffix 渲染 + 报告按「确定性类 / 语义类」分区
```

「escalation decider」是新增的小决策点,**「谁触发」这件事就物化在这里**——它是 Tier-0 与 Tier-1 之间唯一的接线盒。

**Tier-1 的落点 = 第三个动态 agent `runJudgeAgent`（`model-agent.mjs`）**,与既有 `runRecallAgent`（`clean-context-v1`，单发）、`runSkillTriggerAgent`（`skill-trigger-v1`，多步）同构,policy `judge-v1`：

```
model-agent.mjs
├── runRecallAgent        policy: clean-context-v1   单发（已有）
├── runSkillTriggerAgent  policy: skill-trigger-v1   多步 agentic（已有）
└── runJudgeAgent         policy: judge-v1           评判（新增）
```

职责三分,与 06-05 动态 agent 架构一致：

- `runJudgeAgent`（model-agent.mjs）：拼 judge prompt → `callModel` → 返回 `{ok, pass, score, reason}`；复用 `_shared/model-runner` 同一批原语。
- 解析三坑 + 并列计分（lib.mjs）：把 verdict 归一化进判分结果。
- escalation decider（evaluate-queue.mjs）：决定谁触发它。

**单发 vs agentic（深度选择，映射既有两个 agent）**：

| judge 形态 | 同构于 | 能力 | v1 |
|---|---|---|---|
| 单发评判 | `runRecallAgent` | output+rubric → 一次调用 → verdict（= promptfoo llm-rubric） | ✅ |
| agentic 评判 | `runSkillTriggerAgent` | 多步:可**读 `source_ref` 核对答案是否忠于原文**再裁——promptfoo stateless rubric 给不了 | 接口预留·推后 |

v1 落单发 `runJudgeAgent`；agentic judge 留成同一 `runJudgeAgent` 接口下的更高 policy,需要时无契约改动地升级（与触发源 #2 同策略）。

#### (7) rubric 文本从哪来

- 默认取 case 的 `score_rule.full`（满分标准本就是人写的判定语言，直接当 rubric）。
- 可被 `expected.judge.rubric` 显式覆盖（需要与满分标准不同措辞时）。
- 不另造词表：rubric 就是你已经在写的 `score_rule`，judge 让它**第一次被消费**。

#### (8) grader provider 怎么解析

- 复用 live 的 `replay-engine.loadEnabledProviders`；默认 **grader = 被测同 provider**（省配置）。
- 可被 `expected.judge.grader`（或 CLI `--grader`）覆盖,对应 promptfoo 的 grader override。
- grader 不可达时按触发源退回:#3 audit → 省略并列旁证；#1 语义类 case → 该 case 标 `judge skipped (no grader)` 并退回 Tier-0 子串预过滤结果（不报错、不压分,但显式提示该 case 未得到权威判分）。

#### (9) judge prompt（吸收 promptfoo `DEFAULT_GRADING_PROMPT` 结构,自写,~30 行）

- system：「你按 rubric 给 output 判分,rubric 为真则通过；只回 JSON `{reason, pass, score}`」+ 2 条 few-shot（一正一负）。
- user：`<Output>{答案}</Output>\n<Rubric>{rubric}</Rubric>`。
- 用现有 `_shared/model-runner.mjs` 的 `callModel`,零新增依赖。

#### (10) 解析三坑（必须照抄 promptfoo 处理,否则假绿）

1. `pass` 非 bool → 按字符串 `true/yes/pass/y`（大小写不敏感）兜底转。
2. `score` 非数 → 转数；`NaN` → 回落到 `pass?1:0`。
3. **默认 pass 陷阱**：promptfoo 在「模型省略 `pass` 且未设阈值」时默认放行。本实现令 `threshold` **恒有有效值**（`normalizeJudge` 缺省补 `0.5`，并钳到 `[0,1]`），判分为 `pass = (模型显式 false 否决) 否则 score>=threshold`——阈值恒在,「省略 pass」永远走分数判定,陷阱在**构造上**被堵死,无需为此设 queue-definition failure。

#### (11) 失败分层（沿用现有四层）

- judge 调模型失败（429/断流/非法 JSON）→ **runtime failure**,该并列子分标 `not evaluated`,**确定性 headline 分不受影响**。judge 失败 ≠ 答案差。

---

## 4. 输入/输出契约

- **判分层对外签名**：`scoreAnswer` / `scoreTriggerCase` 保持现签名与返回形状（§2）。`judge` 启用时 `scoreAnswer` 需支持 async；离线调用（无 judge）保持同步快路径，不强制 await 改造上层无关代码。
- **queue 契约新增（schema）**：
  - case 级可选 `scoring`（缺省 `deterministic`；`semantic` = 触发源 #1,该 case 归语义类、judge 为 headline 权威）。
  - `expected` 下可选 `judge` 块（可选 `rubric` 覆盖、可选 `threshold`、可选 `grader` 覆盖）。
  - 结构权威落 `schemas/recall-queue.schema.yaml`，prose 镜像落 SKILL.md / recall-author。**缺省（无 `judge`、`scoring` 不写或为 `deterministic`）= 确定性类,行为与今天逐字节一致**（§2 契约由此守住）。
  - 约束：`scoring: semantic` 必须同时给 `expected.judge`；否则 queue-definition failure。
- **grader provider 来源**：复用 live 的 provider 解析（`replay-engine` 的 `loadEnabledProviders`）；judge 与被测可同/异 provider，默认同 provider。

## 5. 异常态

- `scoring: semantic` 但缺 `expected.judge` → queue-definition failure，报 ``scoring `semantic` requires `expected.judge` ``（threshold 缺省 0.5,不再需要「缺 threshold」这一失败态）。
- judge 调模型失败（429/断流）→ **runtime failure，标 `not evaluated`，不压低内容分**（沿用现有失败分层，judge 失败 ≠ 答案差）。
- judge 返回非法 JSON / 抽不出 `{pass,score}` → 按 runtime failure 处理（同上），不静默判 0。
- 无 grader provider 但 case 声明了 `judge` → 离线模式跳过 judge 子分并显式标注「judge skipped (no grader)」，不影响子串判分；live 模式要求 provider 存在。

## 6. 分叉裁决：`hasNonNegatedMatch` —— 选 C（共存，不删）

**裁决（用户确认）**：两套判分确定性共存——`hasNonNegatedMatch`（中文否定前缀 `不/没/而非…` 检测）**永久保留**为 `must_not_include` 的**离线确定性否定**实现；judge 是**并列的语义层**，只在 live + grader 时附加,不替代、不阻塞子串否定。

含义：

- 本轮**不删** `hasNonNegatedMatch`，`tests/recall-eval.lib.test.mjs` 6 处否定断言**保持不动、继续锁定**离线确定性。
- judge 与子串否定职责分离：子串否定 = 离线、确定、可复现；judge = live、语义、并列子分。二者出现在同一报告行,互不覆盖。
- 不追求「退役 hack」；hack 是离线路径的承重件,共存是设计选择而非妥协残留。

## 7. 验收点

- `npm test`：除 §6 分叉按所选路线调整的测试外，`recall-eval.lib.test.mjs` 全部既有断言继续通过（证明对外契约未变形）。
- 新增单测：check 注册表分发、`not-` 取反、judge 解析三坑（pass 兜底 / score NaN 回落 / 缺 threshold 报错）、judge runtime 失败标 `not evaluated`。
- `npm run lint` 全绿；judge / 注册表非显然逻辑补解释性注释。
- 若走 A：`npm run check` 对 fixture 分类不变。若走 B：同步更新受影响 fixture 并跑 `npm run check`。
- 文档同步：SKILL.md `Scoring Rule` 段、recall-author `expected` 字段表、EXAMPLES.md 输出样例、schema 的 `judge` 块。

## 8. 实现状态（当前实现 vs 目标设计）

**v1 已落地（2026-06-10）**：

- `runJudgeAgent`（`model-agent.mjs`，policy `judge-v1`，单发）+ `buildJudgePrompt`。
- judge 解析三坑 + headline 映射（`lib.mjs`：`parseJudgeResponse` / `judgeToHeadline`；threshold 缺省 0.5）。
- escalation decider（`evaluate-queue.mjs`：`applyJudge`）接触发源 **#1 semantic 权威 / #3 `--judge` audit 旁证**；`run-eval.mjs` 加 `--judge`。
- schema：case 级 `scoring` + `expected.judge`；lib 跨字段：`scoring: semantic` 必须配 `expected.judge`。
- 单测：解析三坑、headline 映射、semantic 跨字段、`runJudgeAgent`（echo + 守卫）。

**目标设计、本轮未落地（仍为 §3.1/§3.2 描述的方向，按需后续推进）**：

- 把 `scoreAnswer` / `scoreTriggerCase` / `scoreDecision` **正式收敛进统一 `CheckResult` + check 注册表**——本轮 judge 是**加法接入**（确定性判分函数保持原结构、对外契约逐字节不变），尚未做这层内部骨架重构。
- 触发源 **#2 自动升级**（边界检测器）：契约预留，未实现。
- **agentic judge**（读 `source_ref` 核对忠于原文）：`runJudgeAgent` 接口预留更高 policy，未实现。
- **grader override**（`expected.judge.grader` / `--grader`）：字段已入 schema 并归一化保留，v1 执行层默认同被测 provider，覆盖未接线。
