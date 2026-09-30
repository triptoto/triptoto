PRAGMA foreign_keys = ON;

-- Complimentary Plus access is an explicit, revocable server-side grant for a
-- signed-in account. It is deliberately separate from provider subscriptions:
-- a cancellation, expiry, or failed payment can never remove a lifetime grant.
CREATE TABLE tripto_plus_lifetime_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  granted_by TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_triptoplus_lifetime_grants_active
  ON tripto_plus_lifetime_grants(user_id, revoked_at);
