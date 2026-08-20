#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
: "${TRIPTO_OPS_SECRET:?Set TRIPTO_OPS_SECRET in this shell. Do not commit it.}"
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"unknown","appVersion":"ops-cli","apiVersion":"v1"}')
TOKEN=$(printf '%s' "$SESSION" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
curl -fsS "$BASE_URL/api/v1/internal/ops/summary" -H "authorization: Bearer $TOKEN" -H "x-tripto-ops-secret: $TRIPTO_OPS_SECRET" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s),null,2)))"
