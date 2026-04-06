# integration-tests

`integration-tests/` 用来放置高副作用、宿主相关或需要真实隔离上下文的集成测试资产。它和 `tests/` 下的快回归不同：这里允许出现真实 clean-room、宿主探测、Markdown 提示词用例、YAML orchestration suite 等更贴近运行时边界的检查。

本目录只描述测试入口、执行协议和维护约束，不替代各子系统自己的 schema、runtime 或专题设计文档。

## 测试方式

### 1. Node `.test.mjs` 集成测试

适用场景：

- 修改 clean-room、workspace-link、git-worktree、artifact 持久化等 runtime 行为
- 修改 Codex runner 探测、执行链路、真实宿主交互

当前入口：

- `integration-tests/codex-runner.harness.test.mjs`
- `integration-tests/codex-runner.real.test.mjs`

对应命令：

- `npm run test:codex-harness`
- `npm run test:codex-real`
- `npm test`

说明：

- `npm test` 会从 `tests/` 和 `integration-tests/` 一起收集 `.test.mjs`
- `test:codex-harness` 偏向可控环境下的 runtime/harness 集成覆盖
- `test:codex-real` 会触达真实 Codex 宿主路径，适合需要验证真实环境时使用

更多背景见：

- [isolated-context-run-codex/README.md](./isolated-context-run-codex/README.md)
- [../docs/isolated-context-run-codex/README.md](../docs/isolated-context-run-codex/README.md)

### 2. Markdown case 集成测试

适用场景：

- 修改 `isolated-context-run` 父层输出骨架或 runner 选择语义
- 修改 `isolated-context-run:subagent` / `isolated-context-run:codex` 的提示词契约
- 调整 `Selected Runner`、`Why`、`Override`、`Install Guidance` 等面向用户的结构化输出

当前目录：

- `integration-tests/isolated-context-run-subagent/`
- `integration-tests/isolated-context-run-codex/`

执行协议：

1. 读取 case 目录下的 `subagent.md`
2. 提取 `## Input`
3. 提取 `## Execution Constraints`
4. 用 `Input + Execution Constraints` 组成实际执行请求
5. 在隔离 agent / subagent 运行中执行该请求
6. 读取返回的纯文本结果
7. 对照 `main-agent-assert.md` 中的 `Assert Must Include` / `Assert Must Not Include` 做字面断言

维护约束：

- 这是协议说明，不表示仓库当前已经提供统一的自动化 npm script
- 这类 case 默认先跑 minimal pass
- 如果只差结构或字面片段，再做一次 targeted tightening pass
- 如果 minimal pass 加一次 targeted tightening pass 之后仍不满足断言，应标记为 `prompt unresolved`

详细协议见：

- [isolated-context-run-subagent/README.md](./isolated-context-run-subagent/README.md)
- [isolated-context-run-codex/README.md](./isolated-context-run-codex/README.md)

### 3. YAML orchestration / fixture 集成测试

适用场景：

- 修改 recall orchestration、队列装载、workspace assert、scoring 逻辑
- 修改 `integration-tests/recall-eval/*.test.yaml` 的 suite 契约
- 修改 `.recall/` 队列数据、fixture 引用或 executor bridge

当前目录：

- `integration-tests/recall-eval/`
- `integration-tests/recall-eval/*.test.yaml`

相关命令：

- `npm run check`
- `npm run check:fixtures`
- `npm run recall:iitest`

说明：

- `npm run check` / `npm run check:fixtures` 负责 fixture 与 suite 契约校验
- `npm run recall:iitest` 对应 recall integration runner，适合实际驱动 YAML suite
- 这类 YAML 文件是 orchestration 层集成资产，不是 schema source of truth

详细协议见：

- [recall-eval/README.md](./recall-eval/README.md)

## 怎么选

- 修改 runtime / clean-room / Codex runner：
  先跑 `npm run test:codex-harness`；需要真实宿主证据时再跑 `npm run test:codex-real`
- 修改 Markdown prompt contract：
  优先查看 `integration-tests/isolated-context-run-subagent/` 与 `integration-tests/isolated-context-run-codex/`，按各自 README 的协议执行 case
- 修改 recall orchestration / queue / fixture：
  先跑 `npm run check:fixtures`，再按需要跑 `npm run recall:iitest`
- 需要完整仓库交付校验：
  按仓库默认顺序补齐 `npm run lint`、`npm run check`，必要时再跑 `npm run verify`

## 默认校验顺序

默认本地校验顺序与仓库约定保持一致：

1. 先跑与本次改动直接相关的局部检查
2. 再跑 `npm run lint`
3. 如果改动影响 fixture、契约或 orchestration，再跑 `npm run check`
4. 需要完整交付校验时跑 `npm run verify`

## 边界说明

- 本目录 README 只负责说明测试入口和协议
- 各子目录 README 仍是对应测试类型的直接维护说明
- schema source of truth、runtime 设计和专题方案应继续放在各自模块文档中，不要反向堆回这里
