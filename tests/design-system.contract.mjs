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
assert.ok(js.includes('fd-list--flight'), 'flight detail must use the shared flat-list layout');
assert.ok(js.includes('fdSection("Actions"'), 'flight detail must group actions by intent');
assert.match(css, /flight-detail-screen[^{]*fd-list--flight\{[^}]*border:0!important/);
assert.match(css, /flight-detail-screen[^{]*fd-row\{[^}]*min-height:60px!important/);
assert.ok(js.includes('collection-schedule__helper'), 'neighborhood schedule explanation must stay with the date field');
assert.match(css, /collection-form-screen[^{]*collection-schedule\{[^}]*grid-column:1\/-1/);
assert.ok(js.includes('function sheetActionRow('), 'item action sheets must share one row primitive');
assert.ok(!js.includes('class="stop-action'), 'legacy nested-card action rows must not survive in item sheets');
assert.match(css, /bottom-sheet[^{]*sheet-action-row\{[^}]*grid-template-columns:40px minmax\(0,1fr\) 20px!important/);

console.log("Unified Tripto Flat Travel design-system contract passed.");
