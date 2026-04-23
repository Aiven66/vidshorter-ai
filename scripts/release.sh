#!/bin/bash
set -Eeuo pipefail

BRANCH="${1:-main}"
MSG="${2:-chore: release}"

cd "$(dirname "$0")/.."

git checkout "$BRANCH"
git pull --rebase --autostash origin "$BRANCH"

if [[ "${SKIP_CHECKS:-0}" != "1" ]]; then
  pnpm -s lint
  pnpm -s ts-check
fi

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$MSG"
git push origin "$BRANCH"
