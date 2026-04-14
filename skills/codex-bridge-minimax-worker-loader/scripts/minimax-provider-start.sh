#!/bin/zsh
set -euo pipefail

BRIDGE_DIR="${HOME}/codex-bridge"
ENV_FILE="${BRIDGE_DIR}/.env"
LOG_FILE="${BRIDGE_DIR}/bridge.log"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
ENTRYPOINT="${BRIDGE_DIR}/main.mjs"
# Keep the production default on 54187, but allow tests or constrained local
# setups to override the binding explicitly without patching the script.
HOST="${CODEX_BRIDGE_HOST:-127.0.0.1}"
PORT="${CODEX_BRIDGE_PORT:-54187}"
HEALTH_URL="${CODEX_BRIDGE_HEALTH_URL:-http://${HOST}:${PORT}/openapi.json}"
START_RETRIES="${CODEX_BRIDGE_START_RETRIES:-20}"

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

require_port_inspector() {
  if command -v lsof >/dev/null 2>&1 || command -v ss >/dev/null 2>&1; then
    return 0
  fi

  echo "Missing required command: lsof or ss" >&2
  exit 1
}

listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null || true
    return 0
  fi

  ss -ltnp 2>/dev/null | awk -v port=":${PORT}" '
    index($4, port) {
      if (match($0, /pid=[0-9]+/)) {
        pid = substr($0, RSTART + 4, RLENGTH - 4)
        if (!(pid in seen)) {
          seen[pid] = 1
          print pid
        }
      }
    }
  ' || true
}

pid_owns_port() {
  local target_pid="${1:-}"
  local pid

  [ -n "$target_pid" ] || return 1

  while IFS= read -r pid; do
    if [ "$pid" = "$target_pid" ]; then
      return 0
    fi
  done <<EOF
$(listener_pids)
EOF

  return 1
}

bridge_pid_is_managed() {
  local pid="${1:-}"
  local pid_cwd
  local pid_cmd

  if ! pid_is_running "$pid"; then
    return 1
  fi

  pid_cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
  pid_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"

  [ "$pid_cwd" = "$BRIDGE_DIR" ] || return 1
  echo "$pid_cmd" | grep -F "main.mjs" >/dev/null 2>&1 || return 1
  echo "$pid_cmd" | grep -F -- "--port ${PORT}" >/dev/null 2>&1
}

find_managed_bridge_listener_pid() {
  local pid

  while IFS= read -r pid; do
    if bridge_pid_is_managed "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
  done <<EOF
$(listener_pids)
EOF
}

find_listener_pid() {
  listener_pids | head -n 1 || true
}

port_conflict_error() {
  local pid="${1:-}"
  local pid_cmd

  pid_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  echo "Port ${PORT} is occupied by unmanaged pid ${pid}." >&2
  if [ -n "$pid_cmd" ]; then
    echo "Command: ${pid_cmd}" >&2
  fi
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
  (
    cd "$BRIDGE_DIR"
    nohup node "$ENTRYPOINT" --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 < /dev/null &
    echo "$!"
  )
}

require_cmd curl
require_cmd node
require_port_inspector

if [ ! -d "$BRIDGE_DIR" ]; then
  echo "codex-bridge is not installed at $BRIDGE_DIR. Re-run the vendored installer skill first." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing bridge env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$ENTRYPOINT" ]; then
  echo "Missing bridge entrypoint at $ENTRYPOINT. Re-run the vendored installer skill." >&2
  exit 1
fi

for key in ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL ANTHROPIC_BASE_URL; do
  if ! env_has_key "$key" "$ENV_FILE"; then
    echo "Missing required key in $ENV_FILE: $key" >&2
    exit 1
  fi
done

if [ ! -f "${BRIDGE_DIR}/package.json" ]; then
  echo "Missing bridge package manifest at ${BRIDGE_DIR}/package.json" >&2
  exit 1
fi

pid_from_file="$(cat "$PID_FILE" 2>/dev/null || true)"

managed_listener_pid="$(find_managed_bridge_listener_pid)"
if [ -n "$managed_listener_pid" ]; then
  if health_check && pid_owns_port "$managed_listener_pid"; then
    printf '%s\n' "$managed_listener_pid" >"$PID_FILE"
    echo "codex-bridge already running on ${HOST}:${PORT} (pid ${managed_listener_pid})."
    exit 0
  fi

  stop_bridge_pid "$managed_listener_pid"
  cleanup_pid_file
fi

listener_pid="$(find_listener_pid)"
if [ -n "$listener_pid" ]; then
  port_conflict_error "$listener_pid"
  exit 1
fi

if bridge_pid_is_managed "$pid_from_file"; then
  stop_bridge_pid "$pid_from_file"
fi
cleanup_pid_file

started_pid="$(start_bridge)"
conflict_pid=""

for _ in {1..$START_RETRIES}; do
  if ! pid_is_running "$started_pid"; then
    break
  fi

  listener_pid="$(find_listener_pid)"
  if [ -n "$listener_pid" ] && [ "$listener_pid" != "$started_pid" ]; then
    conflict_pid="$listener_pid"
    break
  fi

  if pid_owns_port "$started_pid" && health_check; then
    printf '%s\n' "$started_pid" >"$PID_FILE"
    echo "codex-bridge started on ${HOST}:${PORT} (pid ${started_pid})."
    echo "Warning: this bridge remains running until you stop it manually with:"
    echo "kill \"\$(cat ~/codex-bridge/bridge.pid)\" && rm -f ~/codex-bridge/bridge.pid"
    exit 0
  fi
  sleep 1
done

if [ -n "$started_pid" ]; then
  stop_bridge_pid "$started_pid"
fi
cleanup_pid_file

if [ -n "$conflict_pid" ]; then
  port_conflict_error "$conflict_pid"
  exit 1
fi

echo "Failed to start codex-bridge on ${HOST}:${PORT}. Check ${LOG_FILE}." >&2
exit 1
