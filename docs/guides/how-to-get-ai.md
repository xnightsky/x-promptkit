# 如何获取 AI：渠道、门槛、复用关系与风险

<strong style="color:#c62828;">高时效性提示：本文包含强时效性判断，涉及套餐、支持地区、可用渠道、计费边界、限量发售与涨价风险；阅读和引用时必须先核对调研日期与信源日期。</strong>

- 状态：内部研究记录
- <strong style="color:#c62828;">调研时间：2026-04-05</strong>
- 目标：从个人开发者视角，罗列当前“获取 AI 能力”的主要方式，辅助做工具链与采购决策
- 研究时间：2026-04-05
- 相关文档：
  - 如果关注“这类外部信息文档应该如何搜索、校准、验证与分级引用”，见 [research-source-method.md](../research/research-source-method.md)
  - 如果关注“做 Skill / Capability 开发时，哪些工具值得进入主链路”，见 [skill-dev-tool-options.md](../research/skill-dev-tool-options.md)
  - 如果关注“为什么 Skill 测试会卡在中间层、宿主注入与评测应该怎么分层”，见 [capability-skill-dev-toolchain-research.md](../research/capability-skill-dev-toolchain-research.md)
- 信源策略：
  - <span style="color:#2e7d32;"><strong>A</strong></span>：官方文档、官方帮助中心、官方定价页
  - <span style="color:#1565c0;"><strong>B</strong></span>：主流媒体、云厂商官方博客、主流公开产品页
  - <span style="color:#ef6c00;"><strong>C</strong></span>：社区目录、项目索引、公开资料汇编，仅用于观察渠道形式是否存在
  - <span style="color:#c62828;"><strong>D</strong></span>：社论、专栏、评论、自媒体分析，仅用于观察舆论与市场现象
  - <span style="color:#6a1b9a;"><strong>E</strong></span>：BBS、论坛、帖子、经验贴，仅用于观察社区报告与灰色玩法叫法
  - 使用规则：`A/B` 才能直接支撑正文主判断；`C/D/E` 只能作为存在性、市场现象或社区讨论的补充，不单独支撑价格、政策、封禁规则或稳定性结论

## 1. 这篇文档回答什么

这篇文档不是购买教程，也不是开户、代充、网络绕行或风控规避指南。

它要回答的是：

- 个人开发者现在有哪些主要方式可以拿到 AI 能力
- 每种方式拿到的到底是聊天入口、编码入口、API，还是宿主内置额度
- 你现在已有的 AI 套餐，到底能复用到哪一层，不能复用到哪一层
- 全球个人开发者与中国个人开发者，在现实里会分别遇到什么门槛
- 哪些路径适合做默认前提，哪些路径只能作为补充，哪些路径不该被写进仓库默认链路

这里有一个前提必须先说清楚：

**“能用某家模型”不等于“拿到了同一种 AI 能力”。**

你拿到的可能是：

- 网页或 App 聊天入口
- 官方 CLI / coding agent
- 官方 API
- 第三方宿主内含的模型额度
- 第三方宿主 + 你自带 API Key
- 聚合路由层
- 云厂商上的托管模型
- 本地或私有算力上的开源模型

这些路径在账号体系、支付路径、使用限制、计费边界、支持地区、可复用性上都不一样。

本文不讨论：

- 具体开户步骤
- 科学上网或代理配置方法
- 灰色渠道的规避细节
- 企业采购、统一合同、法务审查

## 2. 判读原则

为了避免把“知道一个入口”误写成“现实中能稳定获取 AI”，本文统一从下面这些角度判断：

- 这条路径本质上是什么：订阅、API、宿主、路由层、云市场，还是本地运行
- 你实际拿到的是聊天能力、编码能力、编程接口，还是只是另一个 UI
- 它是否允许复用你已有的账号、订阅、API 或宿主环境
- 它的计费边界在哪里：包月、点数、按量、额外 usage，还是自付算力
- 它对全球个人开发者是否容易获得
- 它对中国个人开发者是否容易获得
- 它是不是足够稳定，能被写成仓库默认前提

判断时尤其要区分这四组边界：

1. 第一方产品 vs 第三方宿主
2. 订阅额度 vs API 额度
3. 宿主内扩展能力 vs 外部 harness / bridge
4. “同一家模型” vs “同一个计费边界”

## 3. 主表：AI 获取渠道矩阵

| 渠道类型 | 本质是什么 | 典型代表 | 你实际拿到什么 | 复用关系 | 全球个人开发者可得性 | 中国个人开发者可得性 | 主要风险 | 对本仓库建议 | 信源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 第一方聊天产品订阅 | 厂商自己的 Web / App / 桌面聊天入口 | ChatGPT Plus / Pro、Claude Pro / Max、Google AI Pro、国内 Kimi / 豆包 / 元宝等会员入口 | 更高聊天额度、更多模型、部分工具能力，通常不等于 API | 一般不能直接复用到 API；也不能默认复用到第三方宿主 | 高，前提是地区与支付支持 | 中到高，国内厂商高；海外厂商常受地区、支付、手机号和网络影响 | 最常见误判是“我订阅了，就等于任何第三方工具都能用”；实际很多能力只在第一方产品内有效 | 可选，适合作为体验和原型入口，不适合当仓库唯一前提 | [S01][S05][S09][S27] |
| 第一方官方 API / 开发者平台 | 面向开发者的编程接口与控制台 | OpenAI API、Anthropic Console、Gemini API、Kimi 开放平台、DeepSeek API | 可编程调用能力，适合接入脚本、服务、评测与自动化 | 最适合被工具链复用；但与聊天订阅通常分账 | 高 | 中到高，国内厂商高；海外厂商受地区支持与支付限制 | 需要自己处理额度、限流、成本、模型切换和失败重试 | 主推，最稳的工程入口 | [S02][S03][S05][S10][S11][S28][S29] |
| 第一方官方 CLI / Coding Agent | 厂商自己做的 coding 入口、CLI 或编程代理 | Claude Code、OpenAI Codex | 在官方宿主内提供编码工作流、审批模式、部分扩展能力 | 有时可复用聊天订阅，有时走 API；必须按官方文档判断，不能想当然 | 中到高 | 低到中，海外产品的账号、地区、手机号、支付与网络门槛更明显 | 最大风险是把官方宿主能力误认为“任意第三方 coding agent 都等价” | 可选，适合官方生态内工作；不适合写成所有维护者默认前提 | [S06][S08][S21][S22] |
| 第三方 IDE / 编码宿主内含额度 | 第三方工具把模型额度打包在自己的产品里 | Cursor、GitHub Copilot、Poe 的部分订阅模型池 | 你拿到的是宿主内的模型使用权，不一定拿到原厂 API | 复用的是宿主本身，不是原厂 API；宿主换掉，能力关系常常就断了 | 高 | 中，通常比海外第一方更容易上手，但仍受支付和网络影响 | 容易误以为“买了宿主就等于有了模型 API”；宿主规则和模型规则可能同时变化 | 可选，适合作为个人高效率入口；不适合作为默认基础设施 | [S12][S14][S17][S18] |
| 第三方宿主 + BYOK | 第三方工具提供 UI / Agent / 工作流，你自带 API Key | Cursor BYOK、各类支持 OpenAI-compatible 的桌面客户端和开源前端 | 宿主体验 + 你自己的 provider 计费 | 复用的是你的 API，不是宿主订阅；迁移性通常比“宿主内含额度”更好 | 中到高 | 中，取决于你能否拿到稳定 API Key | 容易多一层配置、代理、路由和成本管理，调试复杂度更高 | 主推为“兼容层”，但不要把任何单一宿主写死 | [S13][S28][S29] |
| 聚合 API / Router | 第三方把多家模型统一成一个接口层 | OpenRouter、部分 MaaS / 路由层服务 | 单一 API 入口、模型切换、回退、路由，有时还能 BYOK | 可复用多个 provider，但你引入了新的路由层和新的计费边界 | 高 | 中，取决于平台可达性与支付 | 容易误以为它等于原厂；但你其实多依赖了一层策略、风控和账单系统 | 可选，适合做实验、统一接入与回退，不建议作为唯一生产前提 | [S15][S16][S36] |
| 多模型订阅平台 / 点数池 | 一个订阅或点数池覆盖多模型对话 | Poe 等点数制平台 | 一个消费入口，可切不同模型，但通常不是原厂 API | 通常不能无缝迁移到原厂 API；复用的是点数池，不是底层厂商身份 | 中到高 | 中，取决于支付与地区 | 点数、功能、模型开放范围会变；可用不等于可工程化 | 仅参考，适合个人试模型，不适合作为仓库默认依赖 | [S17][S18] |
| 云厂商托管模型 / 模型市场 | 通过云平台购买或调用模型，不直接向模型厂商购买 | AWS Bedrock、Azure OpenAI / Foundry Models、阿里云百炼、百度千帆、腾讯混元、火山方舟 | 企业级云接口、权限体系、账单整合、区域控制 | 复用的是云账号、云权限、云账单，不是原厂订阅 | 中到高 | 高，国内云在中国个人与企业场景下更现实；海外云对国内个人开发者门槛仍不低 | 你引入了云账号、地域、配额、IAM、Marketplace、合规与额外基础设施成本 | 主推为“工程化、可治理”的正式接入层 | [S19][S20][S23][S24][S30][S32][S33][S34] |
| 国内官方模型云 / API | 中国厂商自己的官方聊天或开放平台 | Kimi、DeepSeek、阿里云百炼、文心千帆、腾讯混元、火山方舟 | 国内可直接获得的官方聊天与 API 能力 | 对中国开发者最容易复用；对全球开发者则未必优先 | 中 | 高 | 生态与英文资料相对分散，某些接口或模型与海外 OpenAI-compatible 生态有兼容层但不完全等价；面向 Coding / Agent 的套餐还可能出现限量、售罄、优惠退坡或涨价 | 主推，尤其适合中国个人开发者的默认现实路径，但不要默认价格和供给稳定 | [S27][S28][S29][S30][S32][S33][S34][S50][S51][S52] |
| 本地开源模型 / 自托管 | 你自己下载模型，在本地机器或自有服务器运行 | Ollama、Hugging Face 模型库、自建 vLLM / 推理服务 | 自控的数据与运行环境；成本转为算力、显存、运维 | 最不依赖地区和支付；但最依赖硬件与工程能力 | 中 | 中到高，前提是你有机器和运维能力 | 很容易低估算力、显存、吞吐、部署、升级与评测成本 | 可选，适合隐私要求高、可接受模型上限受限的场景 | [S25][S26] |
| 灰色中间渠道类型 | 非官方、非稳定、常依赖代充、中转、共享或镜像 | 账号代注册/代充、共享账号、API 中转、镜像站、转售点数、拼车/合租、`xx2api`、OAuth 套壳、薅 IDE / 官方补贴额度等 | 通常只是绕过官方门槛获得临时入口，不是稳定的正式能力 | 复用关系极差，随时可能失效；迁移成本高 | 中，取决于渠道活跃度 | 中到高，但不稳定 | 高封号、高停摆、高跑路、高泄露、高合规风险；这类路径近两年经常直接以封禁、失效、下架或补贴取消收场 | 不建议作为默认前提，只能视作观察到的市场形式 | [S03][S04][S11][S35][S36][S53][S54] |

## 4. 最关键的区分

### 4.1 “有订阅”不等于“有 API”

最容易出错的地方，是把聊天订阅、编码入口和开发者 API 混为一谈。

- `ChatGPT Plus / Pro` 提供的是 ChatGPT 产品能力，不等于 OpenAI API；官方帮助中心明确写了 API 与 ChatGPT 分开计费。[S01][S02]
- `Claude Pro / Max` 提供的是 Claude 产品能力与 Claude Code 接入，但不包含 Claude Console API；官方帮助中心同样明确写了这一点。[S05][S06]
- `Google AI Pro` 提供的是 Gemini / Google AI 计划能力；而 `Gemini API` 是另一条开发者路径，有单独的免费层与付费层。[S09][S10]

如果你要做：

- 脚本
- CI
- eval
- agent harness
- 自己的 CLI / IDE 集成

真正稳定的入口仍然是 API，而不是聊天订阅本身。

### 4.2 “在官方宿主里可用”不等于“在第三方宿主里也被同一套餐覆盖”

2026 年最值得记住的风险之一，就是**同一家模型厂商，第一方产品和第三方宿主的计费边界可能会变化**。

典型例子：

- Anthropic 当前官方文档明确说明 `Claude Code` 可由 `Pro / Max` 登录使用，也支持 MCP。[S06][S08]
- 但额外使用、第三方 harness、以及通过外部宿主消费的方式，并不自动与第一方订阅绑定；官方也单独提供了 `extra usage`。[S06][S07]

这类风险不是 Anthropic 独有问题，而是所有“模型厂商 + 第三方宿主 + 订阅捆绑”的通用风险：

- 厂商可能改计费边界
- 宿主可能改模型接入方式
- 订阅可能只覆盖第一方产品
- 宿主内含额度可能只是宿主补贴，不是原厂承诺

### 4.3 “支持同一家模型”不等于“复用了同一套资产”

判断能否复用，不要只看“是不是都能调 Claude / GPT / Gemini”，而要分别看：

- 复用的是 **账号**
- 复用的是 **订阅**
- 复用的是 **API Key**
- 复用的是 **宿主环境**
- 复用的是 **云账单 / IAM**
- 还是只是“协议兼容”

一个最实用的粗判断是：

- 如果你拿到的是 `API Key`，通常比“某个 App 里的额度”更可迁移
- 如果你拿到的是“宿主内含 usage”，通常迁移性更差
- 如果你拿到的是“云厂商里的模型权限”，你复用的是云资源治理，不是原厂身份

## 5. 对中国个人开发者额外敏感的现实问题

如果默认读者包含中国个人开发者，那么除了“好不好用”，还要单独看下面这些门槛：

- 官方是否支持中国大陆注册、登录、支付与使用
- 是否要求支持地区手机号
- 是否要求本人可稳定访问控制台、定价页、支付页面和帮助中心
- 是否存在明显的地区限制或可用区域名单
- 即使理论上能用，是否过度依赖不稳定链路

从现实上看，通常可以把路径大致分成三档：

### 5.1 最现实的正式路径

- 国内官方聊天产品与 API
- 国内云厂商上的模型服务
- 本地开源模型 / 自托管

这些路径的共同点是：

- 支付和账号更现实
- 可达性更稳定
- 文档和社区多为中文
- 更适合作为中国团队的默认前提

但要补一个经常被忽略的现实：

- “更容易买到”不等于“价格长期稳定”
- “有 Coding Plan” 不等于“随时都能按原价续上”
- 面向 AI 编程 / Agent 的低价套餐，可能会因为热度、算力供给和补贴策略变化，出现限量发售、上线即售罄、首购优惠取消或价格上调

### 5.2 可用但门槛显著的正式路径

- OpenAI ChatGPT / API / Codex
- Claude / Claude Code / Console
- Google AI Pro / Gemini API
- Cursor / GitHub Copilot / Poe / OpenRouter 这类海外宿主或平台

这些路径未必不能用，但它们往往同时带来：

- 地区支持限制
- 支付路径问题
- 手机号验证问题
- 网络可达性问题
- 套餐与 API 分账问题

### 5.3 不应被写成默认前提的路径

- 共享账号
- API 中转
- 镜像站
- 代注册 / 代充
- 拼车 / 合租
- 转售点数或资源包

这些形式在公开社区里长期存在，但它们本质上是“**借别人渠道**”而不是“**自己稳定持有能力**”。

## 6. 灰色中间渠道：只列形式，不列名字

这一类路径不应被浪漫化。它们之所以常见，通常不是因为更先进，而是因为它们在填补：

- 官方不支持地区
- 支付不通
- API 或订阅太贵
- 原厂门槛高
- 工具链需要统一入口

常见形式包括：

- 账号代注册 / 代充 / 礼品订阅
- 多人共享同一账号
- API 中转 / 官转 / 二次转售
- 镜像站 / 套壳站 / 兼容层转发
- 点数池转售 / 包量转售
- 云账号代开 / 代买 Marketplace 服务
- `xx2api` 一类把网页、IDE、OAuth 或补贴额度再包装成 API 的项目
- 借 IDE / 官方 coding plan / OAuth token 去“薅”宿主内置 AI usage 的玩法

它们的共同问题是：

- 你通常拿不到真正可持续的官方关系
- 账单、权限、风控、封号和停摆都不在你手里
- 你的 Prompt、文件、Token 用量、密钥甚至支付信息，可能会额外暴露给中间层
- 一旦渠道失效，你不但停机，还可能失去迁移路径

近两年更值得明确写出来的一点是：

- 很多 `xx2api`、共享池、OAuth 套壳、薅 IDE 内置 AI usage 的路径，不是“偶尔不稳”，而是**经常直接走向封禁、补贴终止、接口关闭或项目失效**
- 这类路径最开始看起来像“低成本复用”，最后却往往变成“迁移成本最高、停机最突然”的方案

因此，这些路径最多只能在文档里作为“**公开存在的市场形式**”被记录，不适合作为默认方案被推荐。

这里再加一个证据边界说明：

- 像 `xx2api`、共享池、OAuth 套壳、薅 IDE usage 这类更细的玩法名称，很多时候只能在 `D/E` 级来源里看到
- 因此它们在本文里只表示“社区里存在这种说法或做法”，不表示我已经用高可信来源完成了逐项事实认证

## 7. 最终判断

如果把“如何获取 AI”压缩成几条最实用的结论，大致是：

1. **最稳的工程入口仍然是官方 API 或云厂商托管模型接口。**
2. **聊天订阅、官方 coding agent、第三方宿主内含额度，都不该自动被视为 API 替代品。**
3. **中国个人开发者如果追求现实可得性，国内官方平台、本地模型、国内云入口通常比海外第一方更适合作为默认基线。**
4. **第三方宿主、聚合 API、BYOK 都有价值，但它们引入的是新的宿主与计费边界，不是“零成本复用”。**
5. **灰色渠道最适合被记录为风险，不适合被记录为前提。**
6. **国内官方路径更现实，但这不代表 Coding / Agent 套餐不会玩“限量抢购 + 后续涨价”的游戏。**
7. **`xx2api`、共享池、OAuth 套壳、薅 IDE AI 羊毛这类套利路径，不应再被默认视为可持续方案；现实里它们经常以封禁或失效收场。**

## 8. 多语言 deep research 补充结论

本轮又补做了一轮多语言交叉核对，按 `2026-04-05` 实际检索结果，至少覆盖了：

- 俄语
- 越南语
- 日语
- 法语
- 印尼语
- 印地语

这里有三个对决策真正有用的结论：

### 8.1 多语言页面能证明“渠道存在”，但不能替代英文主文

多语言页面的价值主要在于：

- 验证这个产品是否真的在做本地化分发
- 验证“支持地区 / 可用国家 / 订阅边界 / 使用入口”这些高层信息是否在不同语言中保持一致
- 观察厂商是否在特定语言市场做更强投放

但它们通常不适合替代英文主文作为唯一依据，因为：

- 有些页面明确标注为机器翻译
- 多语言页面的更新时间可能落后于英文页
- 有些语言只本地化了首页或套餐页，没有完整帮助中心

### 8.2 各厂商的本地化覆盖并不均匀

按这次交叉检索，能看到非常不同的策略：

- `OpenAI` 的帮助中心对 `日语 / 法语 / 印尼语 / 印地语` 有明确本地化页面；但我没有稳定找到同等级的 `俄语 / 越南语` 支持国家页。
- `Anthropic / Claude` 的帮助中心对 `俄语 / 日语 / 法语 / 印尼语` 的本地化更清楚，尤其是 `Claude Code` 与 `支持地区` 相关文章；但 `越南语 / 印地语` 的公开帮助中心覆盖不明显。
- `Google One / Google AI plans` 的本地化页覆盖更广，这轮至少明确看到了 `俄语 / 越南语 / 日语 / 法语 / 印尼语` 页面；`印地语` 入口不稳定，搜索结果更多回落到英语印度区页面。

这意味着：

- 如果你在做“多语言官网覆盖”层面的市场可得性判断，Google 的公开分发面最宽。
- 如果你在做“编码入口 / 帮助中心 / 支持条款”判断，Claude 和 OpenAI 仍然要回到英文主帮助中心核对最新规则。

### 8.3 多语言页面反复确认了同一组边界

尽管语言不同，能稳定交叉确认出来的仍然是同一件事：

- `OpenAI API` 继续按“支持国家与地区列表”来限定可用性，且超出支持地区使用可能导致账号被阻断或暂停。
- `Claude` 继续明确区分 `Claude` 产品入口、`Claude Code`、`Claude Console / API`，并按支持地区开放。
- `Google AI plans` 继续把 `Google AI Pro / Ultra` 作为面向个人 Google 账号的订阅入口，同时强调可用国家与部分功能的地区/语言限制。

换句话说，多语言 deep research 没有推翻正文结论，反而强化了它：

**真正稳定的判断维度不是“这个厂商有没有我的语言页面”，而是它是否同时给出清晰的支持地区、产品边界、API 边界和计费边界。**

## 9. 信源

### 9.1 官方与高可信来源

- [S01][A] OpenAI: ChatGPT Pricing  
  https://openai.com/chatgpt/pricing/
- [S02][A] OpenAI Help: How can I move my ChatGPT subscription to the API?  
  https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api
- [S03][A] OpenAI Help: OpenAI API - Supported Countries and Territories  
  https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories
- [S04][A] Claude Help: Where can I access Claude?  
  https://support.claude.com/articles/8461763-where-can-i-access-claude-ai
- [S05][A] Claude Help: What is the Pro plan?  
  https://support.claude.com/en/articles/8325606-what-is-the-pro-plan
- [S06][A] Claude Help: Using Claude Code with your Pro or Max plan  
  https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- [S07][A] Claude Help: Manage extra usage for paid Claude plans  
  https://support.claude.com/en/articles/12429409-manage-extra-usage-for-paid-claude-plans
- [S08][A] Anthropic Docs: Connect Claude Code to tools via MCP  
  https://docs.anthropic.com/en/docs/claude-code/mcp
- [S09][A] Google One: Google AI plans  
  https://one.google.com/about/google-ai-plans/
- [S10][A] Google AI for Developers: Gemini Developer API pricing  
  https://ai.google.dev/pricing
- [S11][A] Google AI for Developers: Available regions for Google AI Studio and Gemini API  
  https://ai.google.dev/gemini-api/docs/available-regions
- [S12][A] Cursor Docs: Pricing  
  https://docs.cursor.com/account/pricing
- [S13][A] Cursor Docs: API Keys / BYOK  
  https://docs.cursor.com/advanced/api-keys
- [S14][A] GitHub: Copilot plans and pricing  
  https://github.com/features/copilot/plans
- [S15][A] OpenRouter Docs: Overview  
  https://openrouter.ai/docs/
- [S16][A] OpenRouter Docs: BYOK  
  https://openrouter.ai/docs/use-cases/byok
- [S17][A] Poe: About  
  https://poe.com/about
- [S18][A] Poe Help: Subscriptions FAQs  
  https://help.poe.com/hc/en-us/articles/19945140063636-Poe-Subscriptions-FAQs
- [S19][A] AWS: Amazon Bedrock pricing  
  https://aws.amazon.com/bedrock/pricing/
- [S20][A] AWS Docs: Subscribe to a model in Amazon Bedrock Marketplace  
  https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-marketplace-subscribe-to-a-model.html
- [S21][A] OpenAI Help: OpenAI Codex CLI – Getting Started  
  https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started
- [S22][A] OpenAI Help: Using Codex with your ChatGPT plan  
  https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan/
- [S23][A] Azure: Azure OpenAI pricing  
  https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
- [S24][A] Microsoft Learn: Microsoft Foundry Models overview  
  https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/model-catalog-overview
- [S25][A] Ollama Docs  
  https://docs.ollama.com/
- [S26][A] Hugging Face Docs: Models / Model Hub  
  https://huggingface.co/docs/hub/en/models

### 9.2 中国官方来源

- [S27][A] Kimi 官方产品页  
  https://www.kimi.com/ai-models/kimi-k2-5
- [S28][A] Kimi API 开放平台  
  https://platform.kimi.com/
- [S29][A] DeepSeek API Docs  
  https://api-docs.deepseek.com/
- [S30][A] 阿里云百炼：平台介绍  
  https://help.aliyun.com/zh/model-studio/product-overview/alibaba-cloud-model-studio-introduction
- [S31][A] 阿里云百炼：开通与快速开始  
  https://help.aliyun.com/zh/model-studio/activate-alibaba-cloud-model-studio
- [S32][A] 百度智能云：千帆大模型平台  
  https://cloud.baidu.com/product/wenxinworkshop.html
- [S33][A] 腾讯云：混元大模型  
  https://cloud.tencent.com/product/hunyuan
- [S34][A] 火山引擎：产品与豆包 / 火山方舟入口  
  https://www.volcengine.com/

### 9.3 <span style="color:#ef6c00;"><strong>C 级：观察性来源</strong></span>

- [S35][C] GitHub: awesome-ai-proxy  
  https://github.com/mn-api/awesome-ai-proxy
- [S36][B] 36Kr: OpenRouter 数据与中国模型调用增长  
  https://www.36kr.com/p/3701403165487494
- [S50][A] DeepSeek API Docs：模型与价格  
  https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
- [S51][A] Kimi API 开放平台：模型推理价格说明  
  https://platform.kimi.com/docs/pricing/chat
- [S52][B] 新浪财经：GLM Coding Plan 上线即售罄  
  https://finance.sina.com.cn/stock/hkstock/2026-02-13/doc-inhmrtih2188804.shtml

### 9.4 <span style="color:#c62828;"><strong>D 级：社论 / 专栏 / 评论</strong></span>

- [S53][D] MetricNexus: Google Banned OpenClaw Users, Then Reversed Course  
  https://metricnexus.ai/blog/google-banning-openclaw-antigravity-users
- [S54][D] 搜狐：从谷歌封杀 OpenClaw 被封事件，看 AI 平台如何判断“异常账号”  
  https://www.sohu.com/a/992078243_121751983

### 9.5 <span style="color:#6a1b9a;"><strong>E 级：BBS / 论坛 / 帖子</strong></span>

- [S55][E] V2EX：说个笑话，中转站开业不到一天被迫停了  
  https://s.v2ex.com/t/1198984
- [S56][E] V2EX：[分享] 卡商+号商自建的 Claude API 中转站，号池自动补充，不怕封号断供  
  https://us.v2ex.com/t/1198574
- [S57][E] V2EX：OpenAI 封号潮来袭？国内极速中转广告帖  
  https://www.v2ex.com/t/1203567

### 9.6 多语言交叉核对来源

以下来源主要用于交叉核对“支持地区 / 可用区域 / 套餐边界 / 入口形态”是否在多语言页面中保持一致；正文判断仍以英文或主站原文为准：

- [S37][A] Claude Help（俄语）：Anthropic Help Center Home  
  https://support.claude.com/ru/
- [S38][A] Google One（俄语）：Google AI Plans  
  https://one.google.com/intl/ru_ru/about/google-ai-plans/
- [S39][A] Google One（越南语）：Google AI Plans  
  https://one.google.com/intl/vi_vn/about/google-ai-plans/
- [S40][A] OpenAI Help（日语）：Supported Countries  
  https://help.openai.com/ja-jp/articles/5347006-openai-api-supported-countries-and-territories
- [S41][A] Claude Help（日语）：Using Claude Code with your Pro or Max plan  
  https://support.claude.com/ja/articles/11145838-pro-%E3%81%BE%E3%81%9F%E3%81%AF-max-%E3%83%97%E3%83%A9%E3%83%B3%E3%81%A7-claude-code-%E3%82%92%E4%BD%BF%E7%94%A8%E3%81%99%E3%82%8B
- [S42][A] Google One（日语）：Google AI Plans  
  https://one.google.com/intl/ja_jp/about/google-ai-plans/
- [S43][A] OpenAI Help（法语）：Supported Countries  
  https://help.openai.com/fr-fr/articles/5347006-openai-api-pays-et-territoires-pris-en-charge
- [S44][A] Claude Help（法语）：Where can I access Claude?  
  https://support.claude.com/fr/articles/8461763-ou-puis-je-acceder-a-claude-ai
- [S45][A] Google One（法语）：Google AI Plans  
  https://one.google.com/intl/fr_fr/about/google-ai-plans/
- [S46][A] OpenAI Help（印尼语）：Supported Countries  
  https://help.openai.com/id-id/articles/5347006-openai-api-supported-countries-and-territories
- [S47][A] Claude Help（印尼语）：Using Claude Code with your Pro or Max plan  
  https://support.claude.com/id/articles/11145838-menggunakan-claude-code-dengan-paket-pro-atau-max-anda
- [S48][A] Google One（印尼语）：Google AI Plans  
  https://one.google.com/intl/id_id/about/google-ai-plans/
- [S49][A] OpenAI Help（印地语）：Supported Countries  
  https://help.openai.com/hi-in/articles/5347006-openai-api-supported-countries-and-territories
