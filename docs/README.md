# docs

当前文档按 3 组组织：

- `agent-interrupt-interaction/`
  - Codex agent 中断、交互、审批与 supervisor 控制面调研
- `isolated-context-run-codex/`
  - `isolated-context-run:codex` 专题文档
  - 从总览、clean-room、结构化 init、返回契约、脚本契约、failure taxonomy 到测试方案
- `research/`
  - 偏研究与方法文档
  - 用于路线判断、外部资料校准、工具链取舍
- `guides/`
  - 偏面向读者的说明型文档

## 目录

- [agent-interrupt-interaction/README.md](agent-interrupt-interaction/README.md)
- [agent-interrupt-interaction/codex.md](agent-interrupt-interaction/codex.md)
- [agent-interrupt-interaction/claude-code.md](agent-interrupt-interaction/claude-code.md)
- [agent-interrupt-interaction/skill.md](agent-interrupt-interaction/skill.md)
- [agent-interrupt-interaction/langchain.md](agent-interrupt-interaction/langchain.md)
- [isolated-context-run-codex/README.md](isolated-context-run-codex/README.md)
- [research/capability-skill-dev-toolchain-research.md](research/capability-skill-dev-toolchain-research.md)
- [research/research-source-method.md](research/research-source-method.md)
- [research/skill-dev-tool-options.md](research/skill-dev-tool-options.md)
- [guides/how-to-get-ai.md](guides/how-to-get-ai.md)

## 约定

- 专题型文档优先收进子目录，不再长期平铺在 `docs/` 根目录。
- 同一专题内优先提供一个 `README.md` 作为入口，而不是要求读者自己猜阅读顺序。
- 跨文档链接一律使用仓库内相对路径，不写本机绝对路径。
- runtime 入口或测试入口新增时，要同步在对应专题 `README.md` 或脚本 `README.md` 中注明，不要只留设计文档。

## 开发校验

- 文档改动也属于开发改动，提交前至少执行 `npm run lint`。
- 如果改动同时影响 queue、skill 契约或 integration-test suite，再补跑 `npm run check`。
- 需要完整交付校验时，统一执行 `npm run verify`。
- 对非显然约束、术语边界和执行限制要补注释或说明，不要只留下结论句。
