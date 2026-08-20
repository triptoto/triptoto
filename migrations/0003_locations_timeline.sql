PRAGMA foreign_keys = ON;

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('airport','station','hotel','restaurant','attraction','port','address','city','other')),
  display_name TEXT NOT NULL,
  local_name TEXT,
  formatted_address TEXT,
  local_address TEXT,
  latitude REAL CHECK(latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude REAL CHECK(longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  country_code TEXT,
  region_code TEXT,
  city TEXT,
  timezone TEXT,
  iata_code TEXT,
  icao_code TEXT,
  station_code TEXT,
  external_provider TEXT,
  external_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);

CREATE TABLE trip_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('transport','stay','activity','reservation','custom')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','confirmed','completed','cancelled','skipped','unknown')),
  title TEXT NOT NULL,
  subtitle TEXT,
  start_location_id TEXT,
  end_location_id TEXT,
  starts_at_utc INTEGER,
  ends_at_utc INTEGER,
  start_local_datetime TEXT,
  end_local_datetime TEXT,
  start_timezone TEXT,
  end_timezone TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','email','upload','system','provider')),
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK(confidence IN ('confirmed','live','estimated','unavailable','low_confidence')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(start_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY(end_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  CHECK(ends_at_utc IS NULL OR starts_at_utc IS NULL OR ends_at_utc >= starts_at_utc)
);

CREATE TABLE trip_item_travelers (
  trip_item_id TEXT NOT NULL,
  traveler_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('participant','booker','driver','other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(trip_item_id, traveler_id),
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(traveler_id) REFERENCES travelers(id) ON DELETE CASCADE
);

CREATE INDEX idx_locations_iata ON locations(iata_code);
CREATE INDEX idx_locations_external ON locations(external_provider, external_id);
CREATE INDEX idx_trip_items_timeline ON trip_items(trip_id, starts_at_utc, deleted_at);
CREATE INDEX idx_trip_items_status ON trip_items(trip_id, status, deleted_at);
