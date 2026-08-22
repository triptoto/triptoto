#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '1/6 Major baseline'
npm run validate:major

echo '2/6 Candidate scenarios'
TMP_DIR="${TMPDIR:-/tmp}/tripto-candidate-validate-$$"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
mkdir -p "$TMP_DIR"
tsc --noEmit false --outDir "$TMP_DIR" --rewriteRelativeImportExtensions true --allowImportingTsExtensions true
node "$TMP_DIR/tests/scenarios/candidate.scenarios.js"

echo '3/6 Candidate recovery contracts'
grep -q "checksum-verified local file" public/app.js
grep -q "Missing verified hotel confirmation" public/app.js
grep -q 'aria-label="Add trip item"' public/app.js
grep -q 'role="status" aria-live="polite"' public/app.js
grep -q "Delete this trip" public/app.js
grep -q "needs_review" public/app.js
grep -q "Scheduled booking data is never presented as live" public/app.js
grep -q "i.explanation||i.message" public/major-workspace.js
grep -q "i.suggestedAction||i.action" public/major-workspace.js
node tests/browser-timezone.contract.mjs

echo '4/6 Mobile application UI contracts'
npm run check:ui
grep -q 'max-width:var(--app-width)' public/mobile-app.css
grep -q 'Show to Driver' public/mobile-app.js
grep -q 'Scheduled booking data is never presented as live' public/mobile-app.js
test -f public/legacy.html
test -f docs/MOBILE_APP_UI_V1.md

echo '5/6 PWA and disabled integrations'
grep -q "tripto-shell-date-range-v3" public/sw.js
grep -q "/assets/mobile/hotel-fallback-premium.jpg" public/sw.js
grep -q "key.startsWith('tripto-shell-')" public/sw.js
for flag in LIVE_FLIGHTS_ENABLED AI_ENABLED GMAIL_SYNC_ENABLED R2_DOCUMENTS_ENABLED ACCOUNT_AUTH_ENABLED SHARING_ENABLED DEMO_TOOLS_ENABLED OPS_ENABLED; do
  grep -q "\"$flag\": \"false\"" wrangler.jsonc
done

echo '6/6 Candidate release files'
test -f scripts/smoke-beta-candidate.sh
test -f docs/BETA_CANDIDATE_1.md
test -f docs/DEPLOY_BETA_CANDIDATE_1.md
test -f docs/ROLLBACK_BETA_CANDIDATE_1.md

echo 'Beta Candidate 1 validation with Mobile App UI v1 passed.'
