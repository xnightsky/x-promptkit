# recall 队列具名字段裁决与双极累加打分设计

日期：2026-06-09 | 状态：设计已确认，实现待落地

补充对象：[2026-06-06-recall-context-layers-design.md](./2026-06-06-recall-context-layers-design.md) 之后的 `expected` 模型扩展；不修订其 `context` 结论。

> 给评审同事的一句话：本设计要解决的是「关键词桶判不了『被选中的具名值对不对』」。做法是给 `expected` 加一个**可选** `decision` 块，用**分析型评分卡（逐条打分再累加）**给路由决策打分，刻度是**双极**的（能表达「反效果」），并且是现有 0/1/2 的**向后兼容超集**——不写 `decision` 的老队列逐字节不变。请重点看「打分模型」与「超集兼容」两节是否贴合你的场景。

---

## 背景：先纠正一个被当成事实的前提

本设计源于一份外部分析，其核心主张是：「仓内 routing 判分的全部威力来自一张具名 DECISION schema（`skill / must_call_first / sub_mode / depth / scan / ceremony / freshness`），recall-eval 把它压成关键词桶所以降级」。

落地前已实证此前提**不成立**：

- 对 `sub_mode | must_call_first | ceremony | freshness | depth | scan` 全仓大小写不敏感检索 **零命中**——这张「固定多维 DECISION schema」在本仓不存在；业界（promptfoo / DeepEval / agent router）的路由判分粒度也只到「选哪个 skill / tool」，没有这套固定词表。
- 因此问题不是「相对仓内既有判分器降级」（参照物不存在），而是一个**净新能力缺口**：`expected` 无法表达「某具名维度 == 某具名值，并按其轻重累加计分」。

由此定下的红线：**契约不固定维度词表**（拒绝把虚构的 6 维焊进 schema），**只约束「具名维度 + 每条计分」这一形状**。

## 当前实现

`expected` 现有三类断言面（`skills-def/recall-eval/lib/lib.mjs` `scoreAnswer`、`scoreTriggerCase`）：

- 内容召回：`must_include` / `any_must_include` / `should_include` / `must_not_include`，全部是大小写不敏感**子串**判定，最终分 `0/1/2`（单极）。
- 命令触发：`trigger.must_run` / `trigger.must_not_run`，对实际工具调用命令做子串判定。
- 技能候选面：`available_skills`（path/name/desc），skill-trigger 模式的候选目录。

缺口：以上**都判不了「被选中的具名值 == X」**。要验「该走的 skill 名是 `recall-author`、子模式是 `fix`、深度是 `L2`」，今天只能把 `L2` 塞进 `must_include` 当子串——丢失字段归属、丢失逐维度计分、丢失「答了个错值（反效果）」与「没答（无效果）」的区分。

## 打分模型（本设计的核心）

### 1. 分析型评分卡：逐条打分，再累加（不封顶）

`decision` 块里每个具名维度 = 评分卡的**一条准则（criterion）**。每条独立给一个**带符号**的分，再**求和**得该用例的 decision 总分。这是 analytic rubric 的标准形态（「逐条打分，各条分数求和为总分」，对照 [Analytic vs Holistic Rubrics](https://resources.depaul.edu/teaching-commons/teaching-guides/feedback-grading/rubrics/Pages/types-of-rubrics.aspx)）。

**每条贡献（设该条 `weight = w`，缺省 `w = 2`）：**

| 该维度实际值 | 含义 | 贡献 |
|---|---|---|
| 抽取值 == `eq` | 达标/命中 | **+w** |
| 抽取值存在但 ≠ `eq` | **反效果**（自信地答错） | **−w** |
| 抽取不到值（没答） | **无效果**（没召回出来，但也没乱说） | **0** |

`decision 总分 = Σ 各维度贡献`，**无界**：3 条各命中、各 `w=2` → **+6**；其中一条答错 → 那条变 **−2**，总分相应下降。**±w 是每条的参考量级，不是总分上限。**

### 2. `weight` = 这条准则值几分（轻重）

`weight` 就是这条准则的分值量级：核心维度给 `weight: 3`、次要维度给 `weight: 1`，缺省 `2`。这把「相对重要性」直接写进分值（analytic rubric 的 weighted scoring：「若 A 比 B 重要一倍，就在分值里体现」）。**它不是单独的轴，就是『这条值几分』。**

### 3. `knockout` = 一票否决（独立、可选、缺省关）

累加模型里，单条的 `−w` **压不住**其他条的正分（一条 −2 抵不过两条 +2+2，总分仍 +2）。因此「一刀切判负」**不能靠分值量级**实现——它必须是一道**独立的前置否决层**。这正是正规评分模型的标准分层：「评分第一步先查 **knockout 准则**，作为加权累加**之前**的前置过滤；不满足即**失格**」（[SI Labs: Scoring Model](https://www.si-labs.com/en/articles/scoring-model/)）。

规则：维度标 `knockout: true` 且该维度**未命中**（反效果或无效果）→ **整题失格**，最终判 `FAIL`，**无视累加总分**。缺省 `false`，即普通维度只参与累加、不否决。

> 设计沿革（给评审：为何不把 knockout 并进 weight）：在「封顶/clamp」刻度下，满量程 weight 经 clamp 即等价于否决，二者可合一；但本设计选了**累加不封顶**，累加下二者数学上不等价，故按标准做法分两层。`weight` 管轻重、`knockout` 管失格，职责正交。

### 4. 双极语义锚（per-criterion，可累积加深）

刻度是双极的，每条参考量程 `[−w, +w]`，`w` 缺省 2（即 ±2，可用 ±1/±3 体现轻重）。锚定（对照语义差异量表与 reward model 的「正=有益 / 0=中性 / 负=有害」惯例：[Semantic Differential](https://www.surveyking.com/help/semantic-differential-scale)、[LLM Safety SFT/DPO](https://arxiv.org/pdf/2509.09055)）：

- **+**：达标/超越（命中该维度期望值）
- **0**：无效果（没答出来，但没乱说）
- **−**：反效果（自信地答错）；多条反效果会**累积**向更负沉

双极相对单极的收益（[Bipolar vs Unipolar Scaling](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11918371/)）：单极（今天的 0/1/2）把「没答」和「答错」都压在 0、丢失区分度；双极把二者分开，恢复信号。

### 5. 超集兼容：不是改 score，是扩

**现有 0/1/2 就是新刻度的非负子集**，语义/数值都不动：

| 今天 | 新刻度 | 变化 |
|---|---|---|
| full | +2 | 同格，值不变 |
| partial | +1 | 同格，值不变 |
| fail | 0 | 同格，值不变 |
| —（今天没有） | 负区（−1/−2…）与累加（+3…+6…） | **纯新增 headroom，仅 `decision` 用例触发** |

**不写 `decision` 的队列：判分路径、返回值逐字节等同今天**，不进任何新分支。负区与累加是 `decision` 块的 opt-in 能力，老队列永不触达。`must_include` 等内容桶语义保持不变，与 `decision` 正交并存（详见「主流程」）。

## 契约：`expected.decision` 块（可选）

```yaml
expected:
  must_include: ["recall-author"]     # 既有内容桶，语义不变
  # 维度名（chosen_skill/answer_mode/answer_depth）纯属示例，由作者自定义；
  # 契约不预设任何维度名——刻意不复用那份被证伪的「固定 6 维」词表，
  # 也避免单数 skill 这类名字被误读成「真有一个内置 skill 字段」。
  decision:                           # ← 新增，可选
    chosen_skill: { eq: recall-author, knockout: true }  # 选错 skill 直接失格
    answer_mode:  { eq: fix }                             # 缺省 weight=2
    answer_depth: { eq: L2, weight: 1 }                   # 次要维度，值 1 分
```

schema 形状：

```yaml
decision:
  type: object
  minProperties: 1
  additionalProperties:            # key = 自定义维度名，契约不固定词表
    type: object
    required: [eq]
    additionalProperties: false    # 维度内只许这 4 个键，写错即 schema 报错
    properties:
      eq:       { $ref: "#/$defs/non_empty_string" }   # 期望值
      from:     { $ref: "#/$defs/non_empty_string" }   # 抽取正则；缺省走约定
      weight:   { type: integer, minimum: 1 }          # 该条分值量级 ±weight；缺省 2
      knockout: { type: boolean }                       # 缺省 false；未命中即整题失格
```

维度内四键语义（全部定死）：

| 键 | 含义 | 默认 | 取值规则 |
|---|---|---|---|
| `eq` | 该维度期望的具名值 | 必填 | trim 后**大小写不敏感精确相等**（对齐全仓 lowercase 约定） |
| `from` | 抽取实际值的正则（须含 1 个捕获组） | 不写则走约定 | 写了即覆盖默认 |
| `weight` | 该条分值量级（命中 +weight / 答错 −weight / 没答 0） | `2` | 正整数；核心维度给大、次要给小 |
| `knockout` | 未命中是否整题失格 | `false` | 布尔；`true` 时未命中无视累加直接 `FAIL` |

`weight` 用正整数（复用校验器已支持的 `integer/minimum`，不需扩展浮点）。**v1 只做 `eq`**；`not_eq` / `one_of` 明确排除（闭合决定，非空白），维度内已是 object，将来追加向上兼容。

## 取值规则

1. 默认：在答案文本里按 `(?im)^\s*<维度名>\s*:\s*(\S.*?)\s*$` 抓**第一处**捕获组并 trim，作为该维度实际值（即答案需出现一行形如 `answer_depth: L2`）。
2. 维度写了 `from` → 用作者正则覆盖默认（约定：取第一个捕获组）。
3. 抽取无匹配 → 实际值视为**缺席**（贡献 0，无效果）；抽到了但 ≠ `eq` → **反效果**（贡献 −weight）。二者区分是双极刻度的关键收益。

## 主流程（判分）

接入 `lib.mjs` `scoreAnswer`：

1. 先跑现有内容桶逻辑 → `bucketScore`（0/1/2），该段一行不改。
2. 若用例无 `decision` → 直接 `return { score: bucketScore }`（老队列零回归）。
3. 有 `decision`：逐维度 extract → 比 `eq` → 定该条贡献（+w / −w / 0）。
   - 若存在 `knockout: true` 维度未命中 → `return { score: 'FAIL', knockout: <dim> }`（前置否决，无视累加）。
   - 否则 `decisionScore = Σ 各维度贡献`（带符号、无界）。
4. 返回内容分与决策分两部分：`{ bucketScore, decisionScore }`。`decisionScore` 是路由维度的累加分；`bucketScore` 仍是内容召回分。报告并列展示，二者职责正交，互不覆盖。

读入侧：`lib.mjs` 装配 `caseReport.expected` 处（约 179 行 `must_include` 归一化那块）同步把 `expected.decision`（含 weight/knockout 缺省填充）读进 `caseReport`。

## 异常态

- `decision` 非对象、`minProperties` 不足、维度内缺 `eq`、出现 `eq/from/weight/knockout` 之外的键、`weight` 非正整数、`knockout` 非布尔、`eq`/`from` 空串 → 队列定义失败（queue-definition failure）。
- `from` 正则不含捕获组 → 抽取按「无匹配（缺席）」处理（不升级为队列定义失败，v1 边界；正则合法性不在 schema 层校验）。
- 运行时未产出答案（载体/桥失败）→ 仍走既有 `not evaluated` 路径，`decision` 不参与，不因此降分。

## 报告格式

逐维度可见，写进既有 Case Results 的 rationale：

```
4. Case Results
- routing-fix: content=2 decision=+1 | chosen_skill=recall-author(+2)✓ answer_mode✗got=author/want=fix(-2) answer_depth=L2(+1)✓
- routing-knockout: content=2 decision=FAIL | knockout fail @chosen_skill: got=recall-eval/want=recall-author
```

## 走查（一道真题，从文本到累加分）

维度声明（同上契约示例）：`chosen_skill{eq:recall-author, knockout:true}`、`answer_mode{eq:fix}`、`answer_depth{eq:L2, weight:1}`。模型答案文本：

```
该走 recall-author。
chosen_skill: recall-author
answer_mode: author
answer_depth: L2
```

判分：
- `chosen_skill`：`recall-author == recall-author` → 命中 **+2**；它是 knockout 维度，但命中 → 不触发失格。
- `answer_mode`：抽到 `author` ≠ `fix` → 反效果 **−2**。
- `answer_depth`：`L2 == L2` → 命中 **+1**（weight=1）。
- `decisionScore = +2 −2 +1 = +1`；内容 `bucketScore = 2`。

含义：选对了 skill（没被否决）、深度对，但**用错了档位**（该 fix 答成 author，反效果 −2）把决策分从 +3 拉到 +1。这正是关键词桶看不见、双极累加才表达得出的东西。

对照另一种：若把 `answer_mode` 也标 `knockout: true`，则同一答案因 `answer_mode` 未命中 → **整题 FAIL**（无视累加）。**作者用 weight 表达「错了扣多少」，用 knockout 表达「错了直接出局」。**

## 文件变更

| 文件 | 位置 | 改动 |
|---|---|---|
| `skills-def/recall-eval/schemas/recall-queue.schema.yaml` | `expected.properties` | 新增可选 `decision` 块（eq/from/weight/knockout） |
| `skills-def/recall-eval/lib/lib.mjs` | `caseReport.expected` 装配处 | 读入 `decision`，填 weight/knockout 缺省 |
| `skills-def/recall-eval/lib/lib.mjs` | `scoreAnswer`（约 373 行） | 加 knockout 前置 + 逐维度累加 + extract 辅助；保留 `bucketScore` 原样 |
| `skills-def/recall-eval/lib/evaluate-queue.mjs` | 报告拼装处 | 并列输出 content 分与 decision 累加分、knockout 失格原因 |
| `skills-def/recall-eval/SKILL.md` | Case Contract / Scoring Rule | 补 `decision` 散文镜像、双极累加与 knockout 说明，声明不破 trigger 红线 |
| `skills-def/recall-eval/.recall/selftest-decision.yaml`（新增） | — | 正例（全命中累加）+ 反效果例（−w）+ knockout 失格例，三向自测 |
| `tests/`（新增/补） | — | 命中→+w、答错→−w、没答→0、累加求和、knockout→FAIL、无 decision→等同今天 |

自测隔离红线沿用既有约定：`selftest-decision.yaml` 的 `context` 层只指向手写 fixture 提示词，不依赖真实 `AGENTS.md` / 全局提示词。

## 零回归保证

现存所有 `.recall/*.yaml`、所有 `broken-*` 负样本、所有单测**均不含 `decision`**；`scoreAnswer` 第 2 步对它们直接返回 `bucketScore`，逐字节等同当前行为。双极负区、累加、knockout 均仅在用例显式声明 `decision` 时触发。0/1/2 作为非负子集语义不变。

## 边界与后续

- **单值 `eq` 是有意设计，不是欠 v2 的债。** 路由决策大多本就唯一正解，单值逼作者把标准写准；「要同时满足多项」（AND，如既读 plans 又读 research）直接拆成多条单值维度即可，更清楚也更可逐条审。只有「同一答案取其一即可接受」（OR，如 depth=L1 或 L2 都算对）单值表达不了——但这种 OR 多半意味着标准没定死，属应尽量避免的边角；真出现再考虑 `one_of`，形状已为其预留、向上兼容。`not_eq` / 跨维度联动同理，按需再加，不预埋。
- `decision` 与 skill-trigger 模式正交：trigger 验「跑了哪条命令」、走 `scoreTriggerCase`；`decision` 验「答案声明的具名值」、走 `scoreAnswer` 内容线，不接管 skill-trigger 验证（守 SKILL.md「不得混淆 skill-trigger 验证与答案内容评估」）。
- `weight` 暂用正整数；若后续需要小数权重，再扩校验器的数值关键字，沿用「schema 文件 = 结构权威」约定。
- 决策分与内容分的「最终单一总分」如何合成（是否、以及如何把 `bucketScore` 也并入累加），留待真实场景反馈后再定；v1 先并列上报、不强行合一，避免无依据的合成规则。

## 验收点

- `npm test`：`scoreAnswer` 对 decision 的断言——命中→+w、答错→−w、没答→0、多维累加求和正确、`knockout` 未命中→FAIL、无 `decision`→等同今天；extract 默认约定与 `from` 覆盖各一例。
- `npm run lint` 与 `npm run check` 全绿（新增 `selftest-decision.yaml` 被 check-fixtures 按真实可运行队列分类）。
- `npm run recall:validate -- skills-def/recall-eval/.recall/selftest-decision.yaml` 输出 PASS；构造维度内含非法键 / `weight` 非正整数的负例 fixture 输出 FAIL 且指明字段。

## 附录：`selftest-decision.yaml` 草稿（未落地）

下面是配套自测队列草稿，三条用例分别演示**纯累加 / 反效果 / knockout 刹车**。

> 注意：此草稿**暂不落进 `.recall/`**。`.recall/*.yaml` 会被 `npm run check` 用现行 schema 校验、并被当真队列跑；而 `decision` 的 schema 与 `scoreAnswer` 尚未实现，现在落地会打挂 check 或被当空字段忽略。待 schema + 判分实现后再落地为真自测。

| 用例 | 演示 | decision 结果 |
|---|---|---|
| `accumulate-full` | 纯累加（油门） | +5 |
| `counter-effect` | 答错=反效果 −w，但不出局 | +1 |
| `knockout-fail` | 选错 skill → 刹车踩死 | FAIL（无视累加） |

```yaml
# selftest-decision.yaml（草稿）—— 决策累加打分自测，确定性 --answer 驱动
version: 1
# 自测隔离红线：source_ref 指向手写 fixture，不碰真实 AGENTS.md
source_ref: .recall/fake-routing-prompt.md
fallback_answer: "无法判断该走哪个 skill。"

# 顶层 scoring 仍描述内容桶 0/1/2（向后兼容，未动）；decision 累加分独立上报
scoring:
  "0": "未命中 must_include"
  "1": "命中 must_include 但有遗漏"
  "2": "完整命中 must_include"

cases:
  # ── 1. 纯累加：三维全命中 → decision = +2 +2 +1 = +5 ──
  - id: decision-accumulate-full
    question: "用户说『帮我写一个新的召回队列』。逐行输出 chosen_skill / answer_mode / answer_depth。"
    medium: skill-mechanism
    carrier: cli-echo              # 自测载体（示例值，确定性 --answer 时不实际调模型）
    source_scope: "写新队列 → recall-author / author / L2"
    expected:
      must_include: ["recall-author"]
      decision:
        chosen_skill: { eq: recall-author, knockout: true }  # 装了刹车，但本例命中→不触发
        answer_mode:  { eq: author }                         # weight 缺省 2
        answer_depth: { eq: L2, weight: 1 }                  # 次要维度，1 分
    score_rule:
      full: "三维全命中，decision=+5，content=2"
      partial: "部分命中"
      fail: "chosen_skill 错或内容未召回"
    tags: [decision, selftest]
    # 喂答案：chosen_skill: recall-author / answer_mode: author / answer_depth: L2
    # → content=2  decision=+5（+2+2+1），knockout 未触发

  # ── 2. 反效果（刹车没装在错的那维）：答错档位 → -w，但不出局 ──
  - id: decision-counter-effect
    question: "用户说『修一下这个 queue 的 schema 报错』。逐行输出 chosen_skill / answer_mode / answer_depth。"
    medium: skill-mechanism
    carrier: cli-echo
    source_scope: "修报错 → recall-author / fix / L2"
    expected:
      must_include: ["recall-author"]
      decision:
        chosen_skill: { eq: recall-author, knockout: true }
        answer_mode:  { eq: fix }            # 没装刹车：错了只扣分
        answer_depth: { eq: L2, weight: 1 }
    score_rule:
      full: "三维全命中 decision=+5"
      partial: "answer_mode 反效果，decision=+1"
      fail: "chosen_skill 错"
    tags: [decision, selftest, counter-effect]
    # 喂答案：chosen_skill: recall-author(+2) / answer_mode: author(-2，≠fix) / answer_depth: L2(+1)
    # → content=2  decision=+1。错档位扣分但没出局——油门收了，没踩刹车

  # ── 3. knockout 刹车：chosen_skill 选错 → 整题 FAIL，无视累加 ──
  - id: decision-knockout-fail
    question: "用户说『跑一下这张卷子打分』。逐行输出 chosen_skill / answer_mode / answer_depth。"
    medium: skill-mechanism
    carrier: cli-echo
    source_scope: "跑评分 → recall-eval / run / L1"
    expected:
      must_include: ["recall-eval"]
      decision:
        chosen_skill: { eq: recall-eval, knockout: true }   # 选错 skill = 灾难，装刹车
        answer_mode:  { eq: run }
        answer_depth: { eq: L1, weight: 1 }
    score_rule:
      full: "三维全命中 decision=+5"
      partial: "answer_mode/depth 偏差扣分"
      fail: "chosen_skill 选错 → knockout 失格"
    tags: [decision, selftest, knockout]
    # 喂答案（故意选错）：chosen_skill: recall-author（≠eq=recall-eval 且为 knockout 维度）
    #   answer_mode: run（命中）/ answer_depth: L1（命中）
    # → content 照常算；decision=FAIL（knockout @chosen_skill），无视 +2/+1 累加。刹车踩死
```
