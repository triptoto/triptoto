import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Mobile UI contract failed: ${m}`)};
const index=read('public/index.html'),css=read('public/mobile-app.css'),app=read('public/mobile-app.js'),sw=read('public/sw.js'),rules=read('public/mobile-trip-rules.js'),routeSource=read('public/mobile-routes.js'),manifest=read('public/manifest.webmanifest'),geistCss=read('public/vendor/geist/geist.css'),privacy=read('public/privacy.html'),terms=read('public/terms.html'),geistFont=readFileSync('public/vendor/geist/Geist-Variable.woff2');
assert(index.includes('/mobile-app.css')&&index.includes('/mobile-app.js')&&index.includes('/mobile-routes.js')&&index.includes('/mobile-trip-rules.js')&&index.includes('/google-auth-client.js'),'mobile assets missing');
assert(!index.includes('/airport-timezones.js')&&!index.includes('/places-provider.js')&&!index.includes('/places-search-worker.js'),'flow-specific search assets must stay lazy');
assert(!index.includes('/app.js')&&!app.includes('/legacy.html')&&!sw.includes('/legacy.html'),'legacy presentation leaked into Product V2');
assert(css.includes('--app-width:430px')&&css.includes('env(safe-area-inset-bottom)')&&css.includes('env(safe-area-inset-top)'),'mobile sizing or safe areas missing');
assert(css.includes('--font:"Geist"')&&css.includes('-apple-system')&&css.includes('BlinkMacSystemFont')&&!css.includes('Nunito')&&!css.includes('"Inter"'),'approved Geist typography stack changed');
assert(geistCss.includes('font-family: "Geist"')&&geistCss.includes('font-weight: 100 900')&&geistCss.includes('font-display: swap')&&!/https?:\/\//.test(geistCss),'Geist must be a local variable font with swap behavior');
assert(geistFont.subarray(0,4).toString()==='wOF2','Geist font is missing, corrupt, or a pointer file');
assert(index.includes('rel="preload" href="/vendor/geist/Geist-Variable.woff2"')&&index.indexOf('/vendor/geist/geist.css')<index.indexOf('/mobile-app.css'),'Geist preload or stylesheet order changed');
assert(sw.includes('/vendor/geist/geist.css')&&sw.includes('/vendor/geist/Geist-Variable.woff2'),'Geist is not available in the offline application shell');
assert(privacy.includes('/vendor/geist/geist.css')&&terms.includes('/vendor/geist/geist.css')&&privacy.includes('font-family:var(--font)')&&terms.includes('font-family:var(--font)'),'legal pages do not use the shared Geist stack');
for(const token of ['--type-display:52px','--type-route:40px','--type-screen:28px','--type-section:20px','--type-body:16px','--type-meta:13px','--type-label:11px'])assert(css.includes(token),`typography scale missing: ${token}`);
for(const token of ['--weight-regular:400','--weight-medium:500','--weight-semibold:600','--weight-bold:700'])assert(css.includes(token),`typography weight missing: ${token}`);
assert(css.includes('--welcome-title:clamp(48px,min(12vw,6.2svh),var(--type-display))'),'Welcome does not consume the shared display scale');
assert(!/font-weight:\s*(?:650|750|800)\b/.test(css),'nonstandard text weight remains outside the approved Geist hierarchy');
assert(css.includes('font-size:var(--type-route);font-weight:var(--weight-bold)')&&css.includes('font-size:var(--type-screen);font-weight:var(--weight-bold)')&&css.includes('font-size:var(--type-section);font-weight:var(--weight-semibold)'),'Geist role hierarchy mappings changed');
for(const color of ['--paper:#eeeeee','--card:#ffffff','--surface:#e4e4e4','--ink:#111217','--icon:#111217','--accent:#cb2957','--green:#1b704b'])assert(css.includes(color),`single production palette missing: ${color}`);
assert(index.includes('<html lang="en">')&&index.includes('<meta name="theme-color" content="#eeeeee">')&&index.includes('<meta name="color-scheme" content="light">'),'single production shell must load without a theme class and use its real light canvas');
assert(!/(?:theme-(?:harbor|slate|daylight|amethyst|crimson)|set-theme|theme-picker|theme-swatch)/.test(index+css+app),'obsolete multi-theme implementation remains');
for(const oldColor of ['#141948','#2f3bab','#febf02','#f2f4f7','#f7f8fa'])assert(!css.toLowerCase().includes(oldColor)&&!manifest.toLowerCase().includes(oldColor),`old palette remains: ${oldColor}`);
assert(manifest.includes('"background_color": "#EEEEEE"')&&manifest.includes('"theme_color": "#EEEEEE"'),'PWA palette is stale');
assert(css.includes('overflow-x:hidden')&&css.includes('overflow-x:clip'),'horizontal overflow protection missing');
assert(css.includes('@media(prefers-reduced-motion:reduce)')&&css.includes('min-height:44px'),'motion or touch safety missing');
const navFn=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
assert(navFn.includes('navBtn("trips", "plane", "Trip")')&&navFn.includes('nav-item--notify')&&navFn.includes('data-action="open-notifications"')&&navFn.includes('data-action="open-add"')&&navFn.includes('navBtn("checklist", "checklist", "To-do")')&&navFn.includes('navBtn("account", "user", "Account")'),'V2 navigation must remain Trip / Alerts / Add / To-do / Account with the approved airplane Trip icon');
const nav=navFn.slice(navFn.indexOf('return `<nav'));
assert(nav.indexOf('navBtn("trips"')<nav.indexOf('${alerts}')&&nav.indexOf('${alerts}')<nav.indexOf('${addBtn}')&&nav.indexOf('${addBtn}')<nav.indexOf('navBtn("checklist"')&&nav.indexOf('navBtn("checklist"')<nav.indexOf('navBtn("account"'),'V2 navigation order (Trip, Alerts, Add, To-do, Account) is wrong');
assert(!navFn.includes('"Home"')&&!navFn.includes('"Bookings"')&&!navFn.includes('navBtn("help"'),'V1 navigation leaked');
assert(app.includes('function selectRelevantTrip(')&&app.includes('state.account?.mode === "account"')&&app.includes('history.replaceState(null, "", routeUrl("form", "trip"))'),'authenticated relevant-trip routing missing');
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
assert(sw.includes('/canonical-host.js')&&sw.includes('/mobile-routes.js')&&!sw.includes("'/airport-timezones.js'")&&sw.includes('/google-auth-client.js')&&sw.includes('/manual-booking-attachments.js')&&sw.includes('tripto-shell-product-v24-choose-noicons'),'clean route, canonical host, lazy search, manual-attachment, booking-email inbox, live-flight, Google-auth, Geist, or shell cache contract changed');
const welcome=app.slice(app.indexOf('function firstRunScreen('),app.indexOf('function timelineScreen('));
for(const copy of ['Add it once.','Follow the trip.','The essential details stay close','Continue with Google','Take a tour','google-signin-button','first-run-google-preview'])assert(welcome.includes(copy),`Welcome missing: ${copy}`);
assert(app.includes('welcome-route-matrix')&&app.includes('welcome-route-cell--next')&&app.includes('Times + route')&&app.includes('Ready offline')&&app.includes('Know what matters'),'Welcome route matrix is incomplete');
assert(css.includes('background:var(--accent);color:var(--card)')&&css.includes('.welcome-route-matrix')&&css.includes('.welcome-route-cell--next')&&!css.includes('--welcome-serif'),'Welcome must use the selected Route Matrix visual and Geist typography');
assert(!welcome.includes('bottomNav(')&&app.includes('(state.account?.mode || "guest") !== "account"')&&app.includes('state.trips.length === 0'),'Welcome gate/navigation invalid');
assert(app.includes('["empty", "empty-offline", "empty-reduced-motion"].includes(QA_STATE)'),'isolated first-run visual QA state missing');
assert(/\/google-auth-client\.js\?v=google-auth-ios-v\d+/.test(index)&&index.indexOf('/google-auth-client.js')<index.indexOf('/mobile-app.js')&&app.includes('/api/v1/auth/google/challenge')&&app.includes('/api/v1/auth/google')&&app.includes('/api/v1/auth/google/exchange'),'Google sign-in or secure iOS redirect handoff wiring missing');
assert(!app.includes('Gmail access')&&!app.includes('Google Drive access')&&!app.includes('Google Calendar access'),'forbidden Google scope surfaced');
for(const field of ['["destination","Destination","text",true,true]','["startsOn","Start date","date",true,false]','["endsOn","End date","date",true,false]','["title","Trip name","text",false,true]'])assert(app.includes(field),`Create Trip field missing: ${field}`);
assert(app.includes('name="destinationPlace"')&&app.includes('data-place-types="city,airport" data-place-preferred="city"'),'Create Trip place search missing');
assert(app.includes('function dateRangeField(')&&app.includes('data-action="open-date-range"')&&app.includes('data-action="select-range-day"')&&app.includes('data-action="apply-date-range"'),'single-calendar date range controls missing');
assert(app.includes('dateRangeField("startsOn", "endsOn"')&&app.includes('dateRangeField("checkInDate", "checkOutDate"'),'trip and hotel ranges are not using the shared calendar');
assert(!app.includes('tripDateField(')&&!css.includes('.trip-date-control'),'old two-calendar presentation remains');
assert(app.includes('kind==="trip"?"add-booking"'),'Create Trip does not continue to Add Booking');
assert(app.includes('sessionStorage.setItem(quickDraftKey(kind)')&&app.includes('Discard changes?'),'form recovery missing');
const add=app.slice(app.indexOf('function addBookingScreen('),app.indexOf('function documentSheet('));
for(const method of ['Upload Booking','Forward Confirmation Email','Add Manually'])assert(add.includes(method),`Add method missing: ${method}`);
for(const category of ['Flight','Hotel / Stay','Train','Car Rental','Transfer','Cruise','Ferry','Restaurant','Activity / Event','Other'])assert(app.includes(`label: "${category}"`),`manual category missing: ${category}`);
const plus=app.slice(app.indexOf('function addSheet('),app.indexOf('function addBookingScreen('));
assert(plus.includes('Add Booking')&&plus.includes('Create New Trip')&&!plus.includes('Flight'),'plus menu invalid');
assert(app.includes('function timelineContextCard('),'Timeline priority context missing');
assert(app.includes('if (isEmptyTripSetup()) return "";'),'empty trip must not surface premature health warnings');
assert(app.includes('timeline-empty__eyebrow">Start building'),'empty-trip setup hierarchy missing');
assert(css.includes('.timeline-page--empty')&&css.includes('min-height:calc(100dvh - var(--header-h) - var(--nav-height))')&&css.includes('padding-bottom:calc(var(--nav-height) + env(safe-area-inset-bottom) + 6vh)'),'empty timeline viewport sizing missing');
assert(app.includes('timeline-empty__add')&&app.includes('emptySetup ? "plus" : "calendar"'),'Product V2 empty-trip structure missing');
for(const concept of ['need attention','Now','Next','Before you go'])assert(app.includes(concept),`Timeline state missing: ${concept}`);
assert(app.includes('timeline-day__header')&&app.includes('journey-event journey-event--${phase}')&&app.includes('timelineDay(starts, zone)'),'Timeline structure/local grouping missing');
assert(app.includes('timeline-screen--ribbon')&&app.includes('timeline-ribbon')&&css.includes('.timeline-screen--ribbon .timeline-day')&&css.includes('html .bottom-nav'),'selected production timeline and navigation system missing');
assert(app.includes('data-action="switch-trip"')&&app.includes('data-action="open-trip-menu"'),'trip selector / more-options menu missing');
assert(app.includes('function tripMenuSheet(')&&app.includes('state.sheet === "trip-menu"')&&app.includes('data-screen="documents"'),'trip options menu (weather/map/documents/edit/delete) missing');
assert(app.includes('tripto-local-docs-v1')&&app.includes('crypto.subtle.digest("SHA-256"')&&app.includes('integrity === "verified"'),'document integrity missing');
assert(app.includes('saved on this phone')&&app.includes('Scheduled booking data is never presented as live')&&app.includes('<small>Scheduled data</small>'),'data truth labeling missing');
assert(app.includes('Not assigned')&&!app.includes('To be confirmed'),'unavailable data labeling invalid');
assert(app.includes('resolveEventLocalDateTime')&&app.includes('ambiguous or unavailable because of a timezone change'),'DST safety missing');
const flightFormStart=app.indexOf('if (kind === "flight")',app.indexOf('function mobileFormScreen(')),flightFormEnd=app.indexOf('} else if (kind === "hotel")',flightFormStart),flightForm=app.slice(flightFormStart,flightFormEnd);
assert(flightForm.includes('type="hidden" name="departureTimezone"')&&flightForm.includes('type="hidden" name="arrivalTimezone"'),'flight timezone values are not retained internally');
assert(!flightForm.includes('quickField("departureTimezone"')&&!flightForm.includes('quickField("arrivalTimezone"'),'traveler-facing flight timezone field remains');
assert(app.includes('placeTimezoneForInput(')&&app.includes('Select a known airport or enter its time zone.'),'deterministic airport timezone recovery missing');
assert(css.includes('.form-fields--date-time,.form-fields--activity-time{grid-column:1/-1')&&css.includes('.date-suggestions button{min-height:44px'),'date/time layout or touch targets regressed');
assert(app.includes('Nothing was overwritten.')&&app.includes('Review pending changes before removing local data.'),'sync safety missing');
assert(app.includes('method:"POST",body:JSON.stringify({title:fd.get("title"),category:fd.get("category"),priority:fd.get("priority")})'),'native checklist creation missing');
assert(app.includes('data-edit-version')&&app.includes('method:editId?"PATCH":"POST"'),'native traveler editing missing');
const account=app.slice(app.indexOf('function accountScreen('),app.indexOf('let googleScriptPromise'));
for(const copy of ['My trips','Booking email','go@tripto.to','Take the tour','Sign out'])assert(account.includes(copy),`Account missing: ${copy}`);
for(const internal of ['Trip Health','Smart Essentials','Smart Import'])assert(!account.includes(internal),`internal name exposed: ${internal}`);
assert(sw.includes("url.pathname.startsWith('/api/')")&&sw.includes("navigationCacheKey=isMobileShell?'/index.html':url.pathname"),'service worker isolation missing');
assert(index.indexOf('/mobile-trip-rules.js')<index.indexOf('/mobile-app.js'),'trip rules load order wrong');
assert(!index.includes('/airport-timezones.js')&&app.includes('ensureAirportTimezones'),'airport timezone resolver must remain lazy');
assert(!index.match(/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']+\.(?:css|woff2?)/i),'unexpected external font/style introduced');
// Phosphor is fully removed — the app renders only the approved custom icon family.
assert(!index.includes('/vendor/phosphor/')&&!sw.includes('/vendor/phosphor/')&&!app.includes('class="ph ph-')&&!app.includes('ph-${glyph}')&&!/\bICON_NAMES\b/.test(app),'Phosphor references must be fully removed');
assert(app.includes('const ICON_ALIAS = Object.freeze({')&&app.includes('INLINE_SVG[ICON_ALIAS[name]]')&&app.includes('INLINE_SVG.info'),'approved icon resolver (alias table + neutral fallback, no Phosphor) missing');
assert(!app.includes('const ICONS')&&app.includes('const INLINE_SVG = Object.freeze({')&&app.includes('"wx-sun":')&&app.includes('"wx-cloud-rain":')&&app.includes('tripto-custom-icon-spec-v1')&&(app.match(/<svg/g)||[]).length===1,'approved custom icon SVG registry missing');
{const reg=app.slice(app.indexOf('const INLINE_SVG'),app.indexOf('const state ='));
for(const name of ['home','trips','flight','hotel','car','restaurant','edit','delete','notifications','location','calendar','clock','more','close','check','chevron-right','traveler','documents','ferry','cruise','bus','taxi','confirmed','directions','mountain','beach','landmark'])assert(new RegExp(`\\n\\s{4}["']?${name}["']?:\\s*\\{ vb:`).test(reg),`approved icon missing from registry: ${name}`);}
for(const [alias,target] of [['plane','flight'],['trash','delete'],['bell','notifications'],['user','traveler'],['chevron','chevron-right'],['pin','location'],['qr','qr-code'],['document','documents'],['users','travelers'],['external','external-link'],['check-circle','confirmed'],['dest-mountain','mountain'],['dest-beach','beach'],['dest-monument','landmark']])assert(new RegExp(`["']?${alias}["']?:\\s*"${target}"`).test(app),`approved icon alias mapping missing: ${alias} -> ${target}`);
assert(css.includes('.first-run-screen.welcome-thread')&&css.includes('height:100svh')&&css.includes('--welcome-title:clamp(48px,min(12vw,6.2svh),var(--type-display))')&&css.includes('.welcome-route-matrix')&&css.includes('@media(max-height:620px)')&&css.includes('max-width:400px'),'approved compact height-aware Welcome visual system missing');
assert(!css.includes('#google-signin-button>div{max-width:100%!important;border-radius')&&!css.includes('#google-signin-button>div{max-width:100%!important;overflow:hidden'),'Google Identity button internals must not be cropped or restyled');
const sandbox={};runInNewContext(rules,sandbox);const validate=sandbox.TriptoTripRules?.validateManualTrip;
assert(typeof validate==='function','trip validation unavailable');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-02'}).valid===false,'end before start accepted');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-03'}).valid===true,'same-day trip rejected');
console.log('Product V2 mobile UI contract passed.');
