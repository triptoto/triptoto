import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const app = readFileSync('public/mobile-app.js', 'utf8');
const context = { icon: () => '', state: { trips: [], tripFilter: 'all' },
  val: (row, ...keys) => keys.map(k => row?.[k]).find(v => v != null),
  esc: value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
  formatTripDates: trip => trip.starts_on || 'Dates not set',
  tripSharedBadge: trip => trip.is_shared ? 'Shared · View only' : '', mobileAlert: () => '' };
runInNewContext(app.slice(app.indexOf("  const dateFormatters"), app.indexOf("  const API =")),context);
runInNewContext(app.slice(app.indexOf('  function tripBucket('), app.indexOf('  function meaningfulBookingStatus(')), context);
const today = new Date().toISOString().slice(0,10);
const iso = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0,10);
const trip = (id, from, to, lifecycle_state = 'upcoming') => ({id, title:id, starts_on:iso(from), ends_on:iso(to), lifecycle_state});
context.state.trips = [trip('current-one',-4,7),trip('current-two',-45,45),trip('late',30,35),trip('soon',1,4),trip('past-old',-80,-70),trip('past-new',-10,-5),trip('cancelled',-10,3,'cancelled'),{id:'draft',title:'<script>unsafe</script>', lifecycle_state:'draft'}];
let html = context.tripListScreen();
assert.equal((html.match(/class="journal-current"/g)||[]).length,2,'Every current trip remains reachable');
assert(html.indexOf('data-id="soon"') < html.indexOf('data-id="late"'),'Upcoming trips sort soonest first');
assert(html.indexOf('data-id="past-new"') < html.indexOf('data-id="past-old"'),'Past trips sort newest first');
assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;') && !html.includes('<script>unsafe'),'Titles must be escaped');
assert(html.includes('Dates not set'),'Undated trips remain visible');
context.state.tripFilter = 'past'; html = context.tripListScreen();
assert(!html.includes('data-id="cancelled"') && !html.includes('data-id="current-one"'),'Past excludes cancelled/current');
assert(html.includes('Past<span>2</span>'),'Past count uses the same bucket as results');
context.state.tripFilter = 'current'; context.state.trips = [trip('future',4,8)];
assert(context.tripListScreen().includes('Show all trips'),'Filtered empty state has a recovery action');
context.state.trips=[];assert(context.tripListScreen().includes('data-action="create-trip"'),'Empty state can create a real trip');
assert.equal(context.journalDays({}),null); assert.equal(context.journalDate('2026-02-31'),null);
assert.equal(context.journalDays(trip('one-day',0,0)).total,1);
const longRail = context.journalDayRail(trip('long',-45,45));
assert(longRail.includes('Day 46 of 91') && longRail.includes('is-today">46'),'Long trip identifies actual current day');
assert((longRail.match(/<span/g)||[]).length<=9,'Long trips use a bounded day strip');
assert.equal(context.journalDayRail(trip('reversed',2,-1)),'','Invalid ranges must not render progress');
console.log('Trips journal: grouping, ordering, escaping, undated/empty states and bounded progress passed.');

context.state.tripFilter = 'upcoming'; context.state.trips = [trip('later',20,25),trip('next',2,5),{id:'undated',title:'Someday'}];
html = context.tripListScreen();
assert(html.includes('journal-next'), 'Upcoming dated trip is featured');
assert.equal((html.match(/data-id="next"/g)||[]).length,1,'Featured trip is not duplicated in list');
assert(html.includes('data-id="later"') && html.includes('data-id="undated"'),'Remaining and undated trips stay reachable');
context.state.tripFilter='past'; assert(!context.tripListScreen().includes('data-id="next"'),'Feature respects active filter');
