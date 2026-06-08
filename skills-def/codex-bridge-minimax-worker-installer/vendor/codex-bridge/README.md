# codex-bridge runtime (`runtime/codex-bridge`)

This directory is the source of truth for the shared Codex bridge runtime.

- The runtime speaks the OpenAI `Responses API` to Codex.
- Provider-specific adapters translate upstream protocols:
  - `anthropic-messages` for MiniMax's Anthropic-compatible endpoint
- Skill-local `vendor/codex-bridge/` directories are release snapshots, not the
  primary implementation location.

## Layout

- `main.mjs`: process entrypoint
- `lib/server.mjs`: HTTP server, route handling, OpenAPI/health endpoints
- `lib/config.mjs`: `.env` parsing and runtime config loading
- `lib/responses-runtime.mjs`: shared Responses framing, SSE parsing, and
  request-path helpers
- `lib/adapters/anthropic-messages.mjs`: MiniMax adapter

## Runtime contract

- `GET /openapi.json` is the health contract used by loaders.
- `POST /responses` and `POST /v1/responses` are always supported.
- Profile-prefixed routes such as `POST /coding/responses` and
  `POST /general/responses` are supported for adapters that expose multiple
  upstream profiles from one local bridge process.

## Maintenance

- Edit this directory first.
- After changes, sync snapshots into the relevant skill vendors with:

```bash
node scripts/tooling/sync-codex-bridge-runtime.mjs
```
