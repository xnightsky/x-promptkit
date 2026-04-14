#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/../minimax-provider-start.sh"
TMP_HOME="$(mktemp -d)"
BRIDGE_DIR="${TMP_HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="28768"
HEALTH_URL="http://127.0.0.1:${PORT}/openapi.json"
MANAGED_PID=""

cleanup() {
  if [ -n "$MANAGED_PID" ] && kill -0 "$MANAGED_PID" 2>/dev/null; then
    kill "$MANAGED_PID" 2>/dev/null || true
    wait "$MANAGED_PID" 2>/dev/null || true
  fi

  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  fi

  rm -rf "$TMP_HOME"
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
import { createServer } from "node:http";

function parseArgs(argv) {
  const options = { host: "127.0.0.1", port: 54187 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--host") {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
      continue;
    }
    if (argv[index] === "--port") {
      options.port = Number(argv[index + 1] ?? options.port);
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const server = createServer((req, res) => {
  if (req.url === "/openapi.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ paths: { "/healthz": {} } }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(options.port, options.host);

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
EOF
chmod +x "$BRIDGE_DIR/main.mjs"

(
  cd "$BRIDGE_DIR"
  node "$BRIDGE_DIR/main.mjs" --host "127.0.0.1" --port "$PORT" >"$BRIDGE_DIR/unhealthy.log" 2>&1 &
  echo "$!" >"$BRIDGE_DIR/unhealthy.pid"
)
MANAGED_PID="$(cat "$BRIDGE_DIR/unhealthy.pid")"

for _ in {1..10}; do
  if curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

kill -0 "$MANAGED_PID"

cat >"$BRIDGE_DIR/main.mjs" <<'EOF'
#!/usr/bin/env node
import { createServer } from "node:http";

function parseArgs(argv) {
  const options = { host: "127.0.0.1", port: 54187 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--host") {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
      continue;
    }
    if (argv[index] === "--port") {
      options.port = Number(argv[index + 1] ?? options.port);
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const server = createServer((req, res) => {
  if (req.url === "/openapi.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ paths: { "/responses": {} } }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(options.port, options.host);

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
EOF
chmod +x "$BRIDGE_DIR/main.mjs"

"$START_SCRIPT" >"$TMP_HOME/start.out" 2>"$TMP_HOME/start.err"

if kill -0 "$MANAGED_PID" 2>/dev/null; then
  echo "Loader should kill the unhealthy managed listener before restarting" >&2
  exit 1
fi

new_pid="$(cat "$PID_FILE")"
kill -0 "$new_pid"

if [ "$new_pid" = "$MANAGED_PID" ]; then
  echo "Loader should replace the unhealthy managed listener with a new pid" >&2
  exit 1
fi

curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" | grep -F '"/responses"' >/dev/null
