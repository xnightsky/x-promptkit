#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDORED_BRIDGE_DIR="${SKILL_DIR}/vendor/codex-bridge"
CODEX_DIR="${HOME}/.codex"
CONFIG_FILE="${CODEX_DIR}/config.toml"
AGENTS_DIR="${CODEX_DIR}/agents"
AGENT_FILE="${AGENTS_DIR}/minimax-worker.toml"
BRIDGE_DIR="${HOME}/codex-bridge"
ENV_FILE="${BRIDGE_DIR}/.env"
PID_FILE="${BRIDGE_DIR}/bridge.pid"
PORT="54187"
BEGIN_MARKER="# BEGIN codex-bridge-minimax-worker"
END_MARKER="# END codex-bridge-minimax-worker"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local env_file="$2"
  if [ ! -f "$env_file" ]; then
    return 0
  fi
  python3 - "$key" "$env_file" <<'PY'
import pathlib
import sys

key = sys.argv[1]
env_file = pathlib.Path(sys.argv[2])
for line in env_file.read_text().splitlines():
    if line.startswith(f"{key}="):
        print(line.split("=", 1)[1])
        break
PY
}

replace_managed_block() {
  local target_file="$1"
  local block="$2"
  BLOCK="$block" python3 - "$target_file" "$BEGIN_MARKER" "$END_MARKER" <<'PY'
import os
import pathlib
import sys

target_file = pathlib.Path(sys.argv[1]).expanduser()
begin = sys.argv[2]
end = sys.argv[3]
block = os.environ["BLOCK"].rstrip() + "\n"

text = target_file.read_text() if target_file.exists() else ""
if begin in text and end in text:
    start = text.index(begin)
    finish = text.index(end, start) + len(end)
    new_text = text[:start].rstrip() + "\n\n" + block + text[finish:]
else:
    new_text = text.rstrip()
    if new_text:
        new_text += "\n\n"
    new_text += block

target_file.write_text(new_text.rstrip() + "\n")
PY
}

write_env_file() {
  local token="$1"
  local model="$2"
  local base_url="$3"
  ANTHROPIC_AUTH_TOKEN="$token" \
  ANTHROPIC_MODEL="$model" \
  ANTHROPIC_BASE_URL="$base_url" \
  python3 - "$ENV_FILE" <<'PY'
import os
import pathlib
import shlex
import sys

path = pathlib.Path(sys.argv[1]).expanduser()
existing_lines = path.read_text().splitlines() if path.exists() else []
managed = {
    "ANTHROPIC_AUTH_TOKEN": os.environ["ANTHROPIC_AUTH_TOKEN"],
    "ANTHROPIC_MODEL": os.environ["ANTHROPIC_MODEL"],
    "ANTHROPIC_BASE_URL": os.environ["ANTHROPIC_BASE_URL"],
}
remaining = []
for line in existing_lines:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        remaining.append(line)
        continue
    key = stripped.split("=", 1)[0]
    if key not in managed:
        remaining.append(line)

lines = [f"{key}={shlex.quote(value)}" for key, value in managed.items()]
if remaining and remaining[-1].strip():
    remaining.append("")
remaining.extend(lines)
path.write_text("\n".join(remaining).rstrip() + "\n")
PY
}

require_cmd node
require_cmd python3

pid_is_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
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
  echo "$pid_cmd" | grep -F "main.mjs" >/dev/null 2>&1 || return 1
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

stop_pid_gracefully() {
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

stop_bridge() {
  local pid=""
  local managed_listener_pid=""

  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if pid_is_running "$pid"; then
      stop_pid_gracefully "$pid"
    fi
    rm -f "$PID_FILE"
  fi

  # Update/repair must not kill whichever random process owns the port. Only
  # stop a listener we can prove is the managed bridge from ~/codex-bridge.
  managed_listener_pid="$(find_managed_bridge_listener_pid)"
  if [ -n "$managed_listener_pid" ] && [ "$managed_listener_pid" != "$pid" ]; then
    stop_pid_gracefully "$managed_listener_pid"
  fi
}

sync_vendored_bridge() {
  if [ ! -d "$VENDORED_BRIDGE_DIR" ]; then
    echo "Missing vendored codex-bridge source at $VENDORED_BRIDGE_DIR" >&2
    exit 1
  fi

  python3 - "$VENDORED_BRIDGE_DIR" "$BRIDGE_DIR" <<'PY'
import pathlib
import shutil
import sys

source_dir = pathlib.Path(sys.argv[1]).expanduser()
target_dir = pathlib.Path(sys.argv[2]).expanduser()
preserve = {".env", "bridge.log", "bridge.pid"}

target_dir.mkdir(parents=True, exist_ok=True)
for child in list(target_dir.iterdir()):
    if child.name in preserve:
        continue
    if child.is_dir():
        shutil.rmtree(child)
    else:
        child.unlink()

for child in source_dir.iterdir():
    destination = target_dir / child.name
    if child.is_dir():
        shutil.copytree(child, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(child, destination)
PY
}

install_bridge_runtime() {
  local package_json="${BRIDGE_DIR}/package.json"
  local entrypoint="${BRIDGE_DIR}/main.mjs"

  if [ ! -f "$package_json" ]; then
    echo "Missing bridge package manifest at $package_json" >&2
    exit 1
  fi
  if [ ! -f "$entrypoint" ]; then
    echo "Missing bridge entrypoint at $entrypoint" >&2
    exit 1
  fi

  # Materialize the vendored bridge as a self-contained Node project. Even
  # without external runtime dependencies today, `npm install` validates the
  # manifest and preserves a stable install path for future additions.
  (
    cd "$BRIDGE_DIR"
    npm install --omit=dev --ignore-scripts --no-audit --no-fund
  )
}

mkdir -p "$CODEX_DIR" "$AGENTS_DIR"

existing_token="$(read_env_value ANTHROPIC_AUTH_TOKEN "$ENV_FILE")"
existing_model="$(read_env_value ANTHROPIC_MODEL "$ENV_FILE")"
existing_base_url="$(read_env_value ANTHROPIC_BASE_URL "$ENV_FILE")"

token="${ANTHROPIC_AUTH_TOKEN:-$existing_token}"
model="${ANTHROPIC_MODEL:-${existing_model:-MiniMax-M2.7}}"
base_url="${ANTHROPIC_BASE_URL:-${existing_base_url:-https://api.minimaxi.com/anthropic}}"

if [ -z "${token}" ]; then
  echo "ANTHROPIC_AUTH_TOKEN is required. Ask the user for it, export it, then rerun this installer." >&2
  exit 1
fi

stop_bridge
sync_vendored_bridge
install_bridge_runtime

config_block=$(cat <<'EOF'
# BEGIN codex-bridge-minimax-worker
[model_providers.minimax_bridge]
name = "MiniMax via codex-bridge"
base_url = "http://127.0.0.1:54187"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000

[agents.minimax_worker]
description = "Coding worker backed by MiniMax M2.7 via codex-bridge"
config_file = "./agents/minimax-worker.toml"
# END codex-bridge-minimax-worker
EOF
)

replace_managed_block "$CONFIG_FILE" "$config_block"

cat >"$AGENT_FILE" <<EOF
name = "minimax_worker"
description = "Coding worker backed by ${model} via codex-bridge"
developer_instructions = """
You are a focused implementation subagent.
Prefer concrete code changes, concise reasoning, and explicit failure reporting.
Keep unrelated files untouched.
"""
model_provider = "minimax_bridge"
model = "${model}"
model_reasoning_effort = "medium"
EOF

write_env_file "$token" "$model" "$base_url"

echo "Installed or updated codex-bridge MiniMax worker integration."
echo "Vendored source: $VENDORED_BRIDGE_DIR"
echo "Bridge directory: $BRIDGE_DIR"
echo "Config file: $CONFIG_FILE"
echo "Agent file: $AGENT_FILE"
echo "Env file: $ENV_FILE"
