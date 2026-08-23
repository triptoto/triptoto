#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '1/5 Build and typecheck'
npm run build:smart-import
npm run typecheck
echo '2/5 Smart Import deterministic scenarios'
node --import tsx/esm tests/scenarios/smart-import.scenarios.ts
node --import tsx/esm tests/smart-import-fixtures.mjs
echo '3/5 Google token verification scenarios'
node --import tsx/esm tests/scenarios/google-auth.scenarios.ts
echo '4/5 Browser and security contracts'
node tests/smart-import-auth.contract.mjs
echo '5/5 Local D1 integration'
npm run test:integration
echo 'Smart Import + Google Sign-In validation passed.'
