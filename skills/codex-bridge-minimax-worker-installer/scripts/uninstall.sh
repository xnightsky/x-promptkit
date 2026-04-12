#!/bin/zsh
set -euo pipefail

CODEX_DIR="${HOME}/.codex"
CONFIG_FILE="${CODEX_DIR}/config.toml"
AGENTS_DIR="${CODEX_DIR}/agents"
AGENT_FILE="${AGENTS_DIR}/minimax-worker.toml"
HOOKS_DIR="${CODEX_DIR}/hooks"
BRIDGE_DIR="${HOME}/codex-bridge"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="18765"
BEGIN_MARKER="# BEGIN codex-bridge-minimax-worker"
END_MARKER="# END codex-bridge-minimax-worker"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

remove_managed_block() {
  local target_file="$1"
  python3 - "$target_file" "$BEGIN_MARKER" "$END_MARKER" <<'PY'
import pathlib
import sys

target_file = pathlib.Path(sys.argv[1]).expanduser()
begin = sys.argv[2]
end = sys.argv[3]

if not target_file.exists():
    raise SystemExit(0)

text = target_file.read_text()
if begin in text and end in text:
    start = text.index(begin)
    finish = text.index(end, start) + len(end)
    text = (text[:start].rstrip() + "\n\n" + text[finish:].lstrip()).rstrip() + "\n"
    target_file.write_text(text)
PY
}

stop_bridge() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    port_pid="$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [ -n "${port_pid}" ]; then
      kill "$port_pid" 2>/dev/null || true
      sleep 1
    fi
  fi
}

require_cmd python3

remove_managed_block "$CONFIG_FILE"
rm -f "$AGENT_FILE"
stop_bridge
rm -rf "$BRIDGE_DIR"
rmdir "$AGENTS_DIR" 2>/dev/null || true
rmdir "$HOOKS_DIR" 2>/dev/null || true

echo "Uninstalled codex-bridge MiniMax worker integration."
