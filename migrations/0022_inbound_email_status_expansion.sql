PRAGMA foreign_keys = OFF;

-- Expand the inbound_booking_emails status vocabulary so the pipeline can record
-- the full set of user-facing states (Received, Processing, Added, Needs review,
-- Needs trip, Couldn't read) in addition to the original set. SQLite cannot alter
-- a CHECK constraint in place, so the table is rebuilt and its rows are copied.
-- Existing status values are all retained in the new constraint, so the copy is
-- lossless and no production data is reset.

CREATE TABLE inbound_booking_emails_new (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  trip_id TEXT,
  import_id TEXT,
  sender_normalized TEXT,
  message_fingerprint TEXT NOT NULL UNIQUE,
  subject TEXT,
  status TEXT NOT NULL CHECK(status IN (
    'received','processing','added','needs_review',
    'unknown_sender','needs_trip','needs_confirmation','unsupported','couldnt_read','duplicate','rejected'
  )),
  rejection_code TEXT,
  received_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE SET NULL
);

INSERT INTO inbound_booking_emails_new
  (id,user_id,trip_id,import_id,sender_normalized,message_fingerprint,subject,status,rejection_code,received_at)
SELECT id,user_id,trip_id,import_id,sender_normalized,message_fingerprint,subject,status,rejection_code,received_at
FROM inbound_booking_emails;

DROP TABLE inbound_booking_emails;
ALTER TABLE inbound_booking_emails_new RENAME TO inbound_booking_emails;

CREATE INDEX idx_inbound_booking_user_status
  ON inbound_booking_emails(user_id, status, received_at);

PRAGMA foreign_keys = ON;
