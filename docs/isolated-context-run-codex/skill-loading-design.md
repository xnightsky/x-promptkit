# isolated-context-run:codex skill loading 方案

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [research.md](research.md)
  - [clean-room-design.md](clean-room-design.md)
  - [structured-init-design.md](structured-init-design.md)
  - [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - [../../TODO.md](../../TODO.md)

## 1. 文档目的

本文只回答 `isolated-context-run:codex` 在 `tmp HOME` 下如何组织、暴露和测试 skills。

本文负责：

- Codex 子层的 skills 发现根目录设计
- skill source 与 invocation 的对象模型
- `link copy` 的精确定义
- 同名 skill 冲突优先级
- 自动发现测试、显式提示测试、开发中 skill 测试的入口语义

本文不负责：

- fake user home 的目录模型
- `workspace_mode` 与 `minimal-seed` 细节
- trace normalization 实现
- plugin / MCP 生命周期
- 父层 `isolated-context-run` 的通用 capability/skill 框架

其他问题分别见：

- clean-room 与 `HOME` 模型：[clean-room-design.md](clean-room-design.md)
- 结构化 `init`：[structured-init-design.md](structured-init-design.md)
- 脚本请求/输出契约：[probe-run-exec-contract.md](probe-run-exec-contract.md)

## 2. 设计目标

`skill-loading v0` 的目标是：

- 在真实 `tmp HOME` 下测试 Codex 原生的 skills 自动发现与加载
- 允许在一次 run 中显式组装 repo、global、passed-in、dev-path skill 来源
- 保持 skill artifact 接近真实安装形态，而不是发明自定义 loader
- 让本次 run 的 skill 视图可审计、可复现、可解释

`skill-loading v0` 不追求：

- 统一所有 AI CLI 的全局 skill 目录模型
- 绕过 Codex 原生 skill 机制做自定义触发
- 在 skill 层实现 plugin / MCP 注入
- 设计通用 capability registry

## 3. 核心结论

`isolated-context-run:codex` 不负责重新实现 skill loader。

它只负责：

- 在 `tmp HOME` 下准备一组受控的 skill discovery roots
- 将本次 run 允许可见的 skill 以 `link copy` 方式挂进去
- 记录这次 run 最终暴露给 Codex 的 resolved skill view

之后由 Codex 按宿主原生规则完成：

- 发现 skill
- 读取轻量 metadata
- 判断是否自动命中
- 再按需加载完整 `SKILL.md`

因此，本专项的控制点不是“如何替 Codex 选 skill”，而是“Codex 在这次 run 里到底能看见哪些 skill”。

## 4. 术语

### 4.1 `skill source class`

本次 run 中 skill 的来源类别。v0 允许以下几类，且全部都是 optional：

- `dev-path-mount`
  - 通过显式 `skill path` 临时挂入的开发中 skill
- `passed-in`
  - 调用方以现实方式显式传入的 skill
- `repo`
  - 当前仓库中的 skill
- `global`
  - 宿主全局已有的 skill，但必须显式声明混入

### 4.2 `invocation mode`

本次测试如何触发目标 skill。v0 只支持：

- `auto-discovery`
  - 不在 prompt 中点名 skill，测试 Codex 是否自动发现并命中
- `prompted`
  - 在 prompt 中显式给出 skill 名、关键词或引导语

### 4.3 `resolved skill view`

runner 根据 profile 和 per-run override 解析后，最终暴露给 Codex 的 skills 视图。

### 4.4 `link copy`

对 skill 采用“每个 skill 目录一个 symlink”的方式挂入目标 skills root。

这与 `npx skills` 的推荐做法一致：从 agent 侧目录链接到 canonical copy，而不是逐文件复制或逐文件链接。

## 5. Codex 子层的目录规范

### 5.1 默认模式：`codex-native`

默认只测试 Codex 原生的 skills 发现行为。

`tmp HOME` 下默认维护：

```text
<tmp-home>/
  .agents/
    skills/
      <resolved skills>
  .codex/
    config.toml
  workspace/
    ...
```

说明：

- `~/.agents/skills` 是默认 user-level skill discovery root
- `workspace/` 内仍可按需要创建 repo 级 `.agents/skills`
- `~/.codex/config.toml` 只作为可选控制面，不作为主 skills 根目录

### 5.2 可选扩展模式：`cross-agent-interop`

当目标是模拟跨 agent 安装环境时，可以额外维护 agent-specific global roots，例如：

```text
<tmp-home>/
  .agents/skills/
  .codex/skills/
  .claude/skills/
  .cursor/skills/
  .config/opencode/skills/
```

此模式不是 `isolated-context-run:codex` 的默认模式。

它只用于：

- 互操作验证
- 安装器对照测试
- 显式要求模拟 `npx skills` 安装布局的场景

## 6. 技能来源与合成

### 6.1 profile 与 per-run override

v0 采用：

- `profile`
  - 提供稳定、可复现的基线 skill source 配置
- `per-run override`
  - 为单次 run 追加或替换 skill source，主要用于混合测试

### 6.2 override 语义

v0 支持两种模式：

- `append`
  - 在 profile 基线上追加本次 run 的来源
- `replace`
  - 用本次 run 的来源替换 profile 的 skill 集合

默认建议为：

- `append`

### 6.3 来源类别都是 optional

一次 run 不要求所有 source class 都存在。

只有在：

- 多个来源被同时启用
- 且最终出现同名 skill

时，才进入冲突处理。

## 7. 冲突优先级

### 7.1 `conflict precedence`

当多个已启用来源出现同名 skill 时，采用以下优先级：

`dev-path-mount > passed-in > repo > global`

解释：

- `dev-path-mount`
  - 代表当前明确要测试的开发中 skill，优先级最高
- `passed-in`
  - 代表本次 run 显式传入的 skill，高于环境基线
- `repo`
  - 代表仓库内默认基线
- `global`
  - 只作为显式混入来源，优先级最低

### 7.2 `same-tier duplicate policy`

同一优先级层内如果出现同名 skill，v0 默认：

- `error-on-duplicate`

不采用“按声明顺序覆盖”或“静默保留第一个”的隐式规则。

### 7.3 冲突判定基线

v0 的同名冲突默认按：

- `skill directory name`

处理，不先按 `SKILL.md` 内部的 `name` 字段处理。

## 8. `link copy` 定义

### 8.1 基本语义

`link copy` 在本专项中明确指：

- `per-skill directory symlink`

即：

- 每个 skill 目录单独建立一个 symlink
- 挂入目标 skills root
- 不做逐文件复制
- 不做逐文件链接

目标形态类似：

```text
<resolved-skills-root>/
  skill-a -> <source>/skill-a
  skill-b -> <source>/skill-b
```

### 8.2 为什么不用逐文件链接

逐文件链接会引入：

- skill 内相对路径失效
- `references/`、`scripts/`、`assets/` 漏挂风险
- 与真实安装形态不一致

因此 v0 统一按“skill 目录是一个完整 artifact bundle”处理。

### 8.3 子目录跟随规则

如果 skill 目录内存在以下内容，则它们随目录 symlink 一并可见：

- `SKILL.md`
- `EXAMPLES.md`
- `references/`
- `scripts/`
- `assets/`
- `agents/openai.yaml`

这里没有“是否单独跟随”的开关。

只要目录被挂载，这些内容就作为同一 bundle 一起暴露。

### 8.4 broken link 处理

v0 对 broken link 采用严格处理：

- 挂载前源路径已失效
  - 记为非法 skill source
- 挂载后目标 symlink 已失效
  - 记为本次 run 的 skills view 无效

两种情况都不做静默跳过，也不做自动修复。

## 9. 三类测试入口

### 9.1 `auto-discovery`

目标：

- 测试 Codex 是否在不给出显式 skill 提示时自动命中目标 skill

规则：

- runner 只负责布置可见 skill 视图
- prompt 中不点名目标 skill
- 由 Codex 自己按原生机制发现与选择

### 9.2 `prompted`

目标：

- 测试在显式提示下目标 skill 是否能稳定加载

允许的提示形式留给调用方定义，但语义统一归为：

- skill 名
- 关键词
- 引导语

### 9.3 `dev-path-mount`

目标：

- 测试尚未正式装入 skill 集的开发中 skill

规则：

- 输入对象是 `skill path`
- runner 将该路径解析为 skill source
- 再通过 `link copy` 挂入本次 run 的 skill view
- 之后仍由 Codex 按原生方式发现和加载

`dev-path-mount` 是 source class，不单独决定触发方式。

它可以与：

- `auto-discovery`
- `prompted`

任一 invocation mode 组合使用。

## 10. 与 Codex 原生机制的边界

本专项不试图改写 Codex 的原生 skill 触发逻辑。

需要接受的前提是：

- Codex 先发现可见 skill roots
- 读取 `name`、`description`、path，以及可选的 `agents/openai.yaml`
- 再根据任务决定是否自动命中或在显式提示下加载

因此：

- 本仓库控制的是“可见技能世界”
- 不是“宿主内部如何做最终匹配”

## 11. v0 明确支持与不支持

### 11.1 支持

- Codex 原生 skills 自动发现测试
- 显式提示触发测试
- 开发中 skill path 挂载测试
- profile 基线
- per-run `append` / `replace`
- repo / global / passed-in / dev-path 四类可选来源
- 同名冲突显式归因
- resolved skill view 落盘审计

### 11.2 不支持

- 让 Codex 继续向真实宿主环境做隐式扩发现实 skills
- 自定义 skill loader 或自定义触发器
- 逐文件裁剪式挂载
- runner 对 `agents/openai.yaml` 做 overlay 或 patch
- 在 v0 里定义通用跨 agent skill registry
- 在 skill loading 文档里顺带定义 plugin / MCP 行为

## 12. v0 定稿

### 12.1 收口策略

本专项的 v0 采用：

- `strong-core weak-edge`

即：

- 对 runner 自己可控的输入、组装、校验、挂载和落盘结构做强定稿
- 对 Codex 内部黑盒选择过程只定义最小可接受证据，不做强证明承诺

强定稿范围包括：

- `skill validity check`
- `prompted` 输入记录格式
- profile schema
- `resolved skill view` 审计结构
- `agents/openai.yaml` overlay 结论

弱定稿范围包括：

- `automatic discovery evidence`

### 12.2 `skill validity check`

`skill validity check` 只做装载前结构校验，不做内容质量评审。

一个目录在 v0 中要被认定为合法 skill，最低满足：

- 目录本身存在，且可解析到真实目录目标
- 目录名非空，并作为默认 `skill id`
- 优先存在 `SKILL.md`；若缺失，可接受 legacy `SKILLS.fallback.md`
- 选中的 skill markdown 文件必须是普通可读文件
- 如果存在 `agents/openai.yaml`，它只作为 bundle 内容随目录暴露，不参与 runner 改写

v0 明确不做：

- 不要求 `SKILL.md` 必须包含 frontmatter
- 不要求 frontmatter 中的 `name` 与目录名一致
- 不递归校验 `references/`、`scripts/`、`assets/` 是否完整
- 不做 markdown 语义检查、示例可运行检查或描述质量判断

建议失败原因固定为：

- `invalid_skill_source`
  - 目录不存在，或源目标在挂载前已失效
- `missing_skill_md`
  - 目录存在，但既没有 `SKILL.md`，也没有 `SKILLS.fallback.md`
- `unreadable_skill_md`
  - `SKILL.md` 或 `SKILLS.fallback.md` 存在，但选中的 skill markdown 不可读

同层重复目录名仍按前文规则处理：

- `error-on-duplicate`

### 12.3 `prompted` 输入规范

`prompted` 记录的是“提示策略”，不是对 prompt 正文做反推解释。

runner 只负责把调用方想测试的显式提示方式结构化落盘，不负责判断提示文本是否“足够像在点名 skill”。

最小结构建议为：

```json
{
  "invocation": {
    "mode": "prompted",
    "prompted": {
      "kind": "skill_name",
      "value": "isolated-context-run-codex"
    }
  }
}
```

字段规则：

- `kind`
  - 仅允许 `skill_name`、`keyword`、`guidance`
- `value`
  - 必须是非空字符串
  - runner 原样记录，不做改写
- v0 不支持数组形式
  - 一次 run 只测试一种显式提示策略
- v0 不支持从 prompt 正文自动反推 `kind`
  - 必须由调用方显式声明

### 12.4 profile schema

profile schema 只描述两件事：

- 本次 run 的技能世界如何组成
- 本次 run 打算如何触发

最小结构建议为：

```json
{
  "profile_name": "repo-only-auto",
  "skills": {
    "sources": [
      { "class": "repo" }
    ],
    "override_mode": "append",
    "conflict_policy": "error-on-duplicate"
  },
  "invocation": {
    "mode": "auto-discovery"
  }
}
```

字段规则：

- `profile_name`
  - required
  - 只作为人类可读标识，不参与冲突判定
- `skills.sources`
  - required
  - 数组内元素至少包含 `class`
- `class`
  - 仅允许 `dev-path-mount`、`passed-in`、`repo`、`global`
- `override_mode`
  - 仅允许 `append`、`replace`
- `conflict_policy`
  - v0 固定只能是 `error-on-duplicate`
- `invocation.mode`
  - 仅允许 `auto-discovery`、`prompted`
- 当 `invocation.mode=prompted` 时，必须带 `invocation.prompted`
- 当 source class 需要路径或显式对象时，在对应 source 项内增加参数字段，不污染顶层

### 12.5 `resolved skill view` 审计结构

`resolved skill view` 不是原始配置回显，而是冲突处理、合法性校验和挂载决策之后，最终暴露给 Codex 的技能快照。

最小结构建议为：

```json
{
  "resolved_skill_view": {
    "root": ".agents/skills",
    "skills": [
      {
        "id": "isolated-context-run-codex",
        "source_class": "repo",
        "source_ref": "skills/isolated-context-run-codex",
        "mount_relpath": ".agents/skills/isolated-context-run-codex",
        "link_copy": {
          "mode": "directory_symlink"
        },
        "artifacts": {
          "skill_md": true,
          "source_skill_md": "SKILL.md",
          "openai_yaml": false
        }
      }
    ]
  }
}
```

字段规则：

- `root`
  - 记录本次 run 实际暴露给 Codex 的 skills root
  - 用相对语义表达，不在协议中写宿主绝对路径
- `skills`
  - 只记录最终成功进入视图的 skill
  - 不回显被冲突淘汰或校验失败的项
- `id`
  - 默认取目录名
  - 也是冲突判定主键
- `source_ref`
  - 记录相对来源引用，用于审计来源
- `mount_relpath`
  - 记录挂入 skills root 后的相对位置
- `artifacts`
  - 只记录少量可审计事实，不展开完整 bundle 清单
  - `source_skill_md` 用于区分这次挂载来自主入口 `SKILL.md`，还是 legacy `SKILLS.fallback.md`

未进入最终视图的项单独记录为：

```json
{
  "excluded_skills": [
    {
      "id": "foo",
      "source_class": "global",
      "reason": "shadowed_by_higher_precedence"
    }
  ]
}
```

这样可以把“最终可见世界”和“为什么其他项没进去”明确分开。

### 12.6 `automatic discovery evidence`

`automatic discovery evidence` 在 v0 中只定义：

- `minimal evidence`

它回答的是“这次 run 有多大把握是自动命中了目标 skill”，而不是“我们证明了 Codex 内部一定选择了它”。

最小证据由三类事实组成：

- `visibility evidence`
  - 目标 skill 存在于 `resolved_skill_view`
  - 本次 `invocation.mode=auto-discovery`
- `prompt evidence`
  - 没有 `skill_name`、`keyword`、`guidance` 这类 runner 侧显式提示注入
  - 没有其他 runner 侧点名目标 skill 的机制
- `output evidence`
  - 最终输出、trace 摘要或宿主可观测事件中出现该 skill 被加载或使用的直接信号

证据结论状态只允许：

- `confirmed`
  - 有直接可观测信号表明目标 skill 被加载或调用
- `suggestive`
  - 只有可见性和行为结果匹配，但缺少直接加载信号
- `not_supported`
  - 当前宿主输出不足以支撑自动发现归因

只靠“结果看起来像是 skill 生效了”不能在 v0 判为 `confirmed`。

### 12.7 明确延后事项

v0 定稿后仍明确延后：

- 不为 `output evidence` 枚举宿主私有的完整信号字典
- 不在本文中定义更高阶的 skill 内容质量校验
- 不在本文中扩展到 overlay、patch 或自定义 skill artifact 重写
