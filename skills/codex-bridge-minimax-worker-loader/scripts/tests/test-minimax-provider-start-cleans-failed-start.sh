#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/../minimax-provider-start.sh"
TMP_HOME="$(mktemp -d)"
BRIDGE_DIR="${TMP_HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="28767"

cleanup() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "$pid" 2>/dev/null; then
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
console.error("Loaded bridge");
setTimeout(() => process.exit(0), 100);
EOF
chmod +x "$BRIDGE_DIR/main.mjs"

if "$START_SCRIPT" >"$TMP_HOME/start.out" 2>"$TMP_HOME/start.err"; then
  echo "Loader should fail when the bridge process exits before owning the port" >&2
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  echo "Loader should remove bridge.pid after a failed startup" >&2
  exit 1
fi

if ! grep -F "Failed to start codex-bridge on 127.0.0.1:${PORT}" "$TMP_HOME/start.err" >/dev/null 2>&1; then
  echo "Loader did not emit the expected startup failure message" >&2
  exit 1
fi
