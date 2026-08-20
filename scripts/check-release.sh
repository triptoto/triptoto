#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://tripto-api.travelinkme.workers.dev}"
EXPECTED="${TRIPTO_EXPECTED_RELEASE:-beta-milestone-4}"
BODY=$(curl -fsS "$BASE_URL/health")
printf '%s' "$BODY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);const e=process.argv[1];if(!x.ok||x.build!==e){console.error('Expected '+e+', got '+x.build);process.exit(1)};console.log('Release OK:',x.build,'D1 tables:',x.database&&x.database.tables)})" "$EXPECTED"
