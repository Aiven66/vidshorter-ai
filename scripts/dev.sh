#!/bin/bash
set -Eeuo pipefail


PORT="${PORT:-5100}"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


cd "${COZE_WORKSPACE_PATH}"

LOCK_FILE="${COZE_WORKSPACE_PATH}/.next/dev/lock"
if [[ -f "${LOCK_FILE}" ]] && command -v lsof >/dev/null 2>&1; then
  lock_pids=$(lsof -ti "${LOCK_FILE}" 2>/dev/null | paste -sd' ' - || true)
  if [[ -z "${lock_pids}" ]]; then
    lock_pids=$(lsof -t +D "${COZE_WORKSPACE_PATH}/.next/dev" 2>/dev/null | sort -u | paste -sd' ' - || true)
  fi
  if [[ -n "${lock_pids}" ]]; then
    echo "Next dev lock in use by PIDs: ${lock_pids} (SIGKILL)"
    echo "${lock_pids}" | xargs -n 1 kill -9
  fi
fi

is_port_listening() {
    local p="${1}"
    if command -v lsof >/dev/null 2>&1; then
      lsof -tiTCP:"${p}" -sTCP:LISTEN >/dev/null 2>&1
      return $?
    fi
    ss -H -lnt 2>/dev/null | awk -v port="${p}" '$4 ~ ":"port"$"' | grep -q .
}

while is_port_listening "${DEPLOY_RUN_PORT}"; do
  DEPLOY_RUN_PORT=$((DEPLOY_RUN_PORT + 1))
done
echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for dev..."

PORT=${DEPLOY_RUN_PORT} pnpm tsx watch src/server.ts
