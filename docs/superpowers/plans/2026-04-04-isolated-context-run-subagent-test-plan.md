# isolated-context-run subagent sublayer Test Plan

> **For agentic workers:** 优先把这份文档当成测试执行与记录规范，而不是实现规范。执行时保持 `iitests/isolated-context-run-subagent/` 独立，不把 `recall-eval` 当作本次主依赖。

**Goal:** 为提交 `6b2c99b` `feat: define isolated-context-run subagent sublayer` 建立一套可重复执行、可记录结果、可定位契约偏差的测试方案。

**Architecture:** 这次测试不走 `tests/iitest/recall-eval`，而是以 `iitests/isolated-context-run-subagent/` 为主入口，直接验证父层 `isolated-context-run` 与子层 `isolated-context-run:subagent` 的提示词契约、输出骨架、边界和失败分类。测试按“静态契约核对 -> Markdown iitest 执行 -> 失败归因 -> 回写记录”四层推进。

**Tech Stack:** Git, Codex session history, Markdown fixtures, native subagent execution, literal-fragment assertion

---

## Context Snapshot

- Commit: `6b2c99ba627c4b063050ef8c3d843b29e446f97b`
- Commit title: `feat: define isolated-context-run subagent sublayer`
- Commit time: `2026-04-04 17:28:10 +0800`
- Changed files:
  - `TODO.md`
  - `skills/isolated-context-run/SKILL.md`
  - `skills/isolated-context-run/EXAMPLES.md`
  - `skills/isolated-context-run-subagent/SKILL.md`
  - `skills/isolated-context-run-subagent/EXAMPLES.md`

## Session Evidence

- 提交动作来自本机 Codex 历史线程 `019d57a9-13e5-72f3-a51a-20aeacec607d`
  - 证据位置: `/root/.codex/log/codex-tui.log`
  - 关键动作: `git commit -m "feat: define isolated-context-run subagent sublayer"`
- “先提交，然后新 session 研究测试”的后续测试规划主线程是 `019d57d3-411b-7272-844e-5e310a5d9053`
  - 证据位置: `/root/.codex/history.jsonl`
  - 关键输入包括：
    - `feat: define isolated-context-run subagent sublayer 我们对这个 commit， 设计一个测试方案`
    - `recall-eval 当前未完工，因此不把它作为这次测试方案的核心依赖`
    - `我们在 repo iitests 独立起subdir`
    - `验收标注是把每个 md 让 subagent 执行，然后main read subagent result assert 结果`
- 与该测试设计对应的子代理 rollout 记录在：
  - `/root/.codex/sessions/2026/04/04/rollout-2026-04-04T18-18-15-019d5800-1d8f-7712-bb54-c49fc52281d0.jsonl`

## Test Scope

本次只测这四类行为：

- 父层默认路由是否在 native subagent 可用时稳定选中 `isolated-context-run:subagent`
- 父层 override 语义是否稳定覆盖默认链
- 子层是否严格停留在 native subagent 边界内，不重写成 `self-cli` 或外部 CLI
- `unavailable` 与 `environment failure` 是否被稳定区分

本次明确不测：

- `recall-eval` runner、score、report、batch、live 路径
- `tests/iitest/recall-eval/`
- 任何需要真实外部 provider、网络、持久化的 live 运行层

## Test Units

### Static Contract Audit

先做只读核对，确认这几份文件没有显式互相打架：

- `skills/isolated-context-run/SKILL.md`
- `skills/isolated-context-run/EXAMPLES.md`
- `skills/isolated-context-run-subagent/SKILL.md`
- `skills/isolated-context-run-subagent/EXAMPLES.md`
- `iitests/isolated-context-run-subagent/README.md`

重点核对项：

- 父层是否把 `isolated-context-run:subagent` 定义为默认优先级命中后的专用子层
- 子层是否明确禁止回退到 `self-cli`
- 输出骨架是否一致使用 5 个核心段落
- `Install Guidance` 与 `Failure Detail` 是否按 failure taxonomy 分流
- iitest 断言是否与 skill 当前文字契约一致

### Markdown iitest Matrix

所有 case 放在 `iitests/isolated-context-run-subagent/`，每个目录只包含：

- `subagent.md`
- `main-agent-assert.md`

第一版固定覆盖这 6 个 case：

1. `case-01-default-route-to-sublayer`
   - Target Layer: `isolated-context-run`
   - 核心断言：native subagent 可用时，父层 `Selected Runner` 必须是 `isolated-context-run:subagent`
2. `case-02-self-cli-explicit`
   - Target Layer: `isolated-context-run`
   - 核心断言：显式 `self-cli` 请求不再走默认链，并给出 `Execution Template`
3. `case-03-explicit-mode-override`
   - Target Layer: `isolated-context-run`
   - 核心断言：`mode=codex-exec` 直接覆盖默认选择
4. `case-04-missing-command-install-guidance`
   - Target Layer: `isolated-context-run`
   - 核心断言：缺命令时只给 `Install Guidance`，不误报为 environment failure
5. `case-05-direct-subagent-available`
   - Target Layer: `isolated-context-run:subagent`
   - 核心断言：子层直调时 `Selected Runner` 必须是 `subagent`
6. `case-06-direct-subagent-unavailable-or-env-failure`
   - Target Layer: `isolated-context-run:subagent`
   - 核心断言：同一 case 下分别覆盖 unavailable 与 environment failure，且都不能降级到 `self-cli`

### Execution Protocol

每次测试执行都遵守 [README](/data/projects/x-promptkit/iitests/isolated-context-run-subagent/README.md)：

1. 对每个 `case-*` 目录读取 `subagent.md`
2. 只抽取 `## Input`
3. 只抽取 `## Execution Constraints`
4. 拼成一个子代理请求
5. 用 native subagent 执行
6. 等待完成
7. 把返回纯文本与 `main-agent-assert.md` 做字面断言
8. 先跑最小提示
9. 若失败，只允许一次 targeted tightening pass
10. 第二次仍失败则标记 `prompt unresolved`

执行约束：

- 峰值并发 `<= 3`
- 不把整个 `subagent.md` 原文直接发给子代理
- 不把 `main-agent-assert.md` 发给子代理
- 不接受带前言、测试总结、next-step 总结的偏题输出

## Failure Classification

测试结果只分成这 4 类：

- `pass`
  - 所有 `Must Include` 命中，所有 `Must Not Include` 未命中
- `prompt unresolved`
  - 最小提示失败，且一次 targeted tightening 后仍失败
- `contract mismatch`
  - iitest 断言与 skill 文本契约明显冲突，不能继续只靠调 prompt 收敛
- `runner/environment blocked`
  - 当前宿主缺 native subagent 能力，导致执行协议本身无法复现

归因优先顺序：

- 先判断是不是 iitest 断言与 `SKILL.md` 冲突
- 再判断是不是输出骨架字面不稳定
- 最后才判断是否需要新增或删减提示语

## Acceptance Gate

这次 commit 的验收门槛分两层：

- 最低门槛
  - 6 个 case 都能被 README 协议跑通
  - 每个失败都能落在 `prompt unresolved`、`contract mismatch`、`runner/environment blocked` 之一
  - 不再出现“没有记录但改了文案”的回归
- 收口门槛
  - 6/6 case 都 `pass`
  - 子层 case 不再出现偷偷回退 `self-cli`
  - 父层 case 不再把子层 delegation internals 展开成外部 CLI 细节

## Record Template

每轮执行完，都在本文件尾部追加一条 run record，格式固定：

```md
## Run Record - YYYY-MM-DD HH:mm +0800

- operator: `codex`
- source session: `<session id>`
- target commit: `6b2c99b`
- peak concurrency: `<=3`
- result: `X/6 pass`
- pass:
  - `case-..`
- unresolved:
  - `case-..`: `<why>`
- contract mismatch:
  - `case-..`: `<why>`
- blocked:
  - `case-..`: `<why>`
```

## Run Record - 2026-04-04 21:00 +0800

- operator: `codex`
- source session: `019d5892-4174-74d3-8b99-d18c47f2bb38`
- target commit: `6b2c99b`
- peak concurrency: `<=3`
- result: `1/6 pass`
- pass:
  - `case-05-direct-subagent-available`
- unresolved:
  - `case-01-default-route-to-sublayer`: `Override` 字面片段 `` `none` `` 未稳定命中
  - `case-02-self-cli-explicit`: `self-cli requested explicitly` 未稳定命中断言要求的字面形式
  - `case-03-explicit-mode-override`: `explicit` 未稳定命中断言要求的字面形式
  - `case-04-missing-command-install-guidance`: 输出骨架偏离，`Default Priority` 与 `Selected Runner` 被错误改写
  - `case-06-direct-subagent-unavailable-or-env-failure`: `Scenario A/B` 标签与禁用片段风险未稳定收敛
- contract mismatch:
  - `case-04-missing-command-install-guidance`: 当前 skill 文本对字面骨架约束不够硬，靠 prompt tightening 仍易漂移
- blocked:
  - `none`

## Next Action

如果继续推进这个 commit 的测试收口，顺序固定如下：

1. 先修 `skills/isolated-context-run/SKILL.md` 与 `skills/isolated-context-run-subagent/SKILL.md` 的字面输出约束
2. 再同步 `EXAMPLES.md`
3. 最后重跑 `iitests/isolated-context-run-subagent/README.md`
4. 不先改 case 断言，除非已经证明是 `contract mismatch`
