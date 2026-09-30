// Integration scenario for the trip → PDF export model builder.
//
// Extracts the real buildTripExportModel / pdfExportCard mapping from
// mobile-app.js, drives it with a representative in-memory trip (every booking
// type, checklist, documents, a cancelled and a Save-for-Later item) and feeds
// the resulting blocks into the *shipped* PDF renderer bundle
// (public/pdf-export.js). Verifies privacy gating (nothing sensitive leaks
// unless opted in) and that the model always produces a valid, paginated PDF.
// No network, no DOM, no services.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

// --- The shipped renderer bundle (same one the app lazy-loads) ------------
const rctx = {
  console, Math, String, Array, Object, Map, Set, JSON, Number, Boolean,
  Uint8Array, Int32Array, Uint16Array, Uint32Array, Int8Array, Int16Array,
  Float32Array, Float64Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Error,
};
rctx.globalThis = rctx;
vm.createContext(rctx);
vm.runInContext(readFileSync("public/pdf-export.js", "utf8"), rctx);
const render = rctx.TriptoPdfExport.render;

// --- Real model builder, sliced out of mobile-app.js ----------------------
const source = readFileSync("public/mobile-app.js", "utf8");
const slice = source.slice(
  source.indexOf("  // ===== Export trip to PDF"),
  source.indexOf("  function tripOptionsScreen()"),
);

// --- Representative trip state (synthetic travel data) --------------------
const departure = Date.UTC(2026, 9, 12, 6, 15);
const arrival = Date.UTC(2026, 9, 12, 9, 40);
const trainOut = Date.UTC(2026, 9, 14, 8, 0);
const state = {
  trip: { id: "trip-1", title: "Итальянский маршрут — Rome & Florence", starts_on: "2026-10-12", ends_on: "2026-10-18" },
  travelers: [
    { id: "traveler", display_name: "Arthur", traveler_type: "adult" },
    { id: "traveler-2", display_name: "Maya", traveler_type: "adult" },
  ],
  transport: [
    { id: "flight", trip_item_id: "flight", type: "transport", transport_type: "flight", title: "LY 383", status: "confirmed", carrier_name: "EL AL", service_number: "383", departure_location_id: "tlv", arrival_location_id: "fco", scheduled_departure_utc: departure, scheduled_arrival_utc: arrival, departure_timezone: "Asia/Jerusalem", arrival_timezone: "Europe/Rome", departure_terminal: "3", booking_reference: "ABC123", traveler_ids: "traveler,traveler-2", notes: "Window seats requested." },
    { id: "train", trip_item_id: "train", type: "transport", transport_type: "train", title: "Frecciarossa 9512", status: "confirmed", carrier_name: "Trenitalia", service_number: "9512", departure_location_id: "termini", arrival_location_id: "florence", scheduled_departure_utc: trainOut, scheduled_arrival_utc: trainOut + 5700000, departure_timezone: "Europe/Rome", arrival_timezone: "Europe/Rome", departure_platform: "8", booking_reference: "TRN48291", traveler_ids: "traveler,traveler-2" },
  ],
  stays: [
    { id: "stay", trip_item_id: "stay", type: "stay", status: "confirmed", title: "Hotel Artemide", property_name: "Hotel Artemide", property_location_id: "hotel", check_in_date: "2026-10-12", check_in_from: "15:00", check_out_date: "2026-10-18", check_out_by: "11:00", confirmation_number: "HTL-48291", street_address: "Via Nazionale 22, Rome" },
  ],
  timeline: [
    { id: "flight", type: "transport", status: "confirmed", title: "Flight to Rome", subtitle: "LY 383 · TLV → FCO", starts_at_utc: departure, ends_at_utc: arrival, start_timezone: "Asia/Jerusalem", end_timezone: "Europe/Rome", confidence: "confirmed", notes: "Window seats requested." },
    { id: "transfer", type: "transfer", status: "confirmed", title: "Airport to hotel", subtitle: "Private transfer", starts_at_utc: arrival + 45 * 60000, start_timezone: "Europe/Rome" },
    { id: "stay", type: "stay", status: "confirmed", title: "Hotel Artemide", subtitle: "Check-in", starts_at_utc: arrival + 2 * 3600000, start_timezone: "Europe/Rome" },
    { id: "vatican", type: "activity", status: "confirmed", title: "Vatican Museums", subtitle: "Entrance reservation", starts_at_utc: Date.UTC(2026, 9, 13, 8, 0), ends_at_utc: Date.UTC(2026, 9, 13, 10, 0), start_timezone: "Europe/Rome", end_timezone: "Europe/Rome", start_location_id: "vatican", confirmation_number: "VAT-29184" },
    { id: "cancelled-dinner", type: "activity", status: "cancelled", title: "Dinner (cancelled)", subtitle: "Trattoria", starts_at_utc: Date.UTC(2026, 9, 13, 18, 0), start_timezone: "Europe/Rome" },
    { id: "train", type: "transport", status: "confirmed", title: "Train to Florence", subtitle: "Frecciarossa 9512", starts_at_utc: trainOut, ends_at_utc: trainOut + 5700000, start_timezone: "Europe/Rome", end_timezone: "Europe/Rome" },
    { id: "idea", type: "activity", status: "idea", title: "Maybe a cooking class", subtitle: "Save for later" }, // no start → excluded
  ],
  locations: [
    { id: "tlv", type: "airport", display_name: "Tel Aviv (TLV)", city: "Tel Aviv", iata_code: "TLV" },
    { id: "fco", type: "airport", display_name: "Rome Fiumicino (FCO)", city: "Rome", iata_code: "FCO" },
    { id: "termini", type: "station", display_name: "Roma Termini", city: "Rome" },
    { id: "florence", type: "station", display_name: "Firenze S.M.N.", city: "Florence" },
    { id: "vatican", type: "venue", display_name: "Vatican Museums", city: "Rome", formatted_address: "Viale Vaticano, Rome" },
    { id: "hotel", type: "hotel", display_name: "Hotel Artemide", city: "Rome" },
  ],
  bookingDetails: [
    { trip_item_id: "flight", traveler_id: "traveler", display_name: "Arthur", seat: "12A", cabin_class: "Economy", ticket_number: "114-1234567890" },
  ],
  contacts: [],
  checklist: [
    { id: "c1", title: "Passport", category: "documents", completed: true, traveler_id: "traveler" },
    { id: "c2", title: "Pack adapter", category: "packing", completed: false },
  ],
  documents: [
    { id: "d1", title: "LY 383 Boarding Pass", type: "boarding_pass" },
    { id: "d2", title: "Hotel Artemide Confirmation", type: "hotel_confirmation" },
  ],
  syncStatus: { pendingOperations: 0 },
  exportPdf: {},
};

// --- Minimal, faithful stubs for the leaf helpers -------------------------
const val = (row, ...keys) => keys.map((k) => row?.[k]).find((v) => v != null && v !== "") ?? null;
const itemId = (row) => String(row?.id || row?.trip_item_id || "");
const locById = (id) => state.locations.find((l) => String(l.id) === String(id)) || null;
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) : "Date unavailable");
const fmtTime = (ms) => (ms == null ? "—" : new Date(ms).toISOString().slice(11, 16));
const fmtDT = (ms, tz) => (ms == null ? "Unavailable" : `${new Date(ms).toISOString().slice(0, 16)} ${tz || ""}`.trim());

const ctx = {
  state, val, itemId, Math, String, Number, Boolean, Object, Array, Date, JSON, Uint8Array, Intl, isNaN, parseInt, parseFloat,
  loadModule: () => Promise.resolve({}),
  fetch: () => Promise.reject(new Error("no network in test")),
  navigator: {}, document: undefined, URL: globalThis.URL, Blob: class {}, File: class {},
  render: () => {}, showToast: () => {}, closeSheet: () => {}, openSheet: () => {},
  esc: (v) => String(v ?? ""), icon: () => "", bottomSheet: (id, t, b) => b,
  timelineType: (item) => {
    const t = state.transport.find((x) => itemId(x) === itemId(item));
    if (t) return String(val(t, "transport_type") || "transport");
    if (item.type === "stay") return "hotel";
    return item.type || "document";
  },
  transportForItem: (id) => state.transport.find((x) => itemId(x) === String(id)) || null,
  stayForItem: (id) => state.stays.find((x) => itemId(x) === String(id)) || null,
  locationById: locById,
  locationName: (id) => { const l = locById(id); return l ? String(val(l, "display_name", "formatted_address") || "Location") : "Location unavailable"; },
  isCancelled: (item) => ["cancelled", "skipped"].includes(String(val(item, "status", "booking_status") || "")),
  isTimelineVisibleItem: (item) => {
    const type = String(val(item, "type", "kind") || "");
    if ((type === "activity" || type === "reservation") && val(item, "starts_at_utc", "startsAtUtc") == null) return false; // Save for Later
    return true;
  },
  timelineDay: (ms) => (ms == null ? { key: "unavailable", date: "Unavailable" } : { key: new Date(ms).toISOString().slice(0, 10), date: new Date(ms).toISOString().slice(0, 10) }),
  timelineException: (item) => (["cancelled", "skipped"].includes(String(val(item, "status") || "")) ? { label: "Cancelled", tone: "danger" } : null),
  nights: (s) => { const a = val(s, "check_in_date"), b = val(s, "check_out_date"); if (!a || !b) return "—"; return String(Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000)); },
  formatTripDates: (trip) => `${val(trip, "starts_on")} – ${val(trip, "ends_on")}`,
  formatDateOnly: fmtDate, formatTime: fmtTime, formatDateTime: fmtDT,
  tripDefaultTimezone: () => "Europe/Rome",
  dateFormatter: () => ({ format: (d) => new Date(d).toISOString(), formatToParts: () => [] }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(slice, ctx);

// --- Assertions: privacy gating ------------------------------------------
const asText = (model) => JSON.stringify(model.blocks);

const noneOn = ctx.buildTripExportModel({ travelers: false, refs: false, notes: false, checklist: false });
const allOn = ctx.buildTripExportModel({ travelers: true, refs: true, notes: true, checklist: true });

assert(!asText(noneOn).includes("ABC123"), "booking references must be absent when the refs toggle is off");
assert(!asText(noneOn).includes("TRN48291"), "all booking references gated by the refs toggle");
assert(!asText(noneOn).includes("114-1234567890"), "ticket numbers gated by the refs toggle");
assert(!asText(noneOn).includes("Maya"), "traveller names must be absent when the travellers toggle is off");
assert(!asText(noneOn).includes("Window seats requested"), "personal notes gated by the notes toggle");

assert(asText(allOn).includes("ABC123"), "booking reference included when refs enabled");
assert(asText(allOn).includes("Maya"), "traveller names included when travellers enabled");
assert(asText(allOn).includes("Window seats requested"), "notes included when notes enabled");

// Filename must never carry traveller names or references.
assert(/^tripto-.*-2026-10-12_2026-10-18\.pdf$/.test(allOn.filename), `safe filename with date range, got ${allOn.filename}`);
assert(!allOn.filename.includes("ABC123") && !/maya|arthur/i.test(allOn.filename), "filename leaks no sensitive data");

// Save-for-Later idea excluded; cancelled booking retained but marked.
assert(!asText(allOn).includes("cooking class"), "unscheduled Save-for-Later ideas are excluded");
assert(asText(allOn).includes("This booking is cancelled."), "cancelled bookings are kept and clearly marked");

// Documents index carries safe labels only, never files/URLs.
assert(asText(allOn).includes("LY 383 Boarding Pass"), "documents index lists safe labels");
assert(asText(allOn).includes("The files themselves are not included"), "documents index states files are excluded");

// Checklist opt-in.
assert(!asText(noneOn).includes("Pack adapter"), "checklist gated by its toggle");
assert(asText(allOn).includes("Pack adapter"), "checklist included when enabled");

// --- The model must render to a valid, paginated PDF ---------------------
const F = "public/vendor/pdf/standard_fonts/";
const fonts = {
  regular: new Uint8Array(readFileSync(F + "LiberationSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync(F + "LiberationSans-Bold.ttf")),
  italic: new Uint8Array(readFileSync(F + "LiberationSans-Italic.ttf")),
};
const out = render({ fonts, headerLeft: allOn.headerLeft, headerRight: allOn.headerRight, footer: allOn.footer, blocks: allOn.blocks });
assert(out.bytes.length > 1000 && out.pageCount >= 1, "model renders to a valid PDF");
assert.equal(out.hasUnsupported, false, "Latin+Cyrillic itinerary renders without unsupported glyphs");

if (process.env.PDF_DUMP) writeFileSync(process.env.PDF_DUMP, out.bytes);

console.log(`PDF export model scenario passed: privacy gating, cancellations, Save-for-Later exclusion, safe filename, ${out.pageCount}-page render.`);
