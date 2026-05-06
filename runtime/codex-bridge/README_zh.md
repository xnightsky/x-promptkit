# codex-bridge runtime（`runtime/codex-bridge`）

这里是共享 `codex-bridge` runtime 的**源码真源**。

- 对 Codex 暴露 OpenAI `Responses API`
- 通过 adapter 连接不同上游：
  - `anthropic-messages`：MiniMax / Anthropic-compatible
- 各 skill 目录中的 `vendor/codex-bridge/` 只是发布副本，不是日常开发入口

## 目录

- `main.mjs`：进程入口
- `lib/server.mjs`：HTTP server、`/responses`、`/openapi.json`
- `lib/config.mjs`：`.env` 解析和 runtime 配置装载
- `lib/responses-runtime.mjs`：Responses SSE/JSON 共用逻辑
- `lib/adapters/anthropic-messages.mjs`：MiniMax adapter

## 维护规则

- 先改这里，再同步到 skill 的 vendor 副本
- 同步命令：

```bash
node scripts/tooling/sync-codex-bridge-runtime.mjs
```

## 健康检查

- `GET /openapi.json` 是 loader 的 readiness 契约
- 固定支持：
  - `POST /responses`
  - `POST /v1/responses`
- 多 profile adapter 还支持带前缀路径，例如：
  - `POST /coding/responses`
  - `POST /general/responses`
