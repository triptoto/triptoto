#!/usr/bin/env bash
set -euo pipefail
npm run validate:candidate
npm run validate:live-flights
node tests/product-v2.contract.mjs
npm run validate:smart-import-auth
node tests/collaboration.contract.mjs
echo "Product V2 validation passed."
