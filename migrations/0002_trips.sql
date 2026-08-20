PRAGMA foreign_keys = ON;

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  created_by_device_id TEXT,
  title TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'draft' CHECK(lifecycle_state IN ('draft','upcoming','active','completed','cancelled')),
  starts_on TEXT,
  ends_on TEXT,
  primary_destination_location_id TEXT,
  archived_at INTEGER,
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE trip_members (
  trip_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('invited','active','removed')),
  joined_at INTEGER,
  removed_at INTEGER,
  PRIMARY KEY(trip_id, user_id),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE travelers (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  linked_user_id TEXT,
  display_name TEXT NOT NULL,
  given_name TEXT,
  family_name TEXT,
  traveler_type TEXT NOT NULL DEFAULT 'unknown' CHECK(traveler_type IN ('adult','child','infant','unknown')),
  birth_year INTEGER CHECK(birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2200)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(linked_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_trips_owner_state ON trips(owner_user_id, lifecycle_state, deleted_at);
CREATE INDEX idx_trip_members_user ON trip_members(user_id, status);
CREATE INDEX idx_travelers_trip ON travelers(trip_id, deleted_at);
