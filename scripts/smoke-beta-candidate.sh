#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"

printf '1) Candidate health and readiness\n'
HEALTH=$(curl -fsS "$BASE_URL/health")
printf '%s' "$HEALTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ok||x.build!=='beta-candidate-1')throw new Error('Unexpected deployed build: '+x.build);const enabled=Object.entries(x.features||{}).filter(([name,value])=>name!=='betaMetrics'&&value===true).map(([name])=>name);if(enabled.length)throw new Error('Disabled feature unexpectedly enabled: '+enabled.join(', '))})"
READY=$(curl -fsS "$BASE_URL/api/v1/readiness")
printf '%s' "$READY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ready)throw new Error('Candidate is not ready');if(!Array.isArray(x.checks)||x.checks.some(c=>!c.ok))throw new Error('Required schema check failed')})"

printf '2) Disabled feature flags confirmed by health response\n'

printf '3) PWA shell and safety labels\n'
curl -fsS "$BASE_URL/manifest.webmanifest" >/dev/null
SW_SOURCE=$(curl -fsS "$BASE_URL/sw.js")
APP_SOURCE=$(curl -fsS "$BASE_URL/mobile-app.js")
[[ "$SW_SOURCE" == *tripto-shell-product-v6-detail-cards* ]]
[[ "$APP_SOURCE" == *'Scheduled booking data is never presented as live'* ]]
[[ "$APP_SOURCE" == *'checksum verification succeeds'* ]]

printf '4) Full major API smoke\n'
bash "$(dirname "$0")/smoke-major-milestone.sh" "$BASE_URL"

printf 'Beta Candidate 1 deployed smoke test passed.\n'
