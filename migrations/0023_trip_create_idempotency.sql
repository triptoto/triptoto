PRAGMA foreign_keys = ON;

-- A lost mobile response must never create a second trip when the traveler
-- retries Save. The request key is scoped to the authenticated device and the
-- stored fingerprint prevents reusing one key for different trip details.
CREATE TABLE trip_create_idempotency (
  device_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  trip_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, client_request_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX idx_trip_create_idempotency_trip
  ON trip_create_idempotency(trip_id);
