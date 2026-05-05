#!/bin/bash
set -Eeuo pipefail

ROOT="${1:-$(pwd)}"
OUT_DIR="${ROOT}/release/macos-agent"

cd "${ROOT}"

pnpm agent:build

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

cp -f "${ROOT}/dist/agent/cli.js" "${OUT_DIR}/cli.js"
cp -f "${ROOT}/dist/agent/runner.js" "${OUT_DIR}/runner.js"

cat > "${OUT_DIR}/install.sh" <<'SH'
#!/bin/bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="${VIDSHORTER_SERVER_URL:-}"
SECRET="${AGENT_SECRET:-}"
AGENT_ID="${VIDSHORTER_AGENT_ID:-}"

if [[ -z "${SERVER}" ]]; then
  echo "Missing VIDSHORTER_SERVER_URL"
  exit 1
fi

ARGS=(install --server "${SERVER}")
if [[ -n "${SECRET}" ]]; then ARGS+=(--secret "${SECRET}"); fi
if [[ -n "${AGENT_ID}" ]]; then ARGS+=(--agentId "${AGENT_ID}"); fi

node "${DIR}/cli.js" "${ARGS[@]}"
SH

cat > "${OUT_DIR}/uninstall.sh" <<'SH'
#!/bin/bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
node "${DIR}/cli.js" uninstall
SH

chmod +x "${OUT_DIR}/install.sh" "${OUT_DIR}/uninstall.sh"

echo "Release ready: ${OUT_DIR}"

