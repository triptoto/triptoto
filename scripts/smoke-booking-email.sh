#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-https://tripto.to}"
session_token="${2:-${TRIPTO_SESSION_TOKEN:-}}"

health="$(curl -fsS "$base_url/health")"
node -e 'const h=JSON.parse(process.argv[1]);if(!h.ok)throw new Error("health is not ok");' "$health"
printf 'PASS health\n'

api_status="$(curl -sS -o /tmp/tripto-booking-email-public.json -w '%{http_code}' "$base_url/api/v1/booking-emails")"
if [[ "$api_status" != "401" ]]; then
  printf 'Expected unauthenticated inbox to return 401, got %s\n' "$api_status" >&2
  exit 1
fi
printf 'PASS inbox is authentication-protected\n'

if [[ -n "$session_token" ]]; then
  inbox="$(curl -fsS -H "Authorization: Bearer $session_token" "$base_url/api/v1/booking-emails")"
  node -e 'const x=JSON.parse(process.argv[1]);if(!Array.isArray(x.bookingEmails))throw new Error("bookingEmails array missing");' "$inbox"
  printf 'PASS authenticated inbox\n'
else
  printf 'SKIP authenticated inbox (pass a session token to enable)\n'
fi

printf 'Booking email smoke passed for %s\n' "$base_url"
