#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import sqlite3, tempfile
files=sorted(Path('migrations').glob('*.sql'))
with tempfile.NamedTemporaryFile(suffix='.sqlite') as tmp:
    db=sqlite3.connect(tmp.name)
    try:
        for path in files:
            db.executescript(path.read_text())
        required={'journey_groups','journey_group_items','traveler_booking_details','trip_contacts','trip_time_markers','trip_sync_cursors','sync_idempotency','trip_health_runs'}
        found={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing=sorted(required-found)
        if missing: raise SystemExit('Missing major tables: '+', '.join(missing))
        print(f'Applied {len(files)} migrations in clean SQLite; major tables verified.')
    finally:
        db.close()
PY
