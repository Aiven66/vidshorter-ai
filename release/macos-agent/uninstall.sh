#!/bin/bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
node "${DIR}/cli.js" uninstall
