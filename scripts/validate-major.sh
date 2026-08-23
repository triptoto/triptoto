#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '1/7 Frontend JavaScript'
node --check public/mobile-trip-rules.js
node --check public/mobile-app.js

echo '2/7 TypeScript'
tsc --noEmit

echo '3/7 Scenario suites (compiled; no tsx CLI IPC)'
TMP_DIR="${TMPDIR:-/tmp}/tripto-major-validate-$$"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
mkdir -p "$TMP_DIR"
tsc --noEmit false --outDir "$TMP_DIR" --rewriteRelativeImportExtensions true --allowImportingTsExtensions true
for suite in core beta milestone2 import launch major; do
  node "$TMP_DIR/tests/scenarios/${suite}.scenarios.js"
done

echo '4/7 Existing + major local D1 integration'
TRIPTO_EMIT_DIR="$TMP_DIR" node tests/integration/local-d1.integration.mjs
TRIPTO_EMIT_DIR="$TMP_DIR" node tests/integration/major-d1.integration.mjs
TRIPTO_EMIT_DIR="$TMP_DIR" node tests/integration/major.integration.mjs

echo '5/7 Migrations'
bash scripts/validate-migrations.sh

echo '6/7 Shell scripts'
for script in scripts/*.sh; do bash -n "$script"; done

echo '7/7 Static release files'
test -f public/_headers
test -f public/robots.txt
test -f public/.well-known/security.txt

echo 'Major Beta Milestone 5–8 validation passed.'
