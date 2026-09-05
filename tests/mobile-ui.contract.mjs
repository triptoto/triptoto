import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Mobile UI contract failed: ${m}`)};
const index=read('public/index.html'),css=read('public/mobile-app.css'),app=read('public/mobile-app.js'),sw=read('public/sw.js'),shellUpdate=read('public/shell-update.js'),rules=read('public/mobile-trip-rules.js'),routeSource=read('public/mobile-routes.js'),manifest=read('public/manifest.webmanifest'),iconSprite=read('public/icons/tripto-system.svg'),phosphorLicense=read('public/icons/PHOSPHOR-LICENSE.txt'),privacy=read('public/privacy.html'),terms=read('public/terms.html');
assert(index.includes('/mobile-app.min.css')&&index.includes('/mobile-app.min.js')&&index.includes('/mobile-routes.js')&&index.includes('/mobile-trip-rules.js')&&index.includes('/google-auth-client.js'),'mobile assets missing');
assert(index.includes('/shell-update.js?v=shell-refresh-v1')&&shellUpdate.includes('controllerchange')&&shellUpdate.includes('window.location.reload()')&&sw.includes('/shell-update.js'),'service-worker shell refresh wiring missing');
assert(!index.includes('/airport-timezones.js')&&!index.includes('/places-provider.js')&&!index.includes('/places-search-worker.js'),'flow-specific search assets must stay lazy');
assert(!index.includes('/app.js')&&!app.includes('/legacy.html')&&!sw.includes('/legacy.html'),'legacy presentation leaked into Product V2');
assert(css.includes('--app-width:430px')&&css.includes('env(safe-area-inset-bottom)')&&css.includes('env(safe-area-inset-top)'),'mobile sizing or safe areas missing');
assert(css.includes('--font-ui:-apple-system')&&css.includes('BlinkMacSystemFont')&&css.includes('--font-title:var(--font-ui)')&&css.includes('--font:var(--font-ui)')&&!css.includes('Nunito')&&!css.includes('"Inter"')&&!css.includes('"Geist"')&&!css.includes('DM Serif Display'),'unified Apple system font stack changed');
assert(!index.includes('/vendor/dm-serif-display/')&&!index.includes('/vendor/geist/')&&!sw.includes('/vendor/dm-serif-display/')&&!sw.includes('/vendor/geist/'),'obsolete webfont remains in the application shell');
assert(!privacy.includes('/vendor/dm-serif-display/')&&!terms.includes('/vendor/dm-serif-display/')&&!privacy.includes('/vendor/geist/')&&!terms.includes('/vendor/geist/')&&privacy.includes('--font:-apple-system')&&terms.includes('--font:-apple-system')&&privacy.includes('font-family:var(--font)')&&terms.includes('font-family:var(--font)'),'legal interface pages do not use the Apple system stack');
for(const selector of ['.trip-v2-selector strong','.trip-group .trip-row__copy strong','.journey-copy strong','.fd-title','.hotel-detail-screen .fd-flight','.booking-card[data-action="booking-detail"] strong','.booking-trip-group>h2','.quick-trip-context strong'])assert(css.includes(selector),`Apple title role missing: ${selector}`);
for(const token of ['--type-display:40px','--type-route:40px','--type-screen:28px','--type-section:20px','--type-body:16px','--type-meta:14px','--type-label:12px'])assert(css.includes(token),`typography scale missing: ${token}`);
for(const token of ['--weight-regular:400','--weight-medium:500','--weight-semibold:600','--weight-bold:700'])assert(css.includes(token),`typography weight missing: ${token}`);
assert(css.includes('--welcome-title:clamp(36px,min(10vw,5.8svh),var(--type-display))'),'Welcome does not consume the shared display scale');
assert(!/font-weight:\s*(?:650|750|800)\b/.test(css),'nonstandard text weight remains outside the approved typography hierarchy');
assert(css.includes('font-size:var(--type-route);font-weight:var(--weight-bold)')&&css.includes('font-size:var(--type-screen);font-weight:var(--weight-bold)')&&css.includes('font-size:var(--type-section);font-weight:var(--weight-semibold)'),'typographic role hierarchy mappings changed');
for(const color of ['--paper:#fbf8f7','--card:#ffffff','--surface:#f3eff0','--ink:#05152d','--muted:#596474','--muted-soft:#667180','--icon:#0a2445','--accent:#5547b7','--fab:#fbc840','--green:#006b49','--amber:#9b3b0b','--red:#9f2f41','--next:#b84d16','--flight-soft:#d9e4fb','--transfer-soft:#fee4cf','--stay-soft:#d1edde'])assert(css.includes(color),`single production palette missing: ${color}`);
const tokenHex=name=>css.match(new RegExp(`--${name}:(#[0-9a-f]{6})`,'i'))?.[1];
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.03928?value/12.92:((value+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
const contrast=(foreground,background)=>{const a=luminance(tokenHex(foreground)),b=luminance(tokenHex(background));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
for(const [foreground,background] of [['muted','paper'],['muted-soft','paper'],['accent','card'],['green','green-soft'],['amber','amber-soft'],['red','red-soft']])assert(contrast(foreground,background)>=4.5,`${foreground} text fails AA contrast on ${background}`);
assert(index.includes('<html lang="en">')&&index.includes('<meta name="theme-color" content="#fbf8f7">')&&index.includes('<meta name="color-scheme" content="light">'),'single production shell must load without a theme class and use its real light canvas');
assert(!/(?:theme-(?:harbor|slate|daylight|amethyst|crimson)|set-theme|theme-picker|theme-swatch)/.test(index+css+app),'obsolete multi-theme implementation remains');
for(const oldColor of ['#141948','#2f3bab','#febf02','#f2f4f7','#f7f8fa'])assert(!css.toLowerCase().includes(oldColor)&&!manifest.toLowerCase().includes(oldColor),`old palette remains: ${oldColor}`);
assert(manifest.includes('"background_color": "#FBF8F7"')&&manifest.includes('"theme_color": "#FBF8F7"'),'PWA palette is stale');
assert(css.includes('overflow-x:hidden')&&css.includes('overflow-x:clip'),'horizontal overflow protection missing');
assert(css.includes('@media(prefers-reduced-motion:reduce)')&&css.includes('min-height:44px'),'motion or touch safety missing');
const navFn=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
assert(navFn.includes('navBtn("trips", "plane", "Trip")')&&navFn.includes('navBtn("trip-options", "route", "Trip options")')&&navFn.includes('data-action="open-add"')&&navFn.includes('navBtn("checklist", "checklist", "To-do")')&&navFn.includes('navBtn("account", "user", "Account")'),'V2 navigation must remain Trip / Trip options / Add / To-do / Account with the approved airplane and route icons');
const nav=navFn.slice(navFn.indexOf('return `<nav'));
assert(nav.indexOf('navBtn("trips"')<nav.indexOf('navBtn("trip-options"')&&nav.indexOf('navBtn("trip-options"')<nav.indexOf('${addBtn}')&&nav.indexOf('${addBtn}')<nav.indexOf('navBtn("checklist"')&&nav.indexOf('navBtn("checklist"')<nav.indexOf('navBtn("account"'),'V2 navigation order (Trip, Trip options, Add, To-do, Account) is wrong');
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
  ['trip-options',null,'/trip-options'],
  ['collaboration',null,'/collaboration'],
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
const retiredLocalGuide=router.parsePath('/local-guide');
assert(retiredLocalGuide.screen==='trip-options'&&retiredLocalGuide.redirect===true,'retired Local Guide route must redirect to Trip Options');
assert(!app.includes('hashchange')&&!app.includes('const hash = "#"')&&!app.includes('"#timeline"'),'active hash routing remains in the application');
assert(app.includes('startupRoute.redirect || location.hash')&&app.includes('routeUrl(startupRoute.screen, startupRoute.id)'),'legacy hash and retired-route canonicalization missing');
assert(sw.includes('/canonical-host.js')&&sw.includes('/mobile-routes.js')&&!sw.includes("'/airport-timezones.js'")&&sw.includes('/google-auth-client.js')&&sw.includes('/manual-booking-attachments.js')&&sw.includes('/icons/tripto-system.svg')&&sw.includes('/mobile-app.min.css')&&sw.includes('/mobile-app.min.js')&&sw.includes('tripto-shell-product-v112-trip-filters'),'clean route, canonical host, lazy search, optimized shell, manual-attachment, icon, booking-email inbox, live-flight, Google-auth, typography, currency, or shell cache contract changed');
const welcome=app.slice(app.indexOf('function firstRunScreen('),app.indexOf('function timelineScreen('));
for(const copy of ['Add it once.','Follow the trip.','The essential details stay close','Continue with Google','Take a tour','google-signin-button','first-run-google-preview'])assert(welcome.includes(copy),`Welcome missing: ${copy}`);
assert(app.includes('welcome-route-matrix')&&app.includes('welcome-route-cell--next')&&app.includes('Times + route')&&app.includes('Ready offline')&&app.includes('Know what matters'),'Welcome route matrix is incomplete');
assert(css.includes('background:var(--paper);color:var(--ink)')&&css.includes('.welcome-route-matrix')&&css.includes('.welcome-route-cell--next')&&!css.includes('--welcome-serif'),'Welcome must use the selected Route Matrix visual and Apple interface typography');
assert(!welcome.includes('bottomNav(')&&app.includes('(state.account?.mode || "guest") !== "account"')&&app.includes('state.trips.length === 0'),'Welcome gate/navigation invalid');
assert(app.includes('["empty", "empty-offline", "empty-reduced-motion"].includes(QA_STATE)'),'isolated first-run visual QA state missing');
assert(/\/google-auth-client\.js\?v=google-auth-ios-v\d+/.test(index)&&index.indexOf('/google-auth-client.js')<index.indexOf('/mobile-app.min.js')&&app.includes('/api/v1/auth/google/challenge')&&app.includes('/api/v1/auth/google')&&app.includes('/api/v1/auth/google/exchange'),'Google sign-in or secure iOS redirect handoff wiring missing');
assert(!app.includes('Gmail access')&&!app.includes('Google Drive access')&&!app.includes('Google Calendar access'),'forbidden Google scope surfaced');
for(const field of ['["destination","Destination","text",true,true]','["startsOn","Start date","date",true,false]','["endsOn","End date","date",true,false]','["title","Trip name","text",false,true]'])assert(app.includes(field),`Create Trip field missing: ${field}`);
assert(app.includes('const tripNameField = editingTrip')&&app.includes('aria-label="Trip dates"'),'New Trip must omit the trip-name field while Edit Trip preserves it');
assert(app.includes('name="destinationPlace"')&&app.includes('data-place-types="city,airport" data-place-preferred="city"'),'Create Trip place search missing');
assert(app.includes('data-place-search-close')&&app.includes('data-place-search-clear')&&app.includes('setFullScreen')&&app.includes('Search destination')&&app.includes('fullScreenPanel.focus({ preventScroll:true })')&&app.includes('request += 1;'),'Create Trip destination search must open as an accessible full-screen task, clear safely, cancel stale searches, and restore focus without reopening the keyboard');
assert(app.includes('trip-create-search-guide__privacy')&&app.includes('Private on this phone · ready offline'),'destination search must surface a private, ready-offline reassurance');
assert(app.includes('function samePlaceResult(')&&app.includes('rows = [...offlineRows, ...savedPlaceResults(query, types)]')&&app.includes('all.findIndex((row) => samePlaceResult(row, place)) === index'),'Create Trip destination results must keep provider ranking and remove semantic duplicates');
assert(app.includes('hidden.setAttribute("value", serializedPlace)')&&!app.includes('hidden.dispatchEvent(new Event("input"'),'selected place snapshots must persist without emitting a synthetic input event that can clear the selection');
assert(app.includes('const ownRequest = ++request;')&&app.includes('window.setTimeout(() => search(ownRequest), 70)')&&app.includes('fullScreenPanel?.addEventListener("keydown"')&&!app.includes('trip-create-search-guide__examples')&&!app.includes('data-place-example=')&&app.includes('event.key !== "Tab"'),'Create Trip destination search must reject stale results, omit decorative shortcuts, and trap keyboard focus inside the full-screen task');
for(const marker of ['trip-create-route','trip-create-destination__head','Worldwide city and airport search','trip-create-details','You can change every detail later.'])assert(app.includes(marker),`Create Trip travel canvas missing: ${marker}`);
assert(app.includes('editingTrip?"Save changes":`Next ${icon("chevron",18)}`'),'new-trip header action must read Next with a right chevron');
for(const selector of ['.trip-create-head::after','.trip-create-route__plane','.trip-create-destination','.trip-create-details','.trip-create-reassurance'])assert(css.includes(selector),`Create Trip destination design missing: ${selector}`);
for(const selector of ['.trip-create-destination.is-fullscreen','.trip-create-search-guide','.trip-create-destination.is-fullscreen .place-option','.trip-create-destination.is-fullscreen .trip-create-destination__clear'])assert(css.includes(selector),`full-screen destination design missing: ${selector}`);
assert(css.includes('.full-screen-picker,.trip-create-destination.is-fullscreen{--picker-bg:var(--paper);--picker-surface:var(--card);--picker-ink:var(--ink);--picker-accent:var(--accent)'),'trip pickers must share the warm travel canvas, white surface, ink, and accent system');
assert(css.includes('height:100svh;min-height:0;margin:0;padding:0 18px calc(18px + env(safe-area-inset-bottom) + var(--keyboard-offset))')&&!css.includes('calc(100svh - var(--keyboard-offset))'),'destination search must cover the complete viewport while reserving keyboard space inside the screen');
assert(css.includes('.trip-create-details>.date-range-field legend{position:absolute'),'Travel dates must remain accessible without a visible label');
assert(app.includes('function dateRangeField(')&&app.includes('data-action="open-date-range"')&&app.includes('data-action="select-range-day"')&&app.includes('data-action="apply-date-range"'),'single-calendar date range controls missing');
assert(app.includes('full-screen-picker date-range-screen')&&app.includes('data-action="clear-date-range"')&&!app.includes('bottomSheet("date-range"'),'date selection must be a dedicated full-screen task rather than a popup');
const datePicker=app.slice(app.indexOf('function dateRangeSheet()'),app.indexOf('function addSheet()'));
assert(datePicker.includes('range-picker__instruction')&&!datePicker.includes('range-picker__intro')&&!datePicker.includes('range-picker__arrow'),'date picker must keep one compact instruction and avoid duplicated headings or decorative color blocks');
assert(datePicker.includes('"Select dates"')&&datePicker.includes('"Confirm dates"')&&datePicker.includes('"Your travel window is ready."'),'date picker must use concise title, guidance, and confirmation copy');
const tripSetup=app.slice(app.indexOf('function tripSetupReadyScreen()'),app.indexOf('function addSheet()'));
for(const copy of ['Plan your trip',"Still haven't booked the flights?",'Still looking for a place to stay?','Need an eSIM?','Compare routes on Aviasales','Browse stays on Booking.com','Get connected before you land','Partner links may earn Tripto a commission at no extra cost.'])assert(tripSetup.includes(copy),`post-dates trip setup missing: ${copy}`);
assert(app.includes('state.sheet = "trip-setup-ready"')&&tripSetup.includes('target="_blank"')&&tripSetup.includes('routeUrl("esim")')&&tripSetup.includes('sponsored ')&&!app.includes('complete-trip-setup-partner')&&!app.includes('afterTripCreatePartner')&&!app.includes('afterTripCreateScreen'),'post-dates recommendations must open separately without creating the trip');
assert((tripSetup.match(/tool\("trip-setup-tool--/g)||[]).length===3,'all three post-dates recommendations must use the separate-tab link component');
assert(app.includes('if (state.sheet === "trip-setup-ready") ensureStay22().catch(() => {})'),'Stay22 must enhance the prepared stay link without blocking its direct fallback');
assert(app.includes('marker=465464')&&app.includes('trs=570553')&&app.includes('lmaID: STAY22_LMA_ID')&&app.includes('https://scripts.stay22.com/letmeallez.js'),'approved Aviasales and Stay22 partner configuration missing');
for(const selector of ['.trip-setup-ready','.trip-setup-ready__hero','.trip-setup-tool--flight','.trip-setup-tool--stay','.trip-setup-tool--esim','.trip-setup-tool__copy','.trip-setup-tool__external'])assert(css.includes(selector),`post-dates trip setup design missing: ${selector}`);
assert(css.includes('@keyframes full-screen-picker-in{from{transform:translate(-50%,12px)}')&&!css.includes('@keyframes full-screen-picker-in{from{opacity:'),'full-screen date picker must stay opaque throughout its opening animation');
for(const selector of ['.full-screen-picker{','.full-screen-picker__bar{','.range-picker__calendar{','.full-screen-picker__footer{'])assert(css.includes(selector),`full-screen date picker design missing: ${selector}`);
assert(css.includes('.full-screen-picker__back{width:44px;height:44px;')&&css.includes('.full-screen-picker__clear{min-width:52px;min-height:44px')&&css.includes('.range-day{position:relative;display:grid;place-items:center;min-width:0;min-height:44px'),'full-screen date controls must keep 44px touch targets');
assert(app.includes('dateRangeField("startsOn", "endsOn"')&&app.includes('dateRangeField("checkInDate", "checkOutDate"'),'trip and hotel ranges are not using the shared calendar');
assert(!app.includes('tripDateField(')&&!css.includes('.trip-date-control'),'old two-calendar presentation remains');
assert(app.includes('kind==="trip"?"add-booking"'),'Create Trip does not continue to Add Booking');
assert(app.includes('sessionStorage.setItem(quickDraftKey(kind)')&&app.includes('Discard changes?'),'form recovery missing');
const add=app.slice(app.indexOf('function addBookingScreen('),app.indexOf('function documentSheet('));
for(const copy of ['ADD NEW BOOKING','Add to your trip','Choose a type and add the confirmed details.','Already have a confirmation?','Upload a file','Forward an email'])assert(add.includes(copy),`direct manual-add page missing: ${copy}`);
for(const category of ['Flight','Train','Ferry','Bus / Coach','Cruise','Car Rental','Transfer','Taxi / Ride','Parking','Hotel / Stay','Restaurant','Tour / Excursion','Activity / Event','Museum / Attraction','Event / Show','Travel Insurance','Other'])assert(app.includes(`label: "${category}"`),`manual category missing: ${category}`);
for(const selector of ['.manual-add-intro','.manual-add-grid','.manual-add-card','.manual-add-other'])assert(css.includes(selector),`manual-add design missing: ${selector}`);
const plus=app.slice(app.indexOf('function addSheet('),app.indexOf('function addBookingScreen('));
assert(plus.includes('Add Booking')&&plus.includes('Create New Trip')&&!plus.includes('Flight'),'plus menu invalid');
assert(app.includes('function timelineContextCard('),'Timeline priority context missing');
assert(app.includes('if (isEmptyTripSetup()) return "";'),'empty trip must not surface premature health warnings');
assert(app.includes('timeline-empty__eyebrow">Start building'),'empty-trip setup hierarchy missing');
assert(css.includes('.timeline-page--empty')&&css.includes('min-height:calc(100dvh - var(--header-h) - var(--nav-height))')&&css.includes('padding-bottom:calc(var(--nav-height) + env(safe-area-inset-bottom) + 6vh)'),'empty timeline viewport sizing missing');
assert(app.includes('timeline-empty__add')&&app.includes('emptySetup ? "plus" : "calendar"'),'Product V2 empty-trip structure missing');
for(const concept of ['need attention','Now','Next','Before you go'])assert(app.includes(concept),`Timeline state missing: ${concept}`);
assert(app.includes('timeline-day__header')&&app.includes('journey-event journey-event--${phase}')&&app.includes('timelineDay(starts, zone)'),'Timeline structure/local grouping missing');
assert(app.includes('showTimelineStatus = !["confirmed", "booked", "complete", "completed"].includes(statusKey)')&&!css.includes('.journey-event--confirmed .journey-meta'),'confirmed Timeline events must not repeat a green status line');
{const glyphSource=app.slice(app.indexOf('function timelineIcon('),app.indexOf('function timelineSecondary(')),glyphContext={val:(item,...keys)=>{for(const key of keys)if(item?.[key]!=null&&item[key]!=="")return item[key];return null;}};
runInNewContext(glyphSource,glyphContext);
for(const [title,type,expected] of [['Breakfast reservation','activity','restaurant'],['Lunch in Rome','activity','restaurant'],['Coffee & pastry','activity','coffee'],['Wine tasting','activity','bar'],['Gondola ride','activity','ferry'],['City transfer','activity','taxi'],['Photography walk','activity','camera'],['Souvenir shopping','activity','shopping'],['Italian cooking class','activity','cooking'],['Tasting menu','activity','restaurant'],['Rome walking tour','activity','tour']])assert(glyphContext.timelineGlyph({title},type,null)===expected,`wrong Timeline glyph for ${title}: expected ${expected}`);}
{const previewSource=app.slice(app.indexOf('function previewData('),app.indexOf('function applyPreviewData(')),previewContext={};runInNewContext(previewSource,previewContext);const demo=previewContext.previewData(),romeIds=new Set(['breakfast','photo-walk','coffee','lunch','activity','shopping','wine']),romeDay=demo.timeline.filter(item=>romeIds.has(item.id)).sort((a,b)=>a.starts_at_utc-b.starts_at_utc),locations=new Map(demo.locations.map(location=>[location.id,location]));
assert(demo.sharing?.enabled===true,'Plan Together must be available in visual preview');
assert(romeDay.length===romeIds.size,'trustworthy Rome demo day is incomplete');
assert(romeDay.every((item,index)=>item.start_timezone==='Europe/Rome'&&locations.get(item.start_location_id)?.city==='Rome'&&(!index||romeDay[index-1].ends_at_utc<=item.starts_at_utc)),'Rome demo day changes city, overlaps, or loses local timezone');
const outbound=demo.transport.find(item=>item.id==='train'),returning=demo.transport.find(item=>item.id==='train-return');
assert(outbound?.departure_location_id==='termini'&&outbound?.arrival_location_id==='florence'&&returning?.departure_location_id==='florence'&&returning?.arrival_location_id==='termini'&&outbound.scheduled_arrival_utc<=returning.scheduled_departure_utc,'Florence day trip lacks realistic outbound and return trains');
assert(!JSON.stringify(demo).includes('Venice'),'unreachable Venice stop leaked into the Rome demo');}
assert(app.includes('timeline-screen--ribbon')&&app.includes('timeline-ribbon')&&css.includes('.timeline-screen--ribbon .timeline-day')&&css.includes('html .bottom-nav'),'selected production timeline and navigation system missing');
assert(css.includes('background:color-mix(in srgb,var(--accent) 88%,#000)')&&!css.includes('.bottom-nav .nav-item:nth-child(1) .nav-item__icon'),'bottom navigation must use one unified theme-tinted (accent, slightly darkened) surface without per-destination icon colors');
assert(app.includes('navBtn("trip-options", "route", "Trip options")')&&app.includes('"route", "notifications"'),'Trip options must use the Route icon with a selected-state glyph');
for(const token of ['--timeline-trip-title-size:clamp(24px,6.7vw,28px)','--timeline-booking-title-size:clamp(17px,4.6vw,19px)','--timeline-metadata-size:clamp(15px,3.9vw,16px)','--timeline-status-size:clamp(14px,3.7vw,15px)','--timeline-time-size:clamp(15px,4vw,17px)','--timeline-day-size:clamp(14px,3.85vw,16px)'])assert(css.includes(token),`Timeline typography role missing: ${token}`);
const timelineFn=app.slice(app.indexOf('function timelineScreen('),app.indexOf('function patchTimelineLiveStatus('));
assert(timelineFn.includes('data-action="switch-trip"')&&timelineFn.includes('notifyAction()')&&!timelineFn.includes('data-action="open-trip-menu"'),'Timeline header must use the trip selector and Notifications, not duplicate Trip options');
assert(app.includes('function tripOptionsScreen(')&&app.includes('case "trip-options": html = tripOptionsScreen()')&&app.includes('route("trip-options")')&&app.includes('data-screen="documents"')&&!app.includes('data-screen="local-guide"'),'full-page trip options (weather/currency/map/eSIM/documents/collaboration/edit/help) missing or retired Local Guide still exposed');
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
assert(index.indexOf('/mobile-trip-rules.js')<index.indexOf('/mobile-app.min.js'),'trip rules load order wrong');
assert(!index.includes('/airport-timezones.js')&&app.includes('ensureAirportTimezones'),'airport timezone resolver must remain lazy');
assert(!index.match(/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']+\.(?:css|woff2?)/i),'unexpected external font/style introduced');
// One locally generated Phosphor system supplies normal, travel, weather and
// selected navigation icons without a runtime CDN or a second legacy registry.
assert(!index.includes('/vendor/phosphor/')&&!sw.includes('/vendor/phosphor/')&&!app.includes('class="ph ph-')&&!app.includes('ph-${glyph}')&&!app.includes('INLINE_SVG'),'legacy or externally loaded icon implementation remains');
assert(app.includes('const ICON_ALIAS = Object.freeze({')&&app.includes('const ICON_SPRITE = "";')&&app.includes('const FILLED_ICON_IDS = new Set(')&&app.includes('<use href="${ICON_SPRITE}#${symbol}"></use>'),'local Phosphor sprite resolver missing');
assert(index.includes('data-icon-sprite')&&index.includes('<symbol id="accessibility"')&&iconSprite.includes('<symbol id="accessibility"'),'icon sprite must be inlined same-document in index.html');
assert(phosphorLicense.includes('MIT License')&&phosphorLicense.includes('Phosphor Icons'),'Phosphor attribution/license file missing');
for(const name of ['home','trips','flight','hotel','car','restaurant','coffee','bar','cooking','shopping','camera','tour','edit','delete','notifications','location','calendar','clock','more','close','check','chevron-right','traveler','documents','ferry','cruise','bus','taxi','confirmed','directions','mountain','beach','landmark','wx-sun','wx-cloud-rain'])assert(iconSprite.includes(`<symbol id="${name}"`),`Phosphor icon missing from sprite: ${name}`);
for(const name of ['flight','map','route','notifications','checklist','traveler'])assert(iconSprite.includes(`<symbol id="${name}--fill"`),`selected-state icon missing from sprite: ${name}`);
assert(navFn.includes('norm === screen ? "fill" : "regular"'),'selected bottom navigation does not use Phosphor Fill');
for(const [alias,target] of [['plane','flight'],['trash','delete'],['bell','notifications'],['user','traveler'],['chevron','chevron-right'],['pin','location'],['qr','qr-code'],['document','documents'],['users','travelers'],['external','external-link'],['check-circle','confirmed'],['dest-mountain','mountain'],['dest-beach','beach'],['dest-monument','landmark']])assert(new RegExp(`["']?${alias}["']?:\\s*"${target}"`).test(app),`approved icon alias mapping missing: ${alias} -> ${target}`);
assert(css.includes('.first-run-screen.welcome-thread')&&css.includes('height:100svh')&&css.includes('--welcome-title:clamp(36px,min(10vw,5.8svh),var(--type-display))')&&css.includes('.welcome-route-matrix')&&css.includes('@media(max-height:620px)')&&css.includes('max-width:400px'),'approved compact height-aware Welcome visual system missing');
assert(!css.includes('#google-signin-button>div{max-width:100%!important;border-radius')&&!css.includes('#google-signin-button>div{max-width:100%!important;overflow:hidden'),'Google Identity button internals must not be cropped or restyled');
const sandbox={};runInNewContext(rules,sandbox);const validate=sandbox.TriptoTripRules?.validateManualTrip;
assert(typeof validate==='function','trip validation unavailable');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-02'}).valid===false,'end before start accepted');
assert(validate({title:'Rome',startsOn:'2026-09-03',endsOn:'2026-09-03'}).valid===true,'same-day trip rejected');
assert(validate({title:'Rome',startsOn:'',endsOn:''}).valid===true,'undated draft trip rejected');
assert(validate({title:'Rome',startsOn:'',endsOn:'2026-09-03'}).valid===false,'partial date range accepted');
for(const copy of ["I don’t know my dates yet","Dates not set","Compare routes on Aviasales","Browse stays on Booking.com"])assert(app.includes(copy),`undated trip flow missing: ${copy}`);
assert(app.includes('case "skip-date-range"')&&app.includes('optional: form.dataset.kind === "trip"')&&app.includes('lifecycleState:values.startsOn?"upcoming":"draft"'),'undated trips must skip both dates and save as drafts');
console.log('Product V2 mobile UI contract passed.');
