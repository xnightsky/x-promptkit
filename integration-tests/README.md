# integration-tests

`integration-tests/` 用来放置集成测试资产。这里的边界不是"是否起子进程"，而是是否验证整个环境、编排链路、workspace/clean-room 生命周期，或是否消耗真实 AI token。

仓库级硬规则：

- `tests/` 只放单元测试
- `integration-tests/` 只放集成测试
- `test:*` 前缀只属于单元测试
- `iitest:*` 前缀只属于集成测试
- `iitest:token:*` 只用于会消耗真实 AI token 的显式集成测试入口
- 消耗真实 token 的集成测试统一命名 `*.token.ittest.mjs`（`.ittest.mjs` 后缀天然不被 `npm run iitest` 批量收集），不要再用 `*.token.test.mjs` 旧命名
- 纯 fake is unit；验证整个环境或消耗真实 token 才是集成测试

本目录只描述测试入口、执行协议和维护约束，不替代各子系统自己的 schema、runtime 或专题设计文档。

## 测试方式

### 1. Node `.test.mjs` 集成测试

适用场景：

- 修改 recall orchestration、队列装载、workspace assert、scoring 逻辑
- 修改 recall-eval 的 YAML suite 契约或 fixture 交互

当前入口：

- `integration-tests/recall-eval/recall-replay.token.ittest.mjs`
- `integration-tests/recall-eval/recall-live.token.ittest.mjs`

对应命令：

- `npm run iitest`
- `npm run iitest:token:recall-replay`
- `npm run iitest:token:recall-live`

说明：

- `npm run iitest` 会收集 `integration-tests/` 下的非 token Node 集成测试；当前没有此类测试，因此按 SKIP 退出 0（空集是有意状态，新增非 token 集成测试后自动恢复收集）
- `iitest:token:*` 会触达真实 provider 并消耗真实 token；无可用 provider 矩阵时自动跳过（self-skip）

### 2. Markdown case 集成测试

适用场景：

- 修改 `dev-run` skill 的后端选择逻辑、命令模板或输出骨架

当前目录：

- `integration-tests/dev-run/`

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
- Markdown case 默认直接用 subagent carrier 执行
- 如果 case 运行依赖 `skill_entries`，只挂当前 case 所需的最小 allowlist
- `subagent.md` 只放会发给执行 agent 的输入与执行约束
- 主代理专用的验证理由与推导放到 `main-agent-assert.md`

详细协议见：

- [dev-run/README.md](./dev-run/README.md)

### 3. YAML orchestration / fixture 集成测试

适用场景：

- 修改 recall orchestration、队列装载、workspace assert、scoring 逻辑
- 修改 recall-eval fixture 引用或 executor bridge

当前目录：

- `integration-tests/recall-eval/`

相关命令：

- `npm run check`
- `npm run check:fixtures`

详细协议见：

- [recall-eval/README.md](./recall-eval/README.md)

## 怎么选

- 修改 `dev-run` skill：
  先跑集成测试 Markdown case（`integration-tests/dev-run/`），验证后端选择与命令骨架
- 修改 recall orchestration / queue / fixture：
  先跑 `npm run check:fixtures`，再按需要跑 recall 相关测试
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
