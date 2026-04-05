# isolated-context-run:codex 设计与调研

- 状态：研究总览 / 决策摘要
- 日期：2026-04-05
- 相关文档：
  - [../../TODO.md](../../TODO.md)
  - [capability-skill-dev-toolchain-research.md](../research/capability-skill-dev-toolchain-research.md)
  - [skill-dev-tool-options.md](../research/skill-dev-tool-options.md)
  - [clean-room-design.md](clean-room-design.md)
  - [structured-init-design.md](structured-init-design.md)
  - [exec-v0-contract.md](exec-v0-contract.md)
  - [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - [failure-taxonomy.md](failure-taxonomy.md)
  - [test-plan.md](test-plan.md)

## 1. 这篇文档回答什么

这篇文档聚焦 `isolated-context-run:codex` 这一条子层，不讨论通用 agent 平台建设。

它现在承担的是总览角色，主要回答：

- `codex exec` 是否应该作为真实 Codex 宿主验证的第一阶段基线
- `isolated-context-run:codex` 与父层 `isolated-context-run` 的边界如何划分
- 为什么 clean runner 会成为这条子层的核心难点
- 哪些设计继续保留在本篇，哪些已经下沉到专项设计文档

专项细化设计已拆到：

- [clean-room-design.md](clean-room-design.md)
  - 负责 fake user home、目录模型、环境变量、`workspace_mode` 和运行产物边界
- [structured-init-design.md](structured-init-design.md)
  - 负责 `minimal-seed` manifest、结构化 `init`、`run_local` 边界与后续 `recall-eval` 接缝
- [exec-v0-contract.md](exec-v0-contract.md)
  - 负责 `codex exec` 第一阶段返回契约、最小证据摘要与 failure 接缝
- [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - 负责方案 A 下 `probe.mjs` / `run-exec.mjs` 的 CLI 契约与脚本边界
- [failure-taxonomy.md](failure-taxonomy.md)
  - 负责 `failure.kind/reason` 的稳定判定表与脚本归因边界
- [test-plan.md](test-plan.md)
  - 负责 `probe.mjs` / `run-exec.mjs` 的 unit、CLI、harness 三层测试方案

本文的核心判断保持不变：

1. `codex exec` / non-interactive 应作为 `isolated-context-run:codex` 的第一阶段基线执行面。
2. 真正难的不是写一个新 skill，而是定义并实现一个可重复、可观测、可裁剪污染面的 Codex clean runner。
3. 当前行业里有不少可复用零件，但没有发现一个“付费即可直接替代本仓库这条语义边界”的现成成品。

## 2. 结论先行

### 2.1 基线选择

截至 2026-04-05，`codex exec` / non-interactive 是最适合作为第一阶段真实宿主验证基线的入口。

原因：

- 它是官方明确提供的非交互入口，适合脚本、CI 和单次任务执行。
- 它支持 `--json` 事件流，能提供最终回答之外的可观测证据。
- 它支持结构化输出、续跑、sandbox 和 approval 相关配置，足够支撑第一阶段验证。
- 相比 `app-server`，它更轻、更容易作为“单条测试 case 的真实宿主执行面”。

### 2.2 边界判断

`isolated-context-run:codex` 不应只等于“把 `mode=codex-exec` 映射成一条命令”。

它应拆成两层：

- skill 层：轻量 frontdoor / artifact，负责触发语义、统一输出骨架、与父层路由对齐
- script / adapter / harness 层：负责 probe、execution、trace、failure taxonomy、clean-room 环境控制

### 2.3 文档分工

本篇保留：

- 基线选择与边界判断
- 父层与子层的接口语义
- 对外输出字面量
- 内部返回契约骨架
- failure taxonomy 骨架
- 对本仓库的推进顺序

本篇不再展开：

- clean-room 目录模型、环境变量与 `workspace_mode`
- `minimal-seed` 与结构化 `init` 的 manifest 设计
- `run_local` 的受控执行边界
- `codex exec` 的 v0 返回契约与最小证据摘要字段
- `probe.mjs` / `run-exec.mjs` 的请求、输出与退出码契约
- `failure.kind/reason` 的具体判定矩阵
- `probe.mjs` / `run-exec.mjs` 的测试分层与 fake codex fixture 方案

这些内容已分别下沉到专项设计文档。

### 2.4 该不该自己做

不应该自己做的：

- 通用 eval 平台
- 通用 trace 工作台
- 通用 dataset / experiment SaaS
- 通用 sandbox bridge 框架

应该自己做的：

- `isolated-context-run:codex` 的宿主语义
- Codex clean runner 契约
- `codex exec --json` 的 trace 归一化
- 与本仓库 `recall-eval` / `carrier adapter` 的接缝

## 3. 为什么以 `codex exec` 为基线

OpenAI 官方当前把 Codex 自动化入口大致分成三类：

- `codex exec` / non-interactive：单次非交互执行
- Codex SDK：程序化自动化、CI、任务管理
- `codex app-server`：深度集成客户端、长连接和 richer protocol

对本仓库而言，第一阶段要解决的是：

- 真实 Codex 宿主执行
- trace 证据采集
- 失败归因
- 与 `recall-eval` 的 runtime 对接

这几个目标都不要求一开始就做长连接客户端，也不要求一开始就做完整任务管理。因此第一阶段最稳的分层是：

- baseline backend：`exec-json`
- 后续扩展 backend：`sdk`
- 高级宿主 backend：`app-server`

这里有一个明确推断：

- 官方文档没有直接写“评测场景默认请用 `codex exec --json`”
- 但官方已经把 non-interactive、SDK、app-server 的职责边界拆开
- 且 app-server 明确更偏深度集成客户端
- 因此把 `exec-json` 作为第一阶段 baseline，是与官方分层一致的保守方案

## 4. 为什么“干净环境”会成为核心问题

如果只在当前机器上直接执行 `codex exec "<prompt>"`，你测到的很可能不是目标 skill，而是“当前用户机器上的 Codex 世界”。

对 `isolated-context-run:codex` 而言，主要污染面至少有下面几类：

### 4.1 指令污染

- 仓库内 `AGENTS.md`
- 可能存在的用户级或系统级默认 instructions
- `model_instructions_file` 一类显式注入

### 4.2 skill 污染

- 当前仓库内 skill
- 父目录或 repo root 可发现的 skill
- 用户目录、admin 目录、system 目录下可发现的 skill
- 被 enable / disable 覆盖的 skill config

### 4.3 plugin / MCP 污染

- 额外已安装 plugin
- 额外 MCP server
- 某些 `required` 依赖导致的启动失败

### 4.4 配置污染

- 用户级 `~/.codex/config.toml`
- 项目级 `.codex/config.toml`
- profile、model、sandbox、approval、history persistence 等默认值

### 4.5 状态与历史污染

- 历史 transcript
- 续跑上下文
- rollout 文件
- 本地缓存、日志、会话目录

### 4.6 认证与网络污染

- ChatGPT 计划态登录
- API key
- CI token / auth.json
- 代理、网络、provider 状态

### 4.7 版本漂移

- Codex CLI 版本
- model alias 漂移
- 默认 reasoning / approval / sandbox 行为变化
- JSON 事件 schema 漂移

结论：

“干净环境”不能只理解成“新建一个临时目录跑命令”。  
它至少要控制：工作目录、home / config、instructions、skills、plugins / MCP、auth 模式、sandbox / approval、trace 落盘和环境指纹。

## 5. `isolated-context-run:codex` 的目标边界

### 5.1 skill 层应该负责什么

`skills/isolated-context-run-codex/` 只负责：

- 说明这是 Codex 宿主路径的独立子层
- 接受父层路由或直接调用
- 固定共享输出骨架
- 对外把所选 runner 语义固定为 `isolated-context-run:codex`
- 解释 override 与 backend 选择的语义
- 告诉调用方 probe / execution / trace / failure normalization 在脚本层

skill 层不负责：

- 具体 shell 命令模板
- `--json` 事件解析
- trace 持久化
- app-server 生命周期
- CI 认证流程
- sandbox 策略实现

### 5.2 脚本层应该负责什么

建议新增目录：

`scripts/isolated-context-run/codex/`

第一阶段建议包含：

- `probe.mjs`
  - 检查 `codex` 是否存在
  - 检查 `exec` / `--json` 能力
  - 收集版本、模型、关键配置指纹
- `run-exec.mjs`
  - 用 `codex exec --json` 执行单次任务
  - 采集 stdout 和 JSONL 事件
- `normalize-trace.mjs`
  - 在 `v0` 里先把原始事件归一化成最小证据摘要与稳定返回字段
- `normalize-failure.mjs`
  - 统一失败归因
- `clean-room.mjs`
  - 生成并约束临时执行环境

第二阶段再考虑：

- `run-sdk.mjs`
- `run-app-server.mjs`

具体 clean-room、结构化 init 与 v0 返回契约见：

- [clean-room-design.md](clean-room-design.md)
- [structured-init-design.md](structured-init-design.md)
- [exec-v0-contract.md](exec-v0-contract.md)
- [probe-run-exec-contract.md](probe-run-exec-contract.md)
- [failure-taxonomy.md](failure-taxonomy.md)
- [test-plan.md](test-plan.md)

脚本入口方案固定采用方案 A：

- `probe.mjs` 和 `run-exec.mjs` 保持窄职责分离
- 两者都采用“结构化 JSON 输入 -> stdout JSON 输出”
- 业务成功或业务失败写入输出 JSON，不用脚本退出码表达
- 脚本退出码只表示脚本自身请求不合法或内部异常

认证策略不在本仓库 runner 内自行设计：

- `isolated-context-run:codex` 负责探测、执行、归一化和归因
- Codex 自身如何解析与使用认证态，视为宿主能力
- runner 只记录可观测事实，不额外定义一套本地 auth 策略

### 5.3 父层与子层的接口语义

这部分需要尽早定死，否则实现时会在“谁负责选择 runner、谁负责解释 override、谁负责决定输出字面量”之间反复摇摆。

原则：

- 父层 `isolated-context-run` 只负责默认优先级、override 解释、runner 选择和路由决定。
- `isolated-context-run:codex` 子层只负责 Codex 宿主下的 probe、execution、trace 和 failure normalization。
- 父层一旦决定走 Codex，子层不得重新参与 `subagent -> self-cli` 的默认优先级比较。

调用入口分 3 类：

1. 父层默认路由到 Codex
- 例：`subagent` 不可用，当前宿主是 Codex，父层选中 `self-cli`
- 语义：父层已经完成正常 runner 选择，子层只负责把这条 Codex 路径执行并归一化

2. 父层显式 override 到 Codex
- 例：`mode=codex-exec`
- 语义：这是调用方显式指定，不得被子层改写成重新做宿主自动判断

3. 直接调用子层
- 例：测试、adapter 或后续 harness 直接点名 `isolated-context-run:codex`
- 语义：子层直接执行 Codex 路径，但不回退去做父层的 runner 比较

建议子层输入契约至少包含：

```json
{
  "invocation_source": "parent_route | explicit_mode | direct_sublayer",
  "selected_runner": "self-cli | codex-exec",
  "host_facts": {
    "host": "codex",
    "subagent_available": false
  },
  "task": {
    "prompt": "..."
  }
}
```

其中：

- `invocation_source` 用来决定 `Override` 和 `Why` 的语义
- `selected_runner` 表示父层选中的路径来源，而不是要求子层重新选择 runner
- `host_facts` 是父层或调用方已知的宿主事实，子层只用来执行归一化，不应用来重开父层路由逻辑

### 5.4 对外输出字面量

`codex exec --json` 是实现 backend，不是对外的能力边界名称。

因此建议固定：

- 对外 `Selected Runner` 使用 `isolated-context-run:codex`
- 对外 `Why` 说明这是 Codex 子层而不是直接把实现细节暴露成 runner 名称
- `codex exec --json` 只出现在 `Execution Template`、trace 元数据或脚本层返回体里

推荐输出字面量：

- `invocation_source=parent_route`
  - `Selected Runner`: `isolated-context-run:codex`
  - `Override`: `selected by parent frontdoor`
- `invocation_source=explicit_mode`
  - `Selected Runner`: `isolated-context-run:codex`
  - `Override`: `mode=codex-exec`
  - `Why` 中保留字面 `explicit`
- `invocation_source=direct_sublayer`
  - `Selected Runner`: `isolated-context-run:codex`
  - `Override`: `direct sublayer invocation`

禁止把下面两件事混成一层：

- 仓库内能力边界：`isolated-context-run:codex`
- 具体实现 backend：`codex exec --json`

如果后续子层除了 `exec-json` 还增加 `sdk` 或 `app-server` backend，对外 `Selected Runner` 仍保持 `isolated-context-run:codex` 不变，只在内部返回契约和 trace 中暴露 backend 差异。

## 6. 建议的内部返回契约

脚本层不应直接产出 markdown，先统一成 JSON，再交给 skill 层或 adapter 层决定如何展示。

第一阶段不要求先做完整 trace 映射表，而是先固定一个“最终返回值 + 最小证据摘要”的 v0 契约。

建议最小返回体：

```json
{
  "ok": true,
  "carrier": "isolated-context-run:codex",
  "backend": "exec-json",
  "result": {
    "final_text": "...",
    "refusal": false
  },
  "execution": {
    "thread_id": "...",
    "turn_status": "completed",
    "exit_code": 0
  },
  "evidence": {
    "raw_event_log": "artifacts/raw-events.jsonl",
    "events_seen": [
      "thread.started",
      "turn.started",
      "turn.completed"
    ],
    "stdout": "artifacts/stdout.txt",
    "stderr": "artifacts/stderr.txt",
    "warnings": []
  },
  "failure": null
}
```

失败时：

- `ok = false`
- `failure.kind` 进入统一 taxonomy
- 保留执行状态和最小证据摘要

更完整的字段说明与 required / optional 约束见：

- [exec-v0-contract.md](exec-v0-contract.md)
- [failure-taxonomy.md](failure-taxonomy.md)

## 7. 建议的失败 taxonomy

不要把所有失败都压成“命令没装好”。

建议至少区分：

- `unavailable`
  - `codex` 命令不存在
  - 当前 backend 不可用
- `environment_failure`
  - auth 失败
  - network 失败
  - provider / upstream 失败
  - sandbox 拒绝
  - approval 拒绝或挂起
  - required MCP / plugin 初始化失败
  - CLI 运行后无有效输出
- `contract_failure`
  - 原始事件缺失关键字段
  - 最终回答与 trace 无法对齐
- `runner_misconfiguration`
  - clean-room 契约未满足
  - 不允许的 skill / plugin / config 泄漏进来

这里最重要的原则是：

- 缺命令才叫 `unavailable`
- auth / network / provider / sandbox / approval 问题一律归到 `environment_failure`
- 环境不干净不是 skill 契约失败，而是 runner 配置失败

更细的 `reason` 代码与判定矩阵见：

- [failure-taxonomy.md](failure-taxonomy.md)

## 8. 推荐方案

推荐采用：

- skill 轻量子层
- `exec-json` 作为第一阶段 baseline backend
- `clean-room` 作为第一阶段默认目标
- 统一 JSON 返回契约
- 统一 trace / failure normalization
- 后续按需接入 Inspect AI 或 Promptfoo，而不是一开始自建大框架

不推荐采用：

- 继续把 Codex 只留在父层里的最小 adapter
- 一开始就把 `app-server` 作为默认后端
- 一开始就自建通用 eval SaaS、trace 工作台或通用 bridge 平台

## 9. 对本仓库的落地建议

建议按下面顺序推进：

1. 新增 `skills/isolated-context-run-codex/`，固定子层边界。
2. 新增 `scripts/isolated-context-run/codex/`，先落 `probe`、`run-exec`、`normalize-trace`、`normalize-failure`、`clean-room`。
3. 在实现 `clean-room.mjs` 前，先对照两份专项设计文档定死 fake user home、`workspace_mode`、manifest 和 `run_local` 约束。
4. 让父层 `isolated-context-run` 在 Codex 宿主场景路由到这个子层，而不是只给一条 `codex exec` 文本映射。
5. 再把 `recall-eval` 的真实宿主验证接到这个 codex runner 上。
6. 后续若 batch / CI / resume-thread 需求变重，再评估 `run-sdk.mjs`。
7. 只有在确实需要 richer protocol 或长连接客户端时，再评估 `app-server`。
8. 在脚本实现前，先按 [test-plan.md](test-plan.md) 固定 `unit / cli / harness` 三层测试边界与 fake `codex` 注入方式。

## 10. 参考来源

- OpenAI Codex Non-interactive
  - https://developers.openai.com/codex/noninteractive
- OpenAI Codex SDK
  - https://developers.openai.com/codex/sdk
- OpenAI Codex App Server
  - https://developers.openai.com/codex/app-server
- OpenAI Codex Config Reference
  - https://developers.openai.com/codex/config-reference
- OpenAI Codex Skills
  - https://developers.openai.com/codex/skills
- Anthropic Claude Code Subagents
  - https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Inspect AI Agent Bridge
  - https://inspect.aisi.org.uk/agent-bridge.html
- Inspect AI Custom Agents / Transcripts
  - https://inspect.aisi.org.uk/agent-custom.html
- Promptfoo Evaluate Coding Agents
  - https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
- Langfuse Docs
  - https://langfuse.com/docs/observability/get-started
- Braintrust Pricing / product entry
  - https://www.braintrust.dev/pricing
