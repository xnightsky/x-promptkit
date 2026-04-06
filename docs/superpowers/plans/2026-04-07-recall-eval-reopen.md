# Recall Eval Reopen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `recall-eval` 收口到可重新开放的完成态：职责拆分完成，强制规则稳定，runtime 与集成测试补齐，真实 Codex 宿主验证通过，并补上 live 执行模式。

**Architecture:** 保持 `recall-eval = recall-queue-policy / evaluator contract`，把运行职责明确迁到 `recall-evaluator`。先做目录和契约收口，再补 runtime 集成缺口，随后接入真实 Codex 宿主验证，最后补 live 模式并跑完整校验。整个实现不把 skill 再次做成完整运行体。

**Tech Stack:** Node.js ESM, `node:test`, YAML fixtures, Codex runner (`skills/isolated-context-run-codex`), repo tooling (`lint`, `check`, `verify`)

---

## Scope

本计划一次性完成下面 5 类工作：

1. `recall-eval` / `recall-evaluator` 两层拆分
2. runtime 脚本与 npm 入口迁移
3. `carrier` 失败上报与 `source_ref` 混用集成覆盖
4. 基于真实 Codex 宿主的 `should-trigger` / `should-not-trigger` / `broken queue refusal` 验证
5. `recall-evaluator` live 模式与完整回归校验

本计划不包含：

- `batch` / `persistence` / 多 target 批量执行
- `memory` 目录相关 blocked 项
- 与 reopen 无关的额外 skill 扩张

## File Map

### 现有文件

- `skills/recall-eval/SKILL.md`
- `skills/recall-eval/EXAMPLES.md`
- `skills/recall-eval/.recall/*.yaml`
- `skills/recall-eval/SAMPLE-QUEUE.yaml`
- `skills/recall-eval/scripts/*.mjs`
- `skills/recall-eval/scripts/README.md`
- `tests/recall-eval.lib.test.mjs`
- `tests/recall-eval.carrier-adapter.test.mjs`
- `tests/recall-eval.test.mjs`
- `tests/recall-eval.iitest-lib.test.mjs`
- `tests/recall-eval.iitest-runner.test.mjs`
- `integration-tests/recall-eval/*.yaml`
- `integration-tests/recall-eval/README.md`
- `integration-tests/codex-runner.real.test.mjs`
- `scripts/tooling/check-fixtures.mjs`
- `scripts/tooling/lint-repo.mjs`
- `package.json`
- `TODO.md`

### 目标文件布局

- 保留 `skills/recall-eval/` 仅承载 policy / contract / fixture / example
- 新建 `skills/recall-evaluator/` 承载 runtime 文档与脚本
- 测试文件继续保留当前命名，但导入路径改为 `skills/recall-evaluator/scripts/*`
- `integration-tests/recall-eval/` 继续保留为 orchestration 层

## Chunk 1: 边界与目录收口

### Task 1: 建立 `recall-evaluator` 目录并迁移 runtime 入口

**Files:**
- Create: `skills/recall-evaluator/README.md`
- Create: `skills/recall-evaluator/scripts/lib.mjs`
- Create: `skills/recall-evaluator/scripts/carrier-adapter.mjs`
- Create: `skills/recall-evaluator/scripts/validate-schema.mjs`
- Create: `skills/recall-evaluator/scripts/resolve-target.mjs`
- Create: `skills/recall-evaluator/scripts/run-eval.mjs`
- Create: `skills/recall-evaluator/scripts/iitest-lib.mjs`
- Create: `skills/recall-evaluator/scripts/run-iitest.mjs`
- Modify: `package.json`
- Modify: `scripts/tooling/check-fixtures.mjs`
- Modify: `scripts/tooling/lint-repo.mjs`

- [ ] **Step 1: 建立新目录骨架**

创建 `skills/recall-evaluator/README.md` 与 `scripts/` 目录，README 明确声明：
- runtime 归属 `recall-evaluator`
- `recall-eval` 不承载 live runtime
- 校验顺序使用 `npm run lint`、`npm run check`、`npm run verify`

- [ ] **Step 2: 迁移运行脚本到新目录**

将下列脚本从 `skills/recall-eval/scripts/` 迁移到 `skills/recall-evaluator/scripts/`：
- `lib.mjs`
- `carrier-adapter.mjs`
- `validate-schema.mjs`
- `resolve-target.mjs`
- `run-eval.mjs`
- `iitest-lib.mjs`
- `run-iitest.mjs`

要求：
- 所有 usage 文案更新为 `skills/recall-evaluator/scripts/...`
- 注释同步说明 policy/runtime 边界
- 不改变既有 CLI 参数语义

- [ ] **Step 3: 更新 npm 与 repo tooling 引用**

修改 `package.json`：
- `recall:validate`
- `recall:resolve`
- `recall:run`
- `recall:iitest`

修改 `scripts/tooling/check-fixtures.mjs` 与 `scripts/tooling/lint-repo.mjs`：
- import 新路径
- policy 文档检查项改为 `skills/recall-evaluator/README.md`

- [ ] **Step 4: 保留兼容层或一次性改全**

二选一，只选一种：
- 推荐：一次性改全仓库引用，不保留旧脚本壳
- 备选：旧路径保留极薄转发壳，并在 README 标记 deprecated

执行时优先选择“一次性改全”，避免双入口漂移。

- [ ] **Step 5: 运行本阶段回归**

Run:
```bash
npm run test:recall-unit
npm run test:recall-bridge
npm run test:recall-cli
npm run test:recall-harness
```

Expected:
- 所有 `recall` 测试通过
- 不再存在仓库代码引用旧的 `skills/recall-eval/scripts/`

### Task 2: 收口 policy 文档和待办状态

**Files:**
- Modify: `skills/recall-eval/SKILL.md`
- Modify: `skills/recall-eval/EXAMPLES.md`
- Modify: `skills/recall-eval/SAMPLE-QUEUE.yaml` if needed
- Modify: `TODO.md`

- [ ] **Step 1: 更新 `SKILL.md` 的 runtime 引用**

把入口命令、职责描述、限制说明改成：
- `recall-eval` 只定义 queue contract
- evaluator 入口位于 `skills/recall-evaluator/scripts/`
- live / batch / persistence 明确不在 skill 层

- [ ] **Step 2: 更新 `EXAMPLES.md`**

把所有脚本路径、示例命令、边界说明切到 `recall-evaluator`。

- [ ] **Step 3: 更新 `TODO.md`**

完成后回填这些条目：
- `recall-eval` 两层拆分
- guardrails 中 skill/runtime 表述统一

- [ ] **Step 4: 运行文档与 fixture 检查**

Run:
```bash
npm run check
npm run lint:docs
npm run lint:repo
```

Expected:
- fixture 检查通过
- 文档不再引用错误路径

## Chunk 2: runtime 集成缺口补齐

### Task 3: 补 `carrier` 失败上报的集成覆盖

**Files:**
- Modify: `integration-tests/recall-eval/README.md`
- Create: `integration-tests/recall-eval/carrier-execution-failure.test.yaml`
- Modify: `tests/recall-eval.iitest-runner.test.mjs`
- Modify: `tests/recall-eval.carrier-adapter.test.mjs`

- [ ] **Step 1: 定义 carrier 执行失败 suite**

新增 `carrier-execution-failure.test.yaml`，要求：
- queue 指向有效 queue
- task 阶段可以成功
- recall 阶段通过 executor 返回失败或非零退出
- 断言失败归因落在 runtime / adapter 层，不落到 queue integrity

- [ ] **Step 2: 在 harness 测试中覆盖失败路径**

给 `tests/recall-eval.iitest-runner.test.mjs` 增加 case：
- task 成功
- recall executor 失败
- 输出包含 `runtime failures`
- `Integrity Check` 保持 pass

- [ ] **Step 3: 保持 adapter 失败归因稳定**

在 `tests/recall-eval.carrier-adapter.test.mjs` 里补命令桥失败细分断言，固定失败文本，避免后续漂移。

- [ ] **Step 4: 跑 targeted tests**

Run:
```bash
npm run test:recall-bridge
npm run test:recall-harness
```

Expected:
- 新增失败集成 case 通过
- 失败归因稳定显示为 runtime / environment failure

### Task 4: 补 queue-level / case-level `source_ref` 混用集成覆盖

**Files:**
- Create: `integration-tests/recall-eval/mixed-source-ref.test.yaml`
- Modify: `integration-tests/recall-eval/fixtures/task-memory/.recall/queue.yaml`
- Modify: `tests/recall-eval.iitest-lib.test.mjs`
- Modify: `tests/recall-eval.test.mjs`

- [ ] **Step 1: 准备 mixed-source fixture**

在 queue 中同时保留：
- queue-level `source_ref`
- 至少一个 case-level `source_ref` override

要求集成 suite 能验证 recall 阶段实际使用的是正确的 effective source。

- [ ] **Step 2: 补 lib / cli 断言**

在：
- `tests/recall-eval.iitest-lib.test.mjs`
- `tests/recall-eval.test.mjs`

补充对 mixed-source 解析与输出的断言，确保 unit/cli/integration 三层一致。

- [ ] **Step 3: 跑 targeted tests**

Run:
```bash
npm run test:recall-unit
npm run test:recall-cli
npm run test:recall-harness
```

Expected:
- queue 默认值与 case override 都能稳定解析
- 输出中能区分 effective source

## Chunk 3: 真实 Codex 宿主验证

### Task 5: 为 `recall-eval` 建立真实宿主测试入口

**Files:**
- Create: `integration-tests/recall-eval/real-host.trigger.test.mjs`
- Create: `integration-tests/recall-eval/fixtures/real-host/`
- Create: `integration-tests/recall-eval/fixtures/real-host/AGENTS.md`
- Create: `integration-tests/recall-eval/fixtures/real-host/.recall/queue.yaml`
- Modify: `package.json`
- Modify: `docs/isolated-context-run-codex/test-plan.md`
- Modify: `integration-tests/recall-eval/README.md`

- [ ] **Step 1: 设计真实宿主 fixture**

准备最小 real-host fixture，至少包含：
- 1 条 should-trigger case
- 1 条 should-not-trigger case
- 1 条 broken queue refusal case

每条 case 必须有：
- 最终回答断言
- trace / artifact 断言

- [ ] **Step 2: 复用 Codex clean-room 能力**

参考 `integration-tests/codex-runner.real.test.mjs`：
- 使用 `prepareCodexRunEnvironment`
- 使用 `workspace-link`
- 挂载 `recall-eval` 以及必要的 `isolated-context-run-codex` skill 视图

要求：
- 不直接调用本地 `run-eval.mjs` 伪装真实宿主
- 通过 Codex 原生回答触发或拒绝

- [ ] **Step 3: 写真实宿主断言**

在 `real-host.trigger.test.mjs` 中分别断言：
- should-trigger：回答符合 recall 约束，trace 中可见目标绑定或运行证据
- should-not-trigger：回答不误触 recall，trace 中无错误 recall 执行痕迹
- broken queue refusal：回答明确拒绝，trace 中可见拒绝证据

- [ ] **Step 4: 新增 npm 脚本**

在 `package.json` 新增：
- `test:recall-real`

如需纳入总回归，再把它接入 `verify` 前先评估环境阻塞；默认作为显式阻塞命令，不静默跳过。

- [ ] **Step 5: 运行真实宿主测试**

Run:
```bash
npm run test:codex-real
npm run test:recall-real
```

Expected:
- 本机已具备可用 `codex` CLI 与认证
- `test:codex-real` 通过
- `test:recall-real` 覆盖三类 case 并通过

**Blocking rule:**
如果本机 Codex 宿主不可用或未认证，不得宣称本计划完成。

## Chunk 4: live 模式

### Task 6: 为 `recall-evaluator` 加 live 执行模式

**Files:**
- Modify: `skills/recall-evaluator/scripts/run-eval.mjs`
- Modify: `skills/recall-evaluator/scripts/carrier-adapter.mjs`
- Modify: `skills/recall-evaluator/scripts/lib.mjs`
- Modify: `skills/recall-evaluator/README.md`
- Modify: `skills/recall-eval/SKILL.md`
- Modify: `skills/recall-eval/EXAMPLES.md`
- Modify: `tests/recall-eval.test.mjs`
- Modify: `tests/recall-eval.carrier-adapter.test.mjs`
- Modify: `tests/recall-eval.iitest-runner.test.mjs`

- [ ] **Step 1: 定义 live 模式 CLI**

为 `run-eval.mjs` 增加显式模式：
- 默认：score-only
- 新增：live

推荐参数：
- `--live`
- `--carrier <carrier>`

规则：
- `--answer` / `--answer-file` / `--answers-file` 与 `--live` 互斥
- `--live` 必须经过 carrier 取真实回答

- [ ] **Step 2: 稳定 request contract**

在 `carrier-adapter.mjs` 固定 live request 字段，至少包含：
- `source_ref`
- `question`
- `carrier`
- `case_id`
- `medium`

要求文档、测试、实际桥接输入完全一致。

- [ ] **Step 3: 扩展测试矩阵**

在 `tests/recall-eval.test.mjs` 中覆盖：
- direct answer 模式
- answers-file 模式
- live 模式成功
- live 模式缺 carrier
- live 与 direct input 冲突时报错

在 `tests/recall-eval.carrier-adapter.test.mjs` 中覆盖：
- live 请求模板稳定
- 空响应 / 非零退出 / unsupported carrier

- [ ] **Step 4: 运行 targeted tests**

Run:
```bash
npm run test:recall-bridge
npm run test:recall-cli
npm run test:recall-harness
```

Expected:
- `run-eval` 能区分 score-only 与 live
- 运行责任仍归 `recall-evaluator`

## Chunk 5: 最终文档同步与全量验证

### Task 7: 文档、fixture、README、TODO 一次性收口

**Files:**
- Modify: `skills/recall-eval/SKILL.md`
- Modify: `skills/recall-eval/EXAMPLES.md`
- Modify: `skills/recall-evaluator/README.md`
- Modify: `integration-tests/recall-eval/README.md`
- Modify: `TODO.md`
- Modify: `README.md` and `docs/README.md` if workflow text changes

- [ ] **Step 1: 同步所有命令路径**

全文替换并校对：
- `skills/recall-eval/scripts/...` -> `skills/recall-evaluator/scripts/...`

- [ ] **Step 2: 同步行为契约**

确保以下说法一致：
- `recall-eval` 只负责 policy
- `recall-evaluator` 负责 run / score / report / live
- `integration-tests/recall-eval` 是 runtime integration，不是 skill schema source of truth
- 真实 Codex 宿主验证是 reopen 阻塞门

- [ ] **Step 3: 回填 TODO 完成状态**

完成后勾掉：
- 两层拆分
- carrier 失败上报集成覆盖
- `source_ref` 混用集成覆盖
- 真实宿主验证
- live 模式

### Task 8: 跑完整验证并记录结果

**Files:**
- No code changes required unless validation uncovers issues

- [ ] **Step 1: 跑局部测试**

Run:
```bash
npm run test:recall-unit
npm run test:recall-bridge
npm run test:recall-cli
npm run test:recall-harness
```

- [ ] **Step 2: 跑 Codex 相关测试**

Run:
```bash
npm run test:codex-unit
npm run test:codex-cli
npm run test:codex-harness
npm run test:codex-real
npm run test:recall-real
```

- [ ] **Step 3: 跑仓库校验**

Run:
```bash
npm run lint
npm run check
npm run verify
```

Expected:
- `lint` 通过
- `check` 通过
- `verify` 通过
- 所有新增真实宿主测试通过

## Definition of Done

全部满足才算完成：

- `recall-eval` 与 `recall-evaluator` 职责、目录、文档、脚本命名一致
- runtime 入口已迁移，不再由 `skills/recall-eval/scripts/` 承载主实现
- `carrier` 失败上报集成覆盖已补齐
- queue-level / case-level `source_ref` 混用集成覆盖已补齐
- 真实 Codex 宿主三类 case 通过，且每条都有回答断言与 trace / artifact 断言
- live 模式可用且测试通过
- `npm run lint`、`npm run check`、`npm run verify` 全部通过

## Execution Notes

- 本仓库规则要求先读后写，实施时每个 task 先核对现有实现再改。
- 本计划不包含 `git commit`、`git push`、`branch` 步骤；如需提交，单独确认。
- 对 `skills/` 文档类改动，不强制形式化 fail-first；对 runtime 代码改动，优先补贴近真实行为的测试。
- 若 `test:codex-real` 或 `test:recall-real` 因本机环境不可用失败，应先修环境，不得跳过后宣称完成。
