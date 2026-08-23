#!/usr/bin/env bash
set -euo pipefail
npm run validate:candidate
node tests/product-v2.contract.mjs
npm run validate:smart-import-auth
echo "Product V2 validation passed."
