#!/bin/bash
# 生成 Windows Agent 发布包（不依赖 pnpm）
# 对应 macOS 的 scripts/macos-agent-release.sh
#
# 用法: bash scripts/windows-agent-release.sh [project-root]
set -Eeuo pipefail

ROOT="${1:-$(pwd)}"
OUT_DIR="${ROOT}/release/windows-agent"

cd "${ROOT}"

echo "Building agent (runner.js + cli.js + windows-cli.js)..."
pnpm agent:build

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

cp -f "${ROOT}/dist/agent/cli.js" "${OUT_DIR}/cli.js"
cp -f "${ROOT}/dist/agent/runner.js" "${OUT_DIR}/runner.js"
cp -f "${ROOT}/dist/agent/windows-cli.js" "${OUT_DIR}/windows-cli.js"

# PowerShell 安装脚本
cat > "${OUT_DIR}/install.ps1" <<'PS1'
# Clipop AI Windows Agent - PowerShell 安装脚本
# 用法:
#   $env:VIDSHORTER_SERVER_URL="https://www.clipopai.com"
#   $env:AGENT_SECRET="your-secret"        # 可选
#   $env:VIDSHORTER_AGENT_ID="agent-win-1"  # 可选
#   powershell -ExecutionPolicy Bypass -File install.ps1
param(
    [string]$Server = "",
    [string]$Secret = "",
    [string]$AgentId = ""
)

$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Server) { $env:VIDSHORTER_SERVER_URL = $Server }
if ($Secret) { $env:AGENT_SECRET = $Secret }
if ($AgentId) { $env:VIDSHORTER_AGENT_ID = $AgentId }

if (-not $env:VIDSHORTER_SERVER_URL) {
    Write-Error "Missing VIDSHORTER_SERVER_URL. Set it or pass -Server parameter."
    exit 1
}

$args = @("install", "--server", $env:VIDSHORTER_SERVER_URL)
if ($env:AGENT_SECRET) { $args += @("--secret", $env:AGENT_SECRET) }
if ($env:VIDSHORTER_AGENT_ID) { $args += @("--agentId", $env:VIDSHORTER_AGENT_ID) }

& node "$Dir\windows-cli.js" @args
PS1

# PowerShell 卸载脚本
cat > "${OUT_DIR}/uninstall.ps1" <<'PS1'
# Clipop AI Windows Agent - PowerShell 卸载脚本
$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node "$Dir\windows-cli.js" uninstall
PS1

# 管理脚本（便捷入口）
cat > "${OUT_DIR}/manage.ps1" <<'PS1'
# Clipop AI Windows Agent - 管理脚本
param([Parameter(Position=0)][string]$Action = "status")
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$valid = @("install","uninstall","start","stop","status")
if ($valid -notcontains $Action) {
    Write-Host "Usage: .\manage.ps1 <install|uninstall|start|stop|status>"
    exit 1
}
& node "$Dir\windows-cli.js" $Action
PS1

echo "Release ready: ${OUT_DIR}"
ls -la "${OUT_DIR}/"
