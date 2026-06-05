# Recall Eval

召回评测技能——将"agent 是否记住了正确的事"变成可复现的队列驱动评测契约。

## 快速开始

```bash
# 先校验
npm run lint && npm run check

# schema 校验
npm run recall:validate -- skills/recall-eval/.recall/queue.yaml

# 离线打分
npm run recall:run -- skills/recall-eval/.recall/queue.yaml --case recall_eval.reject_missing_medium --answer "..."

# 完整校验
npm run verify
```

## 目录

- `SKILL.md` — 技能契约与行为约束
- `EXAMPLES.md` — 用例与输出样例
- `scripts/` — CLI 入口与运行时库
- `.recall/` — 本地队列与评测资产
- `.recall-replay.env.example.yaml` — provider 矩阵示例
