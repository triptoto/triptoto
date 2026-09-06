PRAGMA foreign_keys = ON;

-- Trip planning collections (Neighborhoods, Day Trips, Walking Routes, and the
-- unscheduled wishlists: Places to Visit, Food & Drink, Shopping).
--
-- A collection is a 1:1 subtype of a `trip_items` row (type='custom'). Reusing
-- trip_items gives the parent a stable id, event-local time columns, the sync
-- quartet (created_at/updated_at/deleted_at/version), trip scoping, offline
-- caching, collaboration and change-event history for free. The presence of a
-- `planning_collections` row is the discriminator that marks a custom item as a
-- planning collection.
--
-- Timeline visibility is derived, not stored: a collection appears once in the
-- main timeline only when its type is timeline-capable
-- (neighborhood/day_trip/walking_route) AND its parent trip_items.starts_at_utc
-- IS NOT NULL. Wishlists never appear in the main timeline.
CREATE TABLE planning_collections (
  trip_item_id TEXT PRIMARY KEY,
  collection_type TEXT NOT NULL CHECK(collection_type IN ('neighborhood','day_trip','walking_route','places_to_visit','food_and_drink','shopping')),
  city TEXT,
  central_location_id TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(central_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_planning_collections_type ON planning_collections(collection_type);

-- Child stops inside a collection. These are deliberately NOT trip_items, so a
-- stop can never be rendered as a top-level row in the main timeline. Ordering
-- is stable via `position`; `scheduled_time` holds an event-local wall-clock
-- string (HH:MM) or NULL for a flexible/untimed stop. `linked_trip_item_id`
-- references an existing booking that is grouped inside this collection without
-- duplicating the booking entity.
CREATE TABLE planning_stops (
  id TEXT PRIMARY KEY,
  collection_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_time TEXT,
  timezone TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  location_id TEXT,
  address_snapshot TEXT,
  place_type TEXT CHECK(place_type IS NULL OR place_type IN ('cafe','restaurant','attraction','museum','shop','market','park','activity','viewpoint','monument','street','other')),
  notes TEXT,
  linked_trip_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','visited','skipped')),
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(collection_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY(linked_trip_item_id) REFERENCES trip_items(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_planning_stops_collection ON planning_stops(collection_item_id, position, deleted_at);
CREATE INDEX idx_planning_stops_time ON planning_stops(collection_item_id, scheduled_time);
CREATE INDEX idx_planning_stops_linked ON planning_stops(linked_trip_item_id);
