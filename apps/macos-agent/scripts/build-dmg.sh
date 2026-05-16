#!/bin/bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm prepare:runner

rm -rf dist/mac dist/mac-arm64 dist/mac-x64
rm -rf dist/*.app dist/OPEN_THIS_*.app dist/ONLY-OPEN-THIS-*

ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_MIRROR

PYTHON_SHIM_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$PYTHON_SHIM_DIR" || true
}
trap cleanup EXIT
cat >"$PYTHON_SHIM_DIR/python" <<'EOF'
#!/bin/sh
exec /usr/bin/python3 "$@"
EOF
chmod +x "$PYTHON_SHIM_DIR/python"
export PATH="$PYTHON_SHIM_DIR:$PATH"

pnpm electron-builder --mac dmg

ARCH="$(uname -m)"
VERSION="$(node -p "require('./package.json').version")"
DMG_PATH="dist/VidShorter-Agent-${VERSION}-${ARCH}.dmg"
if [[ -f "$DMG_PATH" ]]; then
  echo "$DMG_PATH"
  exit 0
fi

FOUND="$(find dist -maxdepth 1 -name "VidShorter-Agent-${VERSION}-*.dmg" -print -quit)"
if [[ -n "$FOUND" ]]; then
  echo "$FOUND"
  exit 0
fi

echo "Missing dmg in dist/"
exit 1
