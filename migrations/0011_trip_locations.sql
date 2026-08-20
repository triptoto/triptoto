PRAGMA foreign_keys = ON;

CREATE TABLE trip_locations (
  trip_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(trip_id, location_id),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_trip_locations_location ON trip_locations(location_id, trip_id);
