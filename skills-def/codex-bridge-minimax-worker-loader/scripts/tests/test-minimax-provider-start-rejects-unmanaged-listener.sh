#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/../minimax-provider-start.sh"
TMP_HOME="$(mktemp -d)"
TMP_SERVER="$(mktemp -d)"
BRIDGE_DIR="${TMP_HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="28766"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_HOME" "$TMP_SERVER"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
export CODEX_BRIDGE_PORT="$PORT"

mkdir -p "$BRIDGE_DIR"
cat >"$BRIDGE_DIR/.env" <<'EOF'
ANTHROPIC_AUTH_TOKEN=test-token
ANTHROPIC_MODEL=MiniMax-M2.7
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
EOF

cat >"$BRIDGE_DIR/package.json" <<'EOF'
{
  "name": "codex-bridge-test",
  "private": true,
  "type": "module"
}
EOF

cat >"$BRIDGE_DIR/main.mjs" <<'EOF'
#!/usr/bin/env node
setInterval(() => {}, 1000);
EOF
chmod +x "$BRIDGE_DIR/main.mjs"

cat >"$TMP_SERVER/openapi-stub.mjs" <<EOF
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.url === "/openapi.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ paths: { "/responses": {} } }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(${PORT}, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
EOF

node "$TMP_SERVER/openapi-stub.mjs" >"$TMP_SERVER/server.log" 2>&1 &
SERVER_PID="$!"

for _ in {1..10}; do
  if curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:${PORT}/openapi.json" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if "$START_SCRIPT" >"$TMP_SERVER/start.out" 2>"$TMP_SERVER/start.err"; then
  echo "Loader should fail when an unmanaged listener already owns the port" >&2
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  echo "Loader should not leave a pid file after an unmanaged port conflict" >&2
  exit 1
fi

if ! grep -F "Port ${PORT} is occupied by unmanaged pid" "$TMP_SERVER/start.err" >/dev/null 2>&1; then
  echo "Loader did not report the unmanaged port conflict clearly" >&2
  exit 1
fi
