#!/usr/bin/env bash
set -euo pipefail

# codex-kimi-worker-installer :: uninstall.sh
#
# Removes the managed Kimi provider/agent installation from ~/.codex.
#
# Environment:
#   KIMI_UNINSTALL_SCOPE  (optional)
#     - unset / "all" (default) : remove everything managed by this skill
#     - "custom-only"           : remove only Dimension C (custom workers +
#                                 manifest). Preserve Dimension A/B.
#
# Does NOT delete the skill directory itself.
# Does NOT clear KIMI_API_KEY (direnv / shell rc / OS env is the user's responsibility).
# Does NOT touch any .envrc or shell rc file.
# Does NOT touch anything owned by codex-bridge-minimax-worker-installer.

CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"
CONFIG_FILE="$CODEX_DIR/config.toml"
AGENTS_DIR="$CODEX_DIR/agents"
META_DIR="$CODEX_DIR/.codex-kimi"
WORKERS_MANIFEST="$META_DIR/workers.json"

SCOPE="${KIMI_UNINSTALL_SCOPE:-all}"
case "$SCOPE" in
  all|custom-only) ;;
  *) echo "KIMI_UNINSTALL_SCOPE must be 'all' or 'custom-only' (got: $SCOPE)" >&2; exit 2 ;;
esac

BEGIN_MARK='# BEGIN managed-by: codex-kimi'
END_MARK='# END managed-by: codex-kimi'

remove_custom_workers() {
  if [ ! -f "$WORKERS_MANIFEST" ]; then
    echo "No workers manifest at $WORKERS_MANIFEST (no custom workers to remove)."
    return 0
  fi

  local names=""
  if command -v python3 >/dev/null 2>&1; then
    names="$(WORKERS_MANIFEST="$WORKERS_MANIFEST" python3 - <<'PY'
import json, os, sys
try:
    with open(os.environ["WORKERS_MANIFEST"]) as f:
        data = json.load(f)
    for w in data.get("workers", []):
        name = w.get("name") if isinstance(w, dict) else None
        if isinstance(name, str) and name:
            print(name)
except Exception as e:
    sys.stderr.write("WARN: failed to parse manifest: %s\n" % e)
PY
)"
  else
    # Best-effort grep fallback for environments without python3.
    names="$(grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' "$WORKERS_MANIFEST" | sed -E 's/.*"([^"]+)"$/\1/' || true)"
  fi

  if [ -z "$names" ]; then
    echo "Manifest contained no custom worker names."
  else
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      local f="$AGENTS_DIR/${n}.toml"
      if [ -f "$f" ]; then
        rm -f "$f"
        echo "Removed custom agent: $f"
      fi
    done <<EOF
$names
EOF
  fi

  rm -f "$WORKERS_MANIFEST"
  echo "Removed manifest: $WORKERS_MANIFEST"

  if [ -d "$META_DIR" ] && [ -z "$(ls -A "$META_DIR" 2>/dev/null || true)" ]; then
    rmdir "$META_DIR"
    echo "Removed empty directory: $META_DIR"
  fi
}

remove_managed_block_and_defaults() {
  if [ -f "$CONFIG_FILE" ]; then
    local tmp tmp_clean
    tmp="$(mktemp)"
    tmp_clean="$(mktemp)"
    awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
      $0 == b { skip=1; next }
      $0 == e { skip=0; next }
      skip != 1 { print }
    ' "$CONFIG_FILE" > "$tmp"
    sed -e :a -e '/^$/{$d;N;ba' -e '}' "$tmp" > "$tmp_clean"
    mv "$tmp_clean" "$CONFIG_FILE"
    rm -f "$tmp"
    echo "Removed managed block from $CONFIG_FILE"
  else
    echo "No $CONFIG_FILE found, nothing to clean in config."
  fi

  for f in "$AGENTS_DIR/kimi-worker.toml" "$AGENTS_DIR/kimi-worker-general.toml"; do
    if [ -f "$f" ]; then
      rm -f "$f"
      echo "Removed default agent: $f"
    fi
  done
}

echo "codex-kimi :: uninstall (scope=$SCOPE)"

if [ "$SCOPE" = "custom-only" ]; then
  remove_custom_workers
else
  remove_custom_workers
  remove_managed_block_and_defaults
fi

echo ""
echo "codex-kimi uninstalled (scope=$SCOPE)."
echo "Note: KIMI_API_KEY env var is NOT cleared (direnv / shell rc / OS env is your responsibility)."
echo "Note: No .envrc / .zshenv / .bashrc was touched."
echo "Note: codex-bridge-minimax-worker installation is NOT affected."
