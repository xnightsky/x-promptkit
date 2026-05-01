#!/usr/bin/env bash
# PUA Extension 集成测试脚本（消耗真实 AI token）
# Usage: bash ~/.pi/agent/extensions/pua/pua.ittest.sh

set -uo pipefail

EXT="$HOME/.pi/agent/extensions/pua/index.ts"
PUA_DIR="$HOME/.pua"
PI_STATE="$HOME/.pi/agent/pua-state.json"
FAILED=0

info() { echo "[TEST] $1"; }
ok()   { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAILED=$((FAILED+1)); }

cleanup() {
  rm -f "$PUA_DIR/.failure_count" "$PI_STATE"
}

# ── 场景1：基本加载 ──
info "场景1：基本加载"
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "基本加载"
else
  fail "基本加载"
fi

# ── 场景2：always_on 自动激活（行为协议注入） ──
info "场景2：always_on 自动激活"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
# 发送一个正常任务，extension 应加载且不报错
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "always_on 自动激活"
else
  fail "always_on 自动激活 — extension 报错"
fi

# ── 场景3：失败检测与计数 ──
info "场景3：失败检测与计数"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p -e "$EXT" --no-prompt-templates --no-context-files "run bash: ls /nonexistent_dir_12345" >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "1" ]; then
  ok "失败计数 = 1"
else
  fail "失败计数 — 预期 1，实际 $COUNT"
fi

# ── 场景4：压力升级（连续失败） ──
info "场景4：压力升级（连续失败）"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
for i in 1 2 3; do
  pi -p -e "$EXT" --no-prompt-templates --no-context-files "run bash: ls /bad_$i" >/dev/null 2>&1 || true
  sleep 1
done
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "3" ]; then
  ok "连续失败计数 = 3"
else
  fail "连续失败计数 — 预期 3，实际 $COUNT"
fi

# ── 场景5：成功清零 ──
info "场景5：成功清零"
pi -p -e "$EXT" --no-prompt-templates --no-context-files "run bash: echo ok" >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "0" ]; then
  ok "成功清零"
else
  fail "成功清零 — 预期 0，实际 $COUNT"
fi

# ── 场景6：on/off 持久化 ──
info "场景6：on/off 持久化"
pi -p -e "$EXT" --no-prompt-templates --no-context-files "/pua-off" >/dev/null 2>&1 || true
ALWAYS_OFF=$(python3 -c "import json; print(json.load(open('$PUA_DIR/config.json')).get('always_on',''))" 2>/dev/null || echo "")
if [ "$ALWAYS_OFF" = "False" ]; then
  ok "pua-off 写入 config"
else
  fail "pua-off — always_on 预期 False，实际 '$ALWAYS_OFF'"
fi

pi -p -e "$EXT" --no-prompt-templates --no-context-files "/pua-on" >/dev/null 2>&1 || true
ALWAYS_ON=$(python3 -c "import json; print(json.load(open('$PUA_DIR/config.json')).get('always_on',''))" 2>/dev/null || echo "")
if [ "$ALWAYS_ON" = "True" ]; then
  ok "pua-on 写入 config"
else
  fail "pua-on — always_on 预期 True，实际 '$ALWAYS_ON'"
fi

# ── 场景7：味道切换 ──
info "场景7：味道切换"
cleanup
echo '{"always_on": true, "flavor": "huawei"}' > "$PUA_DIR/config.json"
# 验证 config 被正确读取且 extension 正常工作
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo test" >/dev/null 2>&1; then
  ok "味道切换（config 读取正常）"
else
  fail "味道切换"
fi

# ── 场景8：skill 缺失保护 ──
info "场景8：skill 缺失保护"
TMP=$(mktemp)
# --no-skills 时 extension 应自动关闭，下一句话不应有旁白
pi -p -e "$EXT" --no-skills --no-prompt-templates --no-context-files "echo test" > "$TMP" 2>&1 || true
if grep -q '定目标\|闭环\|阿里\|PUA' "$TMP"; then
  fail "skill 缺失保护 — 旁白仍出现（extension 未关闭）"
else
  ok "skill 缺失保护（旁白未出现）"
fi
rm -f "$TMP"

# ── 汇总 ──
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 全部通过"
  exit 0
else
  echo "❌ $FAILED 项失败"
  exit 1
fi
