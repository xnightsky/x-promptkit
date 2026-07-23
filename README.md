# x-promptkit

用于整理 prompt、skill、runtime 配套脚本与集成测试资产的开发仓库。

## 仓库结构

- [`skills-def/`](./skills-def/)
  - 能力入口与配套说明所在目录。
  - `SKILL.md` 是默认主入口,通常用于快速确认能力边界、输入约束和输出骨架,不保证单独构成完整教程。
  - 如果某个目录额外保留 `SKILLS.fallback.md`,它只作为旧版契约保底文件;runtime 仅在 `SKILL.md` 缺失时才会回退到它,并对宿主 materialize 出规范化的 `SKILL.md`。
  - 具体怎么使用某个能力,通常还要结合同目录样例、补充 README 或 runtime 说明一起看。
- [`docs/`](./docs/)
  - 专题设计、研究记录和指南文档入口。
  - 建议先从 [`docs/README.md`](./docs/README.md) 进入,再按专题继续下钻。
- [`scripts/tooling/`](./scripts/tooling/)
  - 仓库级 lint、check、test 等本地工具脚本。
- [`tests/`](./tests/)
  - 单元测试:纯 fake、低副作用、不消耗真实 AI token 的脚本契约与库函数回归。
- [`integration-tests/`](./integration-tests/)
  - 集成测试:环境编排、workspace/clean-room 生命周期、真实宿主或真实 AI token 相关资产。

## 怎么理解 skills

`SKILL.md` 更像能力契约,不总是完整教程。读 skill 时可以按下面的分工理解:

- `SKILL.md`
  - 先确认这个能力解决什么问题、要求什么输入、输出遵循什么骨架、哪些行为被明确禁止。
- `EXAMPLES.md`
  - 看典型输入、典型输出和反例,理解实际该怎么触发、怎么措辞。
- 同目录 `README.md` 或脚本 README
  - 看 runtime、脚本入口、本地校验方式和实现侧说明。

推荐阅读顺序:

1. 先看 `SKILL.md`,确认边界。
2. 再看 `EXAMPLES.md`,把抽象规则和实际说法对应起来。
3. 如果这个 skill 背后还有 runtime 或宿主执行链路,再看同目录 README、脚本 README 或专题 docs。

## skills 安装

详见 [`skills-def/INSTALL.md`](./skills-def/INSTALL.md)。

## skills 快速上手

下面这些说明是根 README 补的最小教程,用来回答"我现在大概该用哪个 skill、从哪一份文档开始看"。

### 1. 需要隔离执行


这个 skill 只在当前宿主原生支持 subagent 时使用：

- 在当前宿主会话里委派
- 不重新掉回外部 CLI
- 如果原生 subagent 不可用，就报 `unavailable`

### 2. 想把任务压成一条外部 CLI 命令

统一的「AI CLI ↔ AI CLI 交接」skill：

- [`skills-def/dev-run/SKILL.md`](./skills-def/dev-run/SKILL.md)
  - 支持 6 个后端：**claude**（默认）、**codex**、**opencode**、**pi**、**cursor-agent**、**kimi**
  - 根据用户信号自动选择后端，构造命令并直接执行
  - 两档：Tier-1 极简一发（默认）+ Tier-2 完整编排（拆段串行 + 段间复核）
  - 后端命令模板、转义、wait 预算与编排流程的**唯一事实源**在 [`skills-def/dev-run/references/`](./skills-def/dev-run/references/)

阅读方式：

- 先看 `SKILL.md`，确认两档、后端选择逻辑和禁止项
- 再看 `references/backends.md` 与 `references/orchestration.md`，确认后端模板与编排细节
- 再看 `EXAMPLES.md`，确认典型输入输出和反例

## Claude Code 斜杠命令（dev 插件）

`/dev:run <claude|codex|opencode|pi|cursor|kimi>`（通用交接，后端名作首个位置参数）、便捷壳 `/dev:pi`、`/dev:cursor`、`/dev:kimi`、套餐生成器 `/dev:scope <pi|cursor|kimi>` 由 `extensions/claude-code/dev/` 的 Claude Code 插件提供，是上面 `dev-run` skill 的**斜杠形态（同源）**。它走 `claude plugin` 安装，**不走 `npx skills`**（后者只认 SKILL.md、不认斜杠命令）：

- 装进当前 / 指定 repo：`node scripts/install-dev-plugin.mjs [--repo <path>]`
- 全机安装：`node scripts/install-dev-plugin.mjs --global`
- `/dev:scope <pi|cursor|kimi>` — 按真实可用模型交互生成后端套餐表，写 `.dev-run.yaml`（含顶层 `default_backend`；项目级安装写项目根、用户级安装写 home）。读取从命令 `PWD` 逐级向 home 检索最近配置；未显式点名后端时用 `default_backend`，没有任何配置才回退 Claude。scope 引擎同在 skill 侧，非 CC 宿主可用自然语言触发。
- 编排核心 `references/{backends,orchestration,scoping}.md` 与 `schemas/packages.schema.yaml` 镜像自 `skills-def/dev-run/references/`；改源后跑 `npm run sync:handoff-core` 同步。
- 详情见 [`extensions/claude-code/dev/README.md`](./extensions/claude-code/dev/README.md)

## 常用入口

- 安装指南:[`skills-def/INSTALL.md`](./skills-def/INSTALL.md)
- 文档总入口:[`docs/README.md`](./docs/README.md)
- 集成测试入口:[`integration-tests/README.md`](./integration-tests/README.md)
- 需要让 dev-run 使用额外 skill 时，在调用时通过 `skill_entries` 注入

## 开发与校验

本仓库把常用本地检查收敛到统一脚本入口:

- `npm run lint`
- `npm run check`
- `npm test`
- `npm run iitest`
- `npm run verify`

默认开发流程:

1. 先判断改动会影响代码、文档、skill、fixture 还是脚本入口。
2. 在实现过程中同步补注释,特别是非显然逻辑、协议边界、拒绝分支和输出骨架。
3. 改完后先跑相关局部检查,再跑 `npm run lint`。
4. 如果改动影响 fixture、契约或运行说明,再跑 `npm run check`。
5. 需要完整交付校验时跑 `npm run verify`。

按场景常用的补充入口:

- 跑全部单元测试时,运行 `npm test`
- 跑全部非 token 集成测试时,运行 `npm run iitest`
- 修改 `dev-run` skill 时,优先查看 `integration-tests/dev-run/`

## 仓库约定

约束的唯一权威是 [`AGENTS.md`](./AGENTS.md)（规则红线、文档约定、测试边界、命名约定、开发要求），本 README 不再复刻正文——避免一条规则多处维护导致漂移。

- 代理协作与开发约束:[`AGENTS.md`](./AGENTS.md)
- 测试入口、执行协议与维护约束:[`integration-tests/README.md`](./integration-tests/README.md)
