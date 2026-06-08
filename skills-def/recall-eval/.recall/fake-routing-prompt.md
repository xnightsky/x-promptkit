# 假路由提示词（自测专用）

本文件仅供 `selftest-decision.yaml` 绑定 `source_ref`，**不是真实提示词**。
自测隔离红线：决策打分自测不依赖真实 `AGENTS.md` / 全局提示词，真实提示词内容变化不得影响自测结果。

约定（仅自测用）：
- 写新队列 → skill=recall-author / mode=author / depth=L2
- 修 schema 报错 → skill=recall-author / mode=fix / depth=L2
- 跑队列打分 → skill=recall-eval / mode=run / depth=L1
