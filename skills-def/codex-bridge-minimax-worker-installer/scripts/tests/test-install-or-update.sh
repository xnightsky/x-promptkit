#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../install-or-update.sh"
TMP_HOME="$(mktemp -d)"
TMP_BIN="$(mktemp -d)"
TMP_LOG="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_HOME" "$TMP_BIN" "$TMP_LOG"
}

trap cleanup EXIT

export HOME="$TMP_HOME"
export PATH="$TMP_BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export ANTHROPIC_AUTH_TOKEN="test-token"
export ANTHROPIC_MODEL="MiniMax-M2.7"
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
export TEST_NPM_LOG="$TMP_LOG/npm.log"
export TEST_GIT_LOG="$TMP_LOG/git.log"

cat >"$TMP_BIN/npm" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$PWD:$*" >>"$TEST_NPM_LOG"
EOF
chmod +x "$TMP_BIN/npm"

cat >"$TMP_BIN/git" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$TEST_GIT_LOG"
echo "git should not be called during install" >&2
exit 99
EOF
chmod +x "$TMP_BIN/git"

# Run the target directly so the test follows the checked-in shebang instead of
# pinning a separate shell entrypoint here.
"$INSTALL_SCRIPT"

if [ -f "$TEST_GIT_LOG" ]; then
  echo "Install invoked git unexpectedly" >&2
  exit 1
fi

if [ ! -s "$TEST_NPM_LOG" ]; then
  echo "Install did not provision the vendored bridge runtime" >&2
  exit 1
fi

if ! grep -Eq 'install --omit=dev --ignore-scripts' "$TEST_NPM_LOG"; then
  echo "Install did not invoke the expected npm install command" >&2
  exit 1
fi

for required_file in \
  "$HOME/codex-bridge/main.mjs" \
  "$HOME/codex-bridge/package.json" \
  "$HOME/codex-bridge/README.md" \
  "$HOME/codex-bridge/README_zh.md" \
  "$HOME/codex-bridge/.env.example"; do
  if [ ! -f "$required_file" ]; then
    echo "Missing installed file: $required_file" >&2
    exit 1
  fi
done

if [ -d "$HOME/codex-bridge/.git" ]; then
  echo "Installed bridge should not include .git metadata" >&2
  exit 1
fi

if ! grep -Eq 'model_provider = "minimax_bridge"' "$HOME/.codex/agents/minimax-worker.toml"; then
  echo "Agent file was not written correctly" >&2
  exit 1
fi

if ! grep -Eq '\[model_providers\.minimax_bridge\]' "$HOME/.codex/config.toml"; then
  echo "Managed provider block missing from config" >&2
  exit 1
fi

if ! grep -Eq '^ANTHROPIC_AUTH_TOKEN=' "$HOME/codex-bridge/.env"; then
  echo "Bridge env file missing token" >&2
  exit 1
fi
