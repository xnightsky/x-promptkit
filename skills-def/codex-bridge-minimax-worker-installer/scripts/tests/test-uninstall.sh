#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNINSTALL_SCRIPT="${SCRIPT_DIR}/../uninstall.sh"
TMP_HOME="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_HOME"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/.codex/agents" "$HOME/codex-bridge"

cat >"$HOME/.codex/config.toml" <<'EOF'
model_provider = "example"

# BEGIN codex-bridge-minimax-worker
[model_providers.minimax_bridge]
name = "MiniMax via codex-bridge"

[agents.minimax_worker]
description = "worker"
config_file = "./agents/minimax-worker.toml"
# END codex-bridge-minimax-worker

[features]
fast_mode = true
EOF

cat >"$HOME/.codex/agents/minimax-worker.toml" <<'EOF'
name = "minimax_worker"
EOF

cat >"$HOME/codex-bridge/bridge.pid" <<'EOF'
999999
EOF

# Run the target directly so the test follows the checked-in shebang instead of
# pinning a separate shell entrypoint here.
"$UNINSTALL_SCRIPT"

if rg -q "codex-bridge-minimax-worker" "$HOME/.codex/config.toml"; then
  echo "Managed config block still present after uninstall" >&2
  exit 1
fi

if [ -f "$HOME/.codex/agents/minimax-worker.toml" ]; then
  echo "Agent file still present after uninstall" >&2
  exit 1
fi

if [ -d "$HOME/codex-bridge" ]; then
  echo "Bridge directory still present after uninstall" >&2
  exit 1
fi
