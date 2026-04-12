#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/minimax-provider-start.sh"
BRIDGE_DIR="${HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
HEALTH_URL="http://127.0.0.1:18765/openapi.json"

cleanup() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

trap cleanup EXIT

cleanup

http_proxy="http://127.0.0.1:7890" \
https_proxy="http://127.0.0.1:7890" \
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
