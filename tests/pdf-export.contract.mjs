// Contract for the client-side PDF exporter bundle (public/pdf-export.js).
//
// Validates the *shipped* IIFE bundle end to end: it must expose
// TriptoPdfExport.render, embed CIDFontType2 / Identity-H fonts with a
// ToUnicode CMap (so the PDF has real selectable/searchable text), paginate,
// and honestly report unsupported-glyph fallback. No network, no services.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("public/pdf-export.js", "utf8");
const ctx = {
  console, Math, String, Array, Object, Map, Set, JSON, Number, Boolean,
  Uint8Array, Int32Array, Uint16Array, Uint32Array, Int8Array, Int16Array,
  Float32Array, Float64Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Error,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const api = ctx.TriptoPdfExport;
assert(api && typeof api.render === "function", "TriptoPdfExport.render must be exposed by the bundle");

const F = "public/vendor/pdf/standard_fonts/";
const fonts = {
  regular: new Uint8Array(readFileSync(F + "LiberationSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync(F + "LiberationSans-Bold.ttf")),
  italic: new Uint8Array(readFileSync(F + "LiberationSans-Italic.ttf")),
};

const blocks = [
  { type: "title", text: "Маршрут Rome Тест" },
  { type: "subtitle", text: "Rome · Florence — 12–24 Oct 2026" },
  { type: "meta", text: "Generated 10 Sep 2026 (Europe/Rome)" },
  { type: "daysep", text: "Day 1 — 12 Oct 2026", sub: "Rome, Italy" },
  {
    type: "card", accent: [0.16, 0.42, 0.85],
    title: "Flight LY 381 — TLV → FCO", titleRight: "08:15 → 11:40", badge: "FLIGHT",
    subtitle: "El Al", rows: [{ label: "Booking", value: "PNR ABC123" }],
    notes: ["Scheduled time — never presented as a live status."],
  },
  { type: "sectionhead", text: "Trip checklist" },
  { type: "checkitem", text: "Passports valid", done: true, who: "Alex" },
];

const res = api.render({
  fonts, headerLeft: "Маршрут Тест", headerRight: "tripto.to",
  footer: "Itinerary snapshot · not a live status", blocks,
});

assert(res.bytes instanceof Uint8Array && res.bytes.length > 500, "render must return PDF bytes");
assert.equal(typeof res.pageCount, "number");
assert(res.pageCount >= 1, "at least one page");

const s = Buffer.from(res.bytes).toString("latin1");
assert(s.startsWith("%PDF-1.7"), "PDF header");
assert(s.includes("/Type/Catalog"), "catalog present");
assert(s.includes("/Type/Pages"), "page tree present");
assert(s.includes("/Subtype/Type0"), "composite Type0 font");
assert(s.includes("/Subtype/CIDFontType2"), "CIDFontType2 descendant");
assert(s.includes("/Encoding/Identity-H"), "Identity-H encoding");
assert(s.includes("/ToUnicode"), "ToUnicode CMap for selectable text");
assert(s.includes("/FontFile2"), "embedded TrueType program");
assert(s.includes("/CIDToGIDMap/Identity"), "Identity CIDToGIDMap");
assert(s.trimEnd().endsWith("%%EOF"), "proper EOF");

// Supported scripts (Latin + Cyrillic) must not be flagged as unsupported.
assert.equal(res.hasUnsupported, false, "Latin+Cyrillic content is fully supported by the embedded fonts");

// Scripts the vendored fonts do not cover must be reported honestly.
const cjk = api.render({ fonts, headerLeft: "x", footer: "y", blocks: [{ type: "title", text: "房间 בדיקה" }] });
assert.equal(cjk.hasUnsupported, true, "CJK/Hebrew must be reported as unsupported, never silently mis-rendered");

// Pagination: a dense trip must span multiple pages without error.
const dense = [];
for (let d = 1; d <= 20; d++) {
  dense.push({ type: "daysep", text: `Day ${d}` });
  dense.push({ type: "card", accent: [0, 0.55, 0.5], title: `Booking ${d}`, rows: [{ label: "Ref", value: "ABC" + d }] });
}
const big = api.render({ fonts, headerLeft: "Trip", footer: "snapshot", blocks: dense });
assert(big.pageCount >= 2, "a dense multi-day trip paginates across pages");

console.log("PDF export contract passed: Type0/Identity-H fonts, ToUnicode text, pagination, honest unsupported-glyph reporting.");
