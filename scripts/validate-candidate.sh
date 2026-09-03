#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '1/8 Major baseline'
npm run validate:major

echo '2/8 Candidate scenarios'
TMP_DIR="${TMPDIR:-/tmp}/tripto-candidate-validate-$$"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
mkdir -p "$TMP_DIR"
tsc --noEmit false --outDir "$TMP_DIR" --rewriteRelativeImportExtensions true --allowImportingTsExtensions true
node "$TMP_DIR/tests/scenarios/candidate.scenarios.js"

echo '3/8 Candidate recovery contracts'
grep -q 'integrity === "verified"' public/mobile-app.js
grep -q 'Ready offline appears only after checksum verification succeeds' public/mobile-app.js
grep -q 'role="status"' public/mobile-app.js
grep -q 'Nothing was overwritten' public/mobile-app.js
grep -q 'Review pending changes before removing local data' public/mobile-app.js
grep -q 'Scheduled booking data is never presented as live' public/mobile-app.js
node tests/browser-timezone.contract.mjs

echo '4/8 Mobile application UI contracts'
npm run check:ui
grep -q 'max-width:var(--app-width)' public/mobile-app.css
grep -q 'Show to Driver' public/mobile-app.js
grep -q 'Scheduled booking data is never presented as live' public/mobile-app.js
test ! -f public/legacy.html
test ! -f public/app.css
test ! -f public/app.js
test -f docs/MOBILE_APP_UI_V1.md

echo '5/8 PWA and disabled integrations'
grep -q "tripto-shell-product-v39-timeline-time-size" public/sw.js
grep -q "/icons/tripto-system.svg" public/sw.js
grep -q "/canonical-host.js" public/sw.js
grep -q "/google-auth-client.js" public/sw.js
grep -q "tripto-places-2026-08-26" public/sw.js
grep -q "/places-search-worker.js" public/sw.js
grep -q "/data/places-2026-08-26.json" public/sw.js
grep -q 'ensureAirportTimezones' public/mobile-app.js
grep -q "/vendor/dm-serif-display/dm-serif-display.css" public/sw.js
grep -q "/vendor/dm-serif-display/DMSerifDisplay-Latin.woff2" public/sw.js
grep -q "/vendor/dm-serif-display/DMSerifDisplay-LatinExt.woff2" public/sw.js
grep -q "/assets/google-g.svg" public/sw.js
! grep -q "/legacy.html" public/sw.js
grep -q "key.startsWith('tripto-shell-')" public/sw.js
for flag in LIVE_FLIGHTS_ENABLED AI_ENABLED GMAIL_SYNC_ENABLED R2_DOCUMENTS_ENABLED DEMO_TOOLS_ENABLED OPS_ENABLED; do
  grep -q "\"$flag\": \"false\"" wrangler.jsonc
done
grep -q '"SHARING_ENABLED": "true"' wrangler.jsonc
grep -Eq '"ACCOUNT_AUTH_ENABLED": "(false|true)"' wrangler.jsonc

echo '6/8 Offline places validation'
npm run validate:places

echo '7/8 Manual booking validation'
npm run validate:manual-booking

echo '8/8 Candidate release files'
test -f scripts/smoke-beta-candidate.sh
test -f docs/BETA_CANDIDATE_1.md
test -f docs/DEPLOY_BETA_CANDIDATE_1.md
test -f docs/ROLLBACK_BETA_CANDIDATE_1.md

echo 'Beta Candidate 1 validation with Mobile App UI v1 passed.'
