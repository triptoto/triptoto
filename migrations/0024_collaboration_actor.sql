-- Collaboration V1: attribute each change to the account or device that made it.
-- Additive only; existing rows keep NULL actor columns (unknown/legacy actor).
-- No paid gate is implied by these columns — attribution applies to every member
-- (owner/editor) equally.
ALTER TABLE change_events ADD COLUMN actor_user_id TEXT;
ALTER TABLE change_events ADD COLUMN actor_device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_change_events_actor ON change_events(trip_id, actor_user_id, created_at);
