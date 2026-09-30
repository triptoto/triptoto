PRAGMA foreign_keys = ON;

-- Stays historically inserted trip_items with a NULL starts_at_utc/ends_at_utc,
-- so every manually-added or imported hotel dropped into the timeline
-- "Date unavailable" bucket even though its check-in/out dates were stored on
-- the stays row. Backfill the sortable UTC anchors from the stay dates. We use
-- noon UTC (matching the app's dateOnlyToUtcMs helper) so the calendar day
-- stays correct once formatted back in any realistic trip time zone.
UPDATE trip_items
SET starts_at_utc = (
      SELECT CAST(strftime('%s', s.check_in_date || ' 12:00:00') AS INTEGER) * 1000
      FROM stays s
      WHERE s.trip_item_id = trip_items.id AND s.check_in_date IS NOT NULL
    )
WHERE type = 'stay'
  AND starts_at_utc IS NULL
  AND EXISTS (
    SELECT 1 FROM stays s
    WHERE s.trip_item_id = trip_items.id AND s.check_in_date IS NOT NULL
  );

UPDATE trip_items
SET ends_at_utc = (
      SELECT CAST(strftime('%s', s.check_out_date || ' 12:00:00') AS INTEGER) * 1000
      FROM stays s
      WHERE s.trip_item_id = trip_items.id AND s.check_out_date IS NOT NULL
    )
WHERE type = 'stay'
  AND ends_at_utc IS NULL
  AND EXISTS (
    SELECT 1 FROM stays s
    WHERE s.trip_item_id = trip_items.id AND s.check_out_date IS NOT NULL
  );
