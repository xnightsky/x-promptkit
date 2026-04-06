# Recall Eval Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks the queue contract, carrier resolution, refusal behavior, and output shape.

## Case 01: 默认 queue 选择

触发方式：

- “跑一下 recall-eval”
- “按默认 queue 做召回评测”

最小上下文：

- 是否显式指定 queue
- 是否正在评测某个 skill

期望产出：

- 未显式指定 queue 时，先解释 queue 解析顺序
- 目标自测优先 `<target>/.recall/queue.yaml`
- 若没有显式路径且没有目标旁真实 queue，则保持 unresolved 并要求补充路径
- `<memory-target>/.recall/queue.yaml` 只是示例布局，不是当前仓库的隐式默认值
- 显式提供任意兼容 yaml 路径时，直接使用该路径
- 明确 queue 绑定的目标来自 `source_ref`

标准输出样例：

```md
1. Queue
- `skills/recall-eval/.recall/queue.yaml`

2. Carrier
- `isolated-context-run:subagent`

3. Integrity Check
- `case-01`: pass | required fields present

4. Case Results
- `case-01`: score=2 | matched required recall points

5. Summary
- directly evaluable: `case-01`
- refused for missing carrier: none
- queue fixes required: none
```

反例：

- 不读 queue 就直接开始评测
- 无依据地换成别的 queue

---

## Case 01A: 接受任意兼容 yaml 路径

触发方式：

- “用这个 xxx.yaml 跑 recall-eval”
- “这个文件不在 `.recall/` 下面，也能评测吗”

最小上下文：

- 一个显式 yaml 路径
- yaml 内容是否符合 recall schema

期望产出：

- 明确 `queue.yaml` 只是推荐命名
- 只要 top-level 和 case 结构兼容，就接受任意 yaml 路径
- 不把文件位置当成硬限制
- 不因为文件放在 `skills/recall-eval/` 根目录就判定不可用

标准输出样例：

```md
1. Queue
- `/abs/path/to/recall-selftest.yaml`

2. Carrier
- `isolated-context-run:subagent`

3. Integrity Check
- `recall_eval.reject_missing_medium`: pass | compatible recall schema

4. Case Results
- `recall_eval.reject_missing_medium`: score=2 | correctly refused execution when `medium` is missing

5. Summary
- directly evaluable: `recall_eval.reject_missing_medium`
- refused for missing carrier: none
- queue fixes required: none
```

反例：

- 只因为文件名不是 `queue.yaml` 就拒绝
- 只因为不在 `.recall/` 目录就判定不可用

---

## Case 01B: `source_ref` 显式绑定目标提示词

触发方式：

- “这个 recall yaml 在评测哪份提示词”
- “target 是怎么绑定的”

最小上下文：

- queue-level `source_ref`
- case-level `source_ref`

期望产出：

- 优先解释 queue-level `source_ref`
- 明确 case-level override 只用于少数特殊 case
- 不从 `source_scope` 或目录反推目标

标准输出样例：

```md
1. Queue
- `skills/recall-eval/.recall/queue-with-case-source-override.yaml`

2. Carrier
- `isolated-context-run:subagent`

3. Integrity Check
- `override-by-case`: pass | effective source_ref resolved from case override

4. Case Results
- `override-by-case`: score=2 | target resolved to `skills/isolated-context-run/SKILL.md#default-priority`

5. Summary
- directly evaluable: `override-by-case`
- refused for missing carrier: none
- queue fixes required: none
```

反例：

- 用 `source_scope` 当成 target 绑定
- 只看 queue 所在目录就推断提示词来源

---

## Case 02: 缺 `medium` 时拒绝

触发方式：

- “这个 queue 能直接跑吗”
- “先帮我检查 recall queue”

最小上下文：

- queue case 内容

期望产出：

- 先做完整性检查
- 缺 `medium` 时直接拒绝该 case 的 recall
- 不从 `source_scope` 或题面猜介质

标准输出样例：

```md
1. Queue
- `<memory-target>/.recall/queue.yaml`

2. Carrier
- `isolated-context-run:subagent`

3. Integrity Check
- `case-02`: fail | missing `medium`

4. Case Results
- `case-02`: not evaluated | queue fix required before recall

5. Summary
- directly evaluable: none
- refused for missing carrier: none
- queue fixes required: `case-02` missing `medium`
```

反例：

- 把 `source_scope` 直接当成 `medium`
- 边报缺字段边继续评测

---

## Case 03: 缺 `carrier` 时拒绝

触发方式：

- “这个 case 为什么不能跑”
- “没写 carrier 也先测一下吧”

最小上下文：

- queue case 内容
- 调用方是否显式指定 carrier

期望产出：

- 明确 carrier 解析顺序
- 无法解析 carrier 时直接拒绝
- 返回推荐默认值 `isolated-context-run:subagent`

标准输出样例：

```md
1. Queue
- `<memory-target>/.recall/queue.yaml`

2. Carrier
- unresolved

3. Integrity Check
- `case-03`: fail | missing `carrier`

4. Case Results
- `case-03`: refused | carrier required before recall

5. Summary
- directly evaluable: none
- refused for missing carrier: `case-03`
- queue fixes required: add `carrier` or explicitly pass `isolated-context-run:subagent`
```

反例：

- 没有 carrier 还在当前上下文直跑
- 没有 carrier 时偷偷降级

---

## Case 04: 调用方覆盖默认 carrier

触发方式：

- “这轮 recall 用显式 carrier”
- “不要默认 subagent，按我指定的 carrier 跑”

最小上下文：

- 调用方显式 carrier
- queue case carrier

期望产出：

- 明确调用方 carrier 高于 queue carrier
- 明确这属于 override，不是自动选择

标准输出样例：

```md
1. Queue
- `<memory-target>/.recall/queue.yaml`

2. Carrier
- `custom-carrier`

3. Integrity Check
- `case-04`: pass | required fields present

4. Case Results
- `case-04`: score=2 | evaluated with caller override carrier

5. Summary
- directly evaluable: `case-04`
- refused for missing carrier: none
- queue fixes required: none
```

反例：

- 明明调用方指定了 carrier，还继续按 queue 默认值跑
- 把 override 说成自动推断结果

---

## Case 05: 固定输出结构

触发方式：

- “给我一个 recall-eval 输出样例”
- “把判定结果按固定格式列出来”

最小上下文：

- `recall-eval/SKILL.md`

期望产出：

- 固定使用五段结构
- 每条 case 给出判定或拒绝原因

验收标准：

- 输出包含 `Queue / Carrier / Integrity Check / Case Results / Summary`
- 至少一条 case 结果包含 `score=`
- 拒绝场景必须落在 `Case Results` 和 `Summary` 中

反例：

- 只给总分，不给完整性检查
- 只说“不能跑”，不写拒绝原因

---

## Case 05A: 脚本化 schema 校验

触发方式：

- “先校验这个 recall yaml”
- “给我一个 schema 验证入口”

最小上下文：

- 一个 recall yaml 路径

期望产出：

- 使用 `validate-schema.mjs`
- 运行入口位于 `skills/recall-evaluator/scripts/`
- 输出 PASS 或 FAIL
- 失败时逐条列出缺字段

验收标准：

- 支持合法 `.recall/queue.yaml`
- 支持合法任意路径 yaml
- 对缺 `medium` / `carrier` 明确报错

反例：

- 只靠人工读 yaml 判断
- 出错时只说“不合法”，不指出字段

---

## Case 06: 独立于 integration-tests 的 fixture 验证

触发方式：

- “这个 recall yaml 不接 integration-tests 能不能先验”
- “先只做 queue/schema 级验证”

最小上下文：

- 一个兼容 recall schema 的 yaml fixture

期望产出：

- 明确 schema/integrity 检查可以独立于 `integration-tests`
- 说明 initialized-workspace recall 才需要 `integration-tests`；单纯 queue/schema 校验不需要

验收标准：

- 输出明确区分 fixture 校验和集成执行
- 不把 `integration-tests` 写成必选前置

反例：

- 没有 `integration-tests` 就拒绝做 queue 校验
- 把 `integration-tests` 当成 recall-eval 的 schema 解释器

---

## Case 07: integration-tests 只负责集成编排

触发方式：

- “integration-tests 放哪里”
- “哪些属于集成层”

最小上下文：

- `integration-tests/recall-eval/`
- 目标旁 `.recall/`

期望产出：

- 说明真实 queue 跟着目标走
- 说明 `integration-tests/recall-eval/` 负责初始化 workspace、执行任务阶段、再跑 recall 阶段
- 不把 integration-tests 当成 queue 主存储

反例：

- 把所有真实 queue 都搬到 `integration-tests/`
- 把 `.recall` 当成纯测试目录而不是目标本地评测资产
