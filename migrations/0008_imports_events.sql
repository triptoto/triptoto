PRAGMA foreign_keys = ON;

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  user_id TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('forwarded_email','upload','manual')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','needs_confirmation','completed','partial','duplicate','unsupported','failed')),
  source_fingerprint TEXT NOT NULL,
  recovery_action TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(source_type, source_fingerprint)
);

CREATE TABLE import_messages (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  source_timestamp INTEGER,
  sender TEXT,
  subject TEXT,
  normalized_hash TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE,
  UNIQUE(import_id, sequence_no)
);

CREATE TABLE import_candidates (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('pending','confirmed','rejected','invalid')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE
);

CREATE TABLE change_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX idx_imports_user_status ON imports(user_id, status, created_at);
CREATE INDEX idx_change_events_trip ON change_events(trip_id, created_at);
