[中文版 README](README_zh.md)

# codex-bridge

A lightweight proxy that translates **OpenAI Responses API** requests into **Anthropic Messages API** calls, allowing [Codex CLI](https://github.com/openai/codex) (and any client that speaks the Responses API) to use Anthropic-compatible models.

## Features

- **Streaming SSE** -- full support for the Responses API server-sent event protocol (`response.created`, `output_text.delta`, `response.completed`, etc.)
- **Tool calls** -- translates Anthropic `tool_use` blocks into Responses API `function_call` items (and vice-versa), so Codex can execute commands and feed results back
- **Multi-turn conversations** -- correctly maps `function_call` / `function_call_output` history items to Anthropic's `tool_use` / `tool_result` content blocks, with automatic role-alternation merging
- **Thinking blocks** -- silently consumes Anthropic extended-thinking events without leaking them to the client
- **Non-streaming mode** -- also works for plain JSON request/response round-trips

## Quick Start

### Prerequisites

- Python >= 3.10
- [uv](https://github.com/astral-sh/uv) (recommended) or pip

### Install

```bash
git clone https://github.com/nicholasyangyang/codex-bridge.git
cd codex-bridge
uv sync
```

### Configure

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```dotenv
ANTHROPIC_AUTH_TOKEN=sk-your-api-key-here
ANTHROPIC_MODEL=MiniMax-M2.7
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
```

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_AUTH_TOKEN` | Yes | API key for the Anthropic-compatible endpoint |
| `ANTHROPIC_MODEL` | Yes | Default model name sent to the upstream API |
| `ANTHROPIC_BASE_URL` | No | Base URL override (defaults to `https://api.minimaxi.com/anthropic`) |

### Run

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

### Use with Codex CLI

A reference Codex configuration file is provided at `config.toml.example`. Copy it to your Codex config directory:

```bash
cp config.toml.example ~/.codex/config.toml
```

Then launch Codex with the corresponding profile:

```bash
codex --profile m27
```

> The example config points Codex at `http://0.0.0.0:8000` using the Responses wire API, with retry and timeout settings tuned for proxied requests. Adjust the model name and provider settings to match your setup.

## How It Works

```
Codex CLI                codex-bridge              Anthropic-compatible API
(Responses API) ──POST──> (FastAPI proxy) ──POST──> (Messages API)
     <──── SSE stream ────    <──── SSE stream ────
```

1. Codex sends a Responses API request (`POST /responses`)
2. The proxy converts it to an Anthropic Messages API request (messages, system prompt, tools)
3. The upstream response is streamed back, with each Anthropic event translated to the corresponding Responses API SSE event
4. For tool calls, the proxy maps `tool_use` to `function_call` so Codex can execute the command and send back `function_call_output`, which gets converted to `tool_result`

## License

MIT
