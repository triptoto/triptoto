import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const app = readFileSync('public/mobile-app.js', 'utf8');
const context = { icon: () => '', state: { trips: [], tripFilter: 'all' },
  val: (row, ...keys) => keys.map(k => row?.[k]).find(v => v != null),
  esc: value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
  formatTripDates: trip => trip.starts_on || 'Dates not set',
  tripSharedBadge: trip => trip.is_shared ? 'Shared · View only' : '',
  tripMarkIcon: () => 'trips', bottomNav: () => '<nav class="bottom-nav"></nav>',
  mobileAlert: () => '', pageHelpButton: () => '' };
runInNewContext(app.slice(app.indexOf("  const dateFormatters"), app.indexOf("  const API =")),context);
// todayISO() is the single canonical "today" used by tripBucket and the journal
// helpers; evaluate the real one (not a stub) so midnight/UTC behaviour is tested.
assert(app.indexOf('  function todayISO(') > 0 && app.indexOf('  function todayISO(') < app.indexOf('  function tripBucket('), 'todayISO must be defined with the trip-bucket helpers');
runInNewContext(app.slice(app.indexOf('  function todayISO('), app.indexOf('  function meaningfulBookingStatus(')), context);
const today = new Date().toISOString().slice(0,10);
const iso = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0,10);
const trip = (id, from, to, lifecycle_state = 'upcoming') => ({id, title:id, starts_on:iso(from), ends_on:iso(to), lifecycle_state});
context.state.trips = [trip('current-one',-4,7),trip('current-two',-45,45),trip('late',30,35),trip('soon',1,4),trip('past-old',-80,-70),trip('past-new',-10,-5),trip('cancelled',-10,3,'cancelled'),{id:'draft',title:'<script>unsafe</script>', lifecycle_state:'draft'}];
let html = context.tripListScreen();
assert(html.includes('trips-app-bar') && html.includes('data-action="create-trip"'),'Trips must use the shared root app bar with a create action');
// The in-progress trip (soonest current first) is featured in the editorial hero.
assert(html.includes('class="trips-hero trips-hero--current"') && /trips-hero[^]*?data-id="current-two"/.test(html),'Current trip is featured in the hero');
// Every remaining trip stays reachable as an editorial row (8 trips - 1 hero).
assert.equal((html.match(/class="trip-list-row trips-ed-row/g)||[]).length,7,'Every non-hero trip remains reachable as an editorial row');
assert(html.indexOf('data-id="soon"') < html.indexOf('data-id="late"'),'Upcoming trips sort soonest first');
assert(html.indexOf('data-id="past-new"') < html.indexOf('data-id="past-old"'),'Past trips sort newest first');
assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;') && !html.includes('<script>unsafe'),'Titles must be escaped');
assert(html.includes('To plan'),'Undated trips remain visible with a placeholder date');
assert(html.includes('Past trips</h2><span class="trip-list-group__count">2</span>'),'Past group count matches the rows shown');
assert(html.includes('Also happening</h2>'),'Extra current trips group under the hero');
// The tripFilter state no longer hides trips — all buckets always render.
context.state.tripFilter = 'past';
assert.equal((context.tripListScreen().match(/class="trip-list-row trips-ed-row/g)||[]).length,7,'Filter state does not hide trips in the editorial list');
context.state.tripFilter = 'all';
context.state.trips=[];assert(context.tripListScreen().includes('data-action="create-trip"'),'Empty state can create a real trip');
assert.equal(context.journalDays({}),null); assert.equal(context.journalDate('2026-02-31'),null);
assert.equal(context.journalDays(trip('one-day',0,0)).total,1);
const longRail = context.journalDayRail(trip('long',-45,45));
assert(longRail.includes('Day 46 of 91') && longRail.includes('is-today">46'),'Long trip identifies actual current day');
assert((longRail.match(/<span/g)||[]).length<=9,'Long trips use a bounded day strip');
assert.equal(context.journalDayRail(trip('reversed',2,-1)),'','Invalid ranges must not render progress');
console.log('Trips journal: hero feature, grouping, ordering, escaping, undated/empty states and bounded progress passed.');

context.state.trips = [trip('later',20,25),trip('next',2,5),{id:'undated',title:'Someday'}];
html = context.tripListScreen();
assert(html.includes('class="trips-hero"') && html.includes('Next up') && /trips-hero[^]*?data-id="next"/.test(html),'Soonest upcoming trip is featured when nothing is in progress');
assert(html.includes('trip-list-group--upcoming'), 'Remaining upcoming trips use the shared list group');
assert.equal((html.match(/class="trip-list-row trips-ed-row/g)||[]).length,2,'Non-hero upcoming trips are not duplicated in the list');
assert(html.includes('data-id="later"') && html.includes('data-id="undated"'),'Remaining and undated trips stay reachable');
