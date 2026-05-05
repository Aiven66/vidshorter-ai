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
