#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/../minimax-provider-start.sh"
TMP_HOME="$(mktemp -d)"
BRIDGE_DIR="${TMP_HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
export CODEX_BRIDGE_PORT="28765"
HEALTH_URL="http://127.0.0.1:${CODEX_BRIDGE_PORT}/openapi.json"

cleanup() {
  export HOME="$TMP_HOME"
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  rm -rf "$TMP_HOME"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
cleanup

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

http_proxy="http://127.0.0.1:7890" \
https_proxy="http://127.0.0.1:7890" \
# Run the target directly so the test follows the checked-in shebang instead of
# pinning a separate shell entrypoint here.
"$START_SCRIPT" >/tmp/minimax-provider-start-test.out 2>&1

curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" >/dev/null

first_pid="$(cat "$PID_FILE")"
kill -0 "$first_pid"

rm -f "$PID_FILE"

"$START_SCRIPT" >/tmp/minimax-provider-start-test-second.out 2>&1

second_pid="$(cat "$PID_FILE")"
kill -0 "$second_pid"

if [ "$first_pid" != "$second_pid" ]; then
  echo "Loader started a duplicate bridge instead of reusing the healthy one" >&2
  exit 1
fi
