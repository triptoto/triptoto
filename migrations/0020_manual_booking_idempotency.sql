PRAGMA foreign_keys = ON;

-- Optional idempotency for direct manual-booking creates. Only an opaque
-- client request ID and a SHA-256 fingerprint are retained; request bodies and
-- booking details remain in their canonical tables.
CREATE TABLE manual_booking_idempotency (
  trip_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('stay','transport','activity','contact')),
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
  owner_token TEXT,
  lock_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY(trip_id,device_id,client_request_id),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX idx_manual_booking_idempotency_resource
  ON manual_booking_idempotency(trip_id,resource_type,resource_id);
