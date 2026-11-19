#!/usr/bin/env bash
# Gera o .zip para upload no Chrome Web Store Developer Dashboard.
set -euo pipefail
cd "$(dirname "$0")"
version=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
out="dist/olx-chat-inline-${version}.zip"
mkdir -p dist
rm -f "$out"
zip -r -q "$out" manifest.json icons rules src -x '*.DS_Store'
echo "$out"
unzip -l "$out"
