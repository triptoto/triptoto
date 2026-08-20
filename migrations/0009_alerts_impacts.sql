PRAGMA foreign_keys = ON;

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','shown','acknowledged','resolved','dismissed','superseded')),
  related_item_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(related_item_id) REFERENCES trip_items(id) ON DELETE SET NULL
);

CREATE TABLE impact_assessments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  trigger_event_id TEXT,
  item_id TEXT NOT NULL,
  impact_type TEXT NOT NULL CHECK(impact_type IN ('time','location','status','document','connection','offline')),
  severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  assessment_version INTEGER NOT NULL DEFAULT 1 CHECK(assessment_version >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','superseded')),
  explanation_code TEXT NOT NULL,
  calculated_at INTEGER NOT NULL,
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(trigger_event_id) REFERENCES change_events(id) ON DELETE SET NULL,
  FOREIGN KEY(item_id) REFERENCES trip_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_alerts_home ON alerts(trip_id, status, severity, created_at);
CREATE INDEX idx_impacts_item ON impact_assessments(item_id, status, calculated_at);
