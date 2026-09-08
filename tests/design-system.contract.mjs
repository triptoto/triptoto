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
assert.match(css, /dark-detail[^{]*fd-list--detail\{[^}]*box-shadow:none/);
assert.ok(js.includes('fd-list fd-list--detail'), 'all booking detail variants must use the compact shared detail list');
assert.match(css, /dark-detail[^{]*fd-list--detail\{[^}]*border:1px solid var\(--line\)/);
const flightDetail = js.slice(js.indexOf('function flightScreen()'), js.indexOf('function durationLabel()'));
assert.ok(flightDetail.includes('flightDetailsList = fdList('), 'flight detail must use the shared flat-list layout');
assert.ok(!flightDetail.includes('fdSection(') && !flightDetail.includes('fd-list__section'), 'flight detail must not insert redundant section headings');
assert.match(css, /flight-detail-screen \.fd-list--detail\{[^}]*margin-top:0!important/);
assert.match(css, /flight-detail-screen[^{]*fd-row\{[^}]*min-height:60px!important/);
assert.ok(js.includes('collection-schedule__helper'), 'neighborhood schedule explanation must stay with the date field');
assert.match(css, /collection-form-screen[^{]*collection-schedule\{[^}]*grid-column:1\/-1/);
assert.ok(js.includes('function sheetActionRow('), 'item action sheets must share one row primitive');
assert.ok(js.includes('function sheetActionLink('), 'popup links must use the shared action-row grammar');
assert.ok(js.includes('function sheetActionList('), 'popup action groups must use the shared compact list primitive');
assert.ok(!js.includes('class="stop-action'), 'legacy nested-card action rows must not survive in item sheets');
assert.match(css, /bottom-sheet[^{]*sheet-action-row\{[^}]*grid-template-columns:36px minmax\(0,1fr\) 20px/);
assert.match(css, /bottom-sheet[^{]*sheet-action-list\{[^}]*gap:var\(--space-1\)[^}]*border:0/);
assert.match(css, /bottom-sheet[^{]*sheet-option\.sheet-action-row\{[^}]*border:0/);
assert.match(css, /bottom-sheet\.compact-sheet\{[\s\S]*?--compact-sheet-max-height:min\(calc\(var\(--app-viewport-height,100dvh\) - 12px\),560px\)/, 'every bottom sheet needs the compact viewport cap');
assert.match(css, /bottom-sheet\.compact-sheet \.sheet-scroll\{[\s\S]*?flex:0 1 auto;[\s\S]*?max-height:none;[\s\S]*?overflow-y:auto/, 'long popup content must scroll inside the compact shell');
assert.match(css, /bottom-sheet\.compact-sheet \.sheet-option\.sheet-action-row\{[\s\S]*?min-height:48px/, 'one-line popup actions must keep one shared touch-safe height');
assert.match(css, /sheet-action-row:has\(\.sheet-action-row__copy small\)\{[\s\S]*?min-height:56px/, 'two-line popup actions must keep one shared compact height');
assert.match(css, /sheet-action-row:focus-visible\{[\s\S]*?outline:2px solid var\(--accent\)[\s\S]*?box-shadow:none/, 'keyboard focus must use the shared visible outline, not an inset rail');
assert.match(css, /discard-dialog\{[\s\S]*?max-height:calc\(var\(--app-viewport-height,100dvh\) - 32px\)[\s\S]*?overflow-y:auto/, 'confirmation popups must stay compact and scroll safely on short screens');
const popupMenu = (start, end) => js.slice(js.indexOf(start), js.indexOf(end, js.indexOf(start)));
for (const [start, end, name] of [
  ['function manageBookingSheet()', 'function bookingAnchorDate(', 'booking actions'],
  ['function addSheet()', 'function tripOptionsScreen(', 'add actions'],
  ['function manualBookingSheet()', 'function documentSheet(', 'manual booking chooser'],
  ['function tripSwitchSheet()', 'function bookingEmailTripSheet(', 'trip chooser'],
  ['function bookingEmailTripSheet()', 'function firstRunHowSheet(', 'email trip chooser'],
  ['function helpSheet()', 'function skeletonRows(', 'help menu'],
]) {
  const source = popupMenu(start, end);
  assert.ok(source.includes('sheetActionList') && source.includes('sheetActionRow'), `${name} must use the compact popup action system`);
  assert.ok(!source.includes('sheet-options-group--v2'), `${name} must not fall back to legacy popup rows`);
}
const collectionActionMenu = popupMenu('function collectionStopSheet()', '// One app-controlled confirmation');
assert.ok(collectionActionMenu.includes('sheetActionList') && !collectionActionMenu.includes('stopSheetMeta'), 'Neighborhood place actions must stay compact and action-focused');
assert.ok(js.includes('[["", "Choose a type"]'), 'an unset place type must read as a clear choice');
assert.ok(js.includes('field("status", "Status", "", { type: "select", choices: statusChoices })'), 'place status must use the full-width shared control');
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*quick-primary-fields[^{]*\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*form-field :is\(input,select,textarea\)\{[^}]*border:1px solid var\(--line-strong\)!important/);
assert.match(css, /premium-form:not\(\.trip-create-form\)[^{]*form-field select\{[^}]*background-image:url/);
assert.match(css, /\.date-range-trigger\{[^}]*min-height:var\(--control-height\)[^}]*padding:0 var\(--space-3\)[^}]*border-radius:var\(--radius-control\)/, 'date controls must use the shared input height and control rhythm');
assert.match(css, /\.date-range-trigger__icon\{[^}]*width:40px[^}]*height:40px[^}]*border-radius:var\(--radius-control\)/, 'date controls must use the same icon geometry as form controls');
assert.match(css, /\.form-fields--flight-when\{[^}]*align-items:start/, 'flight date and departure-time labels must share a top edge');
assert.match(css, /\.form-fields--flight-when>\.form-field>input\{[^}]*min-height:var\(--control-height\)/, 'flight departure time must match the shared date control height');
assert.ok(js.includes('function tripsPageHeader(') && js.includes('class="screen trips-screen"'), 'Trips root must use the shared application shell');
const tripsInventory = js.slice(js.indexOf('function tripsPageHeader('), js.indexOf('function meaningfulBookingStatus('));
assert.ok(!tripsInventory.includes('trips-fab') && tripsInventory.includes('bottomNav("trips")'), 'Trips must keep navigation in flow and create from the header');
assert.match(css, /trips-screen[^}]*trips-page\{[^}]*background:var\(--paper\)/);
assert.match(css, /trip-create-screen \.trip-create-head\{[^}]*background:transparent!important/);
assert.match(css, /trip-create-screen \.trip-create-route\{[^}]*display:none!important/);

assert.match(css, /ds-grouped-card\{[^}]*padding:var\(--space-4\)[^}]*border:1px solid var\(--line\)[^}]*border-radius:var\(--radius-regular\)/, 'grouped surfaces must use shared spacing and border tokens');
assert.ok(!/\b(?:window\.)?(?:confirm|prompt)\(/.test(js.replace(/^\s*\/\/.*$/gm, '')), 'app-owned confirmation flows must use the shared accessible dialog');
assert.ok(js.includes('confirmationText: "DELETE"') && js.includes('input.value !== confirmationText'), 'account deletion must preserve exact typed confirmation');
assert.ok(js.includes('awaitingConfirmation') && js.includes('if (!activeActivities.size || awaitingConfirmation)'), 'waiting for confirmation is not network activity');
console.log("Unified Tripto Elegant Flat Cards design-system contract passed.");
