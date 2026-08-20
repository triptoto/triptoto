PRAGMA foreign_keys = ON;

CREATE TABLE journey_groups (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  title TEXT NOT NULL,
  journey_type TEXT NOT NULL DEFAULT 'mixed' CHECK(journey_type IN ('one_way','round_trip','multi_city','open_jaw','road_trip','single_city','mixed')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','confirmed','completed','cancelled')),
  sequence_no INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE journey_group_items (
  journey_group_id TEXT NOT NULL,
  trip_item_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 0,
  semantic_role TEXT NOT NULL DEFAULT 'other' CHECK(semantic_role IN ('outbound','return','stopover','stay','transfer','activity','other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(journey_group_id, trip_item_id),
  FOREIGN KEY(journey_group_id) REFERENCES journey_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE
);

CREATE TABLE traveler_booking_details (
  trip_item_id TEXT NOT NULL,
  traveler_id TEXT NOT NULL,
  seat TEXT,
  cabin_class TEXT,
  fare_class TEXT,
  ticket_number TEXT,
  checked_bags INTEGER CHECK(checked_bags IS NULL OR checked_bags >= 0),
  cabin_bags INTEGER CHECK(cabin_bags IS NULL OR cabin_bags >= 0),
  personal_items INTEGER CHECK(personal_items IS NULL OR personal_items >= 0),
  meal_preference TEXT,
  special_assistance TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  PRIMARY KEY(trip_item_id, traveler_id),
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(traveler_id) REFERENCES travelers(id) ON DELETE CASCADE
);

CREATE TABLE trip_contacts (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  trip_item_id TEXT,
  traveler_id TEXT,
  contact_type TEXT NOT NULL CHECK(contact_type IN ('airline','hotel','driver','host','tour_operator','rental_car','insurance','emergency','other')),
  display_name TEXT NOT NULL,
  local_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE SET NULL,
  FOREIGN KEY(traveler_id) REFERENCES travelers(id) ON DELETE SET NULL
);

CREATE TABLE trip_time_markers (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  trip_item_id TEXT,
  marker_type TEXT NOT NULL CHECK(marker_type IN ('boarding','gate_close','checkin_open','checkin_close','reservation_window_start','reservation_window_end','arrival_deadline','pickup_deadline','document_deadline','custom')),
  label TEXT,
  at_utc INTEGER,
  local_datetime TEXT,
  timezone TEXT,
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK(confidence IN ('confirmed','live','estimated','unavailable','low_confidence')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','email','upload','system','provider')),
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  CHECK(at_utc IS NOT NULL OR local_datetime IS NOT NULL)
);

CREATE INDEX idx_journey_groups_trip ON journey_groups(trip_id,deleted_at,sequence_no);
CREATE INDEX idx_journey_group_items_order ON journey_group_items(journey_group_id,sequence_no);
CREATE INDEX idx_booking_details_traveler ON traveler_booking_details(traveler_id);
CREATE INDEX idx_trip_contacts_trip ON trip_contacts(trip_id,deleted_at,contact_type);
CREATE INDEX idx_trip_time_markers_trip ON trip_time_markers(trip_id,deleted_at,at_utc);
CREATE INDEX idx_trip_time_markers_item ON trip_time_markers(trip_item_id,marker_type);
