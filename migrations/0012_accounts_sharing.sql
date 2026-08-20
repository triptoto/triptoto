PRAGMA foreign_keys = ON;

CREATE TABLE identity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('guest_migrated','identity_linked','identity_unlinked','device_revoked')),
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE trip_invites (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  invited_email TEXT,
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','revoked','expired')),
  created_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_identity_events_user ON identity_events(user_id, created_at);
CREATE INDEX idx_identity_events_device ON identity_events(device_id, created_at);
CREATE INDEX idx_trip_invites_trip_status ON trip_invites(trip_id, status, expires_at);
