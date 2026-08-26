PRAGMA foreign_keys = OFF;

-- A manually entered flight may have a confirmed departure before its arrival
-- details are available.  Preserve every existing row while relaxing only the
-- scheduled-arrival invariant; scheduled information is never treated as live.
CREATE TABLE flights_v2 (
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
  scheduled_arrival_utc INTEGER,
  estimated_departure_utc INTEGER,
  estimated_arrival_utc INTEGER,
  actual_departure_utc INTEGER,
  actual_arrival_utc INTEGER,
  operational_phase TEXT NOT NULL DEFAULT 'scheduled' CHECK(operational_phase IN ('scheduled','boarding','departed','en_route','landed','unknown')),
  disruption_state TEXT NOT NULL DEFAULT 'none' CHECK(disruption_state IN ('none','delayed','cancelled','diverted','unknown')),
  live_data_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_data_enabled IN (0,1)),
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE,
  CHECK(scheduled_arrival_utc IS NULL OR scheduled_arrival_utc >= scheduled_departure_utc)
);

INSERT INTO flights_v2 (
  trip_item_id, marketing_airline_code, marketing_flight_number,
  operating_airline_code, operating_flight_number, departure_terminal,
  departure_gate, arrival_terminal, arrival_gate, boarding_time_utc,
  gate_close_time_utc, scheduled_departure_utc, scheduled_arrival_utc,
  estimated_departure_utc, estimated_arrival_utc, actual_departure_utc,
  actual_arrival_utc, operational_phase, disruption_state, live_data_enabled
)
SELECT
  trip_item_id, marketing_airline_code, marketing_flight_number,
  operating_airline_code, operating_flight_number, departure_terminal,
  departure_gate, arrival_terminal, arrival_gate, boarding_time_utc,
  gate_close_time_utc, scheduled_departure_utc, scheduled_arrival_utc,
  estimated_departure_utc, estimated_arrival_utc, actual_departure_utc,
  actual_arrival_utc, operational_phase, disruption_state, live_data_enabled
FROM flights;

DROP TABLE flights;
ALTER TABLE flights_v2 RENAME TO flights;

PRAGMA foreign_keys = ON;
