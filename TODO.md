# TODO

## 新 Session 提示

### repo skills 向子载体剧透风险排查

#### 背景

- 仓库里的 repo `skills/` 可能会被挂载到子载体视图里，例如 `isolated-context-run:subagent`、`isolated-context-run:codex`。
- 这意味着子载体不只是执行一个局部任务，还可能“看到”其他 repo skills。
- 风险点不在于“能不能看到”，而在于：
  - 本该由 main / 父层决定的 runner 选择、fallback 决策、验证推导、上下文解释，是否被子载体提前感知并接管。
  - 测试夹具或 skill 文档是否把 main-only 信息提前泄露给 subagent / sub-cli。

#### 已有收口

- `integration-tests/README.md` 已经规定：`subagent.md` 只放发给执行 agent 的输入与执行约束。
- `integration-tests/isolated-context-run-subagent/README.md`、`integration-tests/isolated-context-run-codex/README.md`、`integration-tests/claude-p-watch/README.md` 已同步这条规则。
- 主代理专用的验证理由、watch 次数换算、维护者侧推导、验收计算规则，应放在 `main-agent-assert.md`，通常写在 `## Assert Notes`。

#### 给新 session 的提示词

```text
请检查这个仓库里 repo `skills/` 被挂载到子载体（例如 `isolated-context-run:subagent`、`isolated-context-run:codex`）后的“主代理决策被子载体提前接管 / 剧透”的风险。

目标：
1. 找出当前有哪些路径会把 repo skills 暴露给子载体。
2. 判断是否存在本该由 main skill / main agent 决定的事情，被 subagent 或 sub-cli 提前感知并处理的风险。
3. 如果有风险，直接在仓库里修复。
4. 同步更新相关协议文档和测试说明。
5. 结束前跑对应校验，至少 `npm run lint`。

要求：
- 先做代码和文档层面的事实排查，再改。
- 重点看：
  - `skills/isolated-context-run-subagent/`
  - `skills/isolated-context-run-codex/`
  - `skills/isolated-context-run-codex/scripts/skill-loading.mjs`
  - `integration-tests/`
- 特别关注：
  - `skill_entries` / repo skill bundle 挂载
  - `subagent.md` 是否泄露 main-agent-only 信息
  - 子层 skill 是否重新做了本该由父层处理的 runner 选择、fallback 决策、验证推导
- 不要只给分析，能改就直接改。
- 改完后说明：
  - 风险点有哪些
  - 你做了什么收敛
  - 跑了哪些校验，结果是什么
```

## 背景与资料参考

### 当前路线判断

- 仓库总路线采用 “B 为主，局部吸收 C”。
- 在本仓库里，这句话的具体含义是：`skill = artifact / frontdoor`，`adapter / carrier / harness = runtime`。
- 不继续把开发中的能力做成“全 skill 化的完整运行体”。
- 只有当某一层明确需要状态、外部接口、真实执行、批量调度或稳定可观测性时，才把这部分职责下沉到 carrier、script、CLI 或 harness。

### 为什么这样排

- 本仓库的核心资产首先是可审计、可迁移、可版本化的能力包，这一层更适合由 skill 承载。
- 当前行业里更稳定的公开模式不是“skill 吞掉全部运行时”，而是分层协作：
  - skill：知识、流程、触发语义、轻量入口
  - subagent：隔离上下文、专门角色
  - MCP / plugin / CLI adapter：外部工具、状态、接口
  - eval / sandbox harness：评测、trace、批量回归、隔离运行
- 因此 `TODO.md` 的阶段顺序按“先定对象模型与边界，再补样本和契约，再接执行层，最后做 live / batch”组织，避免 runtime 设计反过来挤压 skill 边界。

### 这份 TODO 要保留的架构落点

- `isolated-context-run`：保留为父层 frontdoor skill。
- `isolated-context-run:subagent`：保留为独立子层，负责当前会话内原生 subagent 路径。
- `isolated-context-run:codex`：重新评估为 Codex 真实宿主执行、trace 采集与宿主级验证的前置必要子层。
- `claude`、`opencode`：当前仍停留在父层内部最小 adapter，暂不预建完整子 skill。
- `recall-eval`：保留为 `recall-queue-policy` / evaluator contract。
- `recall-evaluator`：承接 `run / score / report / live / batch / persistence` 的脚本、CLI 与 harness 运行层。

### 资料参考

- 本地研究总纲：
  - `docs/research/capability-skill-dev-toolchain-research.md`
  - 重点看第 3 节“现有工具版图”、第 5 节“Capability Dev Kit”、第 8 节“建议的实施顺序”、第 9 节“最终判断”。
  - 核心判断：当前缺的不是单一“大框架”，而是围绕 `Artifact + Injection Adapter + Eval Harness + Sandbox Harness` 的最小 Capability Dev Kit。
- 本仓库当前契约与运行入口：
  - `skills/isolated-context-run/SKILL.md`
  - `skills/isolated-context-run/EXAMPLES.md`
  - `skills/isolated-context-run-subagent/SKILL.md`
  - `skills/isolated-context-run-subagent/EXAMPLES.md`
  - `skills/recall-eval/SKILL.md`
  - `skills/recall-eval/EXAMPLES.md`
  - `skills/recall-evaluator/README.md`
  - `skills/recall-evaluator/scripts/run-eval.mjs`
  - `skills/recall-evaluator/scripts/run-iitest.mjs`
  - `tests/recall-eval.test.mjs`
  - `integration-tests/recall-eval/README.md`
  - `integration-tests/recall-eval/real-host.trigger.test.mjs`
- 外部参考按层分组：
  - Artifact / skill 规范：
    - Agent Skills overview / specification
    - OpenAI Codex skills / config reference
    - Claude Code skills / slash commands
  - Host injection / carrier / role 分层：
    - Claude Code subagents
    - Claude Code MCP
    - Inspect AI Agent Bridge
  - Prompt / evaluator 评估层：
    - Promptfoo Evaluate Coding Agents
    - Promptfoo Agent Skill
    - Promptfoo MCP Server
    - Langfuse evaluation / prompt management
    - Braintrust evaluation / datasets
  - Agent / sandbox / trace 评估层：
    - Inspect AI sandboxing
    - Inspect AI scorers
    - Inspect AI agent evaluation docs
- 参考用途说明：
  - Agent Skills、Codex、Claude Code 文档用于确定 artifact、宿主注入、subagent / MCP 分工。
  - Promptfoo、Langfuse、Braintrust 用于校准 `recall-evaluator` 应落在哪一层，以及评测/回归应如何与 skill 解耦。
  - Inspect AI 用于校准 carrier、sandbox、trace、agent bridge 这类“真实运行与系统级评估”职责不应继续堆回 skill。

### 使用说明

- 下面的阶段性任务默认继承上述路线判断。
- `integration-tests/` 下的 YAML、Markdown、fixture、脚本与 `.test.mjs` 一律按真实集成测试资产管理，不再按“仅说明”或“仅 smoke”降级理解。
- 若某次交付中 `npm run verify` 被用户主动中断，不得宣称“全量仓库回归已完成”；应明确记录为“局部验证已通过，完整 verify 待补跑”。
- 如果后续出现与本章冲突的新任务，应优先先改这里的判断依据，再调整具体条目，避免 TODO 只剩任务名而失去上下文。

## P0 架构定向与边界

### isolated-context-run

- [x] 统一输出协议，解决“固定 5 段”与 `self-cli` 场景额外 `Minimal Template` 的冲突。
  done when: `SKILL.md` 与 `EXAMPLES.md` 都明确采用“5 个核心段落 + 可选扩展块”；`Execution Template`、`Install Guidance`、`Failure Detail` 只作为扩展块出现，不再被写成固定第 6 段。
  depends on: none

- [x] 为 `mode override`、`unavailable vs environment failure`、`missing command remediation` 补齐最小可验证样例，不再只覆盖 `default_priority`。
  done when: 至少有对应 fixture 或自测 case 覆盖这 3 类规则，且规则名称与文档描述一一对应。
  depends on: 统一输出协议

- [x] 明确 `isolated-context-run` 的父层职责与统一结果骨架。
  done when: `isolated-context-run` 被固定为 frontdoor skill；父层只负责默认优先级、override 解释、carrier 选择与路由、统一输出；不承载具体 carrier 执行细节；父层与子层复用同一结果骨架。
  depends on: 统一输出协议

- [x] 落地 `isolated-context-run:subagent` 的第一阶段独立子层边界。
  done when: `subagent` 子层只负责 probe、execution、subagent 特有错误分类、结果归一化；且第一阶段唯一允许独立出去的 carrier 是 `subagent`。
  depends on: 父层职责与统一结果骨架

- [x] 将 `codex` 从父层内部最小 adapter 重新评估为前置必要子层 `isolated-context-run:codex`。
  done when: `codex` 子层独立承接 Codex 宿主下的 probe、execution、failure taxonomy、trace 采集与结果归一化；父层不再只以 `self-cli -> codex exec` 或 `mode=codex-exec` 的最小映射承载这条真实宿主路径。
  depends on: 父层职责与统一结果骨架

- [x] 固定 `isolated-context-run:codex` 的专项设计文档集合。
  done when: 至少存在并互相引用 `docs/isolated-context-run-codex/clean-room-design.md`、`docs/isolated-context-run-codex/structured-init-design.md`、`docs/isolated-context-run-codex/exec-v0-contract.md`、`docs/isolated-context-run-codex/probe-run-exec-contract.md`、`docs/isolated-context-run-codex/failure-taxonomy.md`、`docs/isolated-context-run-codex/test-plan.md`；主文档保持总览角色，不再回流实现细节。
  depends on: `codex` 重新评估为前置必要子层

- [x] 按方案 A 固定 `probe.mjs` / `run-exec.mjs` 的脚本契约。
  done when: 两个脚本都明确采用“结构化 JSON 输入 -> stdout JSON 输出”；业务失败进入输出 JSON，脚本退出码只用于请求不合法或脚本内部异常；`run-exec.mjs` 直接产出 `codex-exec-v0-contract`。
  depends on: `codex` 重新评估为前置必要子层

- [x] 固定 `failure.kind/reason` 的 v0 判定表。
  done when: `failure.kind` 只使用 `unavailable`、`environment_failure`、`contract_failure`、`runner_misconfiguration`；`reason` 统一为稳定 `snake_case` 代码；`unsupported_extra_args` 一类请求非法问题不进入业务 failure。
  depends on: 按方案 A 固定 `probe.mjs` / `run-exec.mjs` 的脚本契约

- [x] 固定 `probe.mjs` / `run-exec.mjs` 的测试分层。
  done when: 文档与后续实现统一采用 `unit / cli / harness` 三层；黑盒 CLI 测试基线固定为 fake `codex` 注入 `PATH`；不把真实 Codex 宿主纳入第一阶段阻塞测试层。
  depends on: 按方案 A 固定 `probe.mjs` / `run-exec.mjs` 的脚本契约；固定 `failure.kind/reason` 的 v0 判定表

- [x] 增加 `workspace-link` 默认链与正式真实测试门槛。
  done when: `clean-room` 默认优先走 `workspace-link`，失败时仅在隐式默认链下回退到 `git-worktree`；显式 `workspace-link` 请求不允许静默降级；至少有 2 条阻塞真实测试分别覆盖 `tmp HOME + workspace-link` 的真实 Codex 运行，以及挂载完整 `isolated-context-run` skill 视图后的真实运行。
  depends on: 固定 `probe.mjs` / `run-exec.mjs` 的测试分层

- [x] 保留 `claude`、`opencode` 为父层内部最小 adapter。
  done when: `claude`、`opencode` 继续作为父层内部 adapter 存在，只覆盖最小 probe、最小调用模板、缺失命令提示；在出现与 Codex 同级的真实宿主执行与 trace 验证诉求前，不承诺外部可寻址子 skill。
  depends on: 父层职责与统一结果骨架

- [x] 明确 carrier 升级为独立子 skill 的准入规则。
  done when: 只有出现明确独立演进价值、且超出父层最小 adapter 能力边界的 carrier，才从父层迁出；当前 `codex` 已因真实宿主执行与 trace 验证需要而满足迁出条件，其余 carrier 暂不提前建立完整子 skill。
  depends on: `subagent` 第一阶段独立子层边界；父层内部最小 adapter

### recall-eval

- 验证分层说明：
  - 契约层：schema / integrity / `source_ref` / `medium` / `carrier` / `score_rule` / 输出骨架
  - runtime 层：`recall-evaluator` 脚本、carrier adapter、initialized-workspace harness
  - 真实宿主层：Codex 原生加载 `skills/recall-eval` 后，对自然语言输入的 should-trigger / should-not-trigger / refusal 行为验证，并要求结果 + trace 双证据
  - 完成标准：前两层只证明实现没坏；`recall-eval` 是否阶段完成，以真实宿主层是否通过为准

- [x] 将 `recall-eval` 明确拆分为 `recall-queue-policy` 与 `recall-evaluator` 两层。
  done when: `recall-eval` 只负责 queue contract、`source_ref`、`medium`、`carrier`、拒绝规则、输出骨架；`run/score/report/live/batch/persistence` 归入独立 `recall-evaluator`；目录、文档、脚本与测试职责命名一致。
  depends on: none

- [x] 明确默认 queue fallback 策略；在 `memory` 目录落地前，不把 `<memory-target>/.recall/queue.yaml` 这类示例路径当作当前可直接运行的默认值。
  done when: `SKILL.md`、`EXAMPLES.md`、脚本说明中的默认路径描述一致，并明确当前只接受显式 yaml 路径或目标旁真实 queue；缺少默认 queue 时会清晰报错或拒绝。
  depends on: `recall-eval` 两层拆分

### guardrails

- [x] 写清当前阶段的两条非目标：不为每个 carrier 预建完整子 skill；不让 `recall-eval` 直接承担 live runtime、状态持久化、批量调度与外部接口职责。
  done when: `TODO.md`、相关 skill 文档和脚本说明统一使用“skill = artifact/frontdoor，adapter/carrier/harness = runtime”的表述，不再把 skill 写成完整运行体。
  depends on: `isolated-context-run` 父层职责；`recall-eval` 两层拆分

## P1 契约、fixture 与真实样本

### isolated-context-run

- [ ] 补一张 `codex`、`claude`、`opencode` 的官方安装入口简表。
  done when: 文档里能直接看到 3 个宿主 CLI 的安装入口，不需要再从示例反推。
  depends on: 统一输出协议

- [x] 增加一个 auth / network / provider / sandbox 场景的环境失败样例，且不要把它写成 `unavailable`。
  done when: 文档或样例明确区分“能力不存在”和“能力存在但环境失败”，并有至少 1 个环境失败案例。
  depends on: 统一输出协议

### recall-eval

- [x] 增加一个缺少顶层 `source_ref` 的 broken fixture。
  done when: fixture 可被现有校验脚本识别，并产出稳定的缺陷报告。
  depends on: 明确默认 queue fallback 策略

- [x] 增加一个 `score_rule` 结构非法的 broken fixture。
  done when: fixture 可被现有校验脚本识别，并明确报出 `score_rule` 结构问题。
  depends on: 明确默认 queue fallback 策略

- [x] 增加一个缺少 `expected.must_include` 的 broken fixture。
  done when: fixture 可被现有校验脚本识别，并明确报出 `expected.must_include` 缺失。
  depends on: 明确默认 queue fallback 策略

- [x] 增加一个真实指向仓库根 `AGENTS.md` 的 fixture。
  done when: fixture 使用真实 `source_ref` 指向仓库根 `AGENTS.md`，并可被现有脚本读取与解析。
  depends on: 明确默认 queue fallback 策略

### coverage

- [x] 给仓库根 `AGENTS.md` 补一份真实 `.recall/queue.yaml`。
  done when: 仓库根存在与 `AGENTS.md` 配套的真实 recall queue，且路径布局与 skill 目录旁 queue 约定一致。
  depends on: 明确默认 queue fallback 策略

- [ ] 除 `isolated-context-run` 外，至少给一个非平凡 skill 补一份真实 `.recall/queue.yaml`。
  done when: 至少 1 个非平凡 skill 有真实 queue，并能覆盖不止一个简单顺序问答边界。
  depends on: 明确默认 queue fallback 策略

## P2 adapter / harness 接线

### carrier adapter

- [x] 在 carrier adapter 层补 `isolated-context-run:subagent` 的 host-injected 调用桥原型。
  done when: `recall-evaluator` 可通过 adapter 层接入 `isolated-context-run:subagent`，支持请求模板、失败归类、命令桥接与响应归一化；调用桥职责停留在 adapter 层，不回流到父层 skill。
  depends on: `isolated-context-run:subagent` 第一阶段独立子层边界；`recall-eval` 两层拆分

### integration

- [x] 把 `integration-tests/recall-eval/` 从静态 fixture 层接到 `recall-evaluator` 的 runtime runner 入口。
  done when: integration-tests 能驱动 `run-iitest` / harness runner 入口，覆盖初始化 workspace、任务阶段、recall 阶段与评分；这一层仍属于 runtime integration，不作为 skill 真实宿主验证的完成证明。
  depends on: `recall-eval` 两层拆分；明确默认 queue fallback 策略

- [x] 增加 carrier 失败上报的集成覆盖。
  done when: 至少 1 条集成测试覆盖 carrier 存在但执行失败的上报路径，且失败归因落在 adapter / harness 层而不是 skill 契约层。
  depends on: 环境失败样例；真实 runner integration-tests 接入

- [x] 为 `isolated-context-run:codex` 增加 `unit / cli / harness` 三层测试。
  done when: 至少有 `tests/codex-runner.lib.test.mjs`、`tests/codex-runner.probe.test.mjs`、`tests/codex-runner.run-exec.test.mjs`、`integration-tests/codex-runner.harness.test.mjs`；并覆盖 fake `codex` 的 `probe_ok`、`probe_missing`、`run_ok`、`run_auth_failed`、`run_bad_jsonl` 五种最小行为集。
  depends on: 固定 `probe.mjs` / `run-exec.mjs` 的测试分层

- [x] 增加 queue-level 与 case-level `source_ref` 混用场景的集成覆盖。
  done when: 至少 1 条集成测试同时覆盖 queue 默认值和 case override 的解析结果。
  depends on: 真实 runner integration-tests 接入

### real host validation

- [x] 建立以 Codex 为主的 `recall-eval` 真实宿主验证。
  done when: 真实 Codex 宿主在原生加载 `skills/recall-eval` 的前提下，依托 `isolated-context-run:codex` 提供的宿主执行与 trace 能力，至少覆盖 should-trigger、should-not-trigger、broken queue refusal 三类 case，且每条 case 同时满足最终回答断言与可观测 trace 断言；不得通过本地 `skills/recall-evaluator/scripts/*.mjs` 伪装为真实宿主通过。
  depends on: `isolated-context-run:codex` 前置落地；`recall-eval` 两层拆分；默认 queue fallback 策略；runtime runner integration-tests 接入

- [x] 将 `npm run test:recall-real` 固定为 `recall-eval` reopen 的显式真实宿主阻塞入口。
  done when: `test:recall-real` 直接执行 `integration-tests/recall-eval/real-host.trigger.test.mjs`，不静默跳过；`recall-eval` 重新开放前必须与 `test:codex-real` 一起通过。
  depends on: 建立以 Codex 为主的 `recall-eval` 真实宿主验证

## P3 live run 与批量评测

### recall-evaluator

- [x] 为 `recall-evaluator` CLI / harness 增加 live 模式，让它能通过已解析的 carrier 获取模型真实回答，而不是只对预先提供的答案打分。
  done when: live 执行入口能区分“打分已有答案”和“获取真实回答后再打分”两种模式，且运行责任归属 `recall-evaluator` 而不是 `recall-eval` skill。
  depends on: P0 全部完成；`isolated-context-run:subagent` 调用桥；真实 runner integration-tests 接入

- [x] 定义一份稳定的 recall request contract，包含 `source_ref`、case `question`、carrier 约束，以及“只能依据目标提示词回答”的指令。
  done when: live request 已固定为共享 JSON contract，至少包含 `source_ref`、`question`、`carrier`、`case_id`、`medium`；文档、测试、命令桥与 harness 输入统一复用这一份契约，不回退为当前会话本地执行。
  depends on: live 模式

- [x] 持久化 run 产物，保证可复现：`queue` 路径、`case id`、`source_ref`、`carrier`、原始回答、`score`、`rationale`、`timestamp`、`run id`。
  done when: 每次 live 执行都能落盘完整运行记录，且后续可按 `run id` 回看。
  depends on: live 模式；稳定 request contract

- [x] 支持不传 `--case` 直接跑完整个 queue，并支持跨多个 target 的批量执行。
  done when: evaluator CLI 能按单 case、整 queue、跨 target 三种粒度执行，并输出可区分的汇总结果。
  depends on: 持久化 run 产物

- [x] 增加对目标旁 `.recall/queue.yaml` 的目录发现能力。
  done when: 给定 target 时，系统能自动发现同级 `.recall/queue.yaml`，并在缺失时返回清晰错误。
  depends on: 支持整 queue/批量执行

## Blocked / External Dependencies

### recall-eval

- [ ] 增加一个真实指向 `memory` 提示词源的 fixture。
  status: blocked
  blocked by: `memory` 目录落地
  done when: fixture 指向真实 memory prompt 源，并能通过现有 schema / `source_ref` 校验。

### coverage

- [ ] 补上 `memory/.recall/queue.yaml`。
  status: blocked
  blocked by: `memory` 目录落地
  done when: `memory` 目录旁存在真实 recall queue，且可纳入统一发现与验证流程。
