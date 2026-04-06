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
- `isolated-context-run:codex` 的 runtime 说明见 `skills/isolated-context-run-codex/scripts/README.md`，专题设计见 `docs/isolated-context-run-codex/README.md`。
