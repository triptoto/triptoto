PRAGMA foreign_keys = ON;

CREATE TABLE checklist_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  rule_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('documents','before_you_leave','packing','custom')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  auto_rule TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
  UNIQUE(template_id, item_key)
);

CREATE TABLE trip_checklist_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  source_template_item_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('documents','before_you_leave','packing','custom')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  due_at_utc INTEGER,
  completion_source TEXT NOT NULL DEFAULT 'none' CHECK(completion_source IN ('none','user','system')),
  completed_at INTEGER,
  auto_rule TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reminder_enabled IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(source_template_item_id) REFERENCES checklist_items(id) ON DELETE SET NULL
);

CREATE TABLE traveler_checklist_items (
  trip_checklist_item_id TEXT NOT NULL,
  traveler_id TEXT NOT NULL,
  completed_at INTEGER,
  completion_source TEXT NOT NULL DEFAULT 'none' CHECK(completion_source IN ('none','user','system')),
  PRIMARY KEY(trip_checklist_item_id, traveler_id),
  FOREIGN KEY(trip_checklist_item_id) REFERENCES trip_checklist_items(id) ON DELETE CASCADE,
  FOREIGN KEY(traveler_id) REFERENCES travelers(id) ON DELETE CASCADE
);

CREATE INDEX idx_trip_checklist_open ON trip_checklist_items(trip_id, completed_at, priority, deleted_at);
