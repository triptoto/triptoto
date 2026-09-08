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
  collectionForItem: id => ['neighborhood-1', 'neighborhood-alias'].includes(id) ? { id: 'neighborhood-1', collection_type: 'neighborhood' } : null,
  collectionConfig: () => ({ label: 'Neighborhood', stop: 'place' }),
  canEditCurrentTrip: () => ctx.state.trip?.role !== 'viewer',
});
vm.runInContext(readFileSync('public/mobile-routes.js', 'utf8'), ctx);
ctx.routeUrl = (screen, id) => ctx.TriptoRoutes.pathFor(screen, id);
vm.runInContext(get('HeaderNavigation', 'navigationSheet', 'bookingNavigationActions', 'collectionNavigationActions', 'appBar', 'bottomSheet', 'sheetActionRow', 'sheetActionLink', 'sheetActionList', 'tripsPageHeader', 'selectedFlight', 'selectedStay', 'selectedTrain', 'selectedPlan', 'val', 'itemId'), ctx);
ctx.isCancelled = () => false;
const html = ctx.navigationSheet();
assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/trips', '/trip-options', '/before-you-go', '/account']);
assert.equal((html.match(/<a /g) || []).length, 4, 'The menu has exactly four destinations');
assert.match(html, /data-screen="account" aria-current="page"/);
assert.match(ctx.HeaderNavigation(), /data-action="open-add"/);
// Menu actions must target the record actually displayed by each detail route,
// not a subtype label or a stale route slug. Other pages get no booking actions.
Object.assign(ctx.state, {
  transport: [{ id: 'flight-1', transport_type: 'flight' }, { id: 'train-1', transport_type: 'train' }, { id: 'ferry-1', transport_type: 'ferry' }, { id: 'bus-1', transport_type: 'bus' }],
  stays: [{ id: 'hotel-1', property_name: 'QA stay' }],
  timeline: [{ id: 'class-1', type: 'activity', activity_type: 'class' }, { id: 'idea-1', type: 'activity', activity_type: 'idea' }],
});
for (const [screen, id, kind] of [['flight', 'flight-1', 'flight'], ['hotel', 'hotel-1', 'hotel'], ['train', 'train-1', 'train'], ['train', 'ferry-1', 'ferry'], ['plan', 'bus-1', 'bus'], ['plan', 'class-1', 'activity']]) {
  Object.assign(ctx.state, { screen, selectedId: id });
  const menu = ctx.navigationSheet();
  assert.match(menu, /aria-label="Booking actions"/);
  for (const action of ['edit-booking', 'share-booking', 'move-booking', 'delete-booking']) {
    assert(menu.includes('data-action="' + action + '" data-kind="' + kind + '" data-id="' + id + '"'), action + ' targets ' + id);
  }
  assert.equal((menu.match(/<a /g) || []).length, 4);
  assert.doesNotMatch(ctx.appBar('Class Detail'), /app-bar--with-actions|app-bar-actions|share-booking|edit-booking/);
}
ctx.state.screen = 'plan'; ctx.state.selectedId = 'idea-1';
assert.match(ctx.navigationSheet(), /data-action="edit-idea"/);
assert.match(ctx.navigationSheet(), /data-action="delete-idea"/);
assert.doesNotMatch(ctx.navigationSheet(), /data-action="move-booking"/);
ctx.state.trip.role = 'viewer';
assert.match(ctx.navigationSheet(), /data-action="share-booking"/);
assert.doesNotMatch(ctx.navigationSheet(), /data-action="(?:edit|delete|move)-/);
ctx.state.trip.role = 'owner';
ctx.state.selectedId = 'missing';
assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Booking actions"/);
for (const screen of ['account', 'trips', 'form', 'checklist', 'trip-options', 'collection']) {
  ctx.state.screen = screen; ctx.state.selectedId = 'class-1';
  assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Booking actions"/, screen);
}
ctx.state.screen = 'plan'; ctx.state.error = 'Load failed';
assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Booking actions"/);
ctx.state.error = null;
ctx.state.screen = 'collection'; ctx.state.selectedId = 'neighborhood-1';
assert.match(ctx.HeaderNavigation(), /data-action="collection-add-place" data-id="neighborhood-1"/);
for (const role of ['owner', 'editor']) {
  ctx.state.trip.role = role;
  for (const id of ['neighborhood-1', 'neighborhood-alias']) {
    ctx.state.selectedId = id;
    const menu = ctx.navigationSheet();
    assert.match(menu, /data-action="edit-collection" data-id="neighborhood-1"/);
    assert.match(menu, /Edit Neighborhood/);
    assert.doesNotMatch(menu, /data-action="delete-/);
    assert.equal((menu.match(/<a /g) || []).length, 4);
  }
}
ctx.state.selectedId = 'missing';
assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Plan actions"/);
ctx.state.selectedId = 'neighborhood-1';
for (const [key, value] of [['error', 'Load failed'], ['googleAuthHandoffStatus', 'pending']]) {
  ctx.state[key] = value;
  assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Plan actions"/);
  ctx.state[key] = null;
}
ctx.state.trip.role = 'viewer';
assert.doesNotMatch(ctx.navigationSheet(), /data-action="edit-collection"/);
assert.doesNotMatch(ctx.HeaderNavigation(), /data-action="collection-add-place"/);
assert.match(ctx.HeaderNavigation(), /data-action="open-add"/, 'View-only users still see the same header; the action guard explains the restriction');
ctx.state.trip = null;
assert.doesNotMatch(ctx.navigationSheet(), /aria-label="Plan actions"/);
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
// Exercise the real detail handlers with external sharing/confirmation mocked:
// edit goes straight to the correct populated form; sharing closes Menu before
// invoking the native sheet, and cancellation is not reported as a failure.
const effects = [];
const actions = vm.createContext({
  state: { trip: { id: 'trip-1' }, sheet: 'navigation', timeline: [{ id: 'class-1', type: 'activity', activity_type: 'class', title: 'Cooking class' }], transport: [], stays: [] },
  VIEWER_BLOCKED_ACTIONS: new Set(['edit-booking', 'move-booking', 'delete-booking', 'edit-idea', 'delete-idea', 'edit-collection']),
  OWNER_ONLY_ACTIONS: new Set(), viewOnlyBlocked: () => actions.state.trip.role === 'viewer',
  route: (screen, id) => effects.push(['route', screen, id]),
  closeSheetKeepPage: () => { actions.state.sheet = null; effects.push(['close']); },
  closeSheet: () => { actions.state.sheet = null; },
  openSheet: name => { actions.state.sheet = name; },
  confirmDeleteBooking: (kind, id) => effects.push(['delete', kind, id, actions.state.sheet]),
  confirmDeleteIdea: id => effects.push(['delete-idea', id, actions.state.sheet]),
  locationById: () => null, statusText: text => text, manualBookingConfig: () => null,
  showToast: text => effects.push(['toast', text]),
  navigator: {
    share: async data => { effects.push(['share', data.title, data.text, actions.state.sheet]); },
    clipboard: { writeText: async text => { effects.push(['copy', text]); } },
  },
});
vm.runInContext(get('handleActionTask', 'findBookingRecord', 'bookingBaseKind', 'bookingFormKind', 'bookingShareText', 'bookingRecordTitle', 'val', 'itemId'), actions);
const classTarget = { dataset: { kind: 'activity', id: 'class-1' } };
await actions.handleActionTask('edit-booking', classTarget);
assert.deepEqual(effects.pop(), ['route', 'form', 'activity']);
assert.equal(actions.state.editingEntity.id, 'class-1');
actions.state.sheet = 'navigation';
await actions.handleActionTask('share-booking', classTarget);
assert.deepEqual(effects.splice(0), [['close'], ['share', 'Cooking class', 'Cooking class', null]]);
actions.state.sheet = 'navigation';
actions.navigator.share = async () => { throw { name: 'AbortError' }; };
await actions.handleActionTask('share-booking', classTarget);
assert.deepEqual(effects.splice(0), [['close']]);
actions.navigator.share = async () => { throw new Error('Sharing failed'); };
await assert.rejects(actions.handleActionTask('share-booking', classTarget), /Sharing failed/);
delete actions.navigator.share;
actions.state.sheet = 'navigation';
await actions.handleActionTask('share-booking', classTarget);
assert.deepEqual(effects.splice(0), [['close'], ['copy', 'Cooking class'], ['toast', 'Details copied.']]);
actions.state.sheet = 'navigation';
await actions.handleActionTask('delete-booking', classTarget);
assert.deepEqual(effects.splice(0), [['close'], ['delete', 'activity', 'class-1', null]]);
actions.state.sheet = 'navigation';
await actions.handleActionTask('delete-idea', { dataset: { id: 'idea-1' } });
assert.deepEqual(effects.splice(0), [['close'], ['delete-idea', 'idea-1', null]]);
actions.state.sheet = 'navigation';
await actions.handleActionTask('move-booking', classTarget);
assert.equal(actions.state.sheet, 'move-booking'); assert.equal(actions.state.moveBooking.id, 'class-1');
actions.state.sheet = 'navigation';
await actions.handleActionTask('edit-collection', { dataset: { id: 'neighborhood-1' } });
assert.deepEqual(effects.splice(0), [['close'], ['route', 'collection-form', 'neighborhood-1']]);
assert.equal(actions.state.editingEntity.kind, 'collection');
assert.equal(actions.state.editingEntity.id, 'neighborhood-1');
assert.equal(actions.formHasMeaningfulChanges, false);
actions.state.trip.role = 'viewer'; actions.state.sheet = 'navigation';
await actions.handleActionTask('edit-booking', classTarget);
await actions.handleActionTask('edit-collection', { dataset: { id: 'neighborhood-1' } });
assert.equal(actions.state.sheet, 'navigation'); assert.equal(effects.length, 0);
assert.doesNotMatch(source, /function bottomNav\(|function BottomNavigation\(|class="bottom-nav/);
console.log('Header navigation: four real links, protected Trips, contextual Add and booking actions, Neighborhood Edit in Menu without Delete, direct Edit, native Share/cancellation/copy, Delete confirmation, viewer guard, dirty forms and focus restoration passed.');
