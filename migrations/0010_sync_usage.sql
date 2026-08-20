PRAGMA foreign_keys = ON;

CREATE TABLE sync_operations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('create','update','delete')),
  base_version INTEGER,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','applied','conflict','failed_retryable','failed_permanent')),
  created_at INTEGER NOT NULL,
  applied_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE sync_conflicts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  client_base_version INTEGER,
  server_payload_json TEXT NOT NULL,
  client_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved_server','resolved_client','resolved_merged')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY(operation_id) REFERENCES sync_operations(id) ON DELETE CASCADE
);

CREATE TABLE tombstones (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(entity_type, entity_id)
);

CREATE TABLE usage_counters (
  scope_type TEXT NOT NULL CHECK(scope_type IN ('user','system')),
  scope_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0 CHECK(value >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope_type, scope_id, period_key, metric)
);

CREATE INDEX idx_sync_ops_device_status ON sync_operations(device_id, status, created_at);
CREATE INDEX idx_sync_ops_user_status ON sync_operations(user_id, status, created_at);
