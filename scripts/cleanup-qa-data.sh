#!/usr/bin/env bash
set -euo pipefail

MODE=--local
MARKER=
EXECUTE=0
while (($#)); do
  case "$1" in
    --remote|--local) MODE="$1" ;;
    --marker) shift; MARKER="${1:-}" ;;
    --execute) EXECUTE=1 ;;
    *) echo "Usage: $0 [--local|--remote] --marker qa:<id> [--execute]" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! "$MARKER" =~ ^qa:[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$ ]]; then
  echo "Refusing cleanup: an exact qa: marker is required." >&2
  exit 2
fi
SQL_MARKER=${MARKER//\'/\'\'}
QUERY="SELECT qa_marker, COUNT(*) devices FROM devices WHERE qa_marker='$SQL_MARKER' AND user_id IS NULL GROUP BY qa_marker; SELECT qa_marker, COUNT(*) trips FROM trips WHERE qa_marker='$SQL_MARKER' GROUP BY qa_marker;"
echo "QA cleanup target: $MARKER ($MODE)"
npx wrangler d1 execute tripto-db "$MODE" --command "$QUERY"
if ((EXECUTE==0)); then
  echo "Dry run only. Re-run with --execute after inspection."
  exit 0
fi

DELETE_SQL="DELETE FROM trips WHERE qa_marker='$SQL_MARKER' AND created_by_device_id IN (SELECT id FROM devices WHERE qa_marker='$SQL_MARKER' AND user_id IS NULL); DELETE FROM beta_events WHERE qa_marker='$SQL_MARKER' AND device_id IN (SELECT id FROM devices WHERE qa_marker='$SQL_MARKER' AND user_id IS NULL); DELETE FROM devices WHERE qa_marker='$SQL_MARKER' AND user_id IS NULL;"
npx wrangler d1 execute tripto-db "$MODE" --command "$DELETE_SQL"
echo "Deleted only guest QA data carrying exact marker: $MARKER"
