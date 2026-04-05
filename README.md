# x-promptkit

self promptkit

## 开发流程

本仓库当前把本地检查收敛到统一脚本入口：

- `npm run lint`
- `npm run check`
- `npm run verify`

默认开发顺序：

1. 先判断改动会影响代码、文档、skill、fixture 还是脚本入口。
2. 在实现过程中同步补注释，特别是非显然逻辑、协议边界、拒绝分支和输出骨架。
3. 改完后先跑相关局部检查，再跑 `npm run lint`。
4. 如果改动影响 fixture、契约或运行说明，再跑 `npm run check`。
5. 需要完整交付校验时跑 `npm run verify`。

仓库约定：

- 不要在仓库内容里写本机绝对路径，一律改成相对路径或占位符。
- 不要只改实现不改文档；命令、输出格式、字段语义和开发流程变化都要同步更新说明。

## Guided Review

仓库内新增了一个引导式 CR skill：`skills/guided-code-review/`。

- `SKILL.md`：定义引导式 review、技术细节澄清、回到 review 结论的主流程
- `EXAMPLES.md`：定义典型交互案例
- `references/technical-clarification.md`：保留一份技术细节澄清参考文档

配套 wrapper 命令：

- `npm run guided-review -- --worktree . --uncommitted`
- `npm run guided-review -- --worktree .worktrees/isolated-context-run-codex --base main`
- `npm run guided-review -- --worktree . --commit <sha> --prompt "重点看兼容性"`
- `npm run guided-review -- --worktree . --dry-run`

Codex 场景下还支持一个单独的 skill help 入口：

- 消息中出现独立片段 `$guided-code-review --help` 时，优先返回 `skills/guided-code-review/HELP.md` 的帮助骨架
- 这个入口属于 skill 提示侧契约，不等价于 `guided-review` 这个 npm script
- `guided-review` 负责包装 `codex review`，`$guided-code-review --help` 负责解释这个 skill 该怎么用

命令约定：

- `--worktree` 必填，用来显式指定 review 目标
- diff 选择支持 `--uncommitted`、`--base <branch>`、`--commit <sha>`
- 不显式指定 diff 模式时，默认使用 `--uncommitted`
- `--dry-run` 只打印最终 `codex review` 命令和 prompt，不执行真实 review
