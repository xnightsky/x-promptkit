#!/bin/zsh
set -euo pipefail

BRIDGE_DIR="${HOME}/codex-bridge"
ENV_FILE="${BRIDGE_DIR}/.env"
LOG_FILE="${BRIDGE_DIR}/bridge.log"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PYTHON_BIN="${BRIDGE_DIR}/.venv/bin/python"
HOST="127.0.0.1"
PORT="18765"
HEALTH_URL="http://${HOST}:${PORT}/openapi.json"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

env_has_key() {
  local key="$1"
  local file="$2"
  [ -f "$file" ] && grep -Eq "^${key}=" "$file"
}

health_check() {
  curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -F '"/responses"' >/dev/null 2>&1
}

pid_is_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

cleanup_pid_file() {
  rm -f "$PID_FILE"
}

bridge_pid_is_managed() {
  local pid="${1:-}"
  local pid_cwd
  local pid_cmd

  if ! pid_is_running "$pid"; then
    return 1
  fi
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi

  pid_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  pid_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"

  [ "$pid_cwd" = "$BRIDGE_DIR" ] || return 1
  echo "$pid_cmd" | grep -F "main:app" >/dev/null 2>&1 || return 1
  echo "$pid_cmd" | grep -F -- "--port ${PORT}" >/dev/null 2>&1
}

find_managed_bridge_listener_pid() {
  local pid

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  while IFS= read -r pid; do
    if bridge_pid_is_managed "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
  done <<EOF
$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null || true)
EOF
}

stop_bridge_pid() {
  local pid="${1:-}"
  if ! pid_is_running "$pid"; then
    return 0
  fi

  kill "$pid" 2>/dev/null || true
  for _ in {1..5}; do
    if ! pid_is_running "$pid"; then
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
}

start_bridge() {
  python3 <<PY
import os
import subprocess

bridge_dir = os.path.expanduser(${(qqq)BRIDGE_DIR})
log_file = os.path.expanduser(${(qqq)LOG_FILE})
pid_file = os.path.expanduser(${(qqq)PID_FILE})
python_bin = os.path.expanduser(${(qqq)PYTHON_BIN})
cmd = [
    python_bin,
    "-m",
    "uvicorn",
    "main:app",
    "--host",
    ${(qqq)HOST},
    "--port",
    ${(qqq)PORT},
]

with open(log_file, "ab", buffering=0) as log:
    proc = subprocess.Popen(
        cmd,
        cwd=bridge_dir,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

with open(pid_file, "w", encoding="utf-8") as fh:
    fh.write(str(proc.pid))
PY
}

require_cmd curl
require_cmd python3

if [ ! -d "$BRIDGE_DIR" ]; then
  echo "codex-bridge is not installed at $BRIDGE_DIR. Re-run the vendored installer skill first." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing bridge env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "${BRIDGE_DIR}/main.py" ]; then
  echo "Missing bridge entrypoint at ${BRIDGE_DIR}/main.py. Re-run the vendored installer skill." >&2
  exit 1
fi

for key in ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL ANTHROPIC_BASE_URL; do
  if ! env_has_key "$key" "$ENV_FILE"; then
    echo "Missing required key in $ENV_FILE: $key" >&2
    exit 1
  fi
done

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Missing bridge Python runtime: $PYTHON_BIN" >&2
  exit 1
fi

# Probe the health endpoint before trusting bridge.pid. A healthy bridge can
# already be running even if bridge.pid was deleted, and starting another one
# would overwrite the correct pid with a failed duplicate process.
if health_check; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if ! pid_is_running "$pid"; then
    pid="$(find_managed_bridge_listener_pid)"
    if [ -n "$pid" ]; then
      printf '%s\n' "$pid" >"$PID_FILE"
    fi
  fi

  echo "codex-bridge already healthy on ${HOST}:${PORT}."
  exit 0
fi

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${pid}" ]; then
    stop_bridge_pid "$pid"
  fi
  cleanup_pid_file
fi

start_bridge

for _ in {1..20}; do
  if health_check; then
    echo "codex-bridge started on ${HOST}:${PORT}."
    echo "Warning: this bridge remains running until you stop it manually with:"
    echo "kill \"\$(cat ~/codex-bridge/bridge.pid)\" && rm -f ~/codex-bridge/bridge.pid"
    exit 0
  fi
  sleep 1
done

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${pid}" ]; then
    stop_bridge_pid "$pid"
  fi
  cleanup_pid_file
fi

echo "Failed to start codex-bridge on ${HOST}:${PORT}. Check ${LOG_FILE}." >&2
exit 1
