[English README](README.md)

# codex-bridge

一个轻量代理，将 **OpenAI Responses API** 请求转换为 **Anthropic Messages API** 调用，让 [Codex CLI](https://github.com/openai/codex) (以及任何使用 Responses API 的客户端) 能够使用 Anthropic 兼容模型。

## 特性

- **流式 SSE** -- 完整支持 Responses API 的 server-sent event 协议 (`response.created`、`output_text.delta`、`response.completed` 等)
- **工具调用** -- 将 Anthropic 的 `tool_use` 块转换为 Responses API 的 `function_call` 项 (反向亦然)，Codex 可以执行命令并回传结果
- **多轮对话** -- 正确映射 `function_call` / `function_call_output` 历史项到 Anthropic 的 `tool_use` / `tool_result` 内容块，自动合并相邻同角色消息以满足 Anthropic 的严格交替要求
- **思维链块** -- 静默消费 Anthropic 的 extended-thinking 事件，不泄露给客户端
- **非流式模式** -- 同样支持普通 JSON 请求/响应

## 快速开始

### 前置条件

- Python >= 3.10
- [uv](https://github.com/astral-sh/uv) (推荐) 或 pip

### 安装

```bash
git clone https://github.com/nicholasyangyang/codex-bridge.git
cd codex-bridge
uv sync
```

### 配置

复制示例配置并填写:

```bash
cp .env.example .env
```

```dotenv
ANTHROPIC_AUTH_TOKEN=sk-your-api-key-here
ANTHROPIC_MODEL=MiniMax-M2.7
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
```

| 变量 | 必需 | 说明 |
|---|---|---|
| `ANTHROPIC_AUTH_TOKEN` | 是 | Anthropic 兼容端点的 API Key |
| `ANTHROPIC_MODEL` | 是 | 发送到上游 API 的默认模型名称 |
| `ANTHROPIC_BASE_URL` | 否 | 上游 API 地址 (默认 `https://api.minimaxi.com/anthropic`) |

### 运行

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

### 配合 Codex CLI 使用

项目提供了 Codex 参考配置文件 `config.toml.example`，复制到 Codex 配置目录即可:

```bash
cp config.toml.example ~/.codex/config.toml
```

然后使用对应 profile 启动 Codex:

```bash
codex --profile m27
```

> 示例配置将 Codex 指向 `http://0.0.0.0:8000`，使用 Responses wire API，并针对代理请求调整了重试和超时参数。请根据实际情况修改模型名称和 provider 设置。

## 工作原理

```
Codex CLI                codex-bridge              Anthropic 兼容 API
(Responses API) ──POST──> (FastAPI 代理) ──POST──> (Messages API)
     <──── SSE 流 ────       <──── SSE 流 ────
```

1. Codex 发送 Responses API 请求 (`POST /responses`)
2. 代理将其转换为 Anthropic Messages API 请求 (消息、系统提示词、工具定义)
3. 上游响应以流式返回，每个 Anthropic 事件被翻译为对应的 Responses API SSE 事件
4. 对于工具调用，代理将 `tool_use` 映射为 `function_call`，Codex 执行命令后发回 `function_call_output`，代理再将其转换为 `tool_result`

## 许可证

MIT
