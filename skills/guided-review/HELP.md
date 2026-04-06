# Guided Review Help

## Skill

`guided-review` helps a reviewer work through one concrete review point at a time before deciding whether feedback is actionable.

This skill is configured for explicit invocation only. Mention `guided-review` or use the help snippet to activate it.

## When To Use

- 你想 review 某个具体改动点，但还不想直接下结论
- 你需要先补齐技术细节，再判断这个点是否值得留 comment
- 你希望把“担忧、原因、证据、建议动作”收束成更稳的 review 反馈

## What It Does

- 先聚焦当前 review 点，而不是一开始铺开完整 checklist
- 当前轮先问 1 到 2 个高价值问题，整个 review 点累计通常控制在 2 到 4 个
- 只要已经拿到部分答案、局部证据或一个风险信号，就先推给你
- 技术细节不清楚时，先补澄清，再回到当前 review 判断
- 你可以中途质疑当前判断或追问代码知识点，它会先回答当前问题，再继续剩余问题
- 证据足够时，再帮你收束成可执行的 review comment

## What To Provide

- 当前 diff、代码片段或单个 review 点
- 你已经看到的风险、疑问或上下文
- 如果卡住了，说明你具体不理解的技术细节

## Quick Start

- 这个 skill 只接受显式触发，不会依赖描述自动命中
- 直接说你想看的 review 点，例如“帮我 review 这个重试逻辑，但先别急着下结论”
- 如果你只想看帮助，发出独立片段 `$guided-review --help`
- 如果你需要 skill 自带的开发入口，可以运行 `npm run guided-review -- --dry-run`
- 如果你已经确认问题成立，可以要求它帮你整理 comment

## Modes

- `review-guide`: 默认模式，先问问题、收证据、定方向
- `detail-clarifier`: 卡在技术细节时补上下文，再翻译回 review 影响
- `return-to-review`: 澄清后回到当前 review 点，决定是否已足够形成反馈

## Not For

- 一上来就做仓库级 checklist 扫描
- 脱离当前 review 点的大段泛化教程
- 没有具体代码点或上下文时，直接给高置信度结论
- 把当前 skill 误当成独立产品级 review CLI
