# Case ID

case-01-direct-for-loop-outer-watch

## Purpose

约束 `claude-p-watch` 在处理“有限自增 for 循环”请求时，保持单条 `claude -p` 直接执行，并把任务参数固定到可覆盖至少 3 次 watch 的具体数字。

## Environment Assumptions

- `claude-p-watch` skill 已可用
- 用户要的是直接执行，不是脚本示例

## Assert Must Include

- `claude -p`
- 直接执行
- 上限
- `current=<轮次> max=20`
- 3
- 20
- 10
- 200

## Assert Must Not Include

- 你可以手动运行
- 我给你一个示例脚本
- 每次再问我一次

## Assert Notes

- 不要求固定命令全文，但必须体现“单条命令直接执行一个有限循环任务”，并把 `20` 轮、`10` 秒、`200` 秒这些具体参数说出来
- `自增` 与固定输出间隔属于语义约束，不要求逐字出现；只要回复明确描述逐轮递增输出，以及每轮固定 `sleep 10 秒` 即可
- 禁止项针对把请求改写成脚本建议或要求用户反复追问；如果是否定式提到“不是示例脚本”，不视为失败
- 仅供主代理验证：默认 watch 间隔是 `60 秒`，目标至少观察到 `3` 次 watch，则任务总时长至少要大于 `180 秒`；本 case 固定取 `200 秒`，即 `20` 轮 * `10` 秒，作为安全余量
