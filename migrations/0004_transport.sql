PRAGMA foreign_keys = ON;

CREATE TABLE transport_segments (
  trip_item_id TEXT PRIMARY KEY,
  transport_type TEXT NOT NULL CHECK(transport_type IN ('flight','train','bus','ferry','car','transfer','other')),
  carrier_name TEXT,
  service_number TEXT,
  departure_location_id TEXT,
  arrival_location_id TEXT,
  scheduled_departure_utc INTEGER,
  scheduled_arrival_utc INTEGER,
  departure_timezone TEXT,
  arrival_timezone TEXT,
  booking_reference TEXT,
  booking_status TEXT,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(departure_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY(arrival_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  CHECK(scheduled_arrival_utc IS NULL OR scheduled_departure_utc IS NULL OR scheduled_arrival_utc >= scheduled_departure_utc)
);

CREATE TABLE flights (
  trip_item_id TEXT PRIMARY KEY,
  marketing_airline_code TEXT,
  marketing_flight_number TEXT,
  operating_airline_code TEXT,
  operating_flight_number TEXT,
  departure_terminal TEXT,
  departure_gate TEXT,
  arrival_terminal TEXT,
  arrival_gate TEXT,
  boarding_time_utc INTEGER,
  gate_close_time_utc INTEGER,
  scheduled_departure_utc INTEGER NOT NULL,
  scheduled_arrival_utc INTEGER NOT NULL,
  estimated_departure_utc INTEGER,
  estimated_arrival_utc INTEGER,
  actual_departure_utc INTEGER,
  actual_arrival_utc INTEGER,
  operational_phase TEXT NOT NULL DEFAULT 'scheduled' CHECK(operational_phase IN ('scheduled','boarding','departed','en_route','landed','unknown')),
  disruption_state TEXT NOT NULL DEFAULT 'none' CHECK(disruption_state IN ('none','delayed','cancelled','diverted','unknown')),
  live_data_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_data_enabled IN (0,1)),
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  CHECK(scheduled_arrival_utc >= scheduled_departure_utc)
);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  from_item_id TEXT NOT NULL,
  to_item_id TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'unknown' CHECK(connection_type IN ('protected','self_transfer','planned_transfer','logical','unknown')),
  minimum_buffer_minutes INTEGER CHECK(minimum_buffer_minutes IS NULL OR minimum_buffer_minutes >= 0),
  recommended_buffer_minutes INTEGER CHECK(recommended_buffer_minutes IS NULL OR recommended_buffer_minutes >= 0),
  requires_baggage_reclaim INTEGER NOT NULL DEFAULT 0 CHECK(requires_baggage_reclaim IN (0,1)),
  requires_immigration INTEGER NOT NULL DEFAULT 0 CHECK(requires_immigration IN (0,1)),
  requires_security INTEGER NOT NULL DEFAULT 0 CHECK(requires_security IN (0,1)),
  requires_terminal_change INTEGER NOT NULL DEFAULT 0 CHECK(requires_terminal_change IN (0,1)),
  requires_airport_change INTEGER NOT NULL DEFAULT 0 CHECK(requires_airport_change IN (0,1)),
  user_override INTEGER NOT NULL DEFAULT 0 CHECK(user_override IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY(from_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  FOREIGN KEY(to_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  CHECK(from_item_id <> to_item_id),
  UNIQUE(from_item_id, to_item_id)
);

CREATE INDEX idx_transport_type ON transport_segments(transport_type);
CREATE INDEX idx_connections_from ON connections(from_item_id);
CREATE INDEX idx_connections_to ON connections(to_item_id);
