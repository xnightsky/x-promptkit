# Guided Code Review Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case defines trigger phrases, minimum context, expected interaction shape, acceptance criteria, and anti-patterns.

## Case 00: help 请求走独立帮助骨架

触发方式：

- `$guided-code-review --help`
- “先别开始，给我 `$guided-code-review --help` 看看”

最小上下文：

- 不需要 diff
- 只需要明确 help 片段是独立出现的

期望行为：

- 命中 `help-mode`
- 输出 [HELP.md](./HELP.md) 的帮助骨架
- 说明用途、适用场景、输入要求和快速开始
- 不进入当前 review 点的提问流程

验收标准：

- 输出包含 `Skill`、`When To Use`、`What To Provide`、`Quick Start`
- 不输出 `Current Review Point`
- 不输出 `Guiding Questions`
- 不输出 `Review Direction`

反例：

- “这里先帮我解释一下字符串 `$guided-code-review --help` 是什么含义”
- “我想试试 `$guided-code-review --hel`”

## Case 01: 引导 reviewer 先想清楚再下结论

触发方式：

- “guided-code-review：帮我 review 这个改动点，不要直接给结论。”
- “我觉得这里可能有问题，但我还没想清楚。”
- “帮我 review 这个改动点，不要直接给结论。”

最小上下文：

- 当前 diff 或被 review 的单个代码点

期望行为：

- 先定义 `Current Review Point`
- 只提出少量高价值问题
- 先基于现有代码和上下文总结已知信息
- 在证据不足时输出 `needs more evidence`

验收标准：

- 不一上来列完整 checklist
- 问题聚焦在单个 review 点
- 不在证据不足时直接下严重结论

反例：

- “这里有三十个 review 检查项，你全部看一遍。”
- “这一定是 blocker。”

---

## Case 02: reviewer 遇到技术细节盲点

触发方式：

- “这里为什么会有竞态？”
- “我不懂这个框架生命周期，先帮我补一下。”

最小上下文：

- 当前 review 点
- reviewer 明确说出不理解的技术细节

期望行为：

- 进入 `detail-clarifier`
- 优先读取代码、测试、注释和仓库文档
- 用当前 review 点解释技术细节，而不是脱离场景讲大课
- 最后切回 `return-to-review`

验收标准：

- 补充解释能帮助 reviewer 继续 review
- 解释完成后明确指出“这对当前改动意味着什么”

反例：

- 长篇泛讲并发知识，但不回答当前改动的风险
- 解释完后没有 review 结论

---

## Case 03: 需要查官方资料再判断

触发方式：

- “这个库的 API 契约到底是不是这样？”
- “这里是不是框架官方推荐写法？”

最小上下文：

- 当前 review 点
- 本地代码不足以支撑结论

期望行为：

- 先说明需要补证据
- 查询官方文档或可信资料
- 把查询结果翻译成 review 影响
- 输出 `likely feedback` 或 `ready-to-write comment`

验收标准：

- 外部资料只服务当前 review 判断
- 结论中明确说明资料和当前代码点的关系

反例：

- 贴一堆资料摘要，不回到 review
- 查到资料后仍不给出下一步方向

---

## Case 04: 收束成 review comment

触发方式：

- “这个点已经很明确了，帮我把 comment 写出来。”
- “我觉得这里值得留评论，帮我组织措辞。”

最小上下文：

- 当前 review 点
- 风险和证据已经足够

期望行为：

- `Review Direction` 输出 `ready-to-write comment`
- 使用固定结构：
  - `concern`
  - `why it matters`
  - `evidence`
  - `suggested question or change`

验收标准：

- comment 可直接用于 CR
- comment 既指出问题，也说明原因和证据
- comment 不夹带未经验证的判断

反例：

- 只有“这里不好”这种空泛表述
- 只有改法，没有问题描述和证据
