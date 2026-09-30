PRAGMA foreign_keys = ON;

-- Entitlements are owned by the signed-in account when one exists, otherwise
-- by the signed device.  Lemon Squeezy receives this opaque subject in its
-- checkout custom data and returns it in signed webhook events.
CREATE TABLE tripto_plus_subscriptions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('user','device')),
  subject_id TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL UNIQUE,
  provider_customer_id TEXT,
  plan TEXT NOT NULL CHECK(plan IN ('month','year')),
  status TEXT NOT NULL,
  renews_at INTEGER,
  ends_at INTEGER,
  customer_portal_url TEXT,
  provider_updated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(subject_type, subject_id, provider_subscription_id)
);

CREATE INDEX idx_triptoplus_subject ON tripto_plus_subscriptions(subject_type, subject_id, status, ends_at);

-- Lemon retries delivery.  Store a deterministic fingerprint so retries are
-- safe and cannot extend or duplicate an entitlement.
CREATE TABLE tripto_plus_webhook_events (
  event_fingerprint TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  provider_subscription_id TEXT,
  received_at INTEGER NOT NULL
);
