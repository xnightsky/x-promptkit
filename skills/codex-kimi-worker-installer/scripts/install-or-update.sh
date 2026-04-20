#!/usr/bin/env bash
set -euo pipefail

# codex-kimi-worker-installer :: install-or-update.sh
#
# Idempotently installs / updates the Kimi subagent integration for Codex.
# No local bridge process. Codex talks OpenAI /responses wire directly to Kimi.
#
# Required env:
#   KIMI_API_KEY         Moonshot API key.
#
# Optional env:
#   KIMI_UPSTREAM        coding | general | both   (default: coding)
#   KIMI_MODEL_CODING    model SKU for coding line (default: kimi-k2-thinking)
#   KIMI_MODEL_GENERAL   model SKU for general line (default: kimi-k2-0905)
#   CODEX_DIR            override ~/.codex for testing

: "${KIMI_API_KEY:?KIMI_API_KEY must be set in env. Refusing to continue.}"

KIMI_UPSTREAM="${KIMI_UPSTREAM:-coding}"
KIMI_MODEL_CODING="${KIMI_MODEL_CODING:-kimi-k2-thinking}"
KIMI_MODEL_GENERAL="${KIMI_MODEL_GENERAL:-kimi-k2-0905}"

case "$KIMI_UPSTREAM" in
  coding|general|both) ;;
  *) echo "KIMI_UPSTREAM must be one of: coding | general | both (got: $KIMI_UPSTREAM)" >&2; exit 2 ;;
esac

CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"
CONFIG_FILE="$CODEX_DIR/config.toml"
AGENTS_DIR="$CODEX_DIR/agents"

mkdir -p "$AGENTS_DIR"
touch "$CONFIG_FILE"

BEGIN_MARK='# BEGIN managed-by: codex-kimi'
END_MARK='# END managed-by: codex-kimi'

# --- 1. Rewrite managed block in config.toml (idempotent, in-place) ---

tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp.clean"' EXIT

# Strip any existing managed block.
awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
  $0 == b { skip=1; next }
  $0 == e { skip=0; next }
  skip != 1 { print }
' "$CONFIG_FILE" > "$tmp"

# Collapse trailing blank lines.
sed -e :a -e '/^$/{$d;N;ba' -e '}' "$tmp" > "$tmp.clean"
mv "$tmp.clean" "$tmp"

# Append a fresh managed block.
{
  if [ -s "$tmp" ]; then echo ""; fi
  echo "$BEGIN_MARK"
  echo "# Managed by codex-kimi-worker-installer. Do not edit by hand; re-run install-or-update.sh."
  echo ""
  echo '[model_providers.kimi_coding]'
  echo 'name     = "Kimi (coding preview line)"'
  echo 'base_url = "https://api.kimi.com/coding/v1"'
  echo 'env_key  = "KIMI_API_KEY"'
  echo 'wire_api = "responses"'
  echo ""
  echo '[model_providers.kimi_general]'
  echo 'name     = "Kimi (Moonshot general)"'
  echo 'base_url = "https://api.moonshot.ai/v1"'
  echo 'env_key  = "KIMI_API_KEY"'
  echo 'wire_api = "responses"'
  echo "$END_MARK"
} >> "$tmp"

mv "$tmp" "$CONFIG_FILE"
trap - EXIT

# --- 2. Write agent TOMLs based on KIMI_UPSTREAM ---

write_agent_coding=0
write_agent_general=0
case "$KIMI_UPSTREAM" in
  coding)  write_agent_coding=1 ;;
  general) write_agent_general=1 ;;
  both)    write_agent_coding=1; write_agent_general=1 ;;
esac

if [ "$write_agent_coding" -eq 1 ]; then
  cat > "$AGENTS_DIR/kimi-worker.toml" <<EOF
# Managed by codex-kimi-worker-installer.
[agent]
name           = "kimi_worker"
model_provider = "kimi_coding"
model          = "$KIMI_MODEL_CODING"
description    = "Kimi subagent on Kimi Code line (direct, no bridge)"
EOF
else
  rm -f "$AGENTS_DIR/kimi-worker.toml"
fi

if [ "$write_agent_general" -eq 1 ]; then
  cat > "$AGENTS_DIR/kimi-worker-general.toml" <<EOF
# Managed by codex-kimi-worker-installer.
[agent]
name           = "kimi_worker_general"
model_provider = "kimi_general"
model          = "$KIMI_MODEL_GENERAL"
description    = "Kimi subagent on Moonshot general line (direct, no bridge)"
EOF
else
  rm -f "$AGENTS_DIR/kimi-worker-general.toml"
fi

# --- 3. Soft liveness probe (non-blocking) ---

probe_url() {
  local url="$1"
  if curl -sfS --max-time 5 -H "Authorization: Bearer $KIMI_API_KEY" "$url" >/dev/null 2>&1; then
    echo "  ok   $url"
  else
    echo "  WARN unreachable: $url (install still completed; check network/key later)"
  fi
}

if command -v curl >/dev/null 2>&1; then
  echo "Probing upstream endpoints (non-blocking):"
  [ "$write_agent_coding"  -eq 1 ] && probe_url "https://api.kimi.com/coding/v1/models"
  [ "$write_agent_general" -eq 1 ] && probe_url "https://api.moonshot.ai/v1/models"
fi

# --- 4. Done ---

echo ""
echo "codex-kimi installed / updated."
echo "  Config : $CONFIG_FILE (managed block refreshed)"
[ "$write_agent_coding"  -eq 1 ] && echo "  Agent  : $AGENTS_DIR/kimi-worker.toml          -> model=$KIMI_MODEL_CODING"
[ "$write_agent_general" -eq 1 ] && echo "  Agent  : $AGENTS_DIR/kimi-worker-general.toml  -> model=$KIMI_MODEL_GENERAL"
echo ""
echo "Try it:"
[ "$write_agent_coding"  -eq 1 ] && echo "  codex --agent kimi_worker \"...\""
[ "$write_agent_general" -eq 1 ] && echo "  codex --agent kimi_worker_general \"...\""
