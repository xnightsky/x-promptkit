#!/usr/bin/env bash
set -euo pipefail

# codex-kimi-worker-installer :: install-or-update.sh
#
# Three-dimension action model, dispatched by KIMI_ACTION:
#   A. model_providers   ->  ~/.codex/config.toml managed block
#                            (kimi_coding / kimi_general, conditional on KIMI_UPSTREAM)
#   B. default agents    ->  ~/.codex/agents/kimi-worker.toml
#                            ~/.codex/agents/kimi-worker-general.toml
#   C. custom kimi_worker->  ~/.codex/agents/<name>.toml + manifest
#
# KIMI_ACTION values:
#   default              => A + B  (default)
#   providers-only       => A
#   default-agents-only  => B (requires A already installed)
#   custom-worker        => C (requires A already installed)
#   uninstall            => forward to uninstall.sh
#
# Invocation model (important):
#   Codex CLI has NO --agent / --agents flag. Custom subagents are invoked by
#   referring to them BY NAME in a Codex prompt. See SKILL.md and
#   https://developers.openai.com/codex/subagents for the full model.
#
# See SKILL.md and references/codex-kimi-subagent-manual.md for the full
# interaction contract and key-wiring architecture.

KIMI_ACTION="${KIMI_ACTION:-default}"
CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"
CONFIG_FILE="$CODEX_DIR/config.toml"
AGENTS_DIR="$CODEX_DIR/agents"
META_DIR="$CODEX_DIR/.codex-kimi"
WORKERS_MANIFEST="$META_DIR/workers.json"

BEGIN_MARK='# BEGIN managed-by: codex-kimi'
END_MARK='# END managed-by: codex-kimi'

KIMI_CUSTOM_INSTALLED_NAME=""
KIMI_CUSTOM_INSTALLED_PROVIDER=""
KIMI_CUSTOM_INSTALLED_MODEL=""

# ------------------------------------------------------------------ helpers

die() { echo "ERROR: $*" >&2; exit "${2:-1}"; }
note() { printf '%s\n' "$*"; }

managed_block_has_provider() {
  # Return 0 if managed block in CONFIG_FILE contains [model_providers.<name>].
  local provider="$1"
  [ -f "$CONFIG_FILE" ] || return 1
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" -v p="[model_providers.$provider]" '
    $0 == b { inblock=1; next }
    $0 == e { inblock=0; next }
    inblock==1 && $0 == p { found=1 }
    END { exit(found ? 0 : 1) }
  ' "$CONFIG_FILE"
}

# ------------------------------------------------------------------ Dimension A

run_dimension_a() {
  : "${KIMI_API_KEY:?KIMI_API_KEY must be set in env for Dimension A. Refusing to continue.}"

  local upstream="${KIMI_UPSTREAM:-coding}"
  case "$upstream" in
    coding|general|both) ;;
    *) die "KIMI_UPSTREAM must be one of: coding | general | both (got: $upstream)" 2 ;;
  esac

  mkdir -p "$AGENTS_DIR"
  touch "$CONFIG_FILE"

  local tmp tmp_clean
  tmp="$(mktemp)"
  tmp_clean="$(mktemp)"
  trap 'rm -f "$tmp" "$tmp_clean"' RETURN

  # Strip existing managed block.
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    $0 == b { skip=1; next }
    $0 == e { skip=0; next }
    skip != 1 { print }
  ' "$CONFIG_FILE" > "$tmp"

  # Collapse trailing blank lines.
  sed -e :a -e '/^$/{$d;N;ba' -e '}' "$tmp" > "$tmp_clean"

  {
    if [ -s "$tmp_clean" ]; then echo ""; fi
    echo "$BEGIN_MARK"
    echo "# Managed by codex-kimi-worker-installer. Do not edit by hand; re-run install-or-update.sh."
    echo "# Upstream selection: KIMI_UPSTREAM=$upstream"
    echo ""
    if [ "$upstream" = "coding" ] || [ "$upstream" = "both" ]; then
      echo '[model_providers.kimi_coding]'
      echo 'name     = "Kimi (coding preview line)"'
      echo 'base_url = "https://api.kimi.com/coding/v1"'
      echo 'env_key  = "KIMI_API_KEY"'
      echo 'wire_api = "responses"'
      echo ""
    fi
    if [ "$upstream" = "general" ] || [ "$upstream" = "both" ]; then
      echo '[model_providers.kimi_general]'
      echo 'name     = "Kimi (Moonshot general)"'
      echo 'base_url = "https://api.moonshot.ai/v1"'
      echo 'env_key  = "KIMI_API_KEY"'
      echo 'wire_api = "responses"'
      echo ""
    fi
    echo "$END_MARK"
  } >> "$tmp_clean"

  mv "$tmp_clean" "$CONFIG_FILE"
  rm -f "$tmp"
  trap - RETURN

  note "  [A] providers refreshed in $CONFIG_FILE (upstream: $upstream)"
}

# ------------------------------------------------------------------ Dimension B

run_dimension_b() {
  local upstream="${KIMI_UPSTREAM:-coding}"
  local model_coding="${KIMI_MODEL_CODING:-kimi-k2.6}"
  local model_general="${KIMI_MODEL_GENERAL:-kimi-k2.6}"

  local write_agent_coding=0 write_agent_general=0
  case "$upstream" in
    coding)  write_agent_coding=1 ;;
    general) write_agent_general=1 ;;
    both)    write_agent_coding=1; write_agent_general=1 ;;
    *)       die "KIMI_UPSTREAM must be one of: coding | general | both (got: $upstream)" 2 ;;
  esac

  # Precondition: if Dimension B runs WITHOUT A, target provider must already exist.
  if [ "$KIMI_ACTION" = "default-agents-only" ]; then
    if [ "$write_agent_coding" -eq 1 ] && ! managed_block_has_provider "kimi_coding"; then
      die "Dimension B requires kimi_coding provider. Run KIMI_ACTION=providers-only KIMI_UPSTREAM=coding (or both) first." 3
    fi
    if [ "$write_agent_general" -eq 1 ] && ! managed_block_has_provider "kimi_general"; then
      die "Dimension B requires kimi_general provider. Run KIMI_ACTION=providers-only KIMI_UPSTREAM=general (or both) first." 3
    fi
  fi

  mkdir -p "$AGENTS_DIR"

  if [ "$write_agent_coding" -eq 1 ]; then
    cat > "$AGENTS_DIR/kimi-worker.toml" <<EOF
# Managed by codex-kimi-worker-installer.
name = "kimi_worker"
model_provider = "kimi_coding"
model = "$model_coding"
description = "Kimi subagent on Kimi Code line (direct, no bridge)"
developer_instructions = """
You are a focused implementation subagent running on Kimi.
Prefer concrete code changes, concise reasoning, and explicit failure reporting.
Keep unrelated files untouched and do not revert edits made by others.
When the task involves this repository, follow the active AGENTS.md instructions from the caller.
"""
EOF
    note "  [B] wrote $AGENTS_DIR/kimi-worker.toml (model=$model_coding)"
  else
    if [ -f "$AGENTS_DIR/kimi-worker.toml" ]; then
      rm -f "$AGENTS_DIR/kimi-worker.toml"
      note "  [B] removed $AGENTS_DIR/kimi-worker.toml (not in upstream selection)"
    fi
  fi

  if [ "$write_agent_general" -eq 1 ]; then
    cat > "$AGENTS_DIR/kimi-worker-general.toml" <<EOF
# Managed by codex-kimi-worker-installer.
name = "kimi_worker_general"
model_provider = "kimi_general"
model = "$model_general"
description = "Kimi subagent on Moonshot general line (direct, no bridge)"
developer_instructions = """
You are a general-purpose Kimi subagent.
Prefer clear reasoning and concise answers. You may be used for non-coding tasks
such as summarization, planning, or general conversation. When asked to modify code,
delegate to the caller instead of editing files directly.
"""
EOF
    note "  [B] wrote $AGENTS_DIR/kimi-worker-general.toml (model=$model_general)"
  else
    if [ -f "$AGENTS_DIR/kimi-worker-general.toml" ]; then
      rm -f "$AGENTS_DIR/kimi-worker-general.toml"
      note "  [B] removed $AGENTS_DIR/kimi-worker-general.toml (not in upstream selection)"
    fi
  fi
}

# ------------------------------------------------------------------ Dimension C

valid_worker_name() {
  local name="$1"
  [ -n "$name" ] || return 1
  case "$name" in
    kimi_worker|kimi_worker_general) return 1 ;;
    *..*|*/*) return 1 ;;
  esac
  local len=${#name}
  [ "$len" -ge 3 ] && [ "$len" -le 32 ] || return 1
  if printf '%s' "$name" | grep -Eq '^[a-z][a-z0-9_]+$'; then
    return 0
  fi
  return 1
}

upsert_worker_manifest() {
  local name="$1" provider="$2" model="$3"
  mkdir -p "$META_DIR"
  local created_at
  created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  if command -v python3 >/dev/null 2>&1; then
    WORKERS_MANIFEST="$WORKERS_MANIFEST" \
    _N="$name" _P="$provider" _M="$model" _T="$created_at" \
    python3 - <<'PY'
import json, os
path = os.environ["WORKERS_MANIFEST"]
entry = {
    "name": os.environ["_N"],
    "provider": os.environ["_P"],
    "model": os.environ["_M"],
    "created_at": os.environ["_T"],
}
data = {"version": 1, "workers": []}
try:
    with open(path) as f:
        data = json.load(f)
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("workers"), list):
        data = {"version": 1, "workers": []}
except FileNotFoundError:
    pass
except Exception:
    data = {"version": 1, "workers": []}
workers = [w for w in data["workers"] if isinstance(w, dict) and w.get("name") != entry["name"]]
workers.append(entry)
data["workers"] = workers
with open(path, "w") as f:
    json.dump(data, f, indent=2, sort_keys=False)
    f.write("\n")
PY
  else
    # Fallback: overwrite with a single entry (no merge possible without JSON).
    cat > "$WORKERS_MANIFEST" <<EOF
{
  "version": 1,
  "workers": [
    { "name": "$name", "provider": "$provider", "model": "$model", "created_at": "$created_at" }
  ]
}
EOF
    note "  [C] python3 not found; manifest overwritten with single entry (install python3 to preserve history)"
  fi
}

run_dimension_c() {
  local name="${KIMI_WORKER_NAME:-}"
  local provider="${KIMI_WORKER_PROVIDER:-}"
  local model="${KIMI_WORKER_MODEL:-kimi-k2.6}"
  local description="${KIMI_WORKER_DESCRIPTION:-Custom Kimi subagent (direct, no bridge)}"
  local instructions_file="${KIMI_WORKER_INSTRUCTIONS_FILE:-}"

  [ -n "$name" ] || die "KIMI_WORKER_NAME is required for custom-worker" 2
  if ! valid_worker_name "$name"; then
    die "KIMI_WORKER_NAME must match ^[a-z][a-z0-9_]{2,31}\$ and not collide with kimi_worker / kimi_worker_general (got: $name)" 2
  fi
  case "$provider" in
    kimi_coding|kimi_general) ;;
    *) die "KIMI_WORKER_PROVIDER must be one of: kimi_coding | kimi_general (got: ${provider:-<unset>})" 2 ;;
  esac

  if ! managed_block_has_provider "$provider"; then
    die "Provider $provider is not installed. Run KIMI_ACTION=providers-only KIMI_UPSTREAM=... ./scripts/install-or-update.sh first." 3
  fi

  mkdir -p "$AGENTS_DIR" "$META_DIR"

  local instructions
  if [ -n "$instructions_file" ]; then
    [ -f "$instructions_file" ] || die "KIMI_WORKER_INSTRUCTIONS_FILE does not exist: $instructions_file" 2
    instructions="$(cat "$instructions_file")"
  else
    instructions="You are a specialized Kimi subagent named $name.
Follow the caller's instructions. Prefer concise reasoning and explicit failure reporting.
When asked to modify this repository, follow the active AGENTS.md instructions from the caller."
  fi

  local agent_file="$AGENTS_DIR/${name}.toml"
  {
    echo "# Managed by codex-kimi-worker-installer (custom)."
    echo "name = \"$name\""
    echo "model_provider = \"$provider\""
    echo "model = \"$model\""
    echo "description = \"$description\""
    echo 'developer_instructions = """'
    printf '%s\n' "$instructions"
    echo '"""'
  } > "$agent_file"

  upsert_worker_manifest "$name" "$provider" "$model"

  note "  [C] wrote $agent_file"
  note "  [C] manifest updated: $WORKERS_MANIFEST"

  KIMI_CUSTOM_INSTALLED_NAME="$name"
  KIMI_CUSTOM_INSTALLED_PROVIDER="$provider"
  KIMI_CUSTOM_INSTALLED_MODEL="$model"
}

# ------------------------------------------------------------------ direnv hint

check_direnv_and_hint() {
  if command -v direnv >/dev/null 2>&1; then
    local ver
    ver="$(direnv version 2>/dev/null || echo 'unknown')"
    printf '\n✓ direnv detected (%s) — recommended for KIMI_API_KEY.\n' "$ver"
    printf '  See references/codex-kimi-subagent-manual.md §6 for .envrc usage.\n'
    return 0
  fi

  printf '\n⚠ direnv not found. KIMI_API_KEY must be exported some other way before running Codex.\n'
  printf '  Recommended: install direnv (per-project env isolation, signed allow-list).\n\n'

  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_s" in
    Darwin)
      printf '  macOS (Homebrew):   brew install direnv\n'
      printf '  macOS (MacPorts):   sudo port install direnv\n'
      ;;
    Linux)
      printf '  Debian/Ubuntu:      sudo apt-get install direnv\n'
      printf '  Fedora:             sudo dnf install direnv\n'
      printf '  Arch:               sudo pacman -S direnv\n'
      printf '  NixOS:              nix profile install nixpkgs#direnv\n'
      ;;
    MINGW*|MSYS*|CYGWIN*)
      printf '  Git Bash / MSYS2:   pacman -S direnv (MSYS2) or scoop install direnv\n'
      ;;
    *)
      printf '  See https://direnv.net/docs/installation.html\n'
      ;;
  esac

  printf '\n  After installing, add this to your shell rc (one-time):\n'
  printf '    # ~/.zshrc                eval "$(direnv hook zsh)"\n'
  printf '    # ~/.bashrc               eval "$(direnv hook bash)"\n'
  printf '    # ~/.config/fish/config.fish   direnv hook fish | source\n'

  printf '\n  Then in your project:\n'
  printf '    echo export KIMI_API_KEY=\"sk-...\" > .envrc && direnv allow\n\n'

  printf '  Alternatives if you do not want to install direnv:\n'
  printf '    - Export in ~/.zshenv / ~/.profile (persists across sessions)\n'
  printf '    - Use 1Password CLI: export KIMI_API_KEY="$(op read op://Private/Kimi/credential)"\n'
  printf '    - Windows: setx KIMI_API_KEY "sk-..." (new shells only)\n'

  printf '\n  NOTE: Codex GUI (macOS .app / Windows .exe / IDE extensions) does NOT source your shell;\n'
  printf '        direnv will not take effect there. Launch codex from a direnv-allowed terminal,\n'
  printf '        or use launchctl setenv / setx as a global fallback.\n'
  return 0
}

# ------------------------------------------------------------------ try-it
#
# Codex CLI has no --agent flag. Custom subagents are invoked by referring to
# them BY NAME in a prompt. See SKILL.md § 'Invoking the generated agents'.

print_try_it() {
  local upstream="${KIMI_UPSTREAM:-coding}"
  echo ""
  echo "codex-kimi installed / updated."
  case "$KIMI_ACTION" in
    default|providers-only|default-agents-only)
      echo "  Action  : $KIMI_ACTION"
      echo "  Upstream: $upstream"
      ;;
    custom-worker)
      echo "  Action  : custom-worker"
      ;;
  esac
  echo "  Config  : $CONFIG_FILE"
  echo ""

  if [ "$KIMI_ACTION" = "custom-worker" ]; then
    echo "Custom worker installed: ${KIMI_CUSTOM_INSTALLED_NAME} -> ${KIMI_CUSTOM_INSTALLED_PROVIDER} (${KIMI_CUSTOM_INSTALLED_MODEL})"
    echo "Try it (refer to the agent BY NAME inside a Codex prompt):"
    echo "  codex exec \"Spawn ${KIMI_CUSTOM_INSTALLED_NAME} to <task>...\""
    echo "  # or in interactive TUI:"
    echo "  codex"
    echo "  # then at the TUI prompt:"
    echo "  #   > Have ${KIMI_CUSTOM_INSTALLED_NAME} do <task>."
    echo "  #   Use /agent to switch between active agent threads."
    _print_invocation_note
    return
  fi

  echo "Try it (refer to the agent BY NAME inside a Codex prompt):"
  case "$upstream" in
    coding)
      echo "  Upstream mode: coding (single worker: kimi_worker)"
      echo "  codex exec \"Have kimi_worker do <task>...\""
      ;;
    general)
      echo "  Upstream mode: general (single worker: kimi_worker_general)"
      echo "  codex exec \"Have kimi_worker_general do <task>...\""
      ;;
    both)
      echo "  Upstream mode: both (workers: kimi_worker, kimi_worker_general)"
      echo "  codex exec \"Have kimi_worker implement <task> and ask kimi_worker_general to review it.\""
      echo ""
      echo "Maintaining multiple workers (KIMI_UPSTREAM=both):"
      echo "  - Prompt-level selection: mention kimi_worker or kimi_worker_general by name"
      echo "  - Project-scoped provider: add model_provider=kimi_coding|kimi_general in .codex/config.toml"
      echo "  - Inside TUI: use /agent to switch between running agent threads"
      echo "  - Fold back to single: re-run with KIMI_UPSTREAM=coding (or general)"
      ;;
  esac
  _print_invocation_note
}

_print_invocation_note() {
  echo ""
  echo "Note: Codex CLI has no --agent / --agents flag (see openai/codex#10067)."
  echo "      If an outer host reports 'agent type is currently not available'"
  echo "      even after install, see SKILL.md § Troubleshooting."
}

# ------------------------------------------------------------------ dispatch

case "$KIMI_ACTION" in
  default)
    note "codex-kimi :: action=default (providers + default agents)"
    run_dimension_a
    run_dimension_b
    print_try_it
    check_direnv_and_hint
    ;;
  providers-only)
    note "codex-kimi :: action=providers-only (Dimension A)"
    run_dimension_a
    print_try_it
    check_direnv_and_hint
    ;;
  default-agents-only)
    note "codex-kimi :: action=default-agents-only (Dimension B)"
    run_dimension_b
    print_try_it
    check_direnv_and_hint
    ;;
  custom-worker)
    note "codex-kimi :: action=custom-worker (Dimension C)"
    run_dimension_c
    print_try_it
    check_direnv_and_hint
    ;;
  uninstall)
    note "codex-kimi :: action=uninstall (forwarding to uninstall.sh)"
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    exec "$script_dir/uninstall.sh"
    ;;
  *)
    die "Unknown KIMI_ACTION: $KIMI_ACTION (must be one of: default, providers-only, default-agents-only, custom-worker, uninstall)" 2
    ;;
esac
