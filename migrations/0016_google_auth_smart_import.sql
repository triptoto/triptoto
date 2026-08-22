PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google')),
  nonce_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE(provider, nonce_hash)
);

CREATE INDEX idx_auth_challenges_device ON auth_challenges(device_id, provider, expires_at, used_at);
