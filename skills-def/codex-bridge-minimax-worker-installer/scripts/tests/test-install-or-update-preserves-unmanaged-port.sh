#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../install-or-update.sh"
TMP_HOME="$(mktemp -d)"
TMP_BIN="$(mktemp -d)"
TMP_LOG="$(mktemp -d)"
SERVER_PID=""
TRACKED_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_HOME" "$TMP_BIN" "$TMP_LOG"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
export PATH="$TMP_BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export ANTHROPIC_AUTH_TOKEN="test-token"
export ANTHROPIC_MODEL="MiniMax-M2.7"
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
export TEST_NPM_LOG="$TMP_LOG/npm.log"

cat >"$TMP_BIN/npm" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$PWD:$*" >>"$TEST_NPM_LOG"
EOF
chmod +x "$TMP_BIN/npm"

if command -v lsof >/dev/null 2>&1; then
  TRACKED_PID="$(lsof -ti tcp:54187 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$TRACKED_PID" ]; then
  python3 -m http.server 54187 --bind 127.0.0.1 >"$TMP_LOG/http-server.log" 2>&1 &
  SERVER_PID="$!"

  for _ in {1..10}; do
    if curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:54187/" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:54187/" >/dev/null 2>&1; then
    echo "Test setup failed to establish the unmanaged listener on port 54187" >&2
    exit 1
  fi

  TRACKED_PID="$SERVER_PID"
fi

# Run the target directly so the test follows the checked-in shebang instead of
# pinning a separate shell entrypoint here.
"$INSTALL_SCRIPT"

if ! kill -0 "$TRACKED_PID" 2>/dev/null; then
  echo "Install should not kill an unmanaged listener on port 54187" >&2
  exit 1
fi
