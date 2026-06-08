#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/../minimax-provider-start.sh"
TMP_HOME="$(mktemp -d)"
BRIDGE_DIR="${TMP_HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="28769"
HEALTH_URL="http://127.0.0.1:${PORT}/openapi.json"

cleanup() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
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

shell_sid="$(ps -o sid= -p "$$" | tr -d '[:space:]')"
"$START_SCRIPT" >"$TMP_HOME/start.out" 2>"$TMP_HOME/start.err"

bridge_pid="$(cat "$PID_FILE")"
bridge_sid="$(ps -o sid= -p "$bridge_pid" | tr -d '[:space:]')"

kill -0 "$bridge_pid"
curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" >/dev/null

if [ -z "$bridge_sid" ]; then
  echo "Loader should leave a running bridge session id to inspect" >&2
  exit 1
fi

if [ "$bridge_sid" = "$shell_sid" ]; then
  echo "Loader should start bridge in a detached session" >&2
  exit 1
fi
