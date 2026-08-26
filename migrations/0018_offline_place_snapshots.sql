-- Stable offline place identity and traveler-facing snapshot fields.
-- Additive only: existing locations remain valid with NULL values.
ALTER TABLE locations ADD COLUMN place_id TEXT;
ALTER TABLE locations ADD COLUMN country_name TEXT;
ALTER TABLE locations ADD COLUMN region TEXT;

CREATE INDEX IF NOT EXISTS idx_locations_place_id ON locations(place_id);
