# isolated-context-run subagent sublayer Repair Plan

## Goal

把 `6b2c99b` 引入的父层 `isolated-context-run` / 子层 `isolated-context-run:subagent` 契约收紧到可以稳定通过 `iitests/isolated-context-run-subagent/README.md` 当前 6 个 case。

## Root Cause

- 父层 `SKILL.md` 虽然定义了 canonical 模板，但没有把 `Override`、`Selected Runner`、扩展块名提升为“必须原样复用”的契约字面。
- 父层没有明确说明：当测试或调用方已经给出 host / probe / 缺命令事实时，应把这些内容当成 authoritative input，而不是用实时探测覆盖。
- 子层 `SKILL.md` 内部对 `Override` 的定义和 `EXAMPLES.md` 不一致：
  - `SKILL.md` 的成功 canonical template 用 `selected by parent frontdoor`
  - `EXAMPLES.md` 的 direct invocation 成功样例用 `direct sublayer invocation`
- 子层缺少多 scenario 正规化规则，导致 `Scenario A / Scenario B` 容易被合并或省略。

## Repair Actions

### Parent Layer

- 在 [isolated-context-run/SKILL.md](/data/projects/x-promptkit/skills/isolated-context-run/SKILL.md) 增加 authoritative input 规则。
- 把 `Override` 枚举值和扩展块标题明确写成 canonical literals，不允许近义改写。
- 补一个以 Codex host 缺命令为例的 missing-command canonical template，固定：
  - `Selected Runner = No runnable selection from this probe.`
  - `Override = none`
  - `Install Guidance` 包含 `missing command:` 与 `next action:`
- 在 `self-cli` 与 explicit mode 模板中明确写出 `explicit override` 语义。

### Child Layer

- 在 [isolated-context-run-subagent/SKILL.md](/data/projects/x-promptkit/skills/isolated-context-run-subagent/SKILL.md) 增加 authoritative input 与 multi-scenario normalization 规则。
- 明确 direct invocation 与 parent-routed 两种 `Override` 的唯一对应关系。
- 保留 `Default Priority` 作为共享骨架，但禁止把它当成重新比较 `self-cli` 的理由。
- 统一 failure evidence，优先使用 `native subagent delegation -> failed after startup`，避免在标准结果里使用 `native subagent delegation -> started`。

### Examples Alignment

- 在 [isolated-context-run/EXAMPLES.md](/data/projects/x-promptkit/skills/isolated-context-run/EXAMPLES.md) 同步父层 explicit override 与缺命令样例。
- 在 [isolated-context-run-subagent/EXAMPLES.md](/data/projects/x-promptkit/skills/isolated-context-run-subagent/EXAMPLES.md) 补 parent-routed 成功样例和 multi-scenario 样例。

## Acceptance

- 第一轮只改 `SKILL.md` / `EXAMPLES.md`，不改 `iitests` 断言。
- 改完后按 [README](/data/projects/x-promptkit/iitests/isolated-context-run-subagent/README.md) 重跑 6 个 case，并发保持 `<= 3`。
- 预期收口顺序：
  - 先解决 `case-01` 到 `case-04` 的 canonical literal 漂移
  - 再解决 `case-05` / `case-06` 的 child-layer override 与 scenario normalization
- 如果重跑后仍有失败，只有在 `SKILL.md` 与 `EXAMPLES.md` 已完全一致时，才允许回头修 `main-agent-assert.md`
