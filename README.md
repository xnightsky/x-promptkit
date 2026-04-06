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

仓库内当前维护的是一个引导式 CR skill：`skills/guided-review/`。

- 主体是 skill，不是独立产品级 CLI
- `SKILL.md`、`HELP.md`、`EXAMPLES.md` 定义交互契约
- `skills/guided-review/scripts/` 是该 skill 自带的开发与验证入口
- `docs/guided-review/` 记录设计边界和开发计划

配套开发入口：

- `npm run guided-review -- --dry-run`
- `npm run guided-review -- --base origin/main --head origin/feat/demo --dry-run`
- `npm run guided-review -- --worktree .worktrees/isolated-context-run-codex --base origin/main --dry-run`
- `npm run guided-review -- --commit <sha> --prompt "重点看兼容性"`

当前脚本入口会先为 `guided-review` 准备稳定的 review context，再调用 `codex review`，包括：

- repo / worktree 解析
- base / head / commit 范围收敛
- 预生成 review context，减少模型重复做机械 git 枚举
- guided review prompt 拼装

Codex 场景下还支持一个单独的 skill help 入口：

- 消息中出现独立片段 `$guided-review --help` 时，优先返回 `skills/guided-review/HELP.md` 的帮助骨架
- 这个入口属于 skill 提示侧契约，不等价于 `guided-review` 这个 npm script
- `guided-review` 的 npm script 只是 skill 的开发与验证入口

当前命令约定：

- `--repo <path>` 可选，默认当前 repo
- `--worktree <path>` 是显式覆盖项
- diff 选择支持 `--uncommitted`、`--base <branch> [--head <ref>]`、`--commit <sha>`
- 不显式指定 diff 模式时，默认使用 `--uncommitted`
- `--dry-run` 会打印解析结果、prepared review context 和最终命令
