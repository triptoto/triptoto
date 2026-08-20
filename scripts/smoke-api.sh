#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
QA_MARKER="${QA_MARKER:-qa:api-smoke:$(date -u +%Y%m%dT%H%M%SZ):$$}"

echo "1) Health"
curl -fsS "$BASE_URL/health"; echo

echo "2) Create guest session"
SESSION_JSON=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" \
  -H 'content-type: application/json' \
  --data "{\"platform\":\"web\",\"appVersion\":\"smoke\",\"apiVersion\":\"v1\",\"qaMarker\":\"$QA_MARKER\"}")
echo "$SESSION_JSON"
TOKEN=$(printf '%s' "$SESSION_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")

echo "3) Create trip"
TRIP_JSON=$(curl -fsS -X POST "$BASE_URL/api/v1/trips" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{"title":"Smoke Test Rome","lifecycleState":"draft"}')
echo "$TRIP_JSON"
TRIP_ID=$(printf '%s' "$TRIP_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).trip.id))")

echo "4) Add timeline item"
NOW=$(node -e 'console.log(Date.now()+3600000)')
curl -fsS -X POST "$BASE_URL/api/v1/trips/$TRIP_ID/timeline" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data "{\"type\":\"activity\",\"status\":\"confirmed\",\"title\":\"Test activity\",\"startsAtUtc\":$NOW,\"confidence\":\"confirmed\"}"; echo

echo "5) Seed checklist"
curl -fsS -X POST "$BASE_URL/api/v1/trips/$TRIP_ID/checklist/seed" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data '{"international":true,"durationDays":7,"hasFlight":true,"travelerCount":1,"destinationCountryCode":"IT"}'; echo

echo "6) Trip Brain"
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/brain" -H "authorization: Bearer $TOKEN"; echo

echo "Smoke test completed. Test trip remains in D1 for inspection."
printf 'QA marker: %s\nOptional cleanup: bash scripts/cleanup-qa-data.sh --remote --marker %q --execute\n' "$QA_MARKER" "$QA_MARKER"
