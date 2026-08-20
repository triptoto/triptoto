#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
json_field(){ node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split('.'))v=v[k];console.log(typeof v==='object'?JSON.stringify(v):String(v));})" "$1"; }
SESSION=$(curl -fsS -X POST "$BASE_URL/api/v1/session/guest" -H 'content-type: application/json' --data '{"platform":"web","appVersion":"beta-milestone-smoke","apiVersion":"v1"}')
TOKEN=$(printf '%s' "$SESSION" | json_field token)
AUTH=(-H "authorization: Bearer $TOKEN")
ACCOUNT=$(curl -fsS "$BASE_URL/api/v1/account" "${AUTH[@]}")
MODE=$(printf '%s' "$ACCOUNT" | json_field account.mode)
[[ "$MODE" == "guest" ]] || { echo "Expected guest account mode, got $MODE"; exit 1; }
TRIP=$(curl -fsS -X POST "$BASE_URL/api/v1/trips" "${AUTH[@]}" -H 'content-type: application/json' --data '{"title":"Beta Milestone Smoke","lifecycleState":"upcoming"}')
TRIP_ID=$(printf '%s' "$TRIP" | json_field trip.id)
TRIP_VERSION=$(printf '%s' "$TRIP" | json_field trip.version)
SHARING=$(curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/sharing" "${AUTH[@]}")
ACCOUNT_REQUIRED=$(printf '%s' "$SHARING" | json_field sharing.accountRequired)
[[ "$ACCOUNT_REQUIRED" == "true" ]] || { echo "Expected sharing.accountRequired=true"; exit 1; }
EXPORT=$(curl -fsS "$BASE_URL/api/v1/trips/$TRIP_ID/export/json" "${AUTH[@]}")
EXPORT_TITLE=$(printf '%s' "$EXPORT" | json_field trip.title)
[[ "$EXPORT_TITLE" == "Beta Milestone Smoke" ]] || { echo "Export title mismatch"; exit 1; }
DIAG=$(curl -fsS "$BASE_URL/api/v1/diagnostics" "${AUTH[@]}")
DIAG_MODE=$(printf '%s' "$DIAG" | json_field diagnostics.mode)
[[ "$DIAG_MODE" == "guest" ]] || { echo "Diagnostics mode mismatch"; exit 1; }
DEMO_STATUS=$(curl -sS -o /tmp/tripto-demo-disabled.json -w '%{http_code}' -X POST "$BASE_URL/api/v1/internal/demo-trips" "${AUTH[@]}" -H 'content-type: application/json' --data '{"scenario":"normal"}')
[[ "$DEMO_STATUS" == "404" ]] || { echo "Demo tools should be disabled by default, got HTTP $DEMO_STATUS"; cat /tmp/tripto-demo-disabled.json; exit 1; }
curl -fsS -X DELETE "$BASE_URL/api/v1/trips/$TRIP_ID" "${AUTH[@]}" -H 'content-type: application/json' --data "{\"version\":$TRIP_VERSION}" >/dev/null
rm -f /tmp/tripto-demo-disabled.json
echo "Beta milestone smoke test completed."
