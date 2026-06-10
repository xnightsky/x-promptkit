# decision + judge(verdict)判分系统设计

日期:2026-06-11 | 状态:已确认

修订对象:[2026-06-10-grading-result-unification-design.md](./2026-06-10-grading-result-unification-design.md) 的 judge 接入方案(`scoring: semantic` 类别 + headline 权威 + escalation decider)整体退场,由本设计取代。该文其余部分(promptfoo 调研结论、`hasNonNegatedMatch` 共存裁决)仍有效。

---

## 1. 原则(四条,全文档的根)

1. **`decision` 是唯一打分出口**:静态机(±weight 累加 + knockout 否决)。给定输入,分数确定、可审计、可复算。
2. **AI(judge)只产出具名布尔裁定(verdict),永远不产出分数**。AI 是"一种验证方式/取值来源",不是打分者;放大 AI = 放大对应维的 `weight`。
3. **`decision` 是精调链路,不是必经之路**:写了 `judge` 池就已经在打分(缺省参与);`decision` 只在要改权重、装刹车、OR 组合、抽字面字段时才写。
4. **缺席者参与决策、不参与权重**:缺席维在场(被记录、被计数、可触发否决),贡献按缺席映射(缺省 0)。环境失败不进打分机(归 runtime failure 层)。

## 2. 契约总览

```yaml
# ── 队列顶层 ──
version: 1
source_ref: ...
fallback_answer: ...
scoring: { "0": ..., "1": ..., "2": ... }   # 三档说明(既有,不变)
judge:                                       # 🆕 队列级 judge 执行配置(对称 skill_trigger)
  grader: <provider-id>                      # 可选;缺省同被测 provider
  timeout_ms: 30000                          # 可选;judge 调用超时

cases:
  - id: ...
    question: ...
    medium: ...
    source_scope: ...
    expected:
      must_include: [...]                    # 门控四件套:既有,不变
      judge:                                 # 🆕 具名裁定池:一条判断依据一项,声明即参与打分
        ownership:    { rubric: "是否说明『写新队列』属于 author 侧?" }
        no_invention: { rubric: "是否没有臆造仓库里不存在的字段?" }
        polite:       { rubric: "措辞是否礼貌克制?" }
        concise:      { rubric: "是否简洁不冗余?" }
      decision:                              # 精调链路(可选):字面维与裁定引用维混用
        chosen_skill: { eq: recall-author, knockout: true }        # 字面等值
        skill_family: { one_of: [recall-author, recall-eval] }     # 字面 OR
        reasoning:    { verdict: judge.ownership, weight: 3 }      # 裁定引用+放大
        no_invention: { verdict: judge.no_invention, knockout: true }  # 裁定+刹车
        style_ok:     { verdict: [judge.polite, judge.concise] }   # 裁定 OR:任一 pass
    score_rule: { full: ..., partial: ..., fail: ... }
    tags: [...]
```

### 图 1:case 级全景数据流(最终版)

```
queue.yaml
   │
   ▼
[校验] schema(形状) + 跨字段(恰一/judge.前缀/引用存在/absent 枚举,§11)
   │            └─ 不过 ─► queue-definition failure(case 不评,报缺陷)
   ▼
[取得答案] --answer / --answers-file / live runRecallAgent
   │            └─ live 失败 ─► runtime failure → not evaluated
   ▼
expected.judge 池非空?
 ├─ 否 ─► verdicts = 空表(本 case 无裁定参与)──────────────┐
 └─ 是 ─► grader 解析(队列级 judge.grader 指名 > 被测 provider)│
           ├─ 无 grader(离线)─► case not evaluated(环境拦截)  │
           └─ 有 ─► 一次批量 judge 调用(全部池项,§9)          │
                     ├─ 调用失败/回答不可解析 ─► case not evaluated
                     └─ 成功 ─► verdicts 表 { 键: {pass, reason} }
   ┌───────────────────────────────────────────────────────┘
   ▼
[判分:两线并行]
 ├─ 内容桶线: must / any / should / must_not ─► headline 0|1|2
 └─ decision 线: 显式精调维 + 缺省隐式维(池里未被引用项,weight 2)
      每维: 字面机抽取(§5) 或 裁定机查 verdicts(§4)
            → 三态 ✓/✗/∅ → 缺席映射 absent(§7) → +w / −w / 0
      knockout 维非✓ ─► decision=FAIL(压过求和)
      Σ 贡献 = decision 分 + coverage(evaluated/total)
   ▼
[渲染] score=X | <rationale> | decision=±N (k/n) | 逐维明细
        —— 两线并列上报,不合并 headline
```

## 3. 缺省表(权威;没进 decision 精调的全走这张表)

### 表 A:不写 `decision` 时,谁默默参与、打几分

| 参与者 | 默认参与方式 | 命中 | 未命中 | 缺席 | 否决权 |
|---|---|---|---|---|---|
| `judge` 池每条裁定(未被精调引用) | **隐式维**(维名=池键) | +2 | −2 | 0 | 无 |
| `must_include` 每项 | 内容桶门控 | 计入全中→可满分 | 封顶:缺项最多 1 分 | — | 缺任一不得满分 |
| `any_must_include` | 内容桶 OR 门控 | 满足 | 降到 1 | 不写=不参与 | 无 |
| `should_include` 每项 | 加分项 | 保满分资格 | 降到 1 | 不写=不参与 | 无 |
| `must_not_include` 每项 | 红线 | 命中→0 分 | 不影响 | 不写=不参与 | 一票 0 |
| 答案里的字面字段 | **不参与**(字面维必须显式建;抽取意图缺省推不出) | — | — | — | — |

### 表 B:进了 `decision`、字段省略时的默认值

| 字段 | 缺省 | 含义 |
|---|---|---|
| `weight` | 2 | 命中 +2 / 答错 −2 |
| `knockout` | false | 无否决权 |
| `absent` | zero | 缺席在场零出力 |
| `from` | 行约定 `^<维名>: <值>$` | 仅字面维 |

隐式维的完整形态:`{ verdict: judge.<池键>, weight: 2, knockout: false, absent: zero }`,维名=池键。

## 4. 命中系统

每个 decision 维**恰有** `eq` / `one_of` / `verdict` 之一:

| # | 写法 | 机器 | hit 判定 |
|---|---|---|---|
| 1 | `eq: <字面串>` | 字面机:从答案抽实际值 | `got == eq`(trim、大小写不敏感) |
| 2 | `one_of: [<字面>, ...]` | 字面机 | `got ∈ 集合`(任一等值) |
| 3 | `verdict: judge.<池键>` | 裁定机:查 verdicts 表 | `verdict == pass` |
| 4 | `verdict: [judge.<a>, judge.<b>]` | 裁定机 OR | 任一 `pass` → ✓ |

寻址规则:**`verdict` 值强制 `judge.<池键>` 前缀**——不是可选糖,不带前缀=校验报错。字段名+前缀双重自文档,杜绝隐式配对。

字段伴随:`from`/`one_of` 仅字面维;`verdict` 维禁 `from`。维名:字面维参与行约定抽取;verdict 维纯计分标签。

### 维度分派图

```
decision.<维名> 声明了哪个命中器?(校验保证恰一)
 ├─ eq: <字面串>        ─► 字面机:抽取(§5) → 等值比对
 ├─ one_of: [<字面>...] ─► 字面机:抽取(§5) → 集合比对
 └─ verdict: judge.<键> ─► 裁定机:查 verdicts 表(§9 的产物)
```

## 5. 字面维抽取原理(抽什么、怎么抽、每个失败口)

```
有 from 字段?
 ├─ 是 ─► new RegExp(from, "im")
 │         ├─ 正则非法 ──────────────► ∅(缺席)
 │         └─ 合法 ─► exec(答案全文)
 │                    ├─ 无匹配 ─────► ∅
 │                    ├─ 匹配但无捕获组1 ► ∅
 │                    └─ 有捕获组1 ──► got = trim(组1)
 └─ 否 ─► 行约定 ^\s*<维名>\s*:\s*(\S.*?)\s*$ (逐行、忽略大小写)
           ├─ 无匹配 ─► ∅
           └─ 匹配 ──► got = trim(值)
```

抽到之后:`targets = one_of ?? [eq]`,`lower(trim(got))` 与 targets 逐项等值——任一相等 ✓ hit,全不等 ✗ miss;没抽到不进比对,直接 ∅。

## 6. verdict 引用的静态解析(校验期定死,运行期只剩查表)

```
verdict 值(串或数组,逐项):
   形如 "judge.<键>"?
     ├─ 否 ─► 校验失败:must use the judge.<name> form
     └─ 是 ─► 剥前缀得 <键>
              <键> ∈ expected.judge 池?
                ├─ 否 ─► 校验失败:missing `expected.judge.<键>`
                └─ 是 ─► 通过
(无孤儿检查:池里未被引用的键 = 缺省隐式参与者,见 §8)
```

## 7. 打分机与缺席映射(核心决策图)

### 三态与缺席映射

```
            ✓ hit          ✗ miss              ∅ 缺席
字面维   got 等值/∈集合   抽到了但不等        答案里抽不到
裁定维   任一 pass        无 pass 且 ≥1 fail   引用的裁定全缺席

缺席映射(absent 字段,进打分机之前执行):
  zero(缺省) → 保持 ∅:在场、贡献 0
  fail        → 缺席视为 no:转 ✗
  pass        → 缺席视为 yes:转 ✓
```

裁定 OR 真值表:

```
verdict: [judge.a, judge.b]
  任一 pass            → ✓
  无 pass 且 ≥1 fail   → ✗(有到场裁判说不行,且无人说行)
  全缺席               → ∅
```

### 打分机(映射后只剩两态半)

```
✓ hit  → +weight
✗ miss → −weight
∅ zero → 0(在场零出力,计入 coverage 分母)
knockout 维非 ✓ → 整题 decision=FAIL(压过求和)
总分 = Σ 贡献,无上下界,可为负
coverage = evaluated(✓/✗ 维数)/ total(全部维数)
```

### 环境失败不进打分机

grader 缺失 / judge 调用失败 / 回答不可解析 = 环境失败 → **case 直接标 `not evaluated`(runtime failures 通道,跑分前拦截)**。打分机看到的缺席永远是内容侧的(答案没写该行;judge 跑了但漏答某项)。

### coverage 红线

不同 coverage 的 decision 分不可比(与"不同 clean-context policy 的 live 分不可比"同级红线);渲染强制带 `(evaluated/total)` 让违规可检。全缺席时和为 0 且渲染 `(0/n)`,与"真实中性 0 (n/n)"可肉眼区分。

## 8. 缺省参与与精调覆盖(merge 语义)

```
池里每条裁定:
  被 ≥1 个 decision 维引用?(含 OR 数组)
    ├─ 是 → 按精调维计分(不再生成隐式维)
    └─ 否 → 自动成为隐式维:{ verdict: judge.<键>, weight: 2, knockout: false, absent: zero }
```

三种形态自由混合:①只写池零 decision(全缺省 ±2);②半精调(精调项听精调,其余默默 ±2);③全精调+字面维。与仓库既有"缺省走内置、显式则覆盖"模式(skill_trigger permissions merge、carrier 缺省 direct、context 缺省 clean)同构。

## 9. judge 执行

### grader 解析

```
expected.judge 池非空?
 ├─ 否 ─► 不调 judge
 └─ 是 ─► 队列级 judge.grader 指名? ─ 是 ─► 已启用 provider 列表按名查,找到用它,找不到回落被测
           └─ 否 ─► 用被测 provider(同一个)
          连被测 provider 都没有(离线 --answer)?
           └─ 是 ─► case 标 not evaluated(judge required but no grader)
```

### 批量调用(一个 case 一次)

```
输入: 答案全文 + 池里全部 (键, rubric) 编号清单
prompt: policy judge-v1;对每条 criterion 判 pass/fail;
        只回 JSON { "<键>": { "pass": true|false, "reason": "..." } },每键恰一次;
        few-shot 一正一负锚定形态
超时: 队列级 judge.timeout_ms 覆盖 provider 缺省
失败(429/断流/超时) → case not evaluated(环境线)
```

### 裁决解析(全部兜底口)

```
回答文本 ─► 括号配平抽首个 JSON 对象(容忍 ```json 围栏/前后散文)
 ├─ 抽不出/parse 失败 ─► case not evaluated(unparseable,环境线)
 └─ 得对象 ─► 逐键:
      值是对象   → raw = 值.pass, reason = 值.reason
      值是布尔   → raw = 值(简写容忍)
      其余形态   → 该键丢弃(= 该裁定 ∅)
      raw 布尔   → pass = raw
      raw 字符串 → pass = ^(true|yes|pass|y)$(忽略大小写)
      其余       → 丢弃(∅)
   清单里有、回答里没有的键 → ∅
   ★ 缺席永远不等于 pass —— "默认放行"陷阱结构性不存在
```

## 10. 失败分层(沿用仓库四层)

| 情形 | 性质 | 处置 |
|---|---|---|
| verdict `fail` / 字面不等 | 内容 | −w;knockout → decision=FAIL |
| 答案没写字面行 / judge 跑了但漏答某项 | 内容侧缺席 | 进 absent 映射(缺省 0) |
| grader 缺失 / 调用失败 / 不可解析 | 环境 | case `not evaluated`,不进打分机 |
| queue 结构非法 | queue-definition | 照旧,case 不评 |

## 11. 校验规则清单(跨字段落 lib.mjs;shape 归 schema)

1. 每维 `eq`/`one_of`/`verdict` 恰一。
2. `verdict` 每项必须形如 `judge.<键>`;剥前缀后 `<键>` ∈ 池。
3. `verdict` 维禁 `from`。
4. `absent` ∈ {zero, pass, fail}(schema 子集无 enum,lib 兜底)。
5. 池项 rubric 非空;池 `minProperties: 1`;队列级 `judge` 块封闭键。
6. ~~池项必须被引用(孤儿=错)~~ 已删:孤儿=缺省参与者。
7. 多维引用同一池键允许(接线显式,不算错)。

## 12. 渲染

```
decision=+8 (4/4) | chosen_skill=recall-author(+2)✓ reasoning=pass(+3)✓ no_invention=pass(+2)✓ style_ok=pass(+1)✓
decision=+3 (3/4) | ... style_ok=∅(0)                       ← 缺席:zero,在场零出力
decision=FAIL(knockout @no_invention) (4/4) | ...            ← 内容否决
not evaluated | judge call failed: rate_limited              ← 环境,没进打分
```

## 13. 算例(打几分,算到底)

§2 的队列,答案:`chosen_skill: recall-author\n理由:写新队列属于 author(编写)侧……`;judge 回:ownership=pass, no_invention=pass, polite=pass, concise=fail。

| 维 | 来源 | 结果 | 贡献 |
|---|---|---|---|
| chosen_skill | 行约定抽到 `recall-author`,等值 | ✓ | +2 |
| skill_family | 同上,∈ 集合 | ✓ | +2 |
| reasoning | judge.ownership=pass | ✓ | +3 |
| no_invention | judge.no_invention=pass(knockout 放行) | ✓ | +2 |
| style_ok | OR:polite=pass | ✓ | +1 |

decision = **+10 (5/5)**;内容桶 must_include 命中 → headline **score=2**;两线并列上报,不合并。
变体:no_invention=fail → `decision=FAIL(knockout @no_invention)`;judge 整体没跑成 → case `not evaluated`(环境);judge 跑了但漏答 style_ok → style_ok ∅(0),decision=+9 (4/5)。

## 14. v1 已落代码处置表

| v1 已落物(2026-06-10) | 处置 |
|---|---|
| case 级 `scoring` 字段(schema+lib 跨字段+2 条测试) | 删 |
| 旧顶层 `expected.judge`({rubric,threshold,grader} 单体) | 改为具名裁定池 |
| `judgeToHeadline`、`applyJudge` 类别分支、`--judge` 旗标、threshold 机制 | 删(verdict 为布尔,threshold 无对象) |
| `parseJudgeResponse` | 改为 `parseJudgeVerdicts`(verdict 粒度) |
| `runJudgeAgent`/`buildJudgePrompt` | 改为批量形态(清单进、具名 JSON 出) |
| `selftest-judge.yaml`、SKILL `judge` Rule、recall-author judge 节 | 重写 |
| `scoreDecision` 静态机骨架、失败分层、`hasNonNegatedMatch` 共存、门控四件套 | 不动(scoreDecision 扩展 verdict 来源/缺席映射/coverage) |

## 15. 实施顺序与验收

顺序:schema → lib.mjs(归一化+跨字段+parseJudgeVerdicts+scoreDecision)→ model-agent(批量 judge)→ evaluate-queue(池→一次调用→verdicts;环境拦截)→ run-eval(删 --judge,传 providers)→ 测试 → fixture/SKILL/recall-author 同步 → lint/check/test 收口。

验收:
- 无 judge 池、无新字段的存量用例**逐字节不变**(decision/内容回归全绿)。
- 新单测覆盖:命中器恰一、前缀强制、引用存在、verdict 三态、OR 真值表、absent 三映射、knockout、缺省隐式参与、coverage、批量解析兜底、环境拦截。
- `npm run lint` / `npm run check` / `npm test` 全绿;离线端到端验证 judge 池 case 的 not-evaluated 拦截。
