(function(){
'use strict';

var API='';
var CACHE_PREFIX='tripto_cache_v3:';
var state={
  view:'home',
  token:localStorage.getItem('tripto_token')||'',
  trips:[],
  trip:null,
  timeline:[],
  checklist:[],
  brain:null,
  impacts:[],
  transport:[],
  stays:[],
  locations:[],
  travelers:[],
  loading:true,
  offline:!navigator.onLine,
  lastRefreshAt:null
};
var app=document.getElementById('app');

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function badge(text,kind){return '<span class="badge '+(kind||'')+'">'+esc(text)+'</span>';}
function iconFor(type){return({transport:'✈',stay:'▣',activity:'★',reservation:'⌁',custom:'•'})[type]||'•';}
function dateLabel(v){
  if(!v)return 'Dates not set';
  try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(v+'T00:00:00'));}catch(_){return v;}
}
function timeLabel(ms){
  if(ms==null)return 'Time not set';
  try{return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(Number(ms)));}catch(_){return 'Time unavailable';}
}
function fullDate(ms){
  if(ms==null)return '';
  try{return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date(Number(ms)));}catch(_){return '';}
}
function dateTimeLabel(ms){
  if(ms==null)return 'Unavailable';
  try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(Number(ms)));}catch(_){return 'Unavailable';}
}
function cacheKey(path){return CACHE_PREFIX+path;}
function cacheWrite(path,data){
  try{localStorage.setItem(cacheKey(path),JSON.stringify({at:Date.now(),data:data}));}catch(_){}
}
function cacheRead(path){
  try{var raw=localStorage.getItem(cacheKey(path));return raw?JSON.parse(raw):null;}catch(_){return null;}
}
function cacheStatus(path){
  var c=cacheRead(path);
  if(!c)return {ok:false,at:null};
  return {ok:true,at:c.at||null};
}
function notify(message){
  var old=document.querySelector('.toast'); if(old)old.remove();
  var el=document.createElement('div'); el.className='toast'; el.textContent=message;
  document.body.appendChild(el); setTimeout(function(){el.remove();},3200);
}
function locationById(id){return state.locations.find(function(x){return x.id===id;})||null;}
function locationShort(id){
  var l=locationById(id); if(!l)return 'Location unavailable';
  return l.iata_code||l.station_code||l.display_name||'Location';
}
function daysUntil(dateStr){
  if(!dateStr)return null;
  var target=new Date(dateStr+'T00:00:00'); var today=new Date();
  var d0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.ceil((target-d0)/86400000);
}
function modeForTrip(){
  if(!state.trip)return 'none';
  if(state.trip.lifecycle_state==='active')return 'active';
  var d=daysUntil(state.trip.starts_on);
  if(d!=null&&d<=0&&(!state.trip.ends_on||new Date(state.trip.ends_on+'T23:59:59')>=new Date()))return 'active';
  if(d!=null&&d>0)return 'preparing';
  return state.trip.lifecycle_state||'draft';
}
function activeIssues(){
  var arr=[];
  if(state.brain&&Array.isArray(state.brain.issues))arr=arr.concat(state.brain.issues);
  if(state.brain&&Array.isArray(state.brain.alerts))arr=arr.concat(state.brain.alerts);
  if(Array.isArray(state.impacts))arr=arr.concat(state.impacts.filter(function(x){return x.status==='active';}));
  return arr;
}
function firstStay(){return state.stays[0]||null;}
function firstStayLocation(){
  var s=firstStay(); if(!s)return null;
  return locationById(s.property_location_id||s.start_location_id);
}
function transportForItem(id){return state.transport.find(function(x){return x.id===id||x.trip_item_id===id;})||null;}
function stayForItem(id){return state.stays.find(function(x){return x.id===id||x.trip_item_id===id;})||null;}

async function ensureSession(){
  if(state.token)return state.token;
  if(!navigator.onLine)throw new Error('No saved session is available offline.');
  var r=await fetch(API+'/api/v1/session/guest',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({platform:'web',appVersion:'ui-v3',apiVersion:'v1'})
  });
  if(!r.ok)throw new Error('Could not start guest session.');
  var d=await r.json();
  state.token=d.token; localStorage.setItem('tripto_token',state.token);
  return state.token;
}
async function api(path,opts){
  opts=opts||{}; await ensureSession();
  var headers=Object.assign({'content-type':'application/json','authorization':'Bearer '+state.token},opts.headers||{});
  var r=await fetch(API+path,Object.assign({},opts,{headers:headers}));
  if(r.status===401){
    localStorage.removeItem('tripto_token'); state.token='';
    if(!opts._retry){opts._retry=true;return api(path,opts);}
  }
  if(!r.ok){
    var msg='Request failed ('+r.status+')';
    try{var e=await r.json();msg=(e.error&&e.error.message)||msg;}catch(_){}
    throw new Error(msg);
  }
  if(r.status===204)return null;
  return r.json();
}
async function apiGet(path){
  if(navigator.onLine){
    try{
      var d=await api(path); cacheWrite(path,d); state.offline=false; return d;
    }catch(e){
      var c=cacheRead(path); if(c){state.offline=true;return c.data;} throw e;
    }
  }
  var cached=cacheRead(path);
  if(cached)return cached.data;
  throw new Error('This data has not been cached for offline use yet.');
}
async function loadTrips(){
  state.loading=true; render();
  try{
    var d=await apiGet('/api/v1/trips');
    state.trips=d.trips||[];
    var selected=localStorage.getItem('tripto_selected_trip');
    state.trip=state.trips.find(function(t){return t.id===selected;})||state.trips[0]||null;
    if(state.trip)localStorage.setItem('tripto_selected_trip',state.trip.id);
    await loadTripDetails();
    state.lastRefreshAt=Date.now();
  }catch(e){notify(e.message);}
  finally{state.loading=false;render();}
}
async function loadTripDetails(){
  if(!state.trip){
    state.timeline=[];state.checklist=[];state.brain=null;state.impacts=[];
    state.transport=[];state.stays=[];state.locations=[];state.travelers=[];return;
  }
  var id=encodeURIComponent(state.trip.id);
  var paths=[
    '/api/v1/trips/'+id+'/timeline',
    '/api/v1/trips/'+id+'/checklist',
    '/api/v1/trips/'+id+'/brain',
    '/api/v1/trips/'+id+'/impacts',
    '/api/v1/trips/'+id+'/transport',
    '/api/v1/trips/'+id+'/stays',
    '/api/v1/trips/'+id+'/locations',
    '/api/v1/trips/'+id+'/travelers'
  ];
  var r=await Promise.allSettled(paths.map(apiGet));
  if(r[0].status==='fulfilled')state.timeline=r[0].value.items||[];
  if(r[1].status==='fulfilled')state.checklist=r[1].value.items||[];
  if(r[2].status==='fulfilled')state.brain=r[2].value.brain||null;
  if(r[3].status==='fulfilled')state.impacts=r[3].value.impacts||[];
  if(r[4].status==='fulfilled')state.transport=r[4].value.transport||[];
  if(r[5].status==='fulfilled')state.stays=r[5].value.stays||[];
  if(r[6].status==='fulfilled')state.locations=r[6].value.locations||[];
  if(r[7].status==='fulfilled')state.travelers=r[7].value.travelers||[];
}

function appHeader(){
  return '<header class="topbar"><div class="topbar-inner"><div class="brand">tripto<span>.to</span></div>'+
    '<div class="status-pill '+(state.offline?'offline':'')+'"><span class="status-dot"></span>'+
    (state.offline?'Offline · cached':'Connected')+'</div></div></header>';
}
function bottomNav(){
  var items=[['home','⌂','Home'],['trips','▣','Trips'],['add','＋',''],['timeline','≡','Timeline'],['checklist','✓','Checklist']];
  return '<nav class="nav" aria-label="Primary">'+items.map(function(i){
    if(i[0]==='add')return '<button class="add" data-action="add">＋</button>';
    return '<button data-view="'+i[0]+'" class="'+(state.view===i[0]?'active':'')+'"><span>'+i[1]+'</span><span>'+i[2]+'</span></button>';
  }).join('')+'</nav>';
}
function shell(content){
  return appHeader()+'<main class="main">'+
    (state.offline?'<div class="offline-note">Offline mode. Showing the last verified trip data cached on this device.</div>':'')+
    content+'</main>'+bottomNav()+dialogs();
}
function dialogs(){
  var loc=firstStayLocation(), stay=firstStay();
  var driverName=stay?stay.property_name:'Destination';
  var driverAddress=loc?(loc.local_address||loc.formatted_address||'Address unavailable'):'Address unavailable';
  return ''+
  '<dialog id="tripDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">New trip</div><h2>Create a trip</h2></div><button class="icon-btn" data-close="tripDialog">×</button></div><form id="tripForm" class="form"><div class="field"><label>Trip name</label><input name="title" maxlength="120" required placeholder="Rome 2026"></div><div class="two-col"><div class="field"><label>Starts</label><input type="date" name="startsOn"></div><div class="field"><label>Ends</label><input type="date" name="endsOn"></div></div><button class="btn btn-primary" type="submit">Create trip</button></form></div></dialog>'+
  '<dialog id="bookingDialog" class="dialog booking-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Add booking</div><h2>What are you adding?</h2></div><button class="icon-btn" data-close="bookingDialog">×</button></div><div class="booking-grid">'+
    '<button class="booking-choice" data-booking="flight"><span>✈</span><strong>Flight</strong><small>Scheduled booking data</small></button>'+
    '<button class="booking-choice" data-booking="hotel"><span>▣</span><strong>Hotel / Stay</strong><small>Check-in, address, confirmation</small></button>'+
    '<button class="booking-choice" data-booking="train"><span>⇄</span><strong>Train</strong><small>Stations, service, time</small></button>'+
    '<button class="booking-choice" data-booking="car"><span>⌁</span><strong>Car / Transfer</strong><small>Pickup, drop-off, time</small></button>'+
    '<button class="booking-choice" data-booking="activity"><span>★</span><strong>Activity</strong><small>Reservation or plan</small></button>'+
    '<button class="booking-choice disabled" type="button" disabled><span>▤</span><strong>Document</strong><small>Cloud storage disabled in beta</small></button>'+
  '</div></div></dialog>'+
  '<dialog id="planDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Add plan</div><h2>Add activity</h2></div><button class="icon-btn" data-close="planDialog">×</button></div><form id="planForm" class="form"><div class="field"><label>Type</label><select name="type"><option value="activity">Activity</option><option value="reservation">Reservation</option><option value="custom">Other</option></select></div><div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Vatican Museums"></div><div class="field"><label>When</label><input type="datetime-local" name="when" required></div><button class="btn btn-primary" type="submit">Add plan</button></form></div></dialog>'+
  '<dialog id="hotelDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Stay</div><h2>Add hotel or stay</h2></div><button class="icon-btn" data-close="hotelDialog">×</button></div><form id="hotelForm" class="form"><div class="field"><label>Property name</label><input name="propertyName" maxlength="160" required placeholder="Hotel Artemide"></div><div class="field"><label>Address</label><input name="address" maxlength="300" placeholder="Via Nazionale 22, Rome"></div><div class="field"><label>Local-language address</label><input name="localAddress" maxlength="300" placeholder="Optional"></div><div class="two-col"><div class="field"><label>Check-in</label><input type="date" name="checkInDate"></div><div class="field"><label>Check-out</label><input type="date" name="checkOutDate"></div></div><div class="field"><label>Confirmation number</label><input name="confirmationNumber" maxlength="100"></div><button class="btn btn-primary" type="submit">Add stay</button></form></div></dialog>'+
  '<dialog id="flightDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Flight</div><h2>Add scheduled flight</h2></div><button class="icon-btn" data-close="flightDialog">×</button></div><div class="fact-note">Live flight tracking is off. Enter scheduled information from the ticket or booking confirmation.</div><form id="flightForm" class="form">'+
    '<div class="two-col"><div class="field"><label>Airline code</label><input name="airlineCode" maxlength="3" placeholder="LY"></div><div class="field"><label>Flight number</label><input name="flightNumber" maxlength="12" placeholder="383"></div></div>'+
    '<div class="route-form"><div><div class="field"><label>From airport</label><input name="fromName" required placeholder="Tel Aviv Ben Gurion"></div><div class="two-col"><div class="field"><label>IATA</label><input name="fromCode" maxlength="3" required placeholder="TLV"></div><div class="field"><label>Timezone</label><input name="fromTz" placeholder="Asia/Jerusalem"></div></div></div>'+
    '<div><div class="field"><label>To airport</label><input name="toName" required placeholder="Rome Fiumicino"></div><div class="two-col"><div class="field"><label>IATA</label><input name="toCode" maxlength="3" required placeholder="FCO"></div><div class="field"><label>Timezone</label><input name="toTz" placeholder="Europe/Rome"></div></div></div></div>'+
    '<div class="two-col"><div class="field"><label>Departure</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival</label><input type="datetime-local" name="arrival" required></div></div>'+
    '<div class="two-col"><div class="field"><label>Departure terminal</label><input name="departureTerminal" maxlength="20"></div><div class="field"><label>Arrival terminal</label><input name="arrivalTerminal" maxlength="20"></div></div>'+
    '<button class="btn btn-primary" type="submit">Add flight</button></form></div></dialog>'+
  '<dialog id="trainDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Train</div><h2>Add train</h2></div><button class="icon-btn" data-close="trainDialog">×</button></div><form id="trainForm" class="form">'+
    '<div class="two-col"><div class="field"><label>Operator</label><input name="carrierName" maxlength="120" placeholder="Trenitalia"></div><div class="field"><label>Train / service number</label><input name="serviceNumber" maxlength="40" placeholder="FR 9520"></div></div>'+
    '<div class="two-col"><div class="field"><label>From station</label><input name="fromName" required placeholder="Roma Termini"></div><div class="field"><label>Station code</label><input name="fromCode" maxlength="20"></div></div>'+
    '<div class="two-col"><div class="field"><label>To station</label><input name="toName" required placeholder="Firenze S. M. Novella"></div><div class="field"><label>Station code</label><input name="toCode" maxlength="20"></div></div>'+
    '<div class="two-col"><div class="field"><label>Departure</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival</label><input type="datetime-local" name="arrival" required></div></div>'+
    '<button class="btn btn-primary" type="submit">Add train</button></form></div></dialog>'+
  '<dialog id="carDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Ground transport</div><h2>Add car or transfer</h2></div><button class="icon-btn" data-close="carDialog">×</button></div><form id="carForm" class="form">'+
    '<div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Airport → Hotel"></div>'+
    '<div class="two-col"><div class="field"><label>Pickup</label><input name="fromName" required placeholder="FCO Airport"></div><div class="field"><label>Drop-off</label><input name="toName" required placeholder="Hotel Artemide"></div></div>'+
    '<div class="two-col"><div class="field"><label>Pickup time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Estimated arrival</label><input type="datetime-local" name="arrival"></div></div>'+
    '<button class="btn btn-primary" type="submit">Add transport</button></form></div></dialog>'+
  '<dialog id="detailDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow" id="detailEyebrow">Details</div><h2 id="detailTitle">Booking</h2></div><button class="icon-btn" data-close="detailDialog">×</button></div><div id="detailBody"></div></div></dialog>'+
  '<dialog id="driverDialog" class="dialog driver-dialog"><div class="driver-sheet"><button class="driver-close" data-close="driverDialog">×</button><div class="driver-kicker">SHOW TO DRIVER</div><div class="driver-name">'+esc(driverName)+'</div><div class="driver-address">'+esc(driverAddress)+'</div><div class="driver-note">Saved trip address · available from cached trip data</div></div></dialog>';
}

function loadingView(){return shell('<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');}
function emptyView(){
  return shell('<div class="card empty"><div class="empty-icon">✈</div><div class="eyebrow">Your travel companion</div><h1 style="font-size:42px">Your whole trip.<br>One calm place.</h1><p class="subtle">Start with a real trip. tripto.to will organize the timeline, checklist, Trip Health and what comes next.</p><button class="btn btn-primary" data-open="tripDialog">Create my first trip</button></div>');
}
function preparingBanner(){
  var mode=modeForTrip(), d=daysUntil(state.trip&&state.trip.starts_on);
  var openImportant=state.checklist.filter(function(x){return !x.completed_at&&(x.priority==='critical'||x.priority==='high');}).length;
  var hasStay=state.stays.length>0;
  var hasOutbound=state.transport.length>0;
  if(mode==='preparing'){
    return '<section class="mode-banner preparing"><div><div class="eyebrow">Preparing mode</div><strong>'+(d===1?'Tomorrow':d+' days to go')+'</strong><span>'+(hasOutbound?'Transport added':'Add your transport')+' · '+(hasStay?'Stay added':'Add your stay')+' · '+openImportant+' important task(s) open</span></div><div class="inline-actions"><button class="btn btn-navy" data-view="ready">Ready Offline</button><button class="btn btn-primary" data-open="bookingDialog">Add booking</button></div></section>';
  }
  if(mode==='active'){
    return '<section class="mode-banner active"><div><div class="eyebrow">Travel mode</div><strong>Trip in progress</strong><span>Focus on what is next. Details stay one tap away.</span></div><button class="btn btn-primary" data-view="home">What’s next</button></section>';
  }
  return '';
}
function heroCard(){
  var t=state.trip; var dates=t.starts_on&&t.ends_on?dateLabel(t.starts_on)+' — '+dateLabel(t.ends_on):'Add dates when you are ready';
  return '<section class="card hero card-pad"><div class="eyebrow">'+esc(t.lifecycle_state||'trip')+'</div><div class="hero-title">'+esc(t.title)+'</div><div class="hero-meta">'+esc(dates)+'</div><div class="stat-row"><div class="stat"><strong>'+state.timeline.length+'</strong><span>Plans</span></div><div class="stat"><strong>'+state.checklist.filter(function(x){return !x.completed_at;}).length+'</strong><span>To do</span></div><div class="stat"><strong>'+activeIssues().length+'</strong><span>Issues</span></div></div><div class="hero-actions"><button class="btn btn-primary" data-view="timeline">View timeline</button><button class="btn" data-action="refresh">Refresh</button></div></section>';
}
function nextCard(){
  var n=state.brain&&state.brain.nextItem;
  if(!n)return '<section class="next-card"><div class="eyebrow" style="color:#d8dcff">What’s next?</div><h3>No upcoming plan yet</h3><p>Add a stay, activity or reservation to build your day.</p><button class="btn btn-primary" data-open="planDialog">Add a plan</button></section>';
  var leave=state.brain.recommendedLeaveAtUtc;
  return '<section class="next-card"><div class="eyebrow" style="color:#d8dcff">What’s next?</div><h3>'+esc(n.title)+'</h3><div class="next-time">'+timeLabel(n.startsAtUtc)+'</div><p>'+fullDate(n.startsAtUtc)+(leave?' · Leave around '+timeLabel(leave):' · Travel time unavailable')+'</p><div class="inline-actions"><button class="btn btn-primary" data-view="timeline">Open timeline</button></div></section>';
}
function flightCards(){
  var flights=state.transport.filter(function(x){return x.transport_type==='flight';});
  if(!flights.length)return '<section class="section-block"><div class="section-title"><h2>Flights</h2><button class="btn btn-ghost" data-booking-shortcut="flight">Add flight</button></div></section>';
  return '<section class="section-block"><div class="section-title"><h2>Flights</h2>'+badge('SCHEDULED DATA','badge-indigo')+'</div><div class="travel-card-grid">'+flights.map(function(f){
    var dep=locationShort(f.departure_location_id||f.start_location_id);
    var arr=locationShort(f.arrival_location_id||f.end_location_id);
    var code=(f.marketing_airline_code||f.carrier_name||'Flight')+' '+(f.marketing_flight_number||f.service_number||'');
    return '<article class="travel-card flight-card interactive-card" data-flight-detail="'+esc(f.id||f.trip_item_id)+'"><div class="travel-card-top"><div><div class="eyebrow">Flight</div><h3>'+esc(code.trim())+'</h3></div>'+badge('Confirmed','badge-green')+'</div><div class="route-row"><div><strong>'+esc(dep)+'</strong><span>'+timeLabel(f.scheduled_departure_utc)+'</span></div><div class="route-line">✈</div><div class="route-end"><strong>'+esc(arr)+'</strong><span>'+timeLabel(f.scheduled_arrival_utc)+'</span></div></div><div class="travel-meta"><span>'+fullDate(f.scheduled_departure_utc)+'</span><span>'+(f.departure_terminal?'Terminal '+esc(f.departure_terminal):'Terminal unavailable')+'</span></div><div class="fact-note">Scheduled/confirmed booking data. Live flight tracking is not enabled.</div></article>';
  }).join('')+'</div></section>';
}
function stayCards(){
  if(!state.stays.length)return '<section class="section-block"><div class="section-title"><h2>Stay</h2><button class="btn btn-ghost" data-booking-shortcut="hotel">Add stay</button></div></section>';
  return '<section class="section-block"><div class="section-title"><h2>Stay</h2><button class="btn btn-ghost" data-booking-shortcut="hotel">Add another</button></div><div class="travel-card-grid">'+state.stays.map(function(s){
    var loc=locationById(s.property_location_id||s.start_location_id);
    var addr=loc?(loc.local_address||loc.formatted_address||'Address unavailable'):'Address unavailable';
    return '<article class="travel-card hotel-card interactive-card" data-stay-detail="'+esc(s.id||s.trip_item_id)+'"><div class="travel-card-top"><div><div class="eyebrow">Stay</div><h3>'+esc(s.property_name||s.title)+'</h3></div>'+badge(s.booking_status||'Confirmed','badge-green')+'</div><div class="hotel-dates"><div><span>Check-in</span><strong>'+esc(s.check_in_date?dateLabel(s.check_in_date):'Not set')+'</strong></div><div><span>Check-out</span><strong>'+esc(s.check_out_date?dateLabel(s.check_out_date):'Not set')+'</strong></div></div><div class="address-line">⌖ '+esc(addr)+'</div>'+(s.confirmation_number?'<div class="confirmation">Confirmation · '+esc(s.confirmation_number)+'</div>':'')+'<div class="inline-actions"><button class="btn btn-indigo" data-open="driverDialog">Show to driver</button></div></article>';
  }).join('')+'</div></section>';
}
function timelinePreview(){
  if(!state.timeline.length)return '<div class="empty" style="padding:20px"><p class="subtle">No plans yet.</p><button class="btn btn-ghost" data-open="planDialog">Add first plan</button></div>';
  return '<div class="list">'+state.timeline.slice(0,5).map(function(x){return '<div class="list-item"><div class="item-icon">'+iconFor(x.type)+'</div><div class="item-body"><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.status)+' · '+esc(x.confidence)+'</div></div><div class="item-time">'+timeLabel(x.starts_at_utc)+'</div></div>';}).join('')+'</div>';
}
function smartEssentials(){
  var items=(state.brain&&state.brain.smartEssentials)||state.checklist.filter(function(x){return !x.completed_at&&(x.priority==='critical'||x.priority==='high');}).slice(0,5);
  if(!items.length)return '<div class="health-line"><div class="health-icon">✓</div><div><strong>Essentials look good</strong><div class="subtle">No critical or high-priority checklist items remain.</div></div></div>';
  return items.map(function(x){return '<div class="check-row"><button class="check-box" data-check="'+esc(x.id)+'" aria-label="Complete item"></button><div class="check-text">'+esc(x.title)+'</div>'+badge(x.priority||'high',x.priority==='critical'?'badge-red':'badge-yellow')+'</div>';}).join('');
}
function healthSummary(){
  var issues=activeIssues();
  var missing=state.checklist.filter(function(x){return !x.completed_at&&(x.priority==='critical'||x.priority==='high');});
  return '<div class="health-line"><div class="health-icon">✓</div><div><strong>Timeline available</strong><div class="subtle">'+state.timeline.length+' saved plan(s).</div></div></div>'+
    '<div class="health-line"><div class="health-icon '+(missing.length?'warn':'')+'">'+(missing.length?'!':'✓')+'</div><div><strong>Smart essentials</strong><div class="subtle">'+(missing.length?missing.length+' important item(s) need attention.':'No critical checklist items are open.')+'</div></div></div>'+
    '<div class="health-line"><div class="health-icon '+(issues.length?'warn':'')+'">'+(issues.length?'!':'✓')+'</div><div><strong>Known conflicts</strong><div class="subtle">'+(issues.length?issues.length+' issue(s) detected from current data.':'No known conflicts from available data.')+'</div></div></div>';
}
function offlineReadiness(){
  if(!state.trip)return [];
  var id=encodeURIComponent(state.trip.id);
  var rows=[
    ['Timeline','/api/v1/trips/'+id+'/timeline'],
    ['Checklist','/api/v1/trips/'+id+'/checklist'],
    ['What’s Next','/api/v1/trips/'+id+'/brain'],
    ['Transport','/api/v1/trips/'+id+'/transport'],
    ['Stays','/api/v1/trips/'+id+'/stays'],
    ['Addresses','/api/v1/trips/'+id+'/locations']
  ];
  return rows.map(function(r){var s=cacheStatus(r[1]);return {name:r[0],ok:s.ok,at:s.at};});
}
function readyOfflineCard(compact){
  var rows=offlineReadiness(), ok=rows.filter(function(x){return x.ok;}).length, total=rows.length;
  var list=rows.map(function(x){return '<div class="offline-row"><div class="offline-check '+(x.ok?'ok':'warn')+'">'+(x.ok?'✓':'!')+'</div><div><strong>'+esc(x.name)+'</strong><span>'+(x.ok?'Cached on this device':'Open online once to cache')+'</span></div></div>';}).join('');
  var documents='<div class="offline-row"><div class="offline-check neutral">—</div><div><strong>Documents</strong><span>Cloud document storage is intentionally disabled in this beta.</span></div></div>';
  if(compact)return '<section class="card card-pad"><div class="section-title"><h2>Ready Offline</h2>'+badge(ok+'/'+total,'badge-green')+'</div><div class="subtle">'+ok+' of '+total+' core trip datasets cached.</div><button class="btn btn-ghost" style="margin-top:12px" data-view="ready">Review offline readiness</button></section>';
  return '<div class="page-head"><div><div class="eyebrow">Offline</div><h1>Ready Offline</h1><div class="subtle">Your trip should never disappear because your internet did.</div></div>'+badge(ok+'/'+total,'badge-green')+'</div><section class="card card-pad"><div class="offline-list">'+list+documents+'</div><div class="fact-note">Cached flight status is never presented as live. Live-flight integration is currently disabled.</div></section>';
}
function homeView(){
  return shell(preparingBanner()+'<div class="page-head"><div><div class="eyebrow">Home / Next</div><h1>'+esc(state.trip.title)+'</h1><div class="subtle">The trip changes. Home stays simple.</div></div>'+badge(state.trip.lifecycle_state||'draft')+'</div><div class="grid home-grid"><div class="grid">'+heroCard()+flightCards()+stayCards()+'<section class="card card-pad"><div class="section-title"><h2>Timeline</h2><button class="btn btn-ghost" data-view="timeline">View all</button></div>'+timelinePreview()+'</section></div><div class="grid">'+nextCard()+'<section class="card card-pad"><div class="section-title"><h2>Smart Essentials</h2><button class="btn btn-ghost" data-view="checklist">View all</button></div>'+smartEssentials()+'</section><section class="card card-pad"><div class="section-title"><h2>Trip Health</h2><button class="btn btn-ghost" data-view="health">Details</button></div>'+healthSummary()+'</section>'+readyOfflineCard(true)+'</div></div>');
}
function tripsView(){
  return shell('<div class="page-head"><div><div class="eyebrow">Trips</div><h1>My trips</h1><div class="subtle">Upcoming, active and completed travel in one place.</div></div><button class="btn btn-primary" data-open="tripDialog">New trip</button></div><div class="trip-list">'+state.trips.map(function(t){return '<article class="trip-card '+(state.trip&&t.id===state.trip.id?'active':'')+'" data-trip="'+esc(t.id)+'"><div>'+badge(t.lifecycle_state||'draft')+'</div><h3>'+esc(t.title)+'</h3><div class="trip-dates">'+esc(t.starts_on?dateLabel(t.starts_on):'No start date')+(t.ends_on?' → '+dateLabel(t.ends_on):'')+'</div></article>';}).join('')+'</div>');
}
function timelineView(){
  var body=state.timeline.length?'<div class="timeline">'+state.timeline.map(function(x){
    var specialized=transportForItem(x.id)||stayForItem(x.id);
    var extra='';
    if(specialized&&x.type==='transport'){
      extra='<div class="timeline-extra">'+esc(locationShort(specialized.departure_location_id))+' → '+esc(locationShort(specialized.arrival_location_id))+'</div>';
    }else if(specialized&&x.type==='stay'){
      var l=locationById(specialized.property_location_id); if(l)extra='<div class="timeline-extra">'+esc(l.display_name||l.formatted_address||'')+'</div>';
    }
    return '<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-box"><div class="timeline-top"><div><div class="timeline-title">'+iconFor(x.type)+' &nbsp;'+esc(x.title)+'</div><div class="item-sub">'+fullDate(x.starts_at_utc)+' · '+esc(x.status)+' · '+esc(x.confidence)+'</div></div><div class="item-time">'+timeLabel(x.starts_at_utc)+'</div></div>'+extra+(x.subtitle?'<div class="subtle" style="margin-top:8px">'+esc(x.subtitle)+'</div>':'')+'</div></div>';
  }).join('')+'</div>':'<div class="empty"><div class="empty-icon">⌁</div><h2>No plans yet</h2><p class="subtle">Add your first activity or reservation.</p></div>';
  return shell('<div class="page-head"><div><div class="eyebrow">Timeline</div><h1>'+esc(state.trip.title)+'</h1><div class="subtle">Confirmed facts, estimates and unavailable data stay clearly separated.</div></div><button class="btn btn-primary" data-open="planDialog">Add plan</button></div>'+body);
}
function checklistView(){
  var open=state.checklist.filter(function(x){return !x.completed_at;});
  var done=state.checklist.filter(function(x){return !!x.completed_at;});
  function rows(items){
    return items.map(function(x){return '<div class="check-row"><button class="check-box '+(x.completed_at?'done':'')+'" data-check="'+esc(x.id)+'">'+(x.completed_at?'✓':'')+'</button><div class="check-text">'+esc(x.title)+'</div>'+badge(x.priority||'medium',x.priority==='critical'?'badge-red':x.priority==='high'?'badge-yellow':'')+'</div>';}).join('');
  }
  return shell('<div class="page-head"><div><div class="eyebrow">Preparing</div><h1>Smart Essentials</h1><div class="subtle">Travel-specific tasks, not another generic todo list.</div></div><button class="btn btn-primary" data-action="seed">Add essentials</button></div><section class="card card-pad"><div class="section-title"><h2>Still to do</h2>'+badge(open.length+' left','badge-yellow')+'</div>'+ (open.length?rows(open):'<div class="health-line"><div class="health-icon">✓</div><div><strong>All clear</strong><div class="subtle">No open checklist items.</div></div></div>')+'</section>'+(done.length?'<section class="card card-pad" style="margin-top:18px"><div class="section-title"><h2>Completed</h2></div>'+rows(done)+'</section>':''));
}
function healthView(){
  var issues=activeIssues();
  var issuesHtml='';
  if(issues.length){
    issuesHtml='<section class="card card-pad" style="margin-top:18px"><div class="section-title"><h2>Issues</h2></div><div class="list">'+
      issues.map(function(x){
        return '<div class="list-item"><div class="item-icon">!</div><div class="item-body"><div class="item-title">'+
          esc(x.title||x.message||x.explanation_code||'Issue')+
          '</div><div class="item-sub">'+esc(x.severity||'info')+'</div></div></div>';
      }).join('')+
      '</div></section>';
  }
  return shell(
    '<div class="page-head"><div><div class="eyebrow">Trip Health</div><h1>'+
    (issues.length?'Needs attention':'Everything looks good')+
    '</h1><div class="subtle">No false precision. Only known issues from current trip data.</div></div>'+
    '<button class="btn btn-indigo" data-action="recalc">Recalculate</button></div>'+
    '<section class="card card-pad">'+healthSummary()+'</section>'+issuesHtml
  );
}
function readyView(){return shell(readyOfflineCard(false));}
function render(){
  if(state.loading){app.innerHTML=loadingView();bind();return;}
  if(!state.trip){app.innerHTML=emptyView();bind();return;}
  var out=state.view==='trips'?tripsView():state.view==='timeline'?timelineView():state.view==='checklist'?checklistView():state.view==='health'?healthView():state.view==='ready'?readyView():homeView();
  app.innerHTML=out; bind();
}

function bind(){
  document.querySelectorAll('[data-view]').forEach(function(el){el.addEventListener('click',function(){state.view=el.dataset.view;render();});});
  document.querySelectorAll('[data-open]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.open);if(d)d.showModal();});});
  document.querySelectorAll('[data-close]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.close);if(d)d.close();});});
  document.querySelectorAll('[data-trip]').forEach(function(el){el.addEventListener('click',async function(){
    state.trip=state.trips.find(function(t){return t.id===el.dataset.trip;})||state.trip;
    localStorage.setItem('tripto_selected_trip',state.trip.id); state.loading=true; render(); await loadTripDetails(); state.loading=false; state.view='home'; render();
  });});
  document.querySelectorAll('[data-check]').forEach(function(el){el.addEventListener('click',async function(){
    var item=state.checklist.find(function(x){return x.id===el.dataset.check;}); if(!item)return;
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/checklist/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({version:item.version,completed:!item.completed_at})});await loadTripDetails();render();}catch(e){notify(e.message);}
  });});
  document.querySelectorAll('[data-action="refresh"]').forEach(function(el){el.addEventListener('click',loadTrips);});
  document.querySelectorAll('[data-action="add"]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById('bookingDialog');if(d)d.showModal();});});
  document.querySelectorAll('[data-action="seed"]').forEach(function(el){el.addEventListener('click',seedChecklist);});
  document.querySelectorAll('[data-action="recalc"]').forEach(function(el){el.addEventListener('click',recalcImpacts);});
  document.querySelectorAll('[data-booking]').forEach(function(el){el.addEventListener('click',function(){
    var chooser=document.getElementById('bookingDialog'); if(chooser)chooser.close();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog'};
    var d=document.getElementById(map[el.dataset.booking]); if(d)d.showModal();
  });});
  document.querySelectorAll('[data-booking-shortcut]').forEach(function(el){el.addEventListener('click',function(e){
    e.stopPropagation();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog'};
    var d=document.getElementById(map[el.dataset.bookingShortcut]); if(d)d.showModal();
  });});
  document.querySelectorAll('[data-flight-detail]').forEach(function(el){el.addEventListener('click',function(){
    openFlightDetail(el.dataset.flightDetail);
  });});
  document.querySelectorAll('[data-stay-detail]').forEach(function(el){el.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('[data-open=\"driverDialog\"]'))return;
    openStayDetail(el.dataset.stayDetail);
  });});


  var tripForm=document.getElementById('tripForm');
  if(tripForm)tripForm.addEventListener('submit',async function(e){
    e.preventDefault(); var fd=new FormData(tripForm);
    try{
      var d=await api('/api/v1/trips',{method:'POST',body:JSON.stringify({title:fd.get('title'),startsOn:fd.get('startsOn')||null,endsOn:fd.get('endsOn')||null,lifecycleState:'upcoming'})});
      state.trips.unshift(d.trip);state.trip=d.trip;localStorage.setItem('tripto_selected_trip',d.trip.id);document.getElementById('tripDialog').close();await loadTripDetails();state.view='home';render();
    }catch(err){notify(err.message);}
  });
  var planForm=document.getElementById('planForm');
  if(planForm)planForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(planForm);var ms=new Date(String(fd.get('when'))).getTime();
    if(!Number.isFinite(ms)){notify('Please enter a valid date and time.');return;}
    try{
      await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/timeline',{method:'POST',body:JSON.stringify({type:fd.get('type'),status:'confirmed',title:fd.get('title'),startsAtUtc:ms,sourceType:'manual',confidence:'confirmed'})});
      document.getElementById('planDialog').close();planForm.reset();await loadTripDetails();render();
    }catch(err){notify(err.message);}
  });
  var hotelForm=document.getElementById('hotelForm');
  if(hotelForm)hotelForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(hotelForm);
    try{
      var locationId=null;
      var address=String(fd.get('address')||'').trim(), localAddress=String(fd.get('localAddress')||'').trim();
      if(address||localAddress){
        var loc=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/locations',{method:'POST',body:JSON.stringify({type:'hotel',displayName:fd.get('propertyName'),formattedAddress:address||null,localAddress:localAddress||null})});
        locationId=loc.location.id;
      }
      await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/stays',{method:'POST',body:JSON.stringify({propertyName:fd.get('propertyName'),propertyLocationId:locationId,checkInDate:fd.get('checkInDate')||null,checkOutDate:fd.get('checkOutDate')||null,confirmationNumber:fd.get('confirmationNumber')||null})});
      document.getElementById('hotelDialog').close();hotelForm.reset();await loadTripDetails();render();
    }catch(err){notify(err.message);}
  });
  var flightForm=document.getElementById('flightForm');
  if(flightForm)flightForm.addEventListener('submit',async function(e){
    e.preventDefault(); var fd=new FormData(flightForm);
    try{
      var depMs=new Date(String(fd.get('departure'))).getTime(), arrMs=new Date(String(fd.get('arrival'))).getTime();
      if(!Number.isFinite(depMs)||!Number.isFinite(arrMs)||arrMs<depMs)throw new Error('Please enter valid departure and arrival times.');
      var from=await createLocation('airport',fd.get('fromName'),{iataCode:String(fd.get('fromCode')||'').toUpperCase(),timezone:fd.get('fromTz')||null});
      var to=await createLocation('airport',fd.get('toName'),{iataCode:String(fd.get('toCode')||'').toUpperCase(),timezone:fd.get('toTz')||null});
      var code=String(fd.get('airlineCode')||'').toUpperCase(), num=String(fd.get('flightNumber')||'').trim();
      await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify({
        transportType:'flight',title:(code||'Flight')+(num?' '+num:''),departureLocationId:from.id,arrivalLocationId:to.id,
        scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs,departureTimezone:fd.get('fromTz')||null,arrivalTimezone:fd.get('toTz')||null,
        marketingAirlineCode:code||null,marketingFlightNumber:num||null,departureTerminal:fd.get('departureTerminal')||null,arrivalTerminal:fd.get('arrivalTerminal')||null
      })});
      document.getElementById('flightDialog').close(); flightForm.reset(); await loadTripDetails(); render(); notify('Flight added.');
    }catch(err){notify(err.message);}
  });

  var trainForm=document.getElementById('trainForm');
  if(trainForm)trainForm.addEventListener('submit',async function(e){
    e.preventDefault(); var fd=new FormData(trainForm);
    try{
      var depMs=new Date(String(fd.get('departure'))).getTime(), arrMs=new Date(String(fd.get('arrival'))).getTime();
      if(!Number.isFinite(depMs)||!Number.isFinite(arrMs)||arrMs<depMs)throw new Error('Please enter valid departure and arrival times.');
      var from=await createLocation('station',fd.get('fromName'),{stationCode:fd.get('fromCode')||null});
      var to=await createLocation('station',fd.get('toName'),{stationCode:fd.get('toCode')||null});
      var carrier=String(fd.get('carrierName')||'').trim(), service=String(fd.get('serviceNumber')||'').trim();
      await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify({
        transportType:'train',title:(carrier||'Train')+(service?' '+service:''),carrierName:carrier||null,serviceNumber:service||null,
        departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs
      })});
      document.getElementById('trainDialog').close(); trainForm.reset(); await loadTripDetails(); render(); notify('Train added.');
    }catch(err){notify(err.message);}
  });

  var carForm=document.getElementById('carForm');
  if(carForm)carForm.addEventListener('submit',async function(e){
    e.preventDefault(); var fd=new FormData(carForm);
    try{
      var depMs=new Date(String(fd.get('departure'))).getTime();
      var arrivalValue=String(fd.get('arrival')||'');
      var arrMs=arrivalValue?new Date(arrivalValue).getTime():null;
      if(!Number.isFinite(depMs)||(arrMs!=null&&!Number.isFinite(arrMs))||(arrMs!=null&&arrMs<depMs))throw new Error('Please enter valid transport times.');
      var from=await createLocation('address',fd.get('fromName'),{});
      var to=await createLocation('address',fd.get('toName'),{});
      await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify({
        transportType:'car',title:fd.get('title'),departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs
      })});
      document.getElementById('carDialog').close(); carForm.reset(); await loadTripDetails(); render(); notify('Transport added.');
    }catch(err){notify(err.message);}
  });

}

async function createLocation(type,name,extra){
  extra=extra||{};
  var body={type:type,displayName:String(name||'').trim()};
  if(!body.displayName)throw new Error('Location name is required.');
  Object.keys(extra).forEach(function(k){if(extra[k]!=null&&extra[k]!=='')body[k]=extra[k];});
  var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/locations',{method:'POST',body:JSON.stringify(body)});
  return d.location;
}
function openFlightDetail(id){
  var f=state.transport.find(function(x){return String(x.id||x.trip_item_id)===String(id);});
  if(!f)return;
  var dep=locationById(f.departure_location_id||f.start_location_id), arr=locationById(f.arrival_location_id||f.end_location_id);
  var title=((f.marketing_airline_code||f.carrier_name||'Flight')+' '+(f.marketing_flight_number||f.service_number||'')).trim();
  document.getElementById('detailEyebrow').textContent='Flight details';
  document.getElementById('detailTitle').textContent=title||'Flight';
  document.getElementById('detailBody').innerHTML=
    '<div class="detail-route"><div><strong>'+esc(dep?(dep.iata_code||dep.display_name):'From')+'</strong><span>'+dateTimeLabel(f.scheduled_departure_utc)+'</span></div><div class="detail-plane">✈</div><div><strong>'+esc(arr?(arr.iata_code||arr.display_name):'To')+'</strong><span>'+dateTimeLabel(f.scheduled_arrival_utc)+'</span></div></div>'+
    '<div class="detail-grid"><div><span>Departure terminal</span><strong>'+esc(f.departure_terminal||'Unavailable')+'</strong></div><div><span>Arrival terminal</span><strong>'+esc(f.arrival_terminal||'Unavailable')+'</strong></div><div><span>Status source</span><strong>Confirmed booking</strong></div><div><span>Live status</span><strong>Not enabled</strong></div></div>'+
    '<div class="fact-note">tripto.to will never present this scheduled information as live. Live-flight integration remains disabled.</div>';
  document.getElementById('detailDialog').showModal();
}
function openStayDetail(id){
  var s=state.stays.find(function(x){return String(x.id||x.trip_item_id)===String(id);});
  if(!s)return;
  var loc=locationById(s.property_location_id||s.start_location_id);
  document.getElementById('detailEyebrow').textContent='Stay details';
  document.getElementById('detailTitle').textContent=s.property_name||s.title||'Stay';
  document.getElementById('detailBody').innerHTML=
    '<div class="detail-grid"><div><span>Check-in</span><strong>'+esc(s.check_in_date?dateLabel(s.check_in_date):'Not set')+'</strong></div><div><span>Check-out</span><strong>'+esc(s.check_out_date?dateLabel(s.check_out_date):'Not set')+'</strong></div><div><span>Confirmation</span><strong>'+esc(s.confirmation_number||'Unavailable')+'</strong></div><div><span>Booking status</span><strong>'+esc(s.booking_status||'Confirmed')+'</strong></div></div>'+
    '<div class="detail-address"><span>Address</span><strong>'+esc(loc?(loc.local_address||loc.formatted_address||loc.display_name):'Unavailable')+'</strong></div>'+
    '<div class="inline-actions"><button class="btn btn-indigo" id="detailDriverButton">Show to driver</button></div>';
  var detail=document.getElementById('detailDialog');
  detail.showModal();
  var btn=document.getElementById('detailDriverButton');
  if(btn)btn.addEventListener('click',function(){
    detail.close();
    var driver=document.getElementById('driverDialog'); if(driver)driver.showModal();
  });
}
async function seedChecklist(){
  try{
    await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/checklist/seed',{method:'POST',body:JSON.stringify({international:true,durationDays:7,hasFlight:state.transport.some(function(x){return x.transport_type==='flight';}),travelerCount:Math.max(1,state.travelers.length),destinationCountryCode:null})});
    await loadTripDetails();render();notify('Travel essentials added.');
  }catch(e){notify(e.message);}
}
async function recalcImpacts(){
  try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/impacts/recalculate',{method:'POST',body:'{}'});await loadTripDetails();render();notify('Trip Health recalculated.');}catch(e){notify(e.message);}
}

window.addEventListener('online',function(){state.offline=false;loadTrips();});
window.addEventListener('offline',function(){state.offline=true;render();});
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
loadTrips();
})();