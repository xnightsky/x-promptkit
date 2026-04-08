# x-promptkit

用于整理 prompt、skill、runtime 配套脚本与集成测试资产的开发仓库。

## 仓库结构

- [`skills/`](./skills/)
  - 能力入口与配套说明所在目录。
  - `SKILL.md` 通常用于快速确认能力边界、输入约束和输出骨架，不保证单独构成完整教程。
  - 具体怎么使用某个能力，通常还要结合同目录样例、补充 README 或 runtime 说明一起看。
- [`docs/`](./docs/)
  - 专题设计、研究记录和指南文档入口。
  - 建议先从 [`docs/README.md`](./docs/README.md) 进入，再按专题继续下钻。
- [`scripts/tooling/`](./scripts/tooling/)
  - 仓库级 lint、check、test 等本地工具脚本。
- [`tests/`](./tests/)
  - 快回归与低副作用测试。
- [`integration-tests/`](./integration-tests/)
  - 高副作用、宿主相关或需要隔离上下文的集成测试资产。

## 怎么理解 skills

`SKILL.md` 更像能力契约，不总是完整教程。读 skill 时可以按下面的分工理解：

- `SKILL.md`
  - 先确认这个能力解决什么问题、要求什么输入、输出遵循什么骨架、哪些行为被明确禁止。
- `EXAMPLES.md`
  - 看典型输入、典型输出和反例，理解实际该怎么触发、怎么措辞。
- 同目录 `README.md` 或脚本 README
  - 看 runtime、脚本入口、本地校验方式和实现侧说明。

推荐阅读顺序：

1. 先看 `SKILL.md`，确认边界。
2. 再看 `EXAMPLES.md`，把抽象规则和实际说法对应起来。
3. 如果这个 skill 背后还有 runtime 或宿主执行链路，再看同目录 README、脚本 README 或专题 docs。

## skills 快速上手

下面这些说明是根 README 补的最小教程，用来回答“我现在大概该用哪个 skill、从哪一份文档开始看”。

### 1. 需要隔离执行，但还没决定走哪条路径

先从 [`skills/isolated-context-run/SKILL.md`](./skills/isolated-context-run/SKILL.md) 和 [`skills/isolated-context-run/EXAMPLES.md`](./skills/isolated-context-run/EXAMPLES.md) 开始。

这个父层 skill 负责：

- 比较当前环境里可用的隔离执行路径
- 按 `subagent -> self-cli` 的默认优先级做选择
- 解释为什么选中某条路径，或者为什么降级

适合的请求形态：

- “列出当前可用的隔离执行方式，并选默认方案”
- “这个任务如果要隔离执行，应该走 subagent 还是当前宿主 CLI”
- “显式用 `self-cli` 跑这个任务”

### 2. 已经明确要走 Codex 宿主路径

看 [`skills/isolated-context-run-codex/SKILL.md`](./skills/isolated-context-run-codex/SKILL.md)，然后继续看 [`skills/isolated-context-run-codex/scripts/README.md`](./skills/isolated-context-run-codex/scripts/README.md)；需要设计背景时再看 [`docs/isolated-context-run-codex/README.md`](./docs/isolated-context-run-codex/README.md)。

这条子层适合“已经确定要留在 Codex 宿主链路里”的场景。它负责：

- 把外部可见 runner 固定为 `isolated-context-run:codex`
- 说明这是父层路由进来的，还是 `mode=codex-exec` 显式指定的
- 把 probe、执行、trace、failure normalization 留给脚本层处理

如果你要看 runtime 怎么实际准备 clean-room、怎么跑 `probe.mjs` / `run-exec.mjs`，不要只停在 `SKILL.md`，继续看 scripts README。

### 3. 已经明确要走当前会话原生 subagent

看 [`skills/isolated-context-run-subagent/SKILL.md`](./skills/isolated-context-run-subagent/SKILL.md)。

这条子层只适合当前宿主本来就有原生 subagent 能力的场景。它的硬边界很重要：

- 只在当前宿主会话里委派
- 不重新掉回外部 CLI
- 如果原生 subagent 不可用，就报 `unavailable`，把 fallback 决策交回父层

如果你其实还没确定该不该走 subagent，就不要先看这个子层，先回到父层 `isolated-context-run`。

### 4. 想把任务压成一条外部 CLI 命令

这类 skill 的重点不是解释架构，而是稳定生成一条可执行命令。

- [`skills/claude-p/SKILL.md`](./skills/claude-p/SKILL.md)
  - 用在你明确要一条 `claude -p` 命令时
  - 默认命令骨架是 `cd <workdir> && IS_SANDBOX=1 claude --dangerously-skip-permissions -p "<task>"`
  - 默认带该参数是为了避免非交互执行被权限审批阻塞，但不应被描述成“所有守卫都被绕过”
- [`skills/opencode-run/SKILL.md`](./skills/opencode-run/SKILL.md)
  - 用在你明确要一条 `opencode run` 命令时
  - 默认命令骨架是 `cd <workdir> && opencode run "<task>"`
- [`skills/opencode-run-with-superpowers/SKILL.md`](./skills/opencode-run-with-superpowers/SKILL.md)
  - 只在你明确要求带 superpowers 前缀时使用
  - 默认骨架是 `cd <workdir> && opencode run "use skill tool to load superpowers/<skill>; <task>"`
  - 如果只说 “with superpowers” 但没点名 skill，默认前缀是 `superpowers/brainstorming`

这几类命令型 skill 的阅读方式也不一样：

- 先看 `SKILL.md`，确认它会不会自动加额外 flag、额外 stop condition 或额外实现建议
- 再看 `EXAMPLES.md`，确认引号、转义和返回模式
- 如果你只需要一条命令，通常不用再跳到别的文档

## 常用入口

- 文档总入口：[`docs/README.md`](./docs/README.md)
- 集成测试入口：[`integration-tests/README.md`](./integration-tests/README.md)
- Codex runtime 入口：[`skills/isolated-context-run-codex/scripts/README.md`](./skills/isolated-context-run-codex/scripts/README.md)
- Codex 专题设计入口：[`docs/isolated-context-run-codex/README.md`](./docs/isolated-context-run-codex/README.md)

## 开发与校验

本仓库把常用本地检查收敛到统一脚本入口：

- `npm run lint`
- `npm run check`
- `npm test`
- `npm run verify`

默认开发顺序：

1. 先判断改动会影响代码、文档、skill、fixture 还是脚本入口。
2. 在实现过程中同步补注释，特别是非显然逻辑、协议边界、拒绝分支和输出骨架。
3. 改完后先跑相关局部检查，再跑 `npm run lint`。
4. 如果改动影响 fixture、契约或运行说明，再跑 `npm run check`。
5. 需要完整交付校验时跑 `npm run verify`。

按场景常用的补充入口：

- 修改 Node 测试或需要统一收集 `.test.mjs` 时，运行 `npm test`
- 修改 Codex runner 相关实现时，可按需运行 `npm run test:codex-unit`、`npm run test:codex-cli`、`npm run test:codex-harness`、`npm run test:codex-real`

## 仓库约定

- 仓库内容中不要写本机绝对路径，一律使用仓库内相对路径或占位符。
- 不要只改实现不改文档；命令、输出格式、字段语义和开发流程变化都要同步更新说明。
- Node `.test.mjs` 默认由 `npm test` 从 `tests/` 和 `integration-tests/` 两个目录收集；高副作用集成用例应优先放到 `integration-tests/`。
- `integration-tests/` 下各种测试方式、入口和维护约束见 [`integration-tests/README.md`](./integration-tests/README.md)。
- 对非显然逻辑、协议边界、拒绝分支和输出骨架要同步补注释或说明，不要只留下结论句。
