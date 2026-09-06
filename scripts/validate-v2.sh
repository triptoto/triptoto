#!/usr/bin/env bash
set -euo pipefail
npm run validate:candidate
npm run validate:live-flights
node tests/product-v2.contract.mjs
npm run validate:smart-import-auth
node tests/collaboration.contract.mjs
node tests/collections.contract.mjs
node tests/loading-pattern.contract.mjs
node tests/render-performance.contract.mjs
node tests/booking-notes.contract.mjs
node tests/app-viewport.contract.mjs
echo "Product V2 validation passed."
