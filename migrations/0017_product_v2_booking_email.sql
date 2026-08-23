PRAGMA foreign_keys = ON;

CREATE TABLE verified_sender_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('google_identity','manual_verification')),
  verified_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_verified_sender_active_email
  ON verified_sender_emails(email_normalized)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_verified_sender_user
  ON verified_sender_emails(user_id, revoked_at);

CREATE TABLE inbound_booking_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  trip_id TEXT,
  import_id TEXT,
  sender_normalized TEXT,
  message_fingerprint TEXT NOT NULL UNIQUE,
  subject TEXT,
  status TEXT NOT NULL CHECK(status IN ('unknown_sender','needs_trip','needs_confirmation','unsupported','duplicate','rejected')),
  rejection_code TEXT,
  received_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE SET NULL
);

CREATE INDEX idx_inbound_booking_user_status
  ON inbound_booking_emails(user_id, status, received_at);

INSERT OR IGNORE INTO verified_sender_emails(id,user_id,email,email_normalized,source,verified_at,created_at)
SELECT lower(hex(randomblob(16))),ai.user_id,ai.email,lower(trim(ai.email)),'google_identity',ai.created_at,ai.created_at
FROM auth_identities ai
WHERE ai.provider='google' AND ai.email_verified=1 AND ai.email IS NOT NULL AND trim(ai.email)<>'';
