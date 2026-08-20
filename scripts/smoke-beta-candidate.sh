#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"

printf '1) Candidate health and readiness\n'
HEALTH=$(curl -fsS "$BASE_URL/health")
printf '%s' "$HEALTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ok||x.build!=='beta-candidate-1')throw new Error('Unexpected deployed build: '+x.build)})"
READY=$(curl -fsS "$BASE_URL/api/v1/readiness")
printf '%s' "$READY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ready)throw new Error('Candidate is not ready');if(!Array.isArray(x.checks)||x.checks.some(c=>!c.ok))throw new Error('Required schema check failed')})"

printf '2) Disabled public surfaces\n'
for path in /api/v1/demo/scenarios /api/v1/internal/ops/summary; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL$path")
  test "$CODE" = "404"
done

printf '3) PWA shell and safety labels\n'
curl -fsS "$BASE_URL/manifest.webmanifest" >/dev/null
curl -fsS "$BASE_URL/sw.js" | grep -q 'tripto-shell-beta-candidate-1'
curl -fsS "$BASE_URL/app.js" | grep -q 'Scheduled booking data is never presented as live'
curl -fsS "$BASE_URL/app.js" | grep -q 'checksum-verified local file'

printf '4) Full major API smoke\n'
bash "$(dirname "$0")/smoke-major-milestone.sh" "$BASE_URL"

printf 'Beta Candidate 1 deployed smoke test passed.\n'
