PRAGMA foreign_keys=ON;

-- Generic opaque-key idempotency for offline create-replays (QA BUG-08). When the
-- client flushes its offline queue after a lossy reconnect it re-sends each queued
-- row's stable `pending_<uuid>` id as an Idempotency-Key. Manual bookings (0020)
-- and trip creates (0023) already had per-purpose dedup; this covers the remaining
-- offline create paths (checklist items, planning collections, planning stops) so a
-- replayed queue never inserts duplicate rows. Keyed per device + client request id;
-- request_fingerprint guards against the same key being reused for a different body.
CREATE TABLE create_idempotency (
  device_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, client_request_id)
);

CREATE INDEX idx_create_idempotency_resource
  ON create_idempotency(resource_type, resource_id);
