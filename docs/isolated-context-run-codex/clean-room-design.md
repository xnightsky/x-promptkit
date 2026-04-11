# isolated-context-run:codex clean-room 方案

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [research.md](research.md)
  - [structured-init-design.md](structured-init-design.md)
  - [exec-v0-contract.md](exec-v0-contract.md)
  - [../../TODO.md](../../TODO.md)

## 1. 文档目的

本文只回答 `isolated-context-run:codex` 的 clean-room 应该怎样构造。

本文负责：

- fake user home 的目录模型
- 需要显式固定的环境变量
- `workspace_mode` 的定义与适用边界
- `artifacts/` 与 `meta/` 的最小产物

本文不负责：

- skills 发现与隔离策略
- plugin / MCP 的细化管理
- 容器 / VM 级强隔离
- `sdk` / `app-server` backend
- `minimal-seed` manifest 和结构化 `init` 细节

后两项分别见：

- clean-room 总览与子层边界：[research.md](research.md)
- `minimal-seed` / `init` 细节：[structured-init-design.md](structured-init-design.md)

## 2. 目标级别

`clean-room v0` 的目标是：

- 服务仓库内高置信隔离验证
- 服务 `recall-eval` 的真实宿主接入
- 让单次 run 有可观测、可清理、可比对的执行根目录

`clean-room v0` 不承诺：

- 容器 / VM 级绝对隔离
- 完整切断所有 system/admin 级污染
- 在这一阶段解决 skills 污染设计

换句话说，`clean-room v0` 是“受控假用户环境”，不是“强沙箱评测平台”。

## 3. 目录模型

### 3.1 run-root 语义

每次运行生成一个独立 `run-root`：

```text
<tmp-root>/isolated-context-run/<run-id>/
  .codex/
  workspace/
  artifacts/
  meta/
```

其中：

- `<run-root>/` 直接作为本轮假用户 `HOME`
- `<run-root>/.codex/` 作为本轮 Codex 用户态目录
- `<run-root>/workspace/` 作为本轮任务执行目录
- `<run-root>/artifacts/` 保存原始输出和归一化产物
- `<run-root>/meta/` 保存 run 元信息与环境描述

### 3.2 `.codex/` 的职责

`.codex/` 只放 Codex 自己会读写的用户态内容，目标是尽量拟真：

```text
.codex/
  config.toml
  auth.json
  logs/
  history/
  sessions/
  cache/
```

约束：

- 允许预先写入本轮显式配置文件
- 不应混入 runner 自己的 trace 或汇总结果
- 不依赖开发者真实 `HOME/.codex`

### 3.3 `artifacts/` 与 `meta/` 的职责

`artifacts/` 只放执行证据：

- 原始 JSONL 事件
- CLI stdout / stderr
- v0 证据摘要或其来源文件
- 最终返回 JSON

`meta/` 只放运行说明：

- `run.json`
- `workspace-manifest.json`
- `environment.json`
- 需要时的 `init-report.json`

原则：

- `.codex/` 表示“宿主自己产生了什么”
- `artifacts/` / `meta/` 表示“runner 额外观测和记录了什么”

## 4. 环境变量模型

### 4.1 必须显式固定

`clean-room v0` 至少应显式设置：

- `HOME=<run-root>`
- `CODEX_HOME=<run-root>/.codex`
- `PWD=<run-root>/workspace`
- `TMPDIR=<run-root>/.tmp`
- `XDG_CONFIG_HOME=<run-root>/.config`
- `XDG_CACHE_HOME=<run-root>/.cache`
- `XDG_STATE_HOME=<run-root>/.local/state`

辅助稳定性变量建议固定：

- `LANG=C.UTF-8`
- `LC_ALL=C.UTF-8`
- `TZ=UTC`

### 4.2 默认不继承

下列宿主环境默认不继承，只有在调用方显式要求时才允许白名单注入：

- provider / API key 相关变量
- 代理变量
- 用户级实验开关
- 其他与本轮执行无关的宿主环境变量

理由：

- clean-room 需要“明确注入”，而不是“顺便继承”
- 后续 trace 和失败归因需要知道本轮到底依赖了什么

## 5. workspace_mode

### 5.1 三种模式

`clean-room v0` 固定支持三种 `workspace_mode`：

1. `workspace-link`
2. `git-worktree`
3. `minimal-seed`

三者都使用同一个 fake user home，但工作区来源不同。

默认链为：

- `workspace-link -> git-worktree`

说明：

- 只有隐式默认请求允许从 `workspace-link` 自动降级到 `git-worktree`
- 显式 `workspace_mode=workspace-link` 失败时必须直接报错
- `minimal-seed` 不进入默认降级链

### 5.2 `workspace-link`

定义：

- 将当前源工作区目录以目录链接方式挂到 `<run-root>/workspace`

用途：

- 优先验证 `tmp HOME` 隔离与 runner 数据回收
- 保留当前工作区的真实路径内容与技能资产
- 为正式真实宿主测试提供“非复制、可回收”的默认路径

优点：

- 不需要回收单独的 Git worktree 数据
- 更接近“当前工作区直接运行”的真实形态
- 可与显式 skill allowlist 挂载视图一起验证 linked workspace 行为

局限：

- 允许写穿透到源工作区
- 不提供比 `git-worktree` 更强的工作区隔离

结论：

- `workspace-link` 是 `clean-room v0` 的默认优先模式

### 5.3 `git-worktree`

定义：

- 从目标仓库和目标 revision 派生一个临时 worktree 到 `<run-root>/workspace`

用途：

- 仓库内真实回归
- 真实宿主路径验证
- 与现有 repo 结构强相关的执行场景

优点：

- 保留真实仓库结构和 Git 上下文
- 创建快，空间占用低
- 更贴近仓库内真实使用方式

局限：

- repo root 相关发现逻辑会继续生效
- 不适合作为最强污染控制模式

结论：

- `git-worktree` 是 `workspace-link` 不可用时的默认降级模式

### 5.4 `minimal-seed`

定义：

- `workspace/` 从最小白名单输入构造，不直接派生整份仓库工作区

用途：

- 最小上下文验证
- 污染面实验
- 为后续 `recall-eval` case 构造受控工作区

优点：

- 输入边界清晰
- 更容易审计“到底暴露了什么”

局限：

- 拟真度低于 `git-worktree`
- 需要额外 manifest 与初始化逻辑

结论：

- `minimal-seed` 是受控实验模式，不是默认模式
- 它的具体 manifest 和结构化 init 规则由专项设计文档定义

## 6. 最小运行产物

### 6.1 `meta/`

`meta/` 最小要求：

- `run.json`
  - 本次运行的入口参数、时间戳、carrier/backend、`workspace_mode_requested/resolved`
- `workspace-manifest.json`
  - `workspace/` 的来源说明、是否发生 fallback、若为 `workspace-link` 则记录链接模式
- `environment.json`
  - 本次运行的环境指纹
- `init-report.json`
  - 仅在 `minimal-seed` 或存在初始化步骤时生成

### 6.2 `artifacts/`

`artifacts/` 最小要求：

- `raw-events.jsonl`
- `stdout.txt`
- `stderr.txt`
- `evidence.json`
- `result.json`

命名可以在实现时微调，但职责边界不应改变。

## 7. 与结构化 init 的接缝

clean-room 层只需要知道：

- `workspace_mode` 是什么
- 如果是 `minimal-seed`，解析后的 manifest 在哪里
- 初始化报告最终写到哪里

clean-room 层不负责：

- 解释 `seed.copy`
- 解释 `init.steps`
- 决定 `run_local` 允许什么

这些逻辑由结构化 init 层负责，再把结果回填到 `workspace/` 和 `meta/init-report.json`。

## 8. v0 落地建议

`clean-room.mjs` 的 v0 目标应是：

1. 创建 `run-root`
2. 创建 fake user home 目录结构
3. 为 `exec-v0-contract.md` 中约定的 `artifacts/` 和 `meta/` 预留稳定落点
3. 显式设置环境变量
4. 根据 `workspace_mode` 构造 `workspace/`
5. 初始化 `meta/` 和 `artifacts/` 的落盘位置
6. 把环境指纹写入 `meta/environment.json`

以下内容留给后续阶段：

- 容器 / VM 包装
- system/admin 级技能裁剪
- plugin / MCP 细粒度隔离
- 网络策略细分

## 9. 明确不在本文讨论的事项

为避免范围再次扩散，本文明确不处理：

- skills 设计
- skill 白名单或发现路径策略
- `minimal-seed` YAML schema 细节
- `run_local` policy 细节
- `recall-eval` 评分逻辑

这些问题必须在各自文档里继续推进，而不是回流到 clean-room 文档。
