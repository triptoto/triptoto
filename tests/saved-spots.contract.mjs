import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(path, "utf8");
const app = read("public/mobile-app.js");
const css = read("public/mobile-app.css");
const routes = read("public/mobile-routes.js");

// ---------------------------------------------------------------------------
// UI wiring: the feature lives on the Trip Options travel-tools grid, opens a
// dedicated screen, and exposes both actions (Save here + My spots list).
// ---------------------------------------------------------------------------
assert(
  app.includes('optionCard("spots", "pin", "Save Spots"') && app.includes('data-action="open-spots"'),
  "Save Spots tile is missing from the travel-tools grid",
);
assert(app.includes('case "spots": html = spotsScreen();'), "Save Spots screen is not routed");
assert(routes.includes('spots: "/saved-spots"'), "Save Spots URL route is missing");
assert(app.includes('spots: "trip-options"'), "Back-fallback for the spots screen is missing");
assert(app.includes('spots: "Save Spots"'), "SEO/page title for the spots screen is missing");

// Spots are scoped to the active trip only — the old "All spots" toggle is gone.
assert(!app.includes('data-action="spot-scope"'), "The cross-trip 'All spots' toggle must be removed");
assert(
  app.includes('all.filter((spot) => String(spot.tripId || "") === String(state.trip.id))'),
  "Spots list must filter to the active trip",
);

for (const action of [
  "open-spots",
  "spot-detect",
  "spot-redetect",
  "spot-save-confirm",
  "spot-route",
  "spot-nav",
  "spot-copy-coords",
  "spot-menu",
  "spot-edit",
  "spot-edit-save",
  "spot-delete",
  "spot-export",
  "spot-import",
]) {
  assert(app.includes(`case "${action}"`), `Event handler for ${action} is missing`);
}

// The save CTA must be user-initiated (a button), never an automatic geolocate.
assert(app.includes('data-action="spot-detect"') && app.includes("Save spot"), "Save-spot CTA is missing");

// ---------------------------------------------------------------------------
// Privacy + honesty guarantees in the copy.
// ---------------------------------------------------------------------------
assert(app.includes("tripto.to only sends these coordinates"), "Route sheet must state only coordinates are shared");
assert(
  app.includes("Spots are saved only on this device"),
  "Footer must tell the user spots are device-local",
);

// ---------------------------------------------------------------------------
// Local storage: dedicated owner-scoped IndexedDB store, cleared on wipe.
// ---------------------------------------------------------------------------
assert(app.includes("indexedDB.open(LOCAL_DOC_DB, 3)"), "Local doc DB must be bumped to v3 for the spots store");
assert(
  app.includes('db.createObjectStore("spots", { keyPath: "id" })') && app.includes('spots.createIndex("owner"'),
  "spots object store + owner index are missing",
);
assert(
  app.includes('.index("owner").getAll(owner)') && app.includes("row.owner === owner"),
  "Spots must be read filtered by owner so accounts stay isolated",
);
assert(app.includes('["docs", "bookingDrafts", "spots"]'), "clearLocalDeviceData must also clear the spots store");

// ---------------------------------------------------------------------------
// Single-shot geolocation only: getCurrentPosition, fresh fix, no tracking.
// ---------------------------------------------------------------------------
assert(app.includes("navigator.geolocation.getCurrentPosition("), "Single-shot geolocation call is missing");
assert(!app.includes(".watchPosition("), "Saved spots must never use background watchPosition tracking");
assert(app.includes("maximumAge: 0"), "Geolocation must force a fresh fix (maximumAge:0)");

// ---------------------------------------------------------------------------
// Styling present and responsive, using shared tokens/components.
// ---------------------------------------------------------------------------
for (const selector of [".spots-page", ".spots-intro", ".spot-card", ".spot-empty", ".spot-footer"]) {
  assert(css.includes(selector), `CSS for ${selector} is missing`);
}
assert(/\.spots-page\{padding-inline:12px\}/.test(css) || css.includes(".spots-page{padding-inline:12px}"), "Small-screen spots styling is missing");

// ---------------------------------------------------------------------------
// Pure helpers: slice them out of the bundle and exercise the real logic.
// ---------------------------------------------------------------------------
const blockA = app.slice(
  app.indexOf("const SPOT_SCHEMA_VERSION = 1;"),
  app.indexOf("async function listSpots()"),
);
const validate = app.slice(
  app.indexOf("function validateSpotImport(parsed)"),
  app.indexOf("async function importSpotsFromFile(file)"),
);
assert(blockA && validate, "Could not locate the pure spot helpers in the bundle");

const helpers = runInNewContext(
  `${blockA}\n${validate}\n({ spotMapLinks, normalizeSpotRow, isFiniteCoord, validateSpotImport, formatCoords, SPOT_MAX, SPOT_ACCURACY_WARN_M })`,
  { crypto: globalThis.crypto, sessionIdentity: () => "owner-a", Date },
);

// Deep links carry only the exact coordinates in the documented formats.
{
  const lat = 48.8584,
    lng = 2.2945;
  const links = helpers.spotMapLinks(lat, lng);
  assert.equal(links.coords, "48.8584,2.2945");
  // Universal https links carrying the "start navigation" intent so the installed
  // app begins routing (not the blank editor). A LITERAL comma is required — a
  // percent-encoded comma (%2C) is not parsed.
  assert.equal(links.google, "https://www.google.com/maps/dir/?api=1&destination=48.8584,2.2945&travelmode=driving&dir_action=navigate");
  assert.equal(links.apple, "https://maps.apple.com/?daddr=48.8584,2.2945&dirflg=d");
  const walk = helpers.spotMapLinks(lat, lng, "walking");
  assert.equal(walk.google, "https://www.google.com/maps/dir/?api=1&destination=48.8584,2.2945&travelmode=walking&dir_action=navigate");
  assert.equal(walk.apple, "https://maps.apple.com/?daddr=48.8584,2.2945&dirflg=w");
  assert.equal(helpers.spotMapLinks(lat, lng, "transit").apple, "https://maps.apple.com/?daddr=48.8584,2.2945&dirflg=r");
  assert.equal(links.waze, "https://waze.com/ul?ll=48.8584,2.2945&navigate=yes");
  for (const url of [links.google, links.apple, links.waze]) {
    assert(!/%2C/i.test(url), "Coordinate comma must not be percent-encoded");
    assert(!/[?&](q|query|name)=/.test(url), "Map links must not send a name/search term");
  }
}

// Coordinate validation rejects out-of-range and non-finite values.
assert(helpers.isFiniteCoord(0, 0));
assert(helpers.isFiniteCoord(-90, 180));
assert(!helpers.isFiniteCoord(91, 0));
assert(!helpers.isFiniteCoord(0, 181));
assert(!helpers.isFiniteCoord(NaN, 0));
assert(!helpers.isFiniteCoord("x", "y"));

// normalizeSpotRow enforces the record schema.
assert.equal(helpers.normalizeSpotRow(null), null, "null input must be rejected");
assert.equal(helpers.normalizeSpotRow({ latitude: 10, longitude: 10 }), null, "missing name must be rejected");
assert.equal(helpers.normalizeSpotRow({ name: "x", latitude: 999, longitude: 10 }), null, "bad coords must be rejected");
{
  const row = helpers.normalizeSpotRow({
    name: " Car ".padEnd(200, "!"),
    note: "n".repeat(900),
    latitude: 12.3456789,
    longitude: 98.7654321,
    accuracy: 42.6,
    approximate: 1,
    tripId: 77,
  });
  assert.equal(row.owner, "owner-a", "owner must come from sessionIdentity()");
  assert.equal(row.schemaVersion, 1);
  assert.equal(row.name.length, 80, "name must be capped at 80 chars");
  assert.equal(row.note.length, 500, "note must be capped at 500 chars");
  assert.equal(row.latitude, 12.345679, "latitude must be rounded to 6 dp");
  assert.equal(row.longitude, 98.765432, "longitude must be rounded to 6 dp");
  assert.equal(row.accuracy, 43, "accuracy must be a rounded integer");
  assert.equal(row.approximate, true, "approximate must be a boolean");
  assert.equal(row.tripId, "77", "tripId must be coerced to string when present");
  assert(row.id.startsWith("spot_"), "a fresh row gets a generated spot_ id");
}
{
  const row = helpers.normalizeSpotRow({ id: "spot_keep", name: "A", latitude: 1, longitude: 2 });
  assert.equal(row.id, "spot_keep", "an existing id is preserved (dedup on re-import)");
  assert.equal(row.tripId, null, "tripId defaults to null for trip-less spots");
}

// Import validation: format/version gate + per-row skipping.
assert.equal(helpers.validateSpotImport({}).ok, false, "non-export files are rejected");
assert.equal(helpers.validateSpotImport({ format: "tripto.spots", version: 999, spots: [] }).ok, false, "newer exports are rejected");
{
  const result = helpers.validateSpotImport({
    format: "tripto.spots",
    version: 1,
    spots: [
      { id: "spot_1", name: "Good", latitude: 5, longitude: 6 },
      { name: "", latitude: 5, longitude: 6 },
      { name: "Bad coords", latitude: 500, longitude: 6 },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.spots.length, 1, "only valid rows survive import validation");
  assert.equal(result.skipped, 2, "invalid rows are counted as skipped");
}

// Re-importing must not overwrite existing ids (dedup by id in the importer).
assert(
  app.includes("if (byId.has(row.id) || bySpot.has(sameSpot(row)))") && app.includes("is never overwritten"),
  "Import must dedup by id and never overwrite an existing spot",
);

// Import guards a maximum file size.
assert(app.includes("SPOT_IMPORT_MAX_BYTES") && app.includes("file.size > SPOT_IMPORT_MAX_BYTES"), "Import must cap file size");
assert.equal(helpers.SPOT_MAX, 200, "Per-device spot cap must be 200");
assert.ok(!app.includes('class="spot-chips"'), "Quick-name chips were removed from the save sheet");

console.log("saved-spots contract: ok");
