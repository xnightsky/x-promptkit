# isolated-context-run:codex

这是 `isolated-context-run:codex` 的专题文档目录。

当前仓库中的第一阶段 runtime 实现位于：

- [../../skills/isolated-context-run-codex/scripts/README.md](../../skills/isolated-context-run-codex/scripts/README.md)
- `skills/isolated-context-run-codex/scripts/probe.mjs`
- `skills/isolated-context-run-codex/scripts/run-exec.mjs`
- `tests/codex-runner.*.test.mjs`

当前实现状态补充：

- clean-room 已具备 `prepareCodexRunEnvironment(...)` 与 `cleanupCodexRunEnvironment(...)` 配对接口
- 默认清理只处理当前 runner-managed run root
- 历史遗留的 `run-xxxxx` git worktree 仍需人工精确回收

建议阅读顺序：

1. [research.md](research.md)
2. [skill-loading-design.md](skill-loading-design.md)
3. [clean-room-design.md](clean-room-design.md)
4. [structured-init-design.md](structured-init-design.md)
5. [exec-v0-contract.md](exec-v0-contract.md)
6. [probe-run-exec-contract.md](probe-run-exec-contract.md)
7. [failure-taxonomy.md](failure-taxonomy.md)
8. [test-plan.md](test-plan.md)

## 文档分工

- [research.md](research.md)
  - 总览、边界、分层判断和推进顺序
- [skill-loading-design.md](skill-loading-design.md)
  - skills discovery roots、source classes、`link copy`、冲突优先级、测试入口
- [clean-room-design.md](clean-room-design.md)
  - fake user home、目录模型、环境变量、`workspace_mode`
- [structured-init-design.md](structured-init-design.md)
  - `minimal-seed`、结构化 `init`、`run_local`
- [exec-v0-contract.md](exec-v0-contract.md)
  - `codex exec` 第一阶段返回契约
- [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - 方案 A 下 `probe.mjs` / `run-exec.mjs` 的请求、输出、退出码
- [failure-taxonomy.md](failure-taxonomy.md)
  - `failure.kind/reason` 判定表
- [test-plan.md](test-plan.md)
  - `unit / cli / harness` 三层测试方案

## 相关文档

- [../../TODO.md](../../TODO.md)
- [../research/capability-skill-dev-toolchain-research.md](../research/capability-skill-dev-toolchain-research.md)
- [../research/skill-dev-tool-options.md](../research/skill-dev-tool-options.md)
