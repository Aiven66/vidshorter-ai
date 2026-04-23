#!/bin/bash
set -Eeuo pipefail

BRANCH="${1:-main}"
MSG="${2:-chore: release}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR/cf-worker"
npx -y wrangler deploy

cd "$ROOT_DIR"
SKIP_CHECKS="${SKIP_CHECKS:-1}" ./scripts/release.sh "$BRANCH" "$MSG"
