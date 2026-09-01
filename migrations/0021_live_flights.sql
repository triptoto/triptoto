PRAGMA foreign_keys = ON;

-- Provider facts stay separate from manual/imported booking facts. Existing
-- flights columns continue to hold normalized estimated/actual state used by
-- the deterministic timeline and Impact Engine.
CREATE TABLE flight_live_status (
  trip_item_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_flight_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'unavailable' CHECK(match_status IN ('matched','ambiguous','not_found','unavailable')),
  match_confidence INTEGER CHECK(match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 100)),
  provider_status TEXT,
  provider_scheduled_departure_utc INTEGER,
  provider_scheduled_arrival_utc INTEGER,
  live_departure_terminal TEXT,
  live_departure_gate TEXT,
  live_arrival_terminal TEXT,
  live_arrival_gate TEXT,
  baggage_belt TEXT,
  marketing_airline_code TEXT,
  marketing_flight_number TEXT,
  operating_airline_code TEXT,
  operating_flight_number TEXT,
  delay_minutes INTEGER CHECK(delay_minutes IS NULL OR delay_minutes >= 0),
  provider_updated_at INTEGER,
  fetched_at INTEGER,
  last_checked_at INTEGER,
  last_success_at INTEGER,
  freshness_expires_at INTEGER,
  next_refresh_at INTEGER,
  normalized_fingerprint TEXT,
  last_error_code TEXT,
  backoff_until INTEGER,
  cancellation_signals INTEGER NOT NULL DEFAULT 0 CHECK(cancellation_signals >= 0),
  cancellation_first_reported_at INTEGER,
  cancellation_confirmed_at INTEGER,
  cancellation_recovery_signals INTEGER NOT NULL DEFAULT 0 CHECK(cancellation_recovery_signals >= 0),
  cancellation_recovery_first_reported_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(trip_item_id) REFERENCES flights(trip_item_id) ON DELETE CASCADE
);

CREATE INDEX idx_flight_live_due ON flight_live_status(next_refresh_at, trip_item_id)
  WHERE next_refresh_at IS NOT NULL;
CREATE INDEX idx_flight_live_provider_id ON flight_live_status(provider, provider_flight_id);
CREATE INDEX idx_flights_live_monitoring ON flights(scheduled_departure_utc, operational_phase, disruption_state)
  WHERE live_data_enabled = 1;

-- Only normalized, provider-independent status is cached. Raw responses and
-- traveler/account identifiers are never stored here.
CREATE TABLE flight_provider_cache (
  provider TEXT NOT NULL,
  lookup_key TEXT NOT NULL,
  normalized_status_json TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(provider, lookup_key)
);

CREATE INDEX idx_flight_provider_cache_expiry ON flight_provider_cache(expires_at);

-- One row is reserved before every outbound request. A reservation counts
-- against both budgets even when the provider fails, which fails safely.
CREATE TABLE flight_provider_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  request_type TEXT NOT NULL,
  day_bucket TEXT NOT NULL,
  month_bucket TEXT NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 1 CHECK(unit_cost >= 1),
  outcome TEXT NOT NULL DEFAULT 'reserved' CHECK(outcome IN ('reserved','success','not_found','ambiguous','rate_limited','timeout','provider_error','invalid_response')),
  provider_status_code INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_flight_provider_usage_day ON flight_provider_usage(provider, day_bucket, created_at);
CREATE INDEX idx_flight_provider_usage_month ON flight_provider_usage(provider, month_bucket, created_at);

INSERT INTO integration_health (
  integration_type,provider_key,enabled,status,last_success_at,last_failure_at,
  consecutive_failures,quota_used,quota_limit,last_error_code,updated_at
) VALUES ('flight','aerodatabox',0,'disabled',NULL,NULL,0,0,NULL,NULL,CAST(strftime('%s','now') AS INTEGER)*1000)
ON CONFLICT(integration_type,provider_key) DO NOTHING;
