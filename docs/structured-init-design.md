# isolated-context-run:codex 结构化 Init 方案

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [isolated-context-run-codex-research.md](isolated-context-run-codex-research.md)
  - [clean-room-design.md](clean-room-design.md)
  - [../TODO.md](../TODO.md)

## 1. 文档目的

本文只回答 `minimal-seed` 和结构化 `init` 如何表达与执行。

本文负责：

- `minimal-seed` 的输入来源
- YAML manifest 的角色
- `seed.copy` 与 `init.steps` 的职责边界
- `run_local` 的受控执行边界
- 与后续 `recall-eval` 的接缝

本文不负责：

- fake user home 的目录模型
- `workspace_mode` 的高层定义
- skills 设计
- plugin / MCP 隔离

目录模型与 `workspace_mode` 基线见：

- [clean-room-design.md](clean-room-design.md)

## 2. 设计目标

结构化 init 的目标不是提供“任意脚本执行器”，而是：

- 为 `minimal-seed` 提供可声明、可审计、可重放的工作区构造方式
- 让人类维护和 harness 动态生成都能复用同一契约
- 为后续 `recall-eval` case 提供稳定的初始化描述层

因此，它必须：

- 支持人类维护的固定 profile
- 支持父层或 harness 显式传入的结构化输入
- 最终都固化成一份 resolved manifest

## 3. 输入来源

### 3.1 两种来源

`minimal-seed` 的输入只允许来自两类来源：

1. 人类维护的 YAML profile
2. 父层 / 上层显式传入的结构化输入

不允许：

- `isolated-context-run:codex` 子层自行猜测需要复制哪些文件
- 根据当前仓库状态隐式扩展 seed

### 3.2 resolved manifest

无论输入源是什么，runner 在执行前都应把最终结果固化为一份 resolved manifest。

建议落盘：

- `meta/resolved-workspace-profile.yaml`

作用：

- 审计这次 `workspace/` 究竟是如何构造的
- 让人类 profile 和 harness 动态输入拥有统一回看口径

## 4. 顶层模型

`minimal-seed` 建议统一成下面这几个顶层块：

- `workspace`
- `seed`
- `init`
- `constraints`
- `policy`

一个精简示例如下：

```yaml
version: 1

workspace:
  mode: minimal-seed

seed:
  copy:
    - from: AGENTS.md
      to: AGENTS.md

init:
  profile: recall-eval-basic
  steps:
    - type: mkdir
      path: outputs

constraints:
  network: off
  allow_git: false

policy:
  run_local:
    allowed_roots:
      - scripts/
      - fixtures/
      - tools/
```

## 5. `seed.copy`

### 5.1 角色

`seed.copy` 只负责回答一件事：

- 哪些输入文件或目录进入 `workspace/`

它不负责：

- 创建目录结构
- 生成内容
- 跑脚本

这些动作都属于 `init.steps`。

### 5.2 允许的来源

`seed.copy` 只接受显式白名单相对路径。

允许：

- 明确文件路径
- 小范围、可审计的目录或 glob

不允许：

- 绝对路径
- `../` 逃逸
- `.git/`
- 整仓根目录级复制
- 来源不明的大范围通配

### 5.3 规模红线

`minimal-seed` 必须防止退化成“伪装成 seed 的整仓复制”。

因此应有规模红线：

- 文件数量阈值
- 总体积阈值
- 禁止目录命中规则

具体阈值可在实现时配置，但行为上必须明确：

- 一旦超阈值，应拒绝本次 `minimal-seed`
- 并提示改用 `workspace_mode=git-worktree`

## 6. `init.steps`

### 6.1 角色

`init.steps` 只负责“把最小工作区摆好”，不负责重建整个仓库。

### 6.2 v0 允许的步骤类型

`v0` 建议仅允许以下步骤：

- `mkdir`
- `copy`
- `write_file`
- `template_file`
- `run_local`

这些类型已足够覆盖：

- 目录准备
- 小量文件生成
- fixture 渲染
- 受控脚本初始化

### 6.3 默认不允许的行为

结构化 init 默认不允许：

- 内联任意 shell 字符串
- 联网下载并执行
- `git clone`
- 从宿主真实 `HOME` 读取隐式状态
- 修改 `run-root` 外部路径
- 把“剩余环境搭建”推给 Codex 启动后再做

## 7. `run_local` policy

### 7.1 目标

`run_local` 保留为结构化 init 的受控扩展点，用于支持后续 `recall-eval` 等需要真实脚本准备步骤的场景。

它不是通用逃生口。

### 7.2 允许的形式

推荐形式：

```yaml
- type: run_local
  command: node
  args:
    - scripts/setup-fixture.mjs
    - --case
    - basic
  cwd: .
  env:
    FIXTURE_MODE: basic
```

约束：

- 参数必须数组化
- 默认在 `workspace/` 内执行
- 只能执行仓库内 allowlist 目录中的脚本
- 环境变量只能白名单注入

### 7.3 禁止事项

以下形式不允许：

- 绝对路径脚本
- `../` 逃逸
- `sh -c`
- `bash -c`
- `zsh -c`
- 运行网络下载得到的临时脚本
- 直接执行 `workspace/` 外部文件

### 7.4 allowlist

`run_local` 应通过 policy 显式给出允许目录，例如：

- `scripts/`
- `fixtures/`
- `tools/`

具体目录名单可按仓库演进调整，但原则不变：

- 只能执行受控目录中的脚本
- 不能因为方便就放开整个仓库

### 7.5 记录要求

每个 `run_local` 步骤都必须写入 `meta/init-report.json`，至少记录：

- 实际命令
- 参数
- `cwd`
- 注入的环境变量键
- 开始时间
- 结束时间
- 退出码

## 8. 与 `recall-eval` 的接缝

这层设计必须服务后续 `recall-eval`，因此不应只面向手写 fixture。

建议的接缝原则：

- `recall-eval` 可以动态生成结构化输入
- runner 负责把动态输入固化成 resolved manifest
- `init.steps` 必须可审计、可重放
- `run_local` 必须足够强，能覆盖真实 fixture 初始化
- 但仍保留受控边界，不退化为任意 shell

换句话说：

- 结构化 init 要能承接 `recall-eval`
- 但 `recall-eval` 不能反过来打穿结构化 init 的边界

## 9. v0 落地建议

第一阶段实现建议：

1. 先实现 YAML manifest 读取与 resolved manifest 落盘
2. 先支持 `seed.copy`
3. 再支持 `mkdir`、`write_file`、`template_file`
4. 最后接入受控版 `run_local`
5. 所有初始化动作统一写入 `meta/init-report.json`

不建议第一阶段就做：

- 任意 shell 模板
- 复杂表达式语言
- 多阶段条件执行 DSL

## 10. 明确不在本文讨论的事项

为避免范围漂移，本文明确不处理：

- fake user home 的目录布局
- `.codex/` 目录内容细化
- skills 的加载和隔离
- plugin / MCP 生命周期
- trace normalization

这些设计应继续留在对应专项文档中。
