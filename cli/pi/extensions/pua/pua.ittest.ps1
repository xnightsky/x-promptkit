# PUA Extension 集成测试脚本（PowerShell 版本，消耗真实 AI token）
# Usage: . $env:USERPROFILE/.pi/agent/extensions/pua/pua.ittest.ps1
# 或:   powershell -ExecutionPolicy Bypass -File ~/.pi/agent/extensions/pua/pua.ittest.ps1

# 兼容 Windows PowerShell 5.x 与 PowerShell 7.x
$ErrorActionPreference = "Stop"

# ── 路径常量 ──
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$Ext = Join-Path $HomeDir ".pi/agent/extensions/pua/index.ts"
$PuaDir = Join-Path $HomeDir ".pua"
$PiState = Join-Path $HomeDir ".pi/agent/pua-state.json"
$Failed = 0

function Info($msg) { Write-Host "[TEST] $msg" }
function Ok($msg)   { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:Failed++ }

function Cleanup {
    Remove-Item -Path (Join-Path $PuaDir ".failure_count") -ErrorAction SilentlyContinue
    Remove-Item -Path $PiState -ErrorAction SilentlyContinue
}

# ── 前置检查 ──
$PiCmd = Get-Command pi -ErrorAction SilentlyContinue
if (-not $PiCmd) {
    Write-Host "[ERROR] 'pi' 命令未找到，请确保 pi CLI 已安装并加入 PATH" -ForegroundColor Red
    exit 1
}

# ── 场景1：基本加载 ──
Info "场景1：基本加载"
try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "echo hello" 2>$null
    Ok "基本加载"
} catch {
    Fail "基本加载"
}

# ── 场景2：always_on 自动激活 ──
Info "场景2：always_on 自动激活"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "echo hello" 2>$null
    Ok "always_on 自动激活"
} catch {
    Fail "always_on 自动激活 — extension 报错"
}

# ── 场景3：失败检测与计数 ──
Info "场景3：失败检测与计数"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "run bash: ls /nonexistent_dir_12345" 2>$null
} catch { }

$CountFile = Join-Path $PuaDir ".failure_count"
$Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
if ($Count -eq "1") {
    Ok "失败计数 = 1"
} else {
    Fail "失败计数 — 预期 1，实际 $Count"
}

# ── 场景4：压力升级（连续失败） ──
Info "场景4：压力升级（连续失败）"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

foreach ($i in 1..3) {
    try {
        $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "run bash: ls /bad_$i" 2>$null
    } catch { }
    Start-Sleep -Seconds 1
}

$Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
if ($Count -eq "3") {
    Ok "连续失败计数 = 3"
} else {
    Fail "连续失败计数 — 预期 3，实际 $Count"
}

# ── 场景5：成功清零 ──
Info "场景5：成功清零"
try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "run bash: echo ok" 2>$null
} catch { }

$Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
if ($Count -eq "0") {
    Ok "成功清零"
} else {
    Fail "成功清零 — 预期 0，实际 $Count"
}

# ── 场景6：on/off 持久化 ──
Info "场景6：on/off 持久化"
try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "/pua-off" 2>$null
} catch { }

$ConfigPath = Join-Path $PuaDir "config.json"
$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
# JSON true/false 在 PowerShell 反序列化后变为 $true/$false 布尔值
if ($Config.always_on -eq $false) {
    Ok "pua-off 写入 config"
} else {
    Fail "pua-off — always_on 预期 False，实际 '$($Config.always_on)'"
}

try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "/pua-on" 2>$null
} catch { }

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ($Config.always_on -eq $true) {
    Ok "pua-on 写入 config"
} else {
    Fail "pua-on — always_on 预期 True，实际 '$($Config.always_on)'"
}

# ── 场景7：味道切换 ──
Info "场景7：味道切换"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true; flavor = "huawei" } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

try {
    $null = & pi -p -e $Ext --no-prompt-templates --no-context-files "echo test" 2>$null
    Ok "味道切换（config 读取正常）"
} catch {
    Fail "味道切换"
}

# ── 场景8：skill 缺失保护 ──
Info "场景8：skill 缺失保护"
$TmpFile = New-TemporaryFile
try {
    $null = & pi -p -e $Ext --no-skills --no-prompt-templates --no-context-files "echo test" *> $TmpFile.FullName
} catch { }

$Output = Get-Content $TmpFile.FullName -Raw
if ($Output -match '定目标|闭环|阿里|PUA') {
    Fail "skill 缺失保护 — 旁白仍出现（extension 未关闭）"
} else {
    Ok "skill 缺失保护（旁白未出现）"
}
Remove-Item $TmpFile.FullName -ErrorAction SilentlyContinue

# ── 汇总 ──
Write-Host ""
if ($Failed -eq 0) {
    Write-Host "✅ 全部通过" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ $Failed 项失败" -ForegroundColor Red
    exit 1
}
