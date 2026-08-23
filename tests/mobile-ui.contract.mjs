import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Mobile UI contract failed: ${m}`)};
const index=read('public/index.html'),css=read('public/mobile-app.css'),app=read('public/mobile-app.js'),sw=read('public/sw.js'),rules=read('public/mobile-trip-rules.js'),routeSource=read('public/mobile-routes.js'),manifest=read('public/manifest.webmanifest');
assert(index.includes('/mobile-app.css')&&index.includes('/mobile-app.js')&&index.includes('/mobile-routes.js'),'mobile assets missing');
assert(!index.includes('/app.js')&&!app.includes('/legacy.html')&&!sw.includes('/legacy.html'),'legacy presentation leaked into Product V2');
assert(css.includes('--app-width:430px')&&css.includes('env(safe-area-inset-bottom)')&&css.includes('env(safe-area-inset-top)'),'mobile sizing or safe areas missing');
assert(css.includes('-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Arial,sans-serif')&&!css.includes('"Inter"'),'Apple typography contract changed');
for(const color of ['--paper:#fff','--surface:#f1f3f5','--icon:#ced4da','--muted:#495057','--ink:#111215'])assert(css.includes(color),`monochrome palette missing: ${color}`);
for(const oldColor of ['#141948','#2f3bab','#febf02','#f2f4f7','#f7f8fa'])assert(!css.toLowerCase().includes(oldColor)&&!manifest.toLowerCase().includes(oldColor),`old palette remains: ${oldColor}`);
assert(manifest.includes('"background_color": "#FFFFFF"')&&manifest.includes('"theme_color": "#FFFFFF"'),'PWA palette is stale');
assert(css.includes('overflow-x:hidden')&&css.includes('overflow-x:clip'),'horizontal overflow protection missing');
assert(css.includes('@media(prefers-reduced-motion:reduce)')&&css.includes('min-height:44px'),'motion or touch safety missing');
const nav=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
assert(nav.includes('["timeline", "clock", "Trip"]')&&nav.includes('["add", "plus", "Add"]')&&nav.includes('["account", "user", "Account"]'),'V2 navigation order is wrong');
assert(!nav.includes('"Home"')&&!nav.includes('"Bookings"'),'V1 navigation leaked');
assert(app.includes('function selectRelevantTrip(')&&app.includes('state.account?.mode === "account"')&&app.includes('history.replaceState(null, "", routeUrl("timeline"))'),'authenticated relevant-trip routing missing');
const routeContext={};runInNewContext(routeSource,routeContext);const router=routeContext.TriptoRoutes;
assert(router&&typeof router.parsePath==='function'&&typeof router.pathFor==='function','clean route module missing');
const routeCases=[
  ['timeline',null,'/timeline'],['account',null,'/account'],['trips',null,'/trips'],
  ['add-booking',null,'/bookings/add'],['bookings',null,'/bookings'],
  ['flight','flight-1','/flights/flight-1'],['hotel','stay-1','/hotels/stay-1'],
  ['train','train-1','/trains/train-1'],['plan','plan-1','/plans/plan-1'],
  ['documents',null,'/documents'],['ready',null,'/ready-offline'],
  ['health',null,'/trip-health'],['travelers',null,'/travelers'],
  ['traveler','traveler-1','/travelers/traveler-1'],['checklist',null,'/before-you-go'],
  ['import',null,'/bookings/import'],['import-review','review-1','/bookings/import/review/review-1'],
  ['import-history',null,'/bookings/import/history'],['sync',null,'/pending-changes'],
  ['form','trip','/trips/new'],['form','traveler','/travelers/new'],
  ['form','checklist','/before-you-go/new'],['form','flight','/bookings/new/flight'],
];
for(const [screen,id,path] of routeCases){
  assert(router.pathFor(screen,id)===path,`clean path mismatch for ${screen}`);
  const parsed=router.parsePath(path);
  assert(parsed.screen===screen&&String(parsed.id||'')===String(id||''),`clean path parsing mismatch for ${path}`);
}
assert(!app.includes('hashchange')&&!app.includes('const hash = "#"')&&!app.includes('"#timeline"'),'active hash routing remains in the application');
assert(app.includes('if (location.hash)')&&app.includes('history.replaceState(null, "", routeUrl(legacy.screen, legacy.id))'),'legacy hash migration missing');
assert(sw.includes('/mobile-routes.js')&&sw.includes('apple-flat-v1'),'clean route shell is not cached');
const welcome=app.slice(app.indexOf('function firstRunScreen('),app.indexOf('function timelineScreen('));
for(const copy of ['Quiet Journey','All your trip.','One calm timeline.','Take a tour','google-signin-button','first-run-google-preview'])assert(welcome.includes(copy),`Welcome missing: ${copy}`);
assert(app.includes('Roscioli')&&app.includes('Dinner reservation'),'Welcome timeline preview is incomplete');
assert(!welcome.includes('bottomNav(')&&app.includes('(state.account?.mode || "guest") !== "account"')&&app.includes('state.trips.length === 0'),'Welcome gate/navigation invalid');
assert(app.includes('["empty", "empty-offline", "empty-reduced-motion"].includes(QA_STATE)'),'isolated first-run visual QA state missing');
assert(app.includes('/api/v1/auth/google/challenge')&&app.includes('/api/v1/auth/google'),'Google sign-in wiring missing');
assert(!app.includes('Gmail access')&&!app.includes('Google Drive access')&&!app.includes('Google Calendar access'),'forbidden Google scope surfaced');
for(const field of ['["destination","Where are you going?","text",true,true]','["startsOn","Start date","date",true,false]','["endsOn","End date","date",true,false]','["title","Trip name · Optional","text",false,true]'])assert(app.includes(field),`Create Trip field missing: ${field}`);
assert(app.includes('function dateRangeField(')&&app.includes('data-action="open-date-range"')&&app.includes('data-action="select-range-day"')&&app.includes('data-action="apply-date-range"'),'single-calendar date range controls missing');
assert(app.includes('dateRangeField("startsOn", "endsOn"')&&app.includes('dateRangeField("checkInDate", "checkOutDate"'),'trip and hotel ranges are not using the shared calendar');
assert(!app.includes('tripDateField(')&&!css.includes('.trip-date-control'),'old two-calendar presentation remains');
assert(app.includes('kind==="trip"?"add-booking"'),'Create Trip does not continue to Add Booking');
assert(app.includes('sessionStorage.setItem(quickDraftKey(kind)')&&app.includes('Discard changes?'),'form recovery missing');
const add=app.slice(app.indexOf('function addBookingScreen('),app.indexOf('function documentSheet('));
for(const method of ['Upload Booking','Forward Confirmation Email','Add Manually'])assert(add.includes(method),`Add method missing: ${method}`);
for(const category of ['Flight','Hotel / Stay','Train','Car Rental','Transfer','Cruise','Ferry','Restaurant','Activity / Event','Other'])assert(add.includes(category),`manual category missing: ${category}`);
const plus=app.slice(app.indexOf('function addSheet('),app.indexOf('function addBookingScreen('));
assert(plus.includes('Add Booking')&&plus.includes('Create New Trip')&&!plus.includes('Flight'),'plus menu invalid');
assert(app.includes('function timelineContextCard('),'Timeline priority context missing');
assert(app.includes('if (isEmptyTripSetup()) return "";'),'empty trip must not surface premature health warnings');
assert(app.includes('timeline-empty__eyebrow">Start building'),'empty-trip setup hierarchy missing');
assert(css.includes('.timeline-page--empty')&&css.includes('min-height:calc(100dvh - 68px - var(--nav-height)'),'empty timeline viewport sizing missing');
assert(app.includes('timeline-empty__add')&&app.includes('emptySetup ? "plus" : "calendar"'),'Product V2 empty-trip structure missing');
for(const concept of ['Needs Attention','Now','Next','Before you go'])assert(app.includes(concept),`Timeline state missing: ${concept}`);
assert(app.includes('timeline-day__header')&&app.includes('journey-event journey-event--${phase}')&&app.includes('timelineDay(starts, zone)'),'Timeline structure/local grouping missing');
assert(app.includes('data-action="switch-trip"')&&app.includes('data-screen="documents" aria-label="Tickets and documents"'),'trip selector/documents missing');
assert(app.includes('tripto-local-docs-v1')&&app.includes('crypto.subtle.digest("SHA-256"')&&app.includes('integrity === "verified"'),'document integrity missing');
assert(app.includes('saved on this phone')&&app.includes('Scheduled booking data is never presented as live')&&app.includes('<small>Scheduled data</small>'),'data truth labeling missing');
assert(app.includes('Not assigned')&&!app.includes('To be confirmed'),'unavailable data labeling invalid');
assert(app.includes('resolveEventLocalDateTime')&&app.includes('ambiguous or unavailable because of a timezone change'),'DST safety missing');
assert(app.includes('Nothing was overwritten.')&&app.includes('Review pending changes before removing local data.'),'sync safety missing');
assert(app.includes('method:"POST",body:JSON.stringify({title:fd.get("title"),category:fd.get("category"),priority:fd.get("priority")})'),'native checklist creation missing');
assert(app.includes('data-edit-version')&&app.includes('method:editId?"PATCH":"POST"'),'native traveler editing missing');
const account=app.slice(app.indexOf('function accountScreen('),app.indexOf('let googleScriptPromise'));
for(const copy of ['My trips','Booking email','bookings@tripto.to','Take the tour','Sign out'])assert(account.includes(copy),`Account missing: ${copy}`);
for(const internal of ['Trip Health','Smart Essentials','Smart Import'])assert(!account.includes(internal),`internal name exposed: ${internal}`);
assert(sw.includes("url.pathname.startsWith('/api/')")&&sw.includes("navigationCacheKey=isMobileShell?'/index.html':url.pathname"),'service worker isolation missing');
assert(index.indexOf('/mobile-trip-rules.js')<index.indexOf('/mobile-app.js'),'trip rules load order wrong');
assert(!index.match(/https?:\/\/[^"']+\.(?:css|woff2?)/i),'external font/style introduced');
assert(index.includes('/vendor/phosphor/phosphor.css')&&sw.includes('/vendor/phosphor/Phosphor.woff2'),'local icon library missing');
assert(!app.includes('const ICONS')&&!app.includes('<svg'),'homemade inline icon system remains');
assert(!css.includes('linear-gradient(')&&!css.includes('radial-gradient('),'flat visual system contains gradients');
const sandbox={};runInNewContext(rules,sandbox);const validate=sandbox.TriptoTripRules?.validateManualTrip;
assert(typeof validate==='function','trip validation unavailable');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-02'}).valid===false,'end before start accepted');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-03'}).valid===true,'same-day trip rejected');
console.log('Product V2 mobile UI contract passed.');
