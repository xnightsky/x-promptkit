# Capability / Skill 开发工具链调研

- 状态：内部研究记录
- 目标：为后续 Capability / Skill 开发与测试体系建设提供参考
- 研究时间：2026-04-04
- 相关文档：如果关注“现有工具对个人开发者是否现实可用、门槛在哪里”，见 [skill-dev-tool-options.md](/data/projects/x-promptkit/docs/skill-dev-tool-options.md)

## 1. 背景与结论

围绕 Skill 或 Capability 的开发，当前行业并不是“完全没有工具”，而是**缺少一个被广泛接受的统一开发工具链**。

现状更接近下面这四层分裂状态：

- Prompt 级：测试与实验工具已经比较成熟。
- Agent 级：评测、sandbox、trace 也已有较强工具。
- Artifact 级：开始出现 `SKILL.md` 这类开放格式。
- Capability / Skill 中间层：还没有一个像 `pytest` / `jest` 那样的标准开发框架。

本文的核心结论是：

1. Prompt 测试框架不是空白，真正的缺口在 **Capability / Skill 中间层**。
2. 当前最现实的路线，不是等待一个“大一统 Skill IDE”，而是用现有成熟零件拼出一个 **Capability Dev Kit**。
3. 这个 Dev Kit 至少应覆盖 5 个问题：描述与打包、宿主注入、触发验证、上下文污染评测、版本与分发。

## 2. 术语与问题定义

为了避免混淆，先固定三个层级：

### 2.1 Prompt

Prompt 指单条提示词或模板。它的主要工程对象通常是：

- 模板版本
- 变量插值
- 输出质量
- 成本、延迟、稳定性

### 2.2 Agent

Agent 指完整执行体，通常包含：

- 工具调用
- 多步循环
- 文件或环境访问
- 记忆、状态、审批、sandbox

### 2.3 Capability / Skill

Capability / Skill 位于 Prompt 与 Agent 之间，更像“宿主中的行为模块”，通常同时包含：

- 触发描述或路由规则
- 上下文注入约定
- 工具使用边界
- 资源引用，例如文档、脚本、样例
- 宿主耦合，例如 Claude / Codex / Kimi / GPTs 的行为差异

Skill 开发难点不只是“输出对不对”，而是下面这些问题要一起成立：

- 该触发时能触发，不该触发时别误触发
- 触发后到底注入了什么上下文
- 多个 Capability 并存时会不会互相污染
- 工具调用是否偏离预期边界
- 换宿主后行为偏移有多大

这也是为什么 Skill 的开发体验常常仍然像“手工作坊”：它既不像 Prompt 那样是纯文本对象，也不像传统插件那样有稳定 ABI。

## 3. 现有工具版图

### 3.1 Artifact 层：Agent Skills / `SKILL.md`

这一层解决的是“能力单元怎么描述与打包”。

目前比较值得参考的是 Agent Skills 开放规范：

- 用 `SKILL.md` + frontmatter 描述能力单元
- 支持 `references/`、`scripts/`、`assets/` 等辅助目录
- 强调 progressive disclosure：先暴露 `name` / `description`，命中后再加载完整内容
- 提供 `skills-ref validate` 做结构级校验

这一层已经开始标准化，但它只解决了**artifact 结构合法性**，没有解决行为级正确性。

### 3.2 Prompt Eval 层：Promptfoo、LangSmith、Braintrust、Langfuse

这一层解决的是“给定输入后，输出表现如何”。

其典型能力包括：

- 数据集与回归测试
- 断言与打分
- 成本、延迟、方差评测
- A/B 实验
- Prompt 版本管理与 playground

代表性工具：

- Promptfoo：更偏本地、开源、CLI/CI 友好
- LangSmith：更偏 LangChain 体系下的数据集、实验、trace
- Braintrust：更偏数据集、评分器、实验工作台
- Langfuse：更偏 prompt management、观测、实验与记录

这类工具已经很成熟，但它们默认把被测对象看成“Prompt 模板”或“Agent 调用”，并不原生围绕 Capability / Skill 的触发与注入行为建模。

### 3.3 Agent Eval / Sandbox 层：Inspect AI

这一层解决的是“完整 agent 行为如何在受控环境中被评测”。

以 Inspect AI 为代表，这一类工具更适合：

- 在 sandbox 中运行 agent
- 控制网络、文件系统、命令边界
- 记录工具轨迹
- 用 dataset + scorer 评估 agent 行为
- 桥接外部 CLI agent

这一层非常适合补上 Capability / Skill 在宿主中的系统行为测试，尤其是：

- 文件访问边界
- 工具轨迹
- 不同宿主下的行为偏移
- 隔离环境中的可重放评测

### 3.4 平台内置 Builder 层

这类工具包括 Claude / GPTs / Kimi 等宿主的内置能力编辑器。

优点：

- 上手快
- 发布路径短
- 对目标平台集成最深

缺点也很明显：

- 黑盒
- 版本化弱
- 难做本地回归
- 难做跨宿主迁移
- 很难纳入 CI/CD

因此它们更适合快速试验，不适合作为 Capability / Skill 工程主干。

## 4. 为什么中间层会形成缺口

这是本次调研最关键的结论。

现有工具并不是不存在，而是它们分别锚定在两个不同对象上：

- Prompt 工具把被测对象看成“模板”
- Agent 工具把被测对象看成“执行体”

Capability / Skill 则恰好卡在两者之间，它既不是纯模板，也不是完整 agent，而是一个**行为包**。这个行为包至少包含以下对象：

- `trigger / routing`
- `context assembly`
- `tool boundary`
- `resource loading`
- `host adapter`

这导致了三个后果：

1. Prompt 级工具只能较好覆盖“触发后效果”，难以原生覆盖“该不该触发”。
2. Agent 级工具能测系统行为，但粒度通常偏粗，成本也更高。
3. 平台内置 Builder 通常最懂自己的宿主，但缺少跨宿主与可重放工程能力。

所以目前的真实状态不是“没有工具”，而是：

**零件已经有了，但 Capability / Skill 级别仍缺少统一对象模型与原生测试 harness。**

## 5. 需要的不是 Skill IDE，而是 Capability Dev Kit

如果把目标定义成“做一个 Skill IDE”，很容易过早进入 UI 和平台适配细节。

从工程落地看，更需要先定义的是 **Capability Dev Kit**。它应至少包含下面 5 层：

### 5.1 Artifact

统一能力单元描述，至少包含：

- 名称、描述、适用范围
- 触发说明
- 引用资源
- 约束与依赖

可以直接采用 Agent Skills 的 `SKILL.md`，也可以在其上再包一层 manifest。

### 5.2 Injection Adapter

这一层负责把能力包注入到不同宿主：

- Claude Code
- Codex CLI
- 平台内置 Builder
- 自定义 Agent Runtime

它不需要很重，但必须明确：

- 目录如何发现
- 宿主如何加载
- 哪些资源对宿主可见
- 哪些上下文由宿主注入，哪些由 capability 自带

### 5.3 Eval Harness

这一层负责回归测试与批量评测，应支持：

- 数据集
- 断言
- 重复运行
- 成本、延迟、波动统计

Promptfoo 适合作为这一层的默认起点。

### 5.4 Sandbox / Trace Harness

这一层负责系统行为验证，应支持：

- 文件与命令边界
- 工具轨迹
- 环境隔离
- 不同宿主行为对比

Inspect AI 更适合作为这一层的底座。

### 5.5 Registry / Experiment Layer

这一层负责：

- 版本记录
- 数据集管理
- 历史实验结果
- 人工 review 与回放

如果需要团队工作台，可以接入 Langfuse 或 Braintrust；如果只是本地研发，初期可以先不做重平台化。

## 6. Capability / Skill 的专属测试矩阵

Capability / Skill 不能只测“输出是否优秀”，还需要一套更贴近行为包的测试矩阵。

### 6.1 触发测试

目标：验证 should-trigger / should-not-trigger。

最小样本集应同时包含：

- 明确应该命中的 query
- 与目标相似但不该命中的 query
- 完全无关的 query

### 6.2 污染测试

目标：验证多个 Capability 并存时是否互相干扰。

建议至少跑这几组：

- 不加载任何 capability
- 只加载目标 capability
- 目标 capability + 相似 capability
- 目标 capability + 无关 capability

需要观察：

- 路由变化
- 输出风格漂移
- 工具调用偏移

### 6.3 上下文测试

目标：看注入机制是否失控。

最少应记录：

- 注入 token 增量
- 额外读取的文件或资源
- 首 token 延迟
- 总体耗时与成本变化

### 6.4 行为测试

目标：验证 capability 生效后的最终表现。

重点应覆盖：

- 输出质量
- 工具路径
- 关键约束是否遵守
- 失败时是否给出预期降级或错误信息

### 6.5 稳定性测试

目标：对抗模型非确定性。

建议同一样本重复运行多次，至少统计：

- 通过率
- 主要评分方差
- 工具调用轨迹是否漂移

### 6.6 宿主一致性测试

目标：衡量 Claude、Codex、平台 Builder 等宿主差异。

这类测试不是追求完全一致，而是要明确：

- 哪些行为应该一致
- 哪些行为允许宿主差异
- 差异超出阈值时如何标记为回归

## 7. 可落地的最小方案

如果目标是现在开始建设，而不是继续等待行业收敛，最现实的组合是：

### 7.1 默认主方案

- Artifact：Agent Skills / `SKILL.md`
- 注入层：自研一个薄的 Injection Adapter
- 回归层：Promptfoo
- sandbox / trace 层：Inspect AI
- 观测与实验层：按需接 Langfuse 或 Braintrust

这套组合的优点是：

- 不依赖单一平台
- 可以先轻后重
- 可以逐步引入，而不是一次性重构
- 对 Capability / Skill 中间层问题有相对完整覆盖

### 7.2 为什么不直接选一个“大框架”

因为目前没有一个工具能同时原生处理下面所有问题：

- Skill 格式
- 宿主注入
- 路由评测
- 交叉污染
- sandbox
- trace
- 实验记录
- 跨平台分发

与其等待不存在的统一框架，不如承认现状：**先把成熟零件组合起来，形成自己的 Capability Dev Kit。**

## 8. 建议的实施顺序

### 8.1 第一阶段：先把能力单元和测试样本固定下来

- 统一 artifact 结构
- 建一套黄金测试集
- 先把 should-trigger / should-not-trigger 和典型行为 case 整理出来

### 8.2 第二阶段：建立基础回归 harness

- 先接 Promptfoo
- 让每次改动都能看到行为变化、评分变化、成本变化

### 8.3 第三阶段：补上宿主注入与隔离能力

- 引入 Injection Adapter
- 用 Inspect AI 跑宿主级和系统级测试

### 8.4 第四阶段：再考虑工作台与 IDE 能力

- prompt archaeology
- 上下文可视化
- capability registry
- 历史对比与人工审查界面

这类能力在前 3 阶段没有稳定对象模型之前，过早建设收益不高。

## 9. 最终判断

本次调研后的判断可以压缩成三句话：

1. Skill / Capability 开发不是“没有工具”，而是“只有分层零件，没有统一工程主干”。
2. Prompt 测试框架已经成熟，Agent sandbox 也已有较强底座，真正缺的是 Capability / Skill 的统一对象模型与测试 harness。
3. 现阶段最现实的路线，是围绕 `Artifact + Injection Adapter + Eval Harness + Sandbox Harness` 建一个最小 `Capability Dev Kit`，而不是等待某个平台提供完整标准答案。

## 10. 参考资料

以下链接均用于本次研究判断，适合后续继续深入：

- Agent Skills
  - https://agentskills.io/
  - https://agentskills.io/specification
  - https://agentskills.io/what-are-skills
  - https://agentskills.io/skill-creation/optimizing-descriptions
- Promptfoo
  - https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
  - https://www.promptfoo.dev/docs/providers/
  - https://www.promptfoo.dev/docs/integrations/ci-cd/
- Inspect AI
  - https://inspect.aisi.org.uk/
  - https://inspect.aisi.org.uk/agent-bridge.html
  - https://inspect.aisi.org.uk/sandboxing.html
  - https://inspect.aisi.org.uk/scorers.html
- Langfuse
  - https://langfuse.com/docs
  - https://langfuse.com/docs/prompt-management/overview
  - https://langfuse.com/docs/evaluation/overview
- Braintrust
  - https://www.braintrust.dev/docs/evaluation
  - https://www.braintrust.dev/docs/platform/playground
  - https://www.braintrust.dev/docs/core/datasets
- OpenAI Codex
  - https://developers.openai.com/codex/skills
  - https://developers.openai.com/codex/config-reference
  - https://developers.openai.com/codex/plugins/build
- Claude Code
  - https://code.claude.com/docs/en/slash-commands
