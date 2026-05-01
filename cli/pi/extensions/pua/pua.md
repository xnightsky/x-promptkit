# PUA 跨平台调研与 pi 扩展设计文档

> 调研时间：2026-04-30
> 调研范围：Claude Code (3.1.0/3.2.3) / Codex / pi（pua/）
> 核心问题：为什么 `always_on=true` 已触发，但 AI 仍可能不遵守规则？

---

## 1. 环境现状

### 1.1 已安装的三个 PUA 实例

| 平台 | 路径 | 版本 | 实现方式 | always_on 支持 |
|------|------|------|----------|----------------|
| **Claude Code** | `~/.claude/plugins/cache/pua-skills/pua/3.1.0/` | 3.1.0 | `hooks.json` + shell 脚本 | ✅ `SessionStart` → `session-restore.sh` 检测 `always_on` → `additionalContext` 注入 |
| **Claude Code (marketplace)** | `~/.claude/plugins/marketplaces/pua-skills/` | 3.0.0 | Claude Code plugin marketplace 源，含 `plugin.json` + `hooks/` + `skills/` + 多平台适配（codex/cursor/kiro/codebuddy/vscode） | ✅ `hooks/session-restore.sh` 注入 |
| **Codex** | `~/.codex/skills/pua -> ~/.codex/pua/codex/pua` | 3.2.3 | 纯 `SKILL.md` 文本协议 | ❌ 无 always_on，需 `$pua` 手动触发或描述匹配自动触发 |
| **pi** | `~/.pi/agent/extensions/pua/` | 自定义 | TypeScript Extension | ✅ `before_agent_start` 检测 `always_on` → `systemPrompt` 拼接 |

### 1.2 共用配置

```
~/.pua/config.json        # always_on / flavor 配置
~/.pua/.failure_count     # 官方失败计数文件
~/.pi/agent/pua-state.json # pi 扩展私有状态
```

当前配置：
```json
{
  "always_on": true,
  "flavor": "huawei"
}
```

### 1.3 Skill 源文件

```
~/.codex/pua/                # tanweai/pua git 仓库（版本 3.2.3）
├── codex/pua/SKILL.md      # Codex / pi 共用 skill 源
├── hooks/                  # Claude Code 专用钩子
│   ├── hooks.json          # SessionStart / PostToolUse / PreCompact / Stop / SubagentStop
│   ├── session-restore.sh  # always_on 检测 + additionalContext 注入
│   ├── failure-detector.sh # Bash 失败检测
│   └── pua-loop-hook.sh    # Stop 钩子（循环拦截）
├── skills/                 # 其他变体（p7/p9/p10/pro/pua-loop...）
│
~/.claude/plugins/marketplaces/pua-skills/   # Claude Code marketplace 安装源（版本 3.0.0）
├── plugin.json             # Claude Code plugin 元数据
├── hooks/                  # Claude Code hooks（session-restore / failure-detector 等）
├── skills/                 # 多平台 skill 变体（p7/p9/p10/pro/pua-loop/agent-enforcer）
├── codex/                  # Codex 适配
├── cursor/                 # Cursor IDE 适配
├── kiro/                   # Kiro（Amazon）适配
├── codebuddy/              # CodeBuddy（腾讯）适配
├── vscode/                 # VS Code Copilot 适配
├── agents/                 # Agent 定义
├── scripts/                # 安装/管理脚本
├── evals/                  # 效果评估
└── landing/                # Landing page (https://openpua.ai)
```

---

## 2. 核心问题："触发" ≠ "生效"

### 2.1 现象

某 session 收到复杂代码评审任务（跨前后端、多阶段、P1/P2 级别问题）后：
- ❌ 未输出方法论路由 `[方法论路由 🧭] 检测到 Code Review → 自动选择 ⬜ Jobs...`
- ❌ 未检查是否需要先写 `docs/plans/<topic>.md`
- ❌ 直接开始执行 `rg` / `read` 工具

### 2.2 根因分析

**PUA always_on 只做了一件事：把规则文本注入给 AI。它没有任何机制能"代替 AI 做判断"。**

具体展开：

```
┌─────────────────────────────────────────────────────────────┐
│  用户发送任务："请修复这段代码评审中的 P1/P2 问题..."         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  [钩子层] before_agent_start / SessionStart                 │
│  1. 读取 ~/.pua/config.json → always_on=true               │
│  2. 读取 flavor → huawei                                   │
│  3. 构建 behaviorProtocol 文本                             │
│  4. 拼进 systemPrompt / additionalContext                   │
│                                                             │
│  ✅ 触发成功 — 规则已注入                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  [模型层] AI 收到 systemPrompt（含完整 PUA 协议）            │
│  协议中明确写了：                                            │
│  "遇到跨前后端、多阶段、高风险或预计超过 30 分钟的任务时，    │
│   先按 PLANS.md 编写执行计划，再开始实施。"                  │
│                                                             │
│  但 AI 的选择是：                                            │
│  - 直接开始执行 bash: rg --files ...                        │
│  - 未输出旁白                                                │
│  - 未检查是否需要写计划                                      │
│                                                             │
│  ❌ 生效失败 — AI 未自觉遵守                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 为什么扩展无法强制拦截？

当前 ExtensionAPI / hooks.json 提供的事件钩子：

| 事件 | Claude Code | pi (pua.ts) | 能否拦截"未写计划就执行"？ |
|------|-------------|-------------|---------------------------|
| `SessionStart` / `session_start` | ✅ | ✅ | ❌ 只负责注入，不校验执行 |
| `before_agent_start` | N/A | ✅ | ❌ 只能改 systemPrompt，不能拦截 tool call |
| `PostToolUse` / `tool_result` | ✅ | ✅ | ❌ 事后检测，非事前拦截 |
| `PreCompact` | ✅ | N/A | ❌ 与执行无关 |
| `Stop` | ✅ | N/A | ❌ 与执行无关 |

**缺失的关键钩子：**
- `PreToolCall`：在执行 bash/read/edit 前拦截，检查前置条件
- `PreResponse`：在 AI 输出回复前校验格式/内容是否符合规则

如果存在 `PreResponse`，理论上可以：
```typescript
pi.on("pre_response", async (event, ctx) => {
  const text = event.text;
  if (!text.includes("[方法论路由 🧭]") && isComplexTask(event.userMessage)) {
    return { block: true, reason: "未输出方法论路由，禁止回复" };
  }
});
```

但 pi 和 Claude Code 的 ExtensionAPI 目前都没有提供这种中间件能力。

---

## 3. 三平台实现差异详析

### 3.1 Claude Code（3.1.0/3.2.3）

**发现路径：**
- 插件缓存：`~/.claude/plugins/cache/pua-skills/pua/3.1.0/`
- 或通过 `~/.claude/` 下的插件机制安装

**核心机制：**
```json
// hooks.json
{
  "SessionStart": [{
    "matcher": "startup|resume",
    "hooks": [{
      "type": "command",
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/session-restore.sh"
    }]
  }]
}
```

`session-restore.sh` 输出格式：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<完整 PUA 协议文本>"
  }
}
```

**特点：**
- 通过 `additionalContext` 注入，与 system prompt 分离
- 有 `SubagentStop` 钩子（pi 没有）
- 有 `pua-loop` 机制（Stop 钩子拦截循环）

### 3.2 Codex

**发现路径：**
```bash
~/.codex/skills/pua -> ~/.codex/pua/codex/pua
```

**核心机制：**
- 纯 `SKILL.md` 文本协议
- 通过 `$pua` 手动触发，或描述匹配自动触发
- **没有 `always_on` 机制**
- `~/.pua/config.json` 对 Codex **无效**

**安装方式（来自 `~/.codex/pua/.codex/INSTALL.md`）：**
```bash
git clone https://github.com/tanweai/pua.git ~/.codex/pua
ln -s ~/.codex/pua/codex/pua ~/.codex/skills/pua
```

### 3.3 pi（pua/）

**发现路径：**
```
~/.pi/agent/extensions/pua/
```

**核心机制：**
```typescript
// 1. session_start 时恢复状态
pi.on("session_start", async () => {
  restoreState();      // 读取 ~/.pua/config.json + ~/.pi/agent/pua-state.json
  rebuildProtocol();   // 构建 behaviorProtocol
});

// 2. before_agent_start 时注入
pi.on("before_agent_start", async (event, ctx) => {
  if (!state.enabled) return undefined;
  let extraPrompt = behaviorProtocol;
  // 叠加压力等级（L1–L4）
  const level = getLevel(state.failureCount);
  if (level > 0) extraPrompt += "\n\n" + pressurePrompts[level];
  return { systemPrompt: event.systemPrompt + "\n\n" + extraPrompt };
});

// 3. tool_result 时检测失败
pi.on("tool_result", async (event, ctx) => {
  if (isFailure(event)) {
    state.failureCount++;
    persistState();
  }
});
```

**特点：**
- 直接修改 `systemPrompt`（不是 `additionalContext`）
- 有 `tool_result` 失败检测（Claude Code 用 `PostToolUse`）
- 有 `/pua-on`、`/pua-off`、`/pua-status`、`/pua-reset` 命令
- skill 缺失时自动关闭

---

## 4. 验证脚本

### 4.1 现有测试：`pua.ittest.sh`

路径：`~/.pi/agent/extensions/pua/pua.ittest.sh`

覆盖场景：
1. 基本加载
2. always_on 自动激活
3. 失败检测与计数
4. 压力升级（连续失败）
5. 成功清零
6. on/off 持久化
7. 味道切换
8. skill 缺失保护

执行方式：
```bash
bash ~/.pi/agent/extensions/pua/pua.ittest.sh
```

### 4.2 新增建议：手动验证"生效"而非"触发"

当前测试只能验证"规则是否注入"（触发），无法验证"AI 是否遵守"（生效）。

建议增加以下手动验证：

```bash
# 验证场景：复杂任务是否先输出方法论路由再执行
echo '{"always_on": true, "flavor": "huawei"}' > ~/.pua/config.json
rm -f ~/.pua/.failure_count ~/.pi/agent/pua-state.json

# 发送一个明显需要计划的复杂任务
pi -p -e ~/.pi/agent/extensions/pua/ "请审查以下跨前后端代码评审，涉及 XSD 扩展和表单序列化协议修正。"

# 人工检查输出：
# 1. 是否包含 "[方法论路由 🧭]"？
# 2. 是否先检查 docs/plans/ 或提到 PLANS.md？
# 3. 是否直接开始执行工具？
```

---

## 5. 改进方向

### 5.1 短期：增强 system prompt 的强制性措辞

当前措辞：
> "遇到跨前后端、多阶段、高风险或预计超过 30 分钟的任务时，先按 PLANS.md 编写执行计划，再开始实施。"

建议改为更绝对的语言：
> "⚠️ 强制约束：在输出 `[方法论路由 🧭]` 并确认是否需要编写 `docs/plans/<topic>.md` 之前，**禁止执行任何工具调用**（bash/read/edit/web_search）。违反 = 3.25。"

这是概率性约束，但措辞越绝对，模型遵守率越高。

### 5.2 中期：框架层支持 PreToolCall / PreResponse 钩子

需要 pi / Claude Code 的 ExtensionAPI 支持新事件：

```typescript
// 理想 API
pi.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && !hasMethodologyBanner(ctx.session)) {
    return { block: true, reason: "未输出方法论路由，禁止执行工具" };
  }
});

pi.on("before_response", async (event, ctx) => {
  if (isComplexTask(ctx.userMessage) && !event.text.includes("[方法论路由")) {
    return { block: true, injectPrompt: "请先输出方法论路由，再给出回复。" };
  }
});
```

### 5.3 长期：AI 层自我监督

不是通过钩子强制，而是通过训练/微调让 AI 内化规则。
- 收集"触发成功但生效失败"的案例
- 作为负面样本加入微调数据
- 目标：AI 看到 system prompt 中的规则后，自觉遵守率 > 95%

---

## 6. 结论

> **PUA always_on 的"触发" = 规则注入成功；**
> **"生效" = AI 自觉遵守。**
> **两者不是一回事。**

那个 session 属于：
- ✅ 触发成功（`always_on=true` → `before_agent_start` 注入 systemPrompt）
- ❌ 生效失败（AI 未遵守"先计划再执行"规则）

当前扩展架构下，**无法从技术层面 100% 保证生效**。唯一的控制点是：
1. 增强 system prompt 措辞的绝对性
2. 等待框架支持 PreToolCall / PreResponse 钩子
3. 长期通过微调提高模型遵守率

---

## 附录：文件索引

| 文件 | 路径 | 说明 |
|------|------|------|
| pi 扩展 | `~/.pi/agent/extensions/pua/index.ts` | TypeScript，当前版本完整 |
| 测试脚本 | `~/.pi/agent/extensions/pua/pua.ittest.sh` | 8 场景验证 |
| 调研文档 | `~/.pi/agent/extensions/pua/pua.md` | 本文档 |
| CC 插件缓存 | `~/.claude/plugins/cache/pua-skills/pua/3.1.0/` | Claude Code 版 |
| CC hooks | `~/.claude/plugins/cache/pua-skills/pua/3.1.0/hooks/hooks.json` | 钩子配置 |
| Codex skill | `~/.codex/skills/pua/SKILL.md` | 软链接到 `~/.codex/pua/codex/pua/SKILL.md` |
| PUA 源码仓库 | `~/.codex/pua/` | tanweai/pua git 仓库，v3.2.3 |
| PUA marketplace | `~/.claude/plugins/marketplaces/pua-skills/` | Claude Code plugin marketplace，v3.0.0，含多平台适配 |
| 共享配置 | `~/.pua/config.json` | always_on / flavor |
| 失败计数 | `~/.pua/.failure_count` | 官方计数文件 |
| pi 扩展状态 | `~/.pi/agent/pua-state.json` | lastFailureTs / lastInjectedLevel |
