# PUA Extension for pi

`pua` 是 `tanweai/pua` 的 PI adapter。它把 PUA 行为协议接入 PI 的 extension 生命周期，用于自动注入行为约束、记录工具失败、叠加压力升级提示。

它不是搜索插件、MCP 插件、PowerShell 插件或权限插件。PI 会根据已启用的 package、extension、skill 和 tool 暴露不同能力；当前 PUA 负责注入基础协议、记录失败状态，并对已可见能力追加正向 PUA 使用约束。它不屏蔽、不授权任何工具调用。

## 当前能力

| 能力 | 来源 | 当前状态 |
|------|------|----------|
| 自动注入 PUA 协议 | `before_agent_start` | 已实现 |
| 恢复开关和失败计数 | `session_start` + `~/.pua` 状态文件 | 已实现 |
| 工具失败计数 | `tool_result` | 已实现 |
| L1-L4 压力升级 | 失败计数 + pressure prompts | 已实现 |
| `/pua-on`、`/pua-off`、`/pua-status`、`/pua-reset` | PI command | 已实现 |
| PUA skill 缺失保护 | 本地 skill 目录嗅探 | 已实现 |
| 能力状态观测与正向增强 | PI active tools / loaded skills | 已实现 |
| 子 agent PUA 继承 | PI `tool_call` + subagent tools | 已实现 |
| 通用事前工具拦截 | PI `tool_call` | 未实现，见 [docs/DESIGN.md](./docs/DESIGN.md) |

## 当前不具备的能力

PUA 当前不注册 tool，`tool_call` 只用于给子 agent prompt 注入 PUA capsule。因此它不具备以下能力：

- 阻止、确认或改写普通工具调用。
- 屏蔽 shell、PowerShell、MCP 或外部插件工具。
- 提供权限系统、沙箱、安全确认或危险命令拦截。
- 保证模型一定执行搜索、子任务、计划模式或其他外部插件流程。

## 不自带的能力

这些能力由其他 PI 插件提供，PUA 不应在缺失时假装可用。当前能力状态用于 `/pua-status` 观测和 `before_agent_start` 正向增强，不生成缺失工具指令：

| 能力 | 典型插件 | PUA 的处理方式 |
|------|----------|----------------|
| 网络搜索、URL 抓取、代码搜索 | `pi-web-access` | 可见时追加搜索取证约束，不把缺失包写成 PUA 失败 |
| MCP 工具调度 | `pi-mcp-adapter` | 可见时提示先发现再调用，不承诺 PUA 自带 MCP |
| Windows 原生 PowerShell | `@marcfargas/pi-powershell` | 可见时追加 Windows 原生验证约束，不作为 PUA 基线依赖 |
| 子任务、计划、后台任务等组合能力 | `@ifi/oh-pi` 及其子包 | 按实际 active tools/skills 观测；subagent 可见时注入 PUA capsule |

完整能力矩阵和开关规则见 [docs/CAPABILITIES.md](./docs/CAPABILITIES.md)。

## 文档导航

| 文档 | 说明 |
|------|------|
| [INSTALL.md](./INSTALL.md) | 安装、命令、配置、同步 references、集成测试 |
| [docs/README.md](./docs/README.md) | 内部文档入口和阅读顺序 |
| [docs/CAPABILITIES.md](./docs/CAPABILITIES.md) | PI 能力开启、屏蔽和可见性模型 |
| [docs/RECOMMENDATIONS.md](./docs/RECOMMENDATIONS.md) | PUA 迭代相关的外部插件推荐组合 |
| [docs/DESIGN.md](./docs/DESIGN.md) | PUA adapter 内部设计与后续落地契约 |
| [docs/UPSTREAM.md](./docs/UPSTREAM.md) | `tanweai/pua` 上游基线与同步策略 |

## 文件结构

```text
pua/
├── docs/
│   ├── README.md           # 内部文档入口
│   ├── CAPABILITIES.md      # PI 插件能力矩阵与可见性规则
│   ├── RECOMMENDATIONS.md   # 外部插件推荐组合
│   ├── DESIGN.md            # adapter 内部设计
│   └── UPSTREAM.md          # 上游同步策略
├── bin/                     # references 同步脚本
├── references/              # 本地 references 快照
├── capabilities.js          # 能力快照、正向增强提示与 subagent prompt 装饰
├── index.ts                 # 扩展主入口
├── references_loader.ts     # references 加载器
├── INSTALL.md               # 安装与使用指南
├── pua.ittest.sh            # bash 集成测试脚本
├── pua.ittest.ps1           # PowerShell 集成测试脚本
└── README.md                # 本文件
```
