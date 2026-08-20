PRAGMA foreign_keys = ON;

CREATE TABLE trip_sync_cursors (
  device_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  last_change_created_at INTEGER,
  last_change_id TEXT,
  acknowledged_at INTEGER,
  pending_local_operations INTEGER NOT NULL DEFAULT 0 CHECK(pending_local_operations >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id,trip_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE sync_idempotency (
  idempotency_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(idempotency_key,device_id,trip_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(operation_id) REFERENCES sync_operations(id) ON DELETE CASCADE
);

CREATE TABLE trip_health_runs (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  input_version INTEGER NOT NULL,
  highest_severity TEXT NOT NULL CHECK(highest_severity IN ('critical','high','medium','low','info')),
  issue_count INTEGER NOT NULL CHECK(issue_count >= 0),
  issues_json TEXT NOT NULL,
  calculated_at INTEGER NOT NULL,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX idx_trip_sync_cursor_updated ON trip_sync_cursors(trip_id,updated_at);
CREATE INDEX idx_sync_idempotency_expiry ON sync_idempotency(expires_at);
CREATE INDEX idx_trip_health_runs_trip ON trip_health_runs(trip_id,calculated_at DESC);
