#!/usr/bin/env bash
set -euo pipefail

# codex-kimi-worker-installer :: uninstall.sh
#
# Removes the managed Kimi provider/agent installation from ~/.codex.
# Does NOT delete the skill itself. Does NOT touch KIMI_API_KEY.
# Does NOT touch anything owned by codex-bridge-minimax-worker-installer.

CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"
CONFIG_FILE="$CODEX_DIR/config.toml"
AGENTS_DIR="$CODEX_DIR/agents"

BEGIN_MARK='# BEGIN managed-by: codex-kimi'
END_MARK='# END managed-by: codex-kimi'

if [ -f "$CONFIG_FILE" ]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp" "$tmp.clean"' EXIT
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    $0 == b { skip=1; next }
    $0 == e { skip=0; next }
    skip != 1 { print }
  ' "$CONFIG_FILE" > "$tmp"
  sed -e :a -e '/^$/{$d;N;ba' -e '}' "$tmp" > "$tmp.clean"
  mv "$tmp.clean" "$CONFIG_FILE"
  trap - EXIT
  rm -f "$tmp"
  echo "Removed managed block from $CONFIG_FILE"
else
  echo "No $CONFIG_FILE found, nothing to clean in config."
fi

for f in "$AGENTS_DIR/kimi-worker.toml" "$AGENTS_DIR/kimi-worker-general.toml"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "Removed $f"
  fi
done

echo ""
echo "codex-kimi uninstalled."
echo "Note: KIMI_API_KEY env var is NOT cleared (that's your shell's rc file's responsibility)."
echo "Note: codex-bridge-minimax-worker installation is NOT affected."
