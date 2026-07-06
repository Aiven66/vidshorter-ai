#!/bin/bash
# 构建 Android APK
# 用法: bash scripts/android-build.sh [debug|release]
set -Eeuo pipefail

cd "$(dirname "$0")/.."
cd android

BUILD_TYPE="${1:-debug}"

# 确保 Gradle wrapper 可执行
chmod +x ./gradlew 2>/dev/null || true

if [ ! -f "./gradlew" ]; then
  echo "Generating Gradle wrapper..."
  if command -v gradle &>/dev/null; then
    gradle wrapper --gradle-version 8.11.1
  else
    echo "Error: gradle not installed. Install Gradle 8.11+ or run 'gradle wrapper' first."
    exit 1
  fi
fi

echo "Building ${BUILD_TYPE} APK..."
./gradlew assemble${BUILD_TYPE^} --no-daemon

APK_DIR="app/build/outputs/apk/${BUILD_TYPE}"
echo ""
echo "============================================"
echo "Build complete!"
echo "APK location: ${APK_DIR}/"
ls -la "${APK_DIR}"/ 2>/dev/null || echo "(check app/build/outputs/apk/)"
echo "============================================"
