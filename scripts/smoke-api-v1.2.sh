#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
QA_MARKER="${QA_MARKER:-qa:v1.2-smoke:$(date -u +%Y%m%dT%H%M%SZ):$$}"
post(){ curl -fsS -X POST "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
patch(){ curl -fsS -X PATCH "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
del(){ curl -fsS -X DELETE "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data "{\"platform\":\"web\",\"appVersion\":\"smoke-v1.2\",\"qaMarker\":\"$QA_MARKER\"}")
TOKEN=$(printf '%s' "$SESSION"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
TRIP=$(post "$BASE_URL/api/v1/trips" '{"title":"V1.2 Edit Test","lifecycleState":"upcoming"}')
TRIP_ID=$(printf '%s' "$TRIP"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).trip.id))")
TRAVELER=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/travelers" '{"displayName":"Test Traveler","travelerType":"adult"}')
TRAVELER_ID=$(printf '%s' "$TRAVELER"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).traveler.id))")
TLV=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"airport","displayName":"Ben Gurion","iataCode":"TLV","timezone":"Asia/Jerusalem"}')
FCO=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"airport","displayName":"Fiumicino","iataCode":"FCO","timezone":"Europe/Rome"}')
TLV_ID=$(printf '%s' "$TLV"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
FCO_ID=$(printf '%s' "$FCO"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
NOW=$(node -e 'console.log(Date.now()+7200000)'); ARR=$((NOW+10800000)); ARR2=$((ARR+1800000))
FLIGHT=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/transport" "{\"transportType\":\"flight\",\"title\":\"LY 383\",\"departureLocationId\":\"$TLV_ID\",\"arrivalLocationId\":\"$FCO_ID\",\"scheduledDepartureUtc\":$NOW,\"scheduledArrivalUtc\":$ARR,\"departureTimezone\":\"Asia/Jerusalem\",\"arrivalTimezone\":\"Europe/Rome\",\"marketingAirlineCode\":\"LY\",\"marketingFlightNumber\":\"383\",\"travelerIds\":[\"$TRAVELER_ID\"]}")
FLIGHT_ID=$(printf '%s' "$FLIGHT"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.id))")
FLIGHT_V=$(printf '%s' "$FLIGHT"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.version))")
UPDATED=$(patch "$BASE_URL/api/v1/trips/$TRIP_ID/transport/$FLIGHT_ID" "{\"version\":$FLIGHT_V,\"scheduledArrivalUtc\":$ARR2,\"arrivalTerminal\":\"1\"}")
UPDATED_V=$(printf '%s' "$UPDATED"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.version))")
NEXT_DEP=$((ARR2+7200000)); NEXT_ARR=$((NEXT_DEP+3600000))
FLO=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"airport","displayName":"Florence","iataCode":"FLR","timezone":"Europe/Rome"}')
FLO_ID=$(printf '%s' "$FLO"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
F2=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/transport" "{\"transportType\":\"flight\",\"title\":\"Test 2\",\"departureLocationId\":\"$FCO_ID\",\"arrivalLocationId\":\"$FLO_ID\",\"scheduledDepartureUtc\":$NEXT_DEP,\"scheduledArrivalUtc\":$NEXT_ARR,\"departureTimezone\":\"Europe/Rome\",\"arrivalTimezone\":\"Europe/Rome\"}")
F2_ID=$(printf '%s' "$F2"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.id))")
CONN=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/connections" "{\"fromItemId\":\"$FLIGHT_ID\",\"toItemId\":\"$F2_ID\",\"connectionType\":\"unknown\",\"recommendedBufferMinutes\":90}")
CONN_ID=$(printf '%s' "$CONN"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).connection.id))")
CONN_V=$(printf '%s' "$CONN"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).connection.version))")
CONN2=$(patch "$BASE_URL/api/v1/trips/$TRIP_ID/connections/$CONN_ID" "{\"version\":$CONN_V,\"connectionType\":\"self_transfer\"}")
CONN_V2=$(printf '%s' "$CONN2"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).connection.version))")
del "$BASE_URL/api/v1/trips/$TRIP_ID/connections/$CONN_ID" "{\"version\":$CONN_V2}" >/dev/null
HOTEL_LOC=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"hotel","displayName":"Test Hotel","formattedAddress":"Via Roma 1"}')
HOTEL_LOC_ID=$(printf '%s' "$HOTEL_LOC"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
STAY=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/stays" "{\"propertyName\":\"Test Hotel\",\"propertyLocationId\":\"$HOTEL_LOC_ID\",\"checkInDate\":\"2026-09-01\"}")
STAY_ID=$(printf '%s' "$STAY"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).stay.id))")
STAY_V=$(printf '%s' "$STAY"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).stay.version))")
STAY2=$(patch "$BASE_URL/api/v1/trips/$TRIP_ID/stays/$STAY_ID" "{\"version\":$STAY_V,\"confirmationNumber\":\"TEST123\"}")
STAY_V2=$(printf '%s' "$STAY2"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).stay.version))")
del "$BASE_URL/api/v1/trips/$TRIP_ID/stays/$STAY_ID" "{\"version\":$STAY_V2}" >/dev/null
del "$BASE_URL/api/v1/trips/$TRIP_ID/transport/$FLIGHT_ID" "{\"version\":$UPDATED_V}" >/dev/null
echo "Backend API v1.2 edit/delete smoke test completed."
printf 'QA marker: %s\nOptional cleanup: bash scripts/cleanup-qa-data.sh --remote --marker %q --execute\n' "$QA_MARKER" "$QA_MARKER"
