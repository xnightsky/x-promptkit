# Skill 开发工具选项

- 状态：内部研究记录
- 目标：从个人开发者视角梳理当前做 Skill / Capability 开发时可借助的方法论、工具、平台与生态资源，并判断它们的现实门槛、时间/金钱成本与可达性边界
- 研究时间：2026-04-04
- 相关文档：
  - 如果关注“为什么 Skill 测试会卡在中间层、应该如何分层”，见 [capability-skill-dev-toolchain-research.md](/data/projects/x-promptkit/docs/capability-skill-dev-toolchain-research.md)
  - 如果关注“个人开发者可以通过哪些正式/非正式渠道获取 AI 能力，以及这些渠道的可复用性与风险”，见 [how-to-get-ai.md](/data/projects/x-promptkit/docs/how-to-get-ai.md)

## 1. 这篇文档回答什么

这篇文档不是“哪家 AI 最强”的测评，也不是购买教程。

它要回答的，是个人开发者在现实里经常会遇到的这些问题：

- 这个东西到底是方法论、规范、框架，还是要真实安装和接入的工具
- 用它更容易浪费时间，还是更容易浪费钱
- 它会不会卡在支持地区、账号体系、支付路径、网络可达性或中转链路
- 我手上如果已经有某种 AI 账号、CLI、IDE 套餐，能不能直接复用，而不是重复购买
- 这个对象值不值得纳入 Skill 开发工具链，还是只适合作为参考

这里有一个很重要的前提：

**概念本身不会卡你账号和国籍，但会消耗时间；具体工具和平台则会把时间、金钱、可达性和宿主绑定的问题一起带进来。**

## 2. 判读原则

为了避免把“知道这个概念”误写成“现实中能用起来”，本文统一按下面几个问题来判断：

- 它本质上是什么：方法论、数据资产、开发框架、工具、平台，还是规范/生态
- 它会不会直接引入现实使用门槛
- 更可能浪费时间，还是更可能浪费钱
- 个人开发者的主要门槛是什么
- 中国开发者是否会额外遇到支持地区、支付路径、网络可达性或官方渠道限制
- 是否必须额外购买 AI、API 或订阅
- 如果手上已经有 Claude、ChatGPT、Cursor、OpenCode、Copilot 或其他 AI 套餐，这些资产能不能复用

本文不讨论：

- 具体价格
- 购买步骤
- 科学上网或中转配置教程
- 企业级采购、统一计费和合规策略

## 3. 主表：方法、工具、平台的现实门槛矩阵

| 对象 | 对象类型 | 本质是什么 | 是否会直接产生现实使用门槛 | 更容易浪费什么 | 个人开发者主要门槛 | 中国开发者额外门槛 | 是否必须另买 AI / API / 订阅 | 是否能复用已有 AI 工具或套餐 | 更适合用来做什么 | 不适合用来做什么 | 对本仓库建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Test-Driven Prompt Engineering（TDPE） | 方法论 | 把 TDD 的“先定义通过条件，再迭代实现”迁移到 Prompt / Agent 场景 | 低 | 时间 | 需要自己定义测试边界和通过标准 | 低，本身没有渠道门槛 | 否 | 高 | 约束提示词或 agent 的迭代流程 | 当成现成产品或框架来采购 | 主推 |
| Eval-Driven Development（EDD） | 方法论 | 先做 eval，再改 prompt / workflow / agent 的开发习惯 | 低 | 时间 | 需要真实样本集、评分规则和回归意识 | 低，本身没有渠道门槛 | 否 | 高 | 让团队从“凭感觉调”转成“以评测驱动” | 代替具体执行工具或框架 | 主推 |
| 黄金数据集 / Eval Set | 数据资产 | 你自己维护的一组代表性样本与参考结果 | 中 | 时间 | 收集成本高，容易做得失真或过拟合 | 低，本身没有渠道门槛 | 否 | 高 | 做回归基线、比较 prompt / agent 版本 | 指望社区现成数据直接替代你的业务样本 | 主推 |
| Red-Green-Refactor 用于 Prompt | 方法论 | 把 TDD 的红绿重构循环借到 prompt / eval 迭代 | 低 | 时间 | 非确定性输出下很难机械套用，需要你自己改造成 eval 形式 | 低，本身没有渠道门槛 | 否 | 高 | 帮你形成稳定迭代节奏 | 机械照搬单元测试式断言 | 可选 |
| Few-shot + 测试生成 | 方法论 | 用模型或模板扩充测试样本、补变体 | 中 | 时间 | 容易生成看起来丰富但质量不高的样本 | 低，本身没有渠道门槛 | 否 | 高 | 快速扩样、补边界样本 | 代替人工定义关键验收标准 | 可选 |
| 结构化 Prompt | 方法论 | 用角色、任务、约束、输出格式强化稳定性 | 低 | 时间 | 很容易写成形式完整但约束无效的模板 | 低，本身没有渠道门槛 | 否 | 高 | 让输出边界更清楚 | 被误当成完整的测试方案 | 可选 |
| LLM-as-Judge | 方法论 / 技术模式 | 用模型做评分器或裁判，而不是只做规则断言 | 中 | 两者都有 | Judge 设计不稳时，既费钱也费时间 | 中，取决于你能否稳定接入 judge 模型 | 通常需要 API 或已有模型接入 | 中 | 做语义评分、复杂 rubric 评估 | 当成零成本、零偏差的判官 | 可选 |
| A/B 测试 Prompt | 方法论 | 在同一评测集上比较不同版本的 prompt / workflow | 中 | 两者都有 | 要跑多轮对比，模型调用和人工解释都会放大成本 | 中，取决于评测模型与平台可达性 | 通常需要 API 或 eval 平台 | 中 | 做版本比较、回归决策 | 在没有基线数据时盲目跑比较 | 可选 |
| Promptimize | 开发框架 | 较早期的 prompt engineering 测试工具包 | 中 | 时间 | 生态较小，影响力和社区势能不如主流方案 | 中，主要取决于其依赖的模型接入 | 通常需要 OpenAI API 或自接模型 | 低 | 研究 TDPE 风格实现、吸收设计思路 | 当成当前主流基础设施或团队标准 | 仅参考 |
| Promptfoo | 工具 | 现成的 eval / compare / regression 工具链 | 中 | 两者都有 | 需要先有被测对象、样本和模型来源；不自动替你解决评测定义问题 | 中，若依赖国外模型或平台则可达性会变差 | 通常需要模型接入；SaaS 非必需 | 中 | Prompt / agent 回归、比较实验、CI 集成 | 被误当成“装上就会自动告诉你怎么评估” | 主推 |
| LangChain + pytest | 开发框架 | 用通用 agent 框架加 Python 测试框架自己搭评测 | 中 | 时间 | 灵活但拼装成本高，容易把大量精力耗在 glue code 上 | 中，取决于你接入的模型和依赖环境 | 通常需要 API 或自接模型 | 中 | 已有 LangChain 代码栈时做定制化测试 | 作为零门槛现成方案推荐给所有人 | 可选 |
| LlamaIndex + pytest | 开发框架 | 用 LlamaIndex 生态配 pytest 自建测试与评估 | 中 | 时间 | 更适合已有 LlamaIndex 场景；纯为 Skill 开发引入可能过重 | 中，取决于模型和依赖环境 | 通常需要 API 或自接模型 | 中 | RAG / retrieval 场景下的定制测试 | 为了测试一个轻量 Skill 而整套引入 | 可选 |
| Cursor 内做 TDD 式 Prompt / Agent 开发 | 工具使用方式 | 借 IDE agent + 规则/工作流去执行你自己的 TDPE | 高 | 两者都有 | 强绑定 Cursor；免费能起步，但高强度 agent 使用会进入订阅和额度问题 | 中，官方可达性相对好，但仍受支付、地区和网络影响 | 通常需要工具订阅，或消耗内置 usage | 高 | IDE 内快速迭代和试验 | 作为仓库唯一前提或唯一评测链路 | 可选 |
| Claude 内做 TDD 式 Prompt / Agent 开发 | 工具使用方式 | 借 Claude Code / Claude.ai / Claude API 去执行你自己的 TDPE | 高 | 两者都有 | Anthropic 账号体系、支持地区和套餐路径会直接影响可用性；第一方产品与第三方 harness 的额度覆盖边界也可能变化 | 高，个人开发者可能会被支持地区、支付路径或网络条件卡住 | 通常需要 Anthropic 账号、API 或商业计划 | 中，取决于你复用的是 Claude 官方产品、API，还是第三方宿主 | 在 Claude 官方产品边界内做 Prompt / Skill 试验与协作 | 写成所有维护者都可默认使用的前提，或默认第三方 harness 仍由订阅兜底 | 可选 |
| Agent Skills / `SKILL.md` | 规范/生态 | 开放格式的能力描述与渐进加载规范 | 中 | 时间 | 规范本身简单，但真正有效的 skill 内容仍要你自己写 | 低，规范本身没有地区门槛 | 否 | 高 | 沉淀可迁移的能力包、约束和资源组织 | 当成完整 runtime、eval 或 sandbox 解决方案 | 主推 |
| Skill = SOP + 工具 + 测试 | 架构思路 | 把 Skill 从 prompt 升级为有流程、工具和测试的能力单元 | 中 | 时间 | 最大难点在边界设计，不在格式本身 | 低，本身没有渠道门槛 | 否 | 高 | 指导 Skill 设计思路 | 当成现成产品名称或行业标准 | 主推 |
| Skill 测试覆盖 | 数据资产 / 实践 | 你为 Skill 自己定义的 case、guardrails、机制与回归集 | 中 | 时间 | 最难的是界定测什么，不是写 case 本身 | 低，本身没有渠道门槛 | 否 | 高 | 做真实 Skill 回归与保护边界 | 期待社区有一套通用现成覆盖直接套用 | 主推 |
| `anthropics/skills` | 规范/生态 | 官方示例与参考实现仓库 | 中 | 时间 | 适合参考，不适合照抄后当作已适配你的仓库 | 中，对中国开发者而言获取和使用体验可能受 GitHub/Claude 生态可达性影响 | 否 | 高 | 看结构、样式、复杂 Skill 参考 | 当作你仓库的直接生产实现 | 主推 |
| Agent Skills 官方文档 / reference library | 规范/生态 | 官方规范、参考库与脚本约定说明 | 中 | 时间 | 文档可吸收，但不会替你做本地集成和运行决策 | 低到中，主要取决于文档可达性 | 否 | 高 | 校准规范、脚本目录和 progressive disclosure | 以为读完文档就不用自建仓库内契约 | 主推 |
| `vercel-labs/agent-skills` | 规范/生态 | 社区高质量 Skill 示例集 | 中 | 时间 | 适合对照模式，不适合作为仓库标准答案 | 低到中，主要是 GitHub 可达性与示例适配成本 | 否 | 高 | 学结构、风格和工程组织 | 当成主运行时或主工具链 | 可选 |
| `vercel-labs/skills` | 工具 | 现成的 Skill 安装与分发 CLI | 中 | 时间 | 解决的是安装分发，不是 Skill 测试和运行本身 | 中，主要取决于 npm / GitHub 可达性 | 否 | 高 | 复用安装、同步、分发层 | 自己再造 installer / sync 工具 | 主推 |
| OpenSkills | 工具 | 通用 skills loader，强调多 agent 共享和兼容 | 中 | 时间 | 对个人开发者有价值，但要接受它自己的约定和同步方式 | 中，主要取决于 npm / GitHub / agent 环境可达性 | 否 | 高 | 跨 agent 共用 skills、统一本地管理 | 误当成它解决了 eval、carrier、sandbox 问题 | 可选 |
| Ai-Agent-Skills | 工具 / 市场 | 偏“Homebrew for skills”的安装与浏览工具 | 中 | 时间 | 社区味重、变化快，稳定性和长期主线地位需要观察 | 中，主要取决于 npm / GitHub 可达性 | 否 | 中 | 试用、浏览、搜现成 skill | 作为唯一主链工具长期押注 | 仅参考 |
| Inspect Agent Bridge | 工具 | 用来桥接外部 CLI / agent 做 sandbox 级评测 | 高 | 两者都有 | 偏研究和系统评测，学习曲线和环境要求都较高 | 中到高，取决于模型/provider 与环境可达性 | 通常需要模型接入和隔离环境 | 中 | 真实 runner / carrier 的系统级测试 | 当成个人开发者的默认日常入口 | 可选 |
| `awesomeAgentskills` | 规范/生态 | 社区索引和资源清单 | 低 | 时间 | 主要问题是信息质量和更新节奏不一 | 低到中，主要是 GitHub 可达性 | 否 | 高 | 搜集样例和入口 | 当成稳定、成体系的主文档 | 仅参考 |
| ClawHub | 平台 / 市场 | 公开 skill registry / 浏览入口 | 中 | 时间 | 更偏发现和浏览，不是核心开发工具链 | 中，平台可达性和维护活跃度会影响使用体验 | 否 | 中 | 找现成 skill 和灵感 | 作为仓库基础设施或默认依赖 | 仅参考 |
| `wshobson/agents` | 规范/生态 / 参考项目 | 一个“plugins + agents + skills”混合组织的公开样板 | 中 | 时间 | 参考价值高，但并不等于你也应该照搬整套组织方式 | 低到中，主要是 GitHub 可达性 | 否 | 高 | 借鉴混合架构与文件组织 | 当成通用工具安装进项目 | 仅参考 |
| `develop-ai-prompt` | 资源集 / 不稳定引用 | 更像经验集合和方法沉淀，不是稳定主线工具 | 中 | 时间 | 来源与持续维护力度不够稳，容易高估其代表性 | 低到中，取决于仓库可达性 | 否 | 中 | 当灵感来源看一眼 | 作为主推方案写进仓库标准链路 | 谨慎引用 |
| Awesome QA Prompt | 资源集 / 不稳定引用 | 更像 prompt 资源集合，不是成熟开发框架 | 低到中 | 时间 | 资源集合适合找灵感，不适合当框架依据 | 低到中，主要是 GitHub 可达性 | 否 | 高 | 找案例和灵感 | 作为技能测试主线方案 | 谨慎引用 |

## 4. 读这张表时最重要的三个判断

### 4.1 最容易浪费时间的，通常不是产品，而是“半成品方法 + 可拼装框架”

下面这些对象更容易让个人开发者花很多时间，却未必立即形成稳定产出：

- TDPE、EDD、Red-Green-Refactor、结构化 Prompt 这类方法论
- LangChain + pytest、LlamaIndex + pytest 这类“积木式自建方案”
- OpenSkills、Ai-Agent-Skills、各种社区仓库这类“还要自己决定怎么接”的生态工具

它们不是没有价值，而是：

- 你需要自己定义边界
- 你需要自己决定怎么接入
- 你需要自己承担方法和工具之间的缝合工作

所以它们更适合作为**增强认知和缩短试错路径的零件**，而不是自动降低门槛的成品。

### 4.2 最容易浪费钱的，通常是“看上去开箱即用”，但会引入额外账号、额度或重复采购的对象

下面这些对象更容易把“能不能用起来”变成现实花费问题：

- Cursor、Claude、Codex、OpenCode 这类 agent 入口
- LLM-as-Judge、A/B 测试、Promptfoo 这类会放大模型调用次数的模式或工具
- 任何你手头明明已有一个 AI 工具套餐，但为了另一条链路又要再买一套接入资格，或补额外 usage / API 的方案

典型风险不是“它不好”，而是：

- 你已经有某个 AI 入口，但这个新工具不能直接复用
- 你以为自己是在复用已有套餐，实际上是在切换宿主、认证方式和计费边界
- 同一家模型的第一方产品内扩展能力，和第三方 harness / 独立 agent 工具，未必共享同一套额度覆盖规则
- 你以为只是引入一个工具，实际上同时引入了新 API、额度、配额和使用习惯
- 你还没形成稳定评测流程，就先把调用成本放大了

### 4.3 对中国开发者最敏感的，不只是网络，而是“官方支持地区 + 支付路径 + 渠道可达性”的组合

这类风险不该被轻描淡写成一句“门槛高”。

对中国开发者而言，更真实的额外门槛通常包括：

- 官方账号体系是否支持当前地区
- 支付和开通路径是否顺畅
- CLI、IDE 或平台是否能通过正常官方渠道稳定使用
- 即使技术上可用，是否过度依赖代理、中转或不稳定链路

这也是为什么：

- 某些国外 AI 工具不能直接被写成仓库默认前提
- “大家都在用”不等于你这边现实里就能稳定复用
- 现成工具是否值得引入，不能只看技术能力，还要看渠道和可达性

## 5. 现有 AI 资产能不能复用

对个人开发者来说，真正会影响决策的，常常不是“要不要用 AI”，而是“我已经有的 AI 资产能不能复用”。

大体上可以这样判断：

- 如果你已经深度使用 Cursor，那么“在 Cursor 内做规则化开发”通常比再单独购入另一条 IDE 入口更顺
- 如果你已经稳定使用 Claude Code 或 Claude API，那么相关的 skill 规范、示例和 Claude 内工作流更容易接上；但这不自动意味着第三方宿主也继续由同一订阅覆盖
- 如果你已经在 OpenAI / ChatGPT 生态里，Codex 路径通常复用性更高
- 如果你不想被某一家绑定，OpenCode、OpenSkills 这类 provider-agnostic 方案更值得研究

但要注意：

- “能复用某个账号”不等于“能复用整套能力”
- 很多看起来兼容多模型的工具，仍然要求你补新的 provider 配置、额度管理或工作流适配
- 对 Claude 这类产品，要区分 `Claude.ai`、`Claude Code` 这类第一方宿主，与 OpenCode、OpenClaw 这类第三方宿主；同样叫 MCP，或同样调用 Claude，不代表计费边界相同
- 能否复用，应该先看它复用的是 **账号**、**API**、**宿主环境**、**计费边界**，还是只是“理论上支持同一家模型”

## 6. 对本仓库的建议

结合本仓库当前要解决的问题，最值得直接复用的，不是再造一整套“Skill 全家桶”，而是吸收现成周边基础设施：

- `Agent Skills / SKILL.md`、`anthropics/skills`、Agent Skills 官方文档：用于校准 artifact 结构和内容组织
- `vercel-labs/skills`：优先作为安装/分发层参考，避免自己造 installer / sync
- `Promptfoo`：优先作为 eval harness 候选，承接回归、比较和基础自动化评测
- `Inspect Agent Bridge`：只在明确需要 carrier / sandbox / bridge 时引入，不作为默认日常依赖

对本仓库不建议默认承诺的，是下面这些路径：

- 把某一家国外 AI 入口工具写成所有维护者的默认前提
- 为了“支持所有人”而自己重写 Skill 安装器、分发器、sandbox bridge、通用 eval 框架
- 把方法论资源集写成像成熟平台一样的标准依赖

收敛成一句话：

**你最应该避免重复造轮子的地方，不是 Skill 本身，而是 Skill 周边的安装、分发、评测和桥接基础设施。**

## 7. 参考入口

以下链接主要用于核对对象定位、接入形态和前置条件，不是购买指南：

- Agent Skills / examples
  - https://github.com/anthropics/skills
  - https://agentskills.io/
  - https://agentskills.io/specification
  - https://agentskills.io/skill-creation/using-scripts
- Skill 安装与共享
  - https://github.com/vercel-labs/skills
  - https://github.com/numman-ali/openskills
  - https://github.com/skillcreatorai/Ai-Agent-Skills
- Skill 样例与资源库
  - https://github.com/vercel-labs/agent-skills
  - https://github.com/littleben/awesomeAgentskills
  - https://github.com/openclaw/clawhub
  - https://github.com/wshobson/agents
- Prompt / agent eval
  - https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
  - https://www.promptfoo.dev/docs/integrations/agent-skill/
  - https://github.com/promptfoo/promptfoo-action
  - https://github.com/preset-io/promptimize
- Agent 入口与桥接
  - https://docs.anthropic.com/en/docs/claude-code/overview
  - https://docs.anthropic.com/en/docs/claude-code/getting-started
  - https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started
  - https://help.openai.com/en/articles/11381614
  - https://cursor.com/pricing/
  - https://docs.cursor.com/account/rate-limits
  - https://dev.opencode.ai/docs/
  - https://inspect.aisi.org.uk/agent-bridge.html
