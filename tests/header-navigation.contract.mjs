import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync('public/mobile-app.js', 'utf8');
const tree = ts.createSourceFile('mobile-app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
const get = (...names) => names.map(name => {
  assert(declarations.has(name), `Missing function ${name}`);
  return declarations.get(name);
}).join('\n');
const ctx = vm.createContext({
  state: { screen: 'account', trip: { id: 'trip-1' }, selectedId: null, sheet: null },
  esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  icon: name => `<svg data-icon="${name}"></svg>`,
  collectionForItem: id => id === 'neighborhood-1' ? { id, collection_type: 'neighborhood' } : null,
  collectionConfig: () => ({ stop: 'place' }),
  canEditCurrentTrip: () => ctx.state.trip?.role !== 'viewer',
});
vm.runInContext(readFileSync('public/mobile-routes.js', 'utf8'), ctx);
ctx.routeUrl = (screen, id) => ctx.TriptoRoutes.pathFor(screen, id);
vm.runInContext(get('HeaderNavigation', 'navigationSheet', 'appBar', 'bottomSheet', 'sheetActionLink', 'sheetActionList', 'tripsPageHeader'), ctx);
const html = ctx.navigationSheet();
assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/trips', '/trip-options', '/before-you-go', '/account']);
assert.equal((html.match(/<a /g) || []).length, 4, 'The menu has exactly four destinations');
assert.match(html, /data-screen="account" aria-current="page"/);
assert.match(ctx.HeaderNavigation(), /data-action="open-add"/);
ctx.state.screen = 'collection'; ctx.state.selectedId = 'neighborhood-1';
assert.match(ctx.HeaderNavigation(), /data-action="collection-add-place" data-id="neighborhood-1"/);
ctx.state.trip.role = 'viewer';
assert.doesNotMatch(ctx.HeaderNavigation(), /data-action="collection-add-place"/);
assert.match(ctx.HeaderNavigation(), /data-action="open-add"/, 'View-only users still see the same header; the action guard explains the restriction');
ctx.state.trip = null;
assert.match(ctx.HeaderNavigation(), /aria-label="Create trip"/);
const inventory = ctx.tripsPageHeader();
assert.match(inventory, /data-screen="account"/);
assert.match(inventory, /data-action="create-trip"/);
assert.doesNotMatch(inventory, /open-navigation|open-add|bottom-nav/, 'The protected Trips header keeps its own navigation');
Object.assign(ctx, { PREVIEW_MODE: false, QA_STATE: null });
vm.runInContext(get('shouldShowFirstRun'), ctx);
Object.assign(ctx.state, { account: { mode: 'guest' }, trips: [], trip: null, tripsLoaded: true });
for (const screen of ['home', 'timeline', 'trips', 'account', 'trip-options', 'checklist', 'form', 'join']) {
  ctx.state.screen = screen;
  assert.equal(ctx.shouldShowFirstRun(), ['home', 'timeline'].includes(screen), `Welcome must not intercept explicit navigation to ${screen}`);
}

// Exercise the actual router and Add handler, including the same screen with
// different entity IDs. A new header action must never wipe an edit in place.
let renders = 0, pendingDiscard = null, blocked = 0;
Object.assign(ctx, {
  formHasMeaningfulChanges: false,
  DIRTY_TASK_SCREENS: new Set(['form', 'collection-form', 'stop-form', 'day-plan-form']),
  VIEWER_BLOCKED_ACTIONS: new Set(['open-add']), OWNER_ONLY_ACTIONS: new Set(),
  viewOnlyBlocked: () => ctx.state.trip?.role === 'viewer' && ++blocked,
  scrollPositions: new Map(), window: { scrollY: 0, scrollTo() {} },
  location: { pathname: '/account', search: '' },
  history: { replaceState() {}, pushState() {} }, routeHistoryIndex: () => 0,
  transitionRender: () => renders++, requestAnimationFrame: fn => fn(),
  requestDiscardChanges: fn => { pendingDiscard = fn; }, closeSheetKeepPage: () => { ctx.state.sheet = null; },
});
vm.runInContext(get('routeHistoryState', 'route', 'handleActionTask'), ctx);
ctx.state.screen = 'account'; ctx.state.selectedId = null;
await ctx.handleActionTask('open-add', {});
assert.equal(ctx.state.screen, 'form'); assert.equal(ctx.state.selectedId, 'trip');
ctx.state.trip = { id: 'trip-1' }; ctx.state.screen = 'account';
await ctx.handleActionTask('open-add', {});
assert.equal(ctx.state.screen, 'add-trip');
ctx.state.screen = 'form'; ctx.state.selectedId = 'flight'; ctx.formHasMeaningfulChanges = true;
const before = renders;
await ctx.handleActionTask('open-add', {});
assert.equal(ctx.state.screen, 'form'); assert.equal(ctx.state.selectedId, 'flight'); assert.equal(renders, before);
assert.equal(typeof pendingDiscard, 'function', 'Leaving a dirty form requests discard before rendering anything');
ctx.formHasMeaningfulChanges = false; pendingDiscard();
assert.equal(ctx.state.screen, 'add-trip');
ctx.state.screen = 'form'; ctx.state.selectedId = 'flight'; ctx.formHasMeaningfulChanges = true; pendingDiscard = null;
ctx.route('form', 'trip');
assert.equal(ctx.state.selectedId, 'flight'); assert.equal(typeof pendingDiscard, 'function');
ctx.formHasMeaningfulChanges = false; ctx.state.trip.role = 'viewer';
await ctx.handleActionTask('open-add', {});
assert.equal(blocked, 1); assert.equal(ctx.state.selectedId, 'flight', 'Header Add cannot bypass view-only access');

// Use the actual delegated click listener: native modified links remain
// native, same-page menu taps preserve DOM, and recovery can reopen Account.
let clickHandler;
function findClick(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'app.addEventListener' && node.arguments[0]?.text === 'click') clickHandler = node.arguments[1].getText(tree);
  ts.forEachChild(node, findClick);
}
findClick(tree); assert(clickHandler);
Object.assign(ctx, { suppressClick: false });
const onClick = vm.runInContext(`(${clickHandler})`, ctx);
let prevented = 0;
const accountLink = { tagName: 'A', dataset: { screen: 'account' }, classList: { contains: () => false } };
const click = { button: 0, target: { closest: selector => selector.includes('[data-screen]') ? accountLink : null }, preventDefault: () => prevented++ };
ctx.state.screen = 'account'; ctx.state.selectedId = null; ctx.state.sheet = 'navigation';
let beforeNavigation = renders;
onClick(click); assert.equal(renders, beforeNavigation); assert.equal(prevented, 1);
ctx.state.error = 'Temporary load failure'; ctx.state.sheet = 'navigation';
onClick(click); assert.equal(renders, beforeNavigation + 1); assert.equal(ctx.state.error, null);
ctx.state.sheet = 'navigation'; beforeNavigation = renders;
onClick({ ...click, metaKey: true });
assert.equal(renders, beforeNavigation); assert.equal(ctx.state.sheet, 'navigation'); assert.equal(prevented, 2);

// Closing the navigation overlay keeps the exact form DOM and restores focus.
let removed = 0, focusRestored = 0;
const attributes = new Set(['inert', 'aria-hidden']);
const expanded = new Map([['aria-expanded', 'true']]);
const background = {
  removeAttribute: name => attributes.delete(name),
  querySelector: selector => selector.includes('open-navigation') ? { setAttribute: (key, value) => expanded.set(key, value) } : null,
};
Object.assign(ctx, {
  document: {
    getElementById: () => ({ querySelector: () => background, querySelectorAll: () => [{ remove: () => removed++ }, { remove: () => removed++ }] }),
    documentElement: { classList: { remove() {} } },
  }, restoreSheetFocus: () => focusRestored++,
});
vm.runInContext(get('closeSheetKeepPage', 'closeSheet'), ctx);
ctx.state.sheet = 'navigation'; const beforeClose = renders;
ctx.closeSheet();
assert.equal(ctx.state.sheet, null); assert.equal(removed, 2); assert.equal(renders, beforeClose);
assert.equal(attributes.size, 0); assert.equal(expanded.get('aria-expanded'), 'false'); assert.equal(focusRestored, 1);
assert.doesNotMatch(source, /function bottomNav\(|function BottomNavigation\(|class="bottom-nav/);
console.log('Header navigation: four real links, protected Trips, contextual Add, viewer guard, dirty form navigation, overlay preservation and focus restoration passed.');
