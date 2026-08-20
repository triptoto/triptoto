#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TMP_DIR="${TMPDIR:-/tmp}/tripto-integration-emit-$$"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
mkdir -p "$TMP_DIR"
tsc --noEmit false --outDir "$TMP_DIR" --rewriteRelativeImportExtensions true --allowImportingTsExtensions true
TRIPTO_EMIT_DIR="$TMP_DIR" node tests/integration/local-d1.integration.mjs
