# Agent 中断与交互边界调研

- 状态：内部研究记录
- 目标：梳理当前 agent 体系里，不同控制方、运行载体与控制机制下的中断、交互、审批与恢复执行能力边界
- 研究时间：2026-04-06
- 研究范围：
  - 官方文档
  - 可核对的本地源码与协议实现
  - 社区 issue / discussion
- 非目标：
  - 不讨论某个特定 skill 的提示词写法
  - 不把“体验建议”混写成“平台已支持能力”

## 1. 背景与核心结论

这份总览不是只回答“某一个 agent 能不能和人交互”，而是更具体地回答：

- 哪些机制只能影响模型下一步
- 哪些机制能真正阻断动作
- 哪些机制能真正暂停并等待人类输入
- 哪些机制支持外部 supervisor 在运行中打断或改道

本次调研后的核心结论是：

1. `prompt` / `skills` 主要属于静态上下文注入，不是运行时中断机制。
2. `hooks` / `rules` 主要属于运行时守卫和续推机制，适合拦截、改写下一步、补充上下文，但不等价于“挂起等待人”。
3. `approval_policy` 属于审批闸门，适合把特定动作挡在用户确认前，但它本身不是通用问答 UI。
4. `request_user_input`、`MCP elicitation`、`App Server` 才是更接近真正 human-in-the-loop harness 的控制面。
5. 如果目标是“外部脚本或 supervisor 强制当前 agent 停下并和人交互”，最佳控制组合不是 skill，也不是普通 prompt，而是 `App Server + request_user_input / elicitation + turn/interrupt / turn/steer`。

这份总览页的角色是：

- 先给统一分析框架
- 再给工具 / 机制边界总表
- 最后把不同 agent 方案拆到子文档里

当前子专题主要包括：

- Codex
- Claude Code
- Skill
- LangChain 自研 Agent

## 2. 分析框架：控制方、运行载体、控制机制

这里必须先把 3 个维度拆开，否则很容易把“谁的 agent”“agent 跑在哪”“用什么手段控制”混成一件事。

如果用更严格一点的说法，我不建议长期使用“主体 / 载体 / 工具”这组词，而更建议用：

- 控制方
- 运行载体
- 控制机制

原因是：

- “主体”这个词太宽，容易把产品方、用户、agent 本身、外部 supervisor 混在一起
- “工具”这个词也太宽，容易把 CLI、IDE、hook、prompt 全都叫工具

### 2.1 控制方

控制方讨论的是：

- 这个 agent 是谁提供的
- 这个 agent 的核心运行时是谁控制的

在这份调研里，最常见的两类控制方形态是：

- `public agent`
  - 平台方已经做好的 agent
  - 例如公开产品里的 Codex、Claude Code 这类现成 agent
- `self agent`
  - 你自己搭的 agent
  - 你自己决定 orchestration、状态机、审批、问答和恢复方式

换一种更直白的说法，也可以写成：

- 别人的 agent
- 自研的 agent

这两类的最大差别是：

- 别人的 agent
  - 你通常只能使用平台已经给你的能力边界
- 自研的 agent
  - 你可以自己设计中断模型、交互模型和 supervisor 控制面

所以如果只是为了说人话：

- `public agent / self agent`
- 别人的 agent / 自研 agent

都可以

但如果是为了做架构分析，我更推荐写成：

- 控制方

### 2.2 运行载体

运行载体讨论的是：

- agent 跑在什么产品形态里
- 中断与交互最终通过什么宿主能力被承接

例如：

- 官方 CLI / TUI
- IDE 插件
- App Server
- 企业内部工作台
- 你自己做的 orchestrator 或 GUI

载体决定的通常是：

- 有没有 UI
- 有没有审批弹层
- 能不能承接结构化用户输入
- 能不能暴露 turn 级控制面

所以同一种 agent 方案，在不同运行载体里，交互能力也可能不完全一样。

### 2.3 控制机制

控制机制讨论的是：

- 你具体用什么手段去影响 agent

例如：

- `prompt`
- `skills`
- `hooks`
- `rules`
- `approval_policy`
- `request_user_input`
- `MCP elicitation`
- `turn/interrupt`
- `turn/steer`

这一层回答的是：

- 你靠什么实现软引导
- 你靠什么实现硬拦截
- 你靠什么实现真暂停
- 你靠什么实现外部控制

### 2.4 这 3 层不要混

这份调研里，后面大多数表格和结论，比较的主要是：

- 控制机制层

而不是：

- 控制方层
- 运行载体层

所以必须明确：

- `prompt / skills / hooks` 不是控制方
- `prompt / skills / hooks` 也不是运行载体
- 它们是控制 agent 的机制

一个更准确的分析句式应该是：

- 在某个控制方提供的 agent 上
- 通过某个运行载体
- 你能调用哪些控制机制
- 这些控制机制对中断与交互的边界分别是什么

## 3. 术语拆分

为了避免把不同能力混成一类，这里先固定几个术语：

### 3.1 软引导

软引导指：

- 给模型额外上下文
- 告诉模型“建议先问问题”
- 告诉模型“不要直接继续”

这类方式会影响模型行为，但不保证真正停住。

### 3.2 硬拦截

硬拦截指：

- 阻止工具调用
- 阻止危险命令执行
- 要求先审批再继续

这类方式会阻止某个动作，但未必进入一个完整的人机问答流程。

### 3.3 真暂停

真暂停指：

- 当前 turn 在运行时进入 pending 状态
- 客户端或外部系统必须返回结构化响应
- 响应后同一 turn 或同一线程继续执行

这才是严格意义上的 human-in-the-loop。

### 3.4 外部控制

外部控制指：

- 当前 turn 已经在跑
- supervisor 或 client 可以插入额外输入
- supervisor 或 client 可以中断、取消或恢复

这属于 harness 控制面，而不是 prompt 工程。

## 4. 不同工具 / 机制的能力边界总表

先强调一次：

- 下面这个表比较的是工具 / 机制
- 不是 `public agent` 和 `self agent` 的对比表
- 也不是不同产品载体的对比表

| 工具 / 机制 | 能影响下一步 | 能阻止动作 | 能暂停等人 | 能恢复执行 | 适合做什么 | 主要边界 |
| --- | --- | --- | --- | --- | --- | --- |
| `prompt` | 是 | 否 | 否 | 否 | 软引导 | 只能“建议”，不能强制 |
| `skills` | 是 | 否 | 否 | 否 | 静态上下文注入、流程约束 | 更像预载规则，不是 runtime interrupt |
| `hooks` | 是 | 是 | 否 | 否 | 运行时守卫、补充上下文、拒绝工具调用 | `Stop hook` 是 continuation prompt，不是真暂停 |
| `rules` | 否 | 是 | 否 | 否 | 命令前缀级审批和禁用 | 适合 guardrail，不适合复杂问答 |
| `approval_policy` | 部分 | 是 | 部分 | 部分 | 把工具调用、权限请求挡在审批前 | 更像审批闸门，不是自由交互层 |
| `request_user_input` | 是 | 不以拦截为主 | 是 | 是 | 结构化问答、等待用户选择或填写 | 受 collaboration mode / client 支持约束 |
| `MCP elicitation` | 是 | 不以拦截为主 | 是 | 是 | 外部 MCP 服务发起表单 / URL 交互 | 强依赖客户端实现质量 |
| `turn/interrupt` | 否 | 是 | 否 | 否 | 外部 supervisor 取消当前 turn | 是中断，不是问答 |
| `turn/steer` | 是 | 否 | 否 | 同 turn 继续 | 外部 supervisor 在当前 turn 中途改道 | 只适用于 steerable 的 regular turn |

## 5. 各工具 / 机制的详细边界

## 5.1 Prompt

`prompt` 级控制最便宜，也最弱。

它能做的是：

- 告诉模型“如果信息不足，先提问”
- 告诉模型“遇到高风险动作先确认”
- 告诉模型“先给 partial judgment，再继续收敛”

它做不到的是：

- 在 runtime 阻止模型继续说下去
- 阻止模型发出某次工具调用
- 让系统进入一个可恢复的等待态

因此，prompt 更适合“行为倾向约束”，不适合承担真正的中断控制。

## 5.2 Skills

从能力模型上看，`skills` 更接近“预打包的上下文与流程模块”，不是 runtime hook。

它更适合：

- 规定某类任务的工作流
- 提供参考资料、脚本、模板
- 在命中某类任务时注入额外说明

它不适合：

- 监听 turn 中途事件
- 拦截某次具体工具调用
- 单独承担暂停 / 恢复交互

这里有一个重要判断：

- `skills` 可以提升“先问再答”的概率
- 但不能提供“等待用户答复”的系统级保证

这不是 skill 设计得不够强，而是载体层级不同。

## 5.3 Hooks

`hooks` 是 Codex 当前最接近“脚本介入 agent 生命周期”的机制，但它的能力边界需要严格拆开。

官方文档把它定义为生命周期脚本扩展，覆盖 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 等阶段。

本次也对本地克隆的 `openai/codex` 仓库做了核对。基于本地源码，可以确认：

- `Stop` hook 的输出结构只覆盖 `continue`、`decision`、`reason`、`stopReason`、`systemMessage` 这一类字段。
- `decision = "block"` 时，运行时会把 `reason` 作为 continuation prompt 注入下一轮，而不是把 turn 挂起等待用户。
- 相关测试也证明 continuation prompt 会进入后续请求历史，而不是进入一个等待态 UI。

因此，hooks 的最适合用途是：

- `UserPromptSubmit`
  - 给 prompt 注入额外 developer context
  - 强制加一层“先澄清再执行”的系统上下文
- `PreToolUse`
  - 拦危险动作
  - 在工具真正执行前 deny
- `PostToolUse`
  - 审查工具结果
  - 发现异常时替换反馈或中断后续
- `Stop`
  - 把当前结果打回去，要求下一轮先做别的

hooks 的边界则是：

- 它更像“运行时续推器”
- 不是“原生挂起并等待用户”

另外，官方文档当前还标注了 Windows 支持临时禁用，这意味着如果系统主控逻辑高度依赖 hooks，最好优先假设部署在类 Unix 或 WSL2 环境。

## 5.4 Rules

`rules` 这层的定位更接近“命令和工具使用 guardrail”。

它适合：

- 对命令前缀设 `allow / prompt / forbidden`
- 让某些 Bash 前缀永远要求审批
- 永远拒绝某类危险命令

它不适合：

- 做多轮结构化用户问答
- 中途让用户编辑 agent 的中间状态
- 挂起 turn 等待表单结果

所以，rules 和 hooks 很适合组合，但它们都不应该被误当成真正的 HITL harness。

## 5.5 Approval Policy

官方文档与本地源码都表明，Codex 的审批策略已经不是单一开关，而是一套可细分的权限面。

当前可见的审批策略包括：

- `untrusted`
- `on-failure`
- `on-request`
- `never`
- `granular`

其中 `granular` 还能拆到：

- `sandbox_approval`
- `rules`
- `skill_approval`
- `request_permissions`
- `mcp_elicitations`

审批策略最适合：

- 把特定动作拦在用户确认前
- 控制命令执行、文件修改、权限扩展
- 作为 “不要让 agent 默默做事” 的底线

但审批策略本身不是完整问答系统。它更偏“要不要继续”的闸门，而不是“你真正想要哪条路径”的协商层。

## 5.6 request_user_input

`request_user_input` 是当前 Codex 体系里最接近“真正暂停等待用户”的内置交互工具。

从官方文档与本地源码核对后，可以确认：

- 它有明确的 `questions / options / answers` 数据结构。
- tool 定义明确写着：它会 request user input 并等待响应。
- 运行时会 `await` 用户回答；如果没有回答或请求被清理，会返回取消结果。
- App Server 测试覆盖了完整 round trip：服务端发请求，客户端回 `answers`，然后 turn 再继续。

它的边界是：

- 需要客户端支持
- 需要所处 collaboration mode 允许
- 更适合短问题、结构化选项、少量问答

## 5.7 MCP Elicitation

MCP elicitation 是另一条真正的 HITL 通道，而且比 `request_user_input` 更适合“外部服务驱动”的交互。

官方文档写得很明确：

- MCP server 可以通过 `mcpServer/elicitation/request` 打断 turn
- 请求可以是 `form` 或 `url`
- 客户端返回 `accept / decline / cancel`

本地源码核对后也能确认：

- TUI 里已经有单独的 elicitation overlay
- 客户端路径里存在专门的 `resolve_elicitation(...)` 处理

MCP elicitation 的优势是：

- 交互由外部服务发起
- 模式可以更结构化
- 更适合接企业内部表单、审批系统、外部工作流平台

它的边界是：

- 非常依赖 client 端实现是否完善
- 理论支持不等于实际客户端链路一定好用

## 5.8 turn/interrupt 与 turn/steer

如果目标是“由外部 harness 直接控制正在运行的 agent”，最关键的不是 hooks，而是 App Server 控制面。

当前协议里明确有两条：

- `turn/interrupt`
  - 取消正在进行的 turn
  - 最终 turn 状态变成 `interrupted`
- `turn/steer`
  - 给当前正在执行的 regular turn 注入额外用户输入
  - 不启动新 turn，而是在同一 turn 内改道

官方文档给了明确说明与示例，本地源码测试也证明 `turn/interrupt` 是真实能力，而不是文档占位。

这两条的意义非常大：

- `turn/interrupt` 解决“现在立刻停下”
- `turn/steer` 解决“别停，改朝这个方向继续”

对外部 supervisor 而言，这是最像真正 agent harness 的控制面。

## 6. 社区观察

社区层面的抱怨，并不主要集中在“没有任何中断入口”，而是集中在“中断后上下文不够完整，难以顺滑改道”。

一个典型例子是 GitHub issue `#5253`。问题核心不是“没有 stop”，而是：

- 当用户说 “No, and tell Codex what to do differently”
- 当前正在进行的工具调用上下文没有被很好保留
- 结果是用户不得不自己重复工具调用细节

这说明：

1. 社区真正想要的是“可恢复、带上下文的中断”
2. 单纯“加一个 stop 按钮”并不等于好的交互 harness

这也与本地源码观察完全一致：

- `Stop hook` 本质是 continuation prompt
- 真正结构化的交互要走 `request_user_input` 或 `elicitation`

## 6.1 与 Claude Code 的对照

如果把 Codex 和 Claude Code 放在同一个问题域里比较，可以看到两者虽然都支持 hooks、审批和人工介入，但重心并不完全相同。

### Claude Code 侧更靠前的点

从官方 Claude Code 文档看，Claude Code 把“人工介入”更直接地放在工具调用与权限链路里：

- hooks 的 `PreToolUse` 可以返回 `allow / deny / ask`
- `ask` 会把工具调用级确认直接推给用户界面
- 非交互模式下支持 `defer`，由外部调用方先接管待处理工具调用，之后再恢复
- Agent SDK 还单独提供 `canUseTool` 与 `AskUserQuestion`
- `AskUserQuestion` 既能做多选，也能做自由文本提问

这意味着 Claude Code 在“工具调用前停一下，让人决定是否继续”这条链路上，明显更偏内建式交互 UX。

但它的边界也要说清：

- `ask` / `defer` 的核心落点仍然是工具调用审批
- `AskUserQuestion` 解决的是 agent 主动发问，不等于外部 supervisor 对运行中 turn 的协议级改道
- 从当前公开文档看，没有看到与 Codex `turn/interrupt`、`turn/steer` 同等显式的 turn 级控制面

### Codex 侧更靠前的点

Codex 的优势不在于把更多确认塞进 hook，而在于把“暂停、等待、改道、恢复”拆成更独立的协议能力：

- 有更显式的 `App Server` 控制面
- 有 `turn/interrupt`
- 有 `turn/steer`
- 有独立的 `request_user_input`
- 有 `MCP elicitation`
- 这些能力与 hooks、rules、approval_policy 并列，而不是都挤在工具权限流里

也就是说，Codex 更像是把“真正的 supervisor 控制”和“真正的等待用户输入”放到了 hooks 之外的状态机与协议层。

所以二者更准确的差别不是“谁更强”，而是“谁把交互放在哪一层”：

- Claude Code：更偏把交互闸门压进 hook / permission UX
- Codex：更偏把交互与中断做成外部控制面和协议能力

如果目标是做“工具调用前确认”的内建体验，Claude Code 的公开形态更直接。

如果目标是做“运行中 turn 的中断、改道、等待、恢复”这种 supervisor harness，Codex 的公开形态更清晰。

### 对非官方社区材料的判断

这次调研接触到的非官方社区材料，不能作为 Claude Code 当前能力边界的高置信源码基线。

原因很直接：

- 这类材料通常已经过二次整理、转译、删改或重组
- 很难证明它与正式现行运行时保持同步
- 很难据此判断正式产品里的当前 hooks、approval、interrupt 与 user input 边界

因此，这类材料最多只能说明：

- 社区有人尝试整理、重写或转译相关结构

但它不能直接说明：

- Claude Code 当前 hooks 的真实运行时边界
- Claude Code 当前审批和中断在正式产品里的现行实现

所以这次对照里，它最多只能作为低权重背景材料，不能高于官方 Claude Code 文档。

## 6.2 架构图与源码速览入口

为了避免 Codex 和 Claude Code 的细节互相打架，这部分已经拆成两个子文档：

- [codex.md](codex.md)
  - Codex 的中断 / 交互架构图
  - 轻量源码讲解
  - 适合看 turn 级控制面、审批、用户输入和 supervisor harness 的关系
- [claude-code.md](claude-code.md)
  - Claude Code 的中断 / 交互架构图
  - 轻量源码讲解
  - 适合看工具调用级闸门、`ask / defer`、问答入口与外部接管的关系
- [skill.md](skill.md)
  - Skill 对交互与中断的边界
  - 适合看 Skill 为什么更像策略层，而不是运行时控制层
- [langchain.md](langchain.md)
  - LangChain 自研 agent 的交互与中断设计
  - 适合看如果自己实现 agent，如何落 prompt、middleware、interrupt、恢复链

如果只记一个最短结论：

- Codex：更像 turn 级状态机和外部控制面
- Claude Code：更像动作级审批闸门和贴近工具调用的人机交互
- Skill：更像软引导和流程塑形
- LangChain：更像你自己拼装提示层和状态机层

## 7. 当前最现实的能力分层

如果从“今天就能做成什么样”来判断，比较现实的能力分层如下。

### 7.1 第一层：提示词 / Skill 级软引导

能做到：

- 明显提高“先问再答”的概率
- 给出统一的工作流约束
- 在某些任务类型上获得较稳定的行为风格

做不到：

- 强制阻断
- 真暂停等待人
- 中途被外部 supervisor 改写当前 turn

适合：

- 低成本流程规范
- 统一话术
- 减少误操作概率

### 7.2 第二层：Hooks + Rules 级守卫

能做到：

- 在关键生命周期点插入脚本
- 阻止部分工具调用
- 要求下一轮先做某个动作
- 把额外 developer context 注入后续请求

做不到：

- 原生挂起等待用户
- 直接弹结构化表单
- 独立承担完整 HITL

适合：

- 阻断危险动作
- 强制先澄清再执行
- 做日志、审计、策略守门

### 7.3 第三层：Approval 级人工闸门

能做到：

- 把命令、补丁、权限请求挡在人工确认前
- 对特定类别动作实行统一审批

边界：

- 更像动作审批，不是开放式问答
- 可作为 HITL 的一部分，但通常不是全部

### 7.4 第四层：request_user_input / MCP elicitation 级真交互

能做到：

- 真实等待用户输入
- 结构化返回答案
- 在同一 turn / thread 生命周期内继续

边界：

- 需要客户端实现
- 需要交互协议稳定
- 更适合短问答和表单，而非无限制长对话

### 7.5 第五层：App Server supervisor 级运行时控制

能做到：

- `turn/start`
- `turn/interrupt`
- `turn/steer`
- 配合 `request_user_input`、`approval`、`elicitation`

这是最接近“自己做一个 agent harness”的层。

它适合：

- IDE、GUI、Web 工作台
- 企业内部 orchestrator
- 需要明确 `blocked / resumed / interrupted / completed` 状态机的系统

## 8. 推荐架构判断

如果目标是“做一个比较成熟的 agent 中断与交互体系”，建议按下面顺序选型：

1. 如果只是想改善行为倾向：
   - 用 `prompt + skills`
2. 如果需要守卫和拦截：
   - 用 `hooks + rules + approval_policy`
3. 如果需要真 HITL：
   - 用 `request_user_input` 或 `MCP elicitation`
4. 如果需要外部 supervisor 真正掌控 agent：
   - 用 `App Server`，把 `turn/interrupt`、`turn/steer`、`request_user_input`、`approval` 统一纳入状态机

不建议的做法是：

- 试图把 skill 直接当成中断机制
- 试图把 stop hook 当成“暂停等人”的替代物
- 只靠关键词和 prompt 约束实现高可靠 HITL

## 9. 最终结论

就当前 Codex 体系的边界来看：

- `skills` 是“让模型更像按某种流程做事”
- `hooks` 是“在生命周期点拦截或改写下一步”
- `rules` / `approval_policy` 是“让动作过人工闸门”
- `request_user_input` / `MCP elicitation` 是“真正进入等待用户输入”
- `turn/interrupt` / `turn/steer` 是“外部 supervisor 控制运行中 turn”

因此，如果问题是：

> 现在基于不同形式的 agent 中断和交互，不同载体的边界能做成什么样？

一个相对准确的答案是：

- 软引导：已经成熟
- 守卫拦截：已经可用
- 审批闸门：已经可用
- 真暂停等待人：已经存在，但要靠 `request_user_input` / `elicitation` / client 实现
- 外部 supervisor 运行时控制：已经存在，最佳入口是 `App Server`

真正还不够成熟的，不是“有没有接口”，而是：

- 不同客户端链路的一致性
- 中断后的上下文保真
- Windows 与非 Unix 环境下的体验对齐

## 10. 调研输入说明

- 本文基于多类材料的交叉整理与比对，只保留和结论直接相关的归纳内容。
- 正文以边界判断、设计取向和能力分层为主，不展开材料来源细节。
- 涉及实现层判断时，只保留经交叉核对后的结论，不把外部材料细节写入正文。
- 非官方材料仅作为低权重背景信息，不高于正式公开资料。
