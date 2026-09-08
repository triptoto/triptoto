import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync("public/mobile-app.js", "utf8");
const css = fs.readFileSync("public/mobile-app.css", "utf8");

for (const token of [
  "--space-1:4px",
  "--space-8:40px",
  "--radius-control:12px",
  "--radius-regular:16px",
  "--radius-hero:22px",
  "--control-height:52px",
  "--row-height:74px",
  "--ds-shadow:none",
]) {
  assert.ok(css.includes(token), `missing unified design token ${token}`);
}

for (const primitive of [
  "function PageShell(",
  "function AppHeader(",
  "function FlatList(",
  "function FlatRow(",
  "function PastelIcon(",
  "function ChoiceTile(",
  "function HeroSummary(",
  "function TimelineRow(",
  "function FormField(",
  "function PrimaryButton(",
  "function SecondaryButton(",
  "function StatusLabel(",
  "function ProgressSummary(",
  "function BottomNavigation(",
  "function EmptyState(",
  "function LoadingState(",
  "function ErrorState(",
]) {
  assert.ok(js.includes(primitive), `missing shared primitive ${primitive}`);
}

for (const routeMarkup of [
  "ds-flat-row trip-option-card",
  "ds-flat-row add-intent-row",
  "ds-flat-row day-plan-row",
  "ds-flat-row travel-row",
  "trip-list-row ds-flat-row",
]) {
  assert.ok(js.includes(routeMarkup), `route is not using the shared flat-row grammar: ${routeMarkup}`);
}

assert.match(css, /trip-options-page[^{]*trip-options-grid\{[^}]*grid-template-columns:1fr!important/);
assert.match(css, /trip-options-page[^{]*trip-option-card\{[^}]*background:transparent!important/);
assert.match(css, /add-intent-page[^{]*add-intent-row\{[^}]*border-bottom:1px solid var\(--line\)/);
assert.match(css, /save-later-page[^{]*save-later-row\{[^}]*background:transparent/);
assert.match(css, /dark-detail[^{]*fd-list\{[^}]*box-shadow:none/);
assert.ok(js.includes('fd-list fd-list--detail'), 'all booking detail variants must use the compact shared detail list');
assert.match(css, /dark-detail[^{]*fd-list--detail\{[^}]*border:0!important/);
const flightDetail = js.slice(js.indexOf('function flightScreen()'), js.indexOf('function durationLabel()'));
assert.ok(flightDetail.includes('flightDetailsList = fdList('), 'flight detail must use the shared flat-list layout');
assert.ok(!flightDetail.includes('fdSection(') && !flightDetail.includes('fd-list__section'), 'flight detail must not insert redundant section headings');
assert.match(css, /flight-detail-screen \.fd-list--detail\{[^}]*margin-top:0!important/);
assert.match(css, /flight-detail-screen[^{]*fd-row\{[^}]*min-height:60px!important/);
assert.ok(js.includes('collection-schedule__helper'), 'neighborhood schedule explanation must stay with the date field');
assert.match(css, /collection-form-screen[^{]*collection-schedule\{[^}]*grid-column:1\/-1/);
assert.ok(js.includes('function sheetActionRow('), 'item action sheets must share one row primitive');
assert.ok(!js.includes('class="stop-action'), 'legacy nested-card action rows must not survive in item sheets');
assert.match(css, /bottom-sheet[^{]*sheet-action-row\{[^}]*grid-template-columns:40px minmax\(0,1fr\) 20px!important/);
assert.ok(js.includes('[["", "Choose a type"]'), 'an unset place type must read as a clear choice');
assert.ok(js.includes('field("status", "Status", "", { type: "select", choices: statusChoices })'), 'place status must use the full-width shared control');
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*quick-primary-fields[^{]*\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*form-field :is\(input,select,textarea\)\{[^}]*border:1px solid var\(--line-strong\)!important/);
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*form-field select\{[^}]*background-image:url/);
assert.ok(js.includes('function tripsPageHeader(') && js.includes('class="screen trips-screen"'), 'Trips root must use the shared application shell');
const tripsInventory = js.slice(js.indexOf('function tripsPageHeader('), js.indexOf('function meaningfulBookingStatus('));
assert.ok(!tripsInventory.includes('trips-fab') && tripsInventory.includes('bottomNav("trips")'), 'Trips must keep navigation in flow and create from the header');
assert.match(css, /trips-screen[^}]*trips-page\{[^}]*background:var\(--paper\)/);
assert.match(css, /trip-create-screen \.trip-create-head\{[^}]*background:transparent!important/);
assert.match(css, /trip-create-screen \.trip-create-route\{[^}]*display:none!important/);

console.log("Unified Tripto Flat Travel design-system contract passed.");
