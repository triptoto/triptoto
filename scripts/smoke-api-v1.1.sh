#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
post(){ curl -fsS -X POST "$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"; }
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"web","appVersion":"smoke-v1.1"}')
TOKEN=$(printf '%s' "$SESSION" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
TRIP=$(post "$BASE_URL/api/v1/trips" '{"title":"V1.1 Rome Connection Test","lifecycleState":"upcoming"}')
TRIP_ID=$(printf '%s' "$TRIP"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).trip.id))")
TRAVELER=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/travelers" '{"displayName":"Test Traveler","travelerType":"adult"}')
TRAVELER_ID=$(printf '%s' "$TRAVELER"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).traveler.id))")
FCO=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"airport","displayName":"Rome Fiumicino Airport","iataCode":"FCO","timezone":"Europe/Rome"}')
HOTEL=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/locations" '{"type":"hotel","displayName":"Test Hotel","formattedAddress":"Via Roma 1","localAddress":"Via Roma 1","timezone":"Europe/Rome"}')
FCO_ID=$(printf '%s' "$FCO"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
HOTEL_ID=$(printf '%s' "$HOTEL"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).location.id))")
NOW=$(node -e 'console.log(Date.now()+3600000)'); ARR=$((NOW+7200000)); NEXT=$((ARR+3600000))
FLIGHT=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/transport" "{\"transportType\":\"flight\",\"title\":\"Test Flight\",\"arrivalLocationId\":\"$FCO_ID\",\"scheduledDepartureUtc\":$NOW,\"scheduledArrivalUtc\":$ARR,\"marketingAirlineCode\":\"LY\",\"marketingFlightNumber\":\"383\",\"travelerIds\":[\"$TRAVELER_ID\"]}")
FLIGHT_ID=$(printf '%s' "$FLIGHT"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.id))")
TRANSFER=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/timeline" "{\"type\":\"transport\",\"status\":\"confirmed\",\"title\":\"Airport transfer\",\"startsAtUtc\":$NEXT,\"confidence\":\"confirmed\"}")
TRANSFER_ID=$(printf '%s' "$TRANSFER"|node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item.id))")
post "$BASE_URL/api/v1/trips/$TRIP_ID/connections" "{\"fromItemId\":\"$FLIGHT_ID\",\"toItemId\":\"$TRANSFER_ID\",\"connectionType\":\"planned_transfer\",\"recommendedBufferMinutes\":90}" >/dev/null
post "$BASE_URL/api/v1/trips/$TRIP_ID/stays" "{\"propertyName\":\"Test Hotel\",\"propertyLocationId\":\"$HOTEL_ID\",\"checkInDate\":\"2026-09-01\",\"travelerIds\":[\"$TRAVELER_ID\"]}" >/dev/null
IMPACTS=$(post "$BASE_URL/api/v1/trips/$TRIP_ID/impacts/recalculate" '{}')
echo "$IMPACTS"
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/changes" -H "authorization: Bearer $TOKEN"; echo
echo "Backend API v1.1 smoke test completed."
