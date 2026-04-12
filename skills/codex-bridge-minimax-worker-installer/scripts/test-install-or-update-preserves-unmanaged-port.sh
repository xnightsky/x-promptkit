#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install-or-update.sh"
TMP_HOME="$(mktemp -d)"
TMP_BIN="$(mktemp -d)"
TMP_LOG="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_HOME" "$TMP_BIN" "$TMP_LOG"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
export PATH="$TMP_BIN:/usr/local/bin:/usr/bin:/bin"
export ANTHROPIC_AUTH_TOKEN="test-token"
export ANTHROPIC_MODEL="MiniMax-M2.7"
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
export TEST_NODE_LOG="$TMP_LOG/node.log"

cat >"$TMP_BIN/node" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$PWD:$*" >>"$TEST_NODE_LOG"
mkdir -p .venv/bin
cat >.venv/bin/python <<'PYEOF'
#!/bin/sh
exec /usr/bin/env python3 "$@"
PYEOF
chmod +x .venv/bin/python
EOF
chmod +x "$TMP_BIN/node"

python3 -m http.server 18765 --bind 127.0.0.1 >"$TMP_LOG/http-server.log" 2>&1 &
SERVER_PID="$!"

for _ in {1..10}; do
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

"$INSTALL_SCRIPT"

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Install should not kill an unmanaged listener on port 18765" >&2
  exit 1
fi
