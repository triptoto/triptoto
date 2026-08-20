#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
TMP_DIR="${TMPDIR:-/tmp}/tripto-smoke-m2-$$"
mkdir -p "$TMP_DIR"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

json_field(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);let v=x;for(const k of process.argv[1].split('.'))v=v[k];console.log(v)})" "$1"; }

printf 'Health... '
HEALTH=$(curl -fsS "$BASE_URL/health")
printf '%s' "$HEALTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(!x.ok||x.build!=='beta-milestone-2')process.exit(1)})"
echo OK

printf 'Guest session... '
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"web","appVersion":"smoke-milestone-2","apiVersion":"v1"}')
TOKEN=$(printf '%s' "$SESSION" | json_field token)
echo OK

AUTH=(-H "authorization: Bearer $TOKEN")

printf 'Account + migration preview... '
curl -fsS "$BASE_URL/api/v1/account" "${AUTH[@]}" > "$TMP_DIR/account.json"
curl -fsS "$BASE_URL/api/v1/account/migration-preview" "${AUTH[@]}" > "$TMP_DIR/migration.json"
echo OK

printf 'Create smoke trip... '
TRIP=$(curl -fsS -X POST "$BASE_URL/api/v1/trips" "${AUTH[@]}" -H 'content-type: application/json' --data '{"title":"Milestone 2 Smoke Trip","lifecycleState":"upcoming"}')
TRIP_ID=$(printf '%s' "$TRIP" | json_field trip.id)
TRIP_VERSION=$(printf '%s' "$TRIP" | json_field trip.version)
echo "$TRIP_ID"

printf 'Sharing status... '
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/sharing" "${AUTH[@]}" > "$TMP_DIR/sharing.json"
echo OK

printf 'JSON export... '
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/export/json" "${AUTH[@]}" > "$TMP_DIR/export.json"
printf '%s' "$(cat "$TMP_DIR/export.json")" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);if(x.exportSchemaVersion!==2)process.exit(1)})"
echo OK

printf 'Calendar export... '
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/export/calendar.ics" "${AUTH[@]}" > "$TMP_DIR/calendar.ics"
grep -q 'BEGIN:VCALENDAR' "$TMP_DIR/calendar.ics"
echo OK

printf 'Privacy-safe support bundle... '
curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/support" "${AUTH[@]}" > "$TMP_DIR/support.json"
grep -q 'privacyNote' "$TMP_DIR/support.json"
echo OK

printf 'Diagnostics + request id... '
curl -fsS -D "$TMP_DIR/headers.txt" "$BASE_URL/api/v1/diagnostics" "${AUTH[@]}" > "$TMP_DIR/diagnostics.json"
grep -qi '^x-request-id:' "$TMP_DIR/headers.txt"
echo OK

printf 'Demo tools disabled gate... '
STATUS=$(curl -sS -o "$TMP_DIR/demo.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/internal/demo-trips" "${AUTH[@]}" -H 'content-type: application/json' --data '{"scenario":"normal"}')
if [[ "$STATUS" != "404" ]]; then
  echo "expected 404, got $STATUS"
  cat "$TMP_DIR/demo.json"
  exit 1
fi
echo OK

printf 'Session refresh... '
REFRESH=$(curl -fsS -X POST "$BASE_URL/api/v1/session/refresh" "${AUTH[@]}" -H 'content-type: application/json' --data '{}')
TOKEN=$(printf '%s' "$REFRESH" | json_field token)
AUTH=(-H "authorization: Bearer $TOKEN")
echo OK

printf 'Cleanup smoke trip... '
curl -fsS -X DELETE "$BASE_URL/api/v1/trips/$TRIP_ID" "${AUTH[@]}" -H 'content-type: application/json' --data "{\"version\":$TRIP_VERSION}" >/dev/null
echo OK

echo 'Beta Milestone 2 smoke test completed.'
