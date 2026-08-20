#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"

post(){ curl -fsS -X POST "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
put(){ curl -fsS -X PUT "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
get(){ curl -fsS "$1" -H "authorization: Bearer $TOKEN"; }
json_field(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);let v=x;for(const k of process.argv[1].split('.'))v=v[k];console.log(v)})" "$1"; }

printf '1) Readiness\n'
READY=$(curl -fsS "$BASE_URL/api/v1/readiness")
printf '%s\n' "$READY"
printf '%s' "$READY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ready)process.exit(1)})"

printf '2) Guest session\n'
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"web","appVersion":"major-smoke","apiVersion":"v1"}')
TOKEN=$(printf '%s' "$SESSION" | json_field token)

printf '3) Trip, traveler and timeline\n'
TRIP=$(post "$BASE_URL/api/v1/trips" '{"title":"Major Milestone Smoke Trip","lifecycleState":"upcoming"}')
TRIP_ID=$(printf '%s' "$TRIP" | json_field trip.id)
TRAVELER=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/travelers" '{"displayName":"Smoke Traveler","travelerType":"adult"}')
TRAVELER_ID=$(printf '%s' "$TRAVELER" | json_field traveler.id)
NOW=$(node -e 'console.log(Date.now()+7200000)')
END=$((NOW+7200000))
ITEM=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/timeline" "{\"type\":\"transport\",\"status\":\"confirmed\",\"title\":\"Smoke transport\",\"startsAtUtc\":$NOW,\"endsAtUtc\":$END,\"startTimezone\":\"Asia/Jerusalem\",\"endTimezone\":\"Europe/Rome\",\"confidence\":\"confirmed\"}")
ITEM_ID=$(printf '%s' "$ITEM" | json_field item.id)

printf '4) Journey group\n'
JOURNEY=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/journeys" '{"title":"Smoke journey","journeyType":"one_way","status":"confirmed","sequenceNo":0}')
JOURNEY_ID=$(printf '%s' "$JOURNEY" | json_field journey.id)
put "$BASE_URL/api/v1/trips/$TRIP_ID/journeys/$JOURNEY_ID/items" "{\"items\":[{\"itemId\":\"$ITEM_ID\",\"sequenceNo\":0,\"semanticRole\":\"outbound\"}]}" >/dev/null

printf '5) Booking detail, contact and time marker\n'
put "$BASE_URL/api/v1/trips/$TRIP_ID/booking-details" "{\"tripItemId\":\"$ITEM_ID\",\"travelerId\":\"$TRAVELER_ID\",\"seat\":\"12A\",\"cabinClass\":\"economy\",\"checkedBags\":1}" >/dev/null
post "$BASE_URL/api/v1/trips/$TRIP_ID/contacts" "{\"contactType\":\"driver\",\"displayName\":\"Smoke Driver\",\"phone\":\"+972000000\",\"tripItemId\":\"$ITEM_ID\"}" >/dev/null
post "$BASE_URL/api/v1/trips/$TRIP_ID/time-markers" "{\"tripItemId\":\"$ITEM_ID\",\"markerType\":\"boarding\",\"label\":\"Boarding\",\"atUtc\":$NOW,\"timezone\":\"Asia/Jerusalem\",\"confidence\":\"confirmed\"}" >/dev/null

printf '6) Expanded health\n'
HEALTH=$(get "$BASE_URL/api/v1/trips/$TRIP_ID/health/expanded")
printf '%s\n' "$HEALTH"
printf '%s' "$HEALTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!Array.isArray(x.health.issues))process.exit(1)})"
post "$BASE_URL/api/v1/trips/$TRIP_ID/health/recalculate" '{}' >/dev/null

printf '7) Sync foundation\n'
CHANGES=$(get "$BASE_URL/api/v1/trips/$TRIP_ID/sync/changes?sinceCreatedAt=0")
LAST_CREATED=$(printf '%s' "$CHANGES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s),c=x.changes.at(-1);console.log(c?c.created_at:0)})")
LAST_ID=$(printf '%s' "$CHANGES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s),c=x.changes.at(-1);console.log(c?c.id:'')})")
post "$BASE_URL/api/v1/trips/$TRIP_ID/sync/ack" "{\"lastChangeCreatedAt\":$LAST_CREATED,\"lastChangeId\":\"$LAST_ID\",\"pendingLocalOperations\":0}" >/dev/null
QUEUED=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/sync/operations" "{\"idempotencyKey\":\"major-smoke-$TRIP_ID\",\"entityType\":\"trip_item\",\"entityId\":\"$ITEM_ID\",\"operationType\":\"update\",\"baseVersion\":1,\"payload\":{\"title\":\"Offline edit\"}}")
printf '%s\n' "$QUEUED"
printf '%s' "$QUEUED" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(x.operation.status!=='pending'||!x.operation.safeMode)process.exit(1)})"

printf 'Major Beta Milestone 5–8 smoke test completed. Test trip remains in D1 for inspection.\n'
