PRAGMA foreign_keys = ON;

CREATE TABLE beta_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT NOT NULL,
  trip_id TEXT,
  event_name TEXT NOT NULL CHECK(event_name IN (
    'trip_created',
    'second_trip_created',
    'booking_added',
    'second_booking_added',
    'timeline_opened',
    'whats_next_opened',
    'during_trip_home_opened',
    'ready_offline_opened',
    'local_document_saved',
    'local_document_opened',
    'import_previewed',
    'import_confirmed',
    'trip_completed',
    'offline_conflict_seen'
  )),
  event_day TEXT NOT NULL,
  release TEXT NOT NULL,
  dedupe_key TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_beta_events_dedupe ON beta_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_beta_events_actor ON beta_events(user_id,device_id,event_name,created_at);
CREATE INDEX idx_beta_events_trip ON beta_events(trip_id,event_name,created_at);
CREATE INDEX idx_beta_events_day ON beta_events(event_day,event_name);

CREATE TABLE integration_health (
  integration_type TEXT NOT NULL CHECK(integration_type IN ('flight','gmail','documents','auth','sharing','maps')),
  provider_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  status TEXT NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','healthy','degraded','unavailable','quota_exhausted')),
  last_success_at INTEGER,
  last_failure_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures >= 0),
  quota_used INTEGER,
  quota_limit INTEGER,
  last_error_code TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(integration_type, provider_key)
);

CREATE TABLE privacy_deletions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('guest','account')),
  deleted_trips INTEGER NOT NULL DEFAULT 0 CHECK(deleted_trips >= 0),
  deleted_devices INTEGER NOT NULL DEFAULT 0 CHECK(deleted_devices >= 0),
  created_at INTEGER NOT NULL
);
