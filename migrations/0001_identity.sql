PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  primary_email TEXT,
  locale TEXT,
  timezone TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('apple','google','email')),
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_subject)
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT NOT NULL CHECK(platform IN ('ios','android','web','unknown')),
  app_version TEXT,
  api_version TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  sync_cursor TEXT,
  revoked_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_devices_user ON devices(user_id, revoked_at);
