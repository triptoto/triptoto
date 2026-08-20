PRAGMA foreign_keys = ON;

CREATE TABLE stays (
  trip_item_id TEXT PRIMARY KEY,
  property_name TEXT NOT NULL,
  property_location_id TEXT,
  check_in_date TEXT,
  check_in_from TEXT,
  check_in_until TEXT,
  check_out_date TEXT,
  check_out_by TEXT,
  confirmation_number TEXT,
  room_name TEXT,
  booking_status TEXT,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(property_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE activities (
  trip_item_id TEXT PRIMARY KEY,
  activity_type TEXT,
  venue_location_id TEXT,
  reservation_reference TEXT,
  arrival_deadline_utc INTEGER,
  notes TEXT,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(venue_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE reservations (
  trip_item_id TEXT PRIMARY KEY,
  reservation_type TEXT,
  confirmation_number TEXT,
  window_start_utc INTEGER,
  window_end_utc INTEGER,
  notes TEXT,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  CHECK(window_end_utc IS NULL OR window_start_utc IS NULL OR window_end_utc >= window_start_utc)
);
