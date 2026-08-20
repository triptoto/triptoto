#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
SCENARIO="${2:-normal}"
: "${TRIPTO_DEMO_SECRET:?Set TRIPTO_DEMO_SECRET to the Cloudflare DEMO_TOOLS_SECRET value first.}"
case "$SCENARIO" in normal|self_transfer|overnight|family|missing_essentials) ;; *) echo "Unknown scenario: $SCENARIO"; exit 2;; esac
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"web","appVersion":"demo-generator","apiVersion":"v1"}')
TOKEN=$(printf '%s' "$SESSION" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
RESULT=$(curl -fsS -X POST "$BASE_URL/api/v1/internal/demo-trips" -H "authorization: Bearer $TOKEN" -H "x-tripto-demo-secret: $TRIPTO_DEMO_SECRET" -H 'content-type: application/json' --data "{\"scenario\":\"$SCENARIO\"}")
printf '%s\n' "$RESULT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).demo;console.log('Created demo scenario:',d.scenario);console.log('Trip ID:',d.tripId);console.log('Title:',d.title);console.log(d.note);})"
