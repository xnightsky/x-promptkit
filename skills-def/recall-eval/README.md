# Recall Eval

召回评测技能——将"agent 是否记住了正确的事"变成可复现的队列驱动评测契约。

## 快速开始

```bash
# 进入 skill 目录
cd skills-def/recall-eval

# 先校验（从仓库根）
npm run lint && npm run check

# schema 校验
node scripts/validate-schema.mjs .recall/queue.yaml

# 离线打分
node scripts/run-eval.mjs .recall/queue.yaml --case recall_eval.reject_missing_medium --answer "..."

# 完整校验
npm run verify
```

## 目录

- `SKILL.md` — 技能契约与行为约束
- `EXAMPLES.md` — 用例与输出样例
- `schemas/` — 队列契约的结构权威（类 JSON Schema，校验代码直接消费）
- `examples/` — 最小合法样例（`queue.example.yaml`；非队列的 context 声明样例在 `../_shared/examples/`）
- `scripts/` — CLI 入口与运行时库
- `.recall/` — 本地队列与评测资产（`broken-*` 前缀 = 故意非法的负例 fixture）
- `.recall-replay.env.example.yaml` — provider 矩阵示例
