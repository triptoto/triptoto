(function(){
'use strict';

var API='';
var CACHE_PREFIX='tripto_cache_v3:';
var state={
  view:localStorage.getItem('tripto_view')||'home',
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
  connections:[],
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
function timeLabelInZone(ms,timeZone){
  if(ms==null)return 'Time not set';
  try{return new Intl.DateTimeFormat(undefined,{timeZone:timeZone||undefined,hour:'2-digit',minute:'2-digit'}).format(new Date(Number(ms)));}catch(_){return timeLabel(ms);}
}
function dateTimeLabelInZone(ms,timeZone){
  if(ms==null)return 'Unavailable';
  try{return new Intl.DateTimeFormat(undefined,{timeZone:timeZone||undefined,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(Number(ms)));}catch(_){return dateTimeLabel(ms);}
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

function setupSteps(){
  var important=state.checklist.filter(function(x){return !x.completed_at&&(x.priority==='critical'||x.priority==='high');}).length;
  return [
    {key:'transport',label:'Add transport',done:state.transport.length>0,action:'flight'},
    {key:'stay',label:'Add a stay',done:state.stays.length>0,action:'hotel'},
    {key:'essentials',label:'Prepare essentials',done:state.checklist.length>0&&important===0,view:'checklist'},
    {key:'offline',label:'Cache core trip data',done:offlineReadiness().every(function(x){return x.ok;}),view:'ready'}
  ];
}
function setupProgress(){
  var steps=setupSteps(), done=steps.filter(function(x){return x.done;}).length;
  return {done:done,total:steps.length,steps:steps};
}
function firstRunSeen(){return localStorage.getItem('tripto_onboarding_seen')==='1';}
function markOnboardingSeen(){localStorage.setItem('tripto_onboarding_seen','1');}
function persistView(){localStorage.setItem('tripto_view',state.view);}

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
    state.transport=[];state.stays=[];state.locations=[];state.travelers=[];state.connections=[];return;
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
    '/api/v1/trips/'+id+'/travelers',
    '/api/v1/trips/'+id+'/connections'
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
  if(r[8].status==='fulfilled')state.connections=r[8].value.connections||[];
}

function travelerChecks(){
  if(!state.travelers.length)return '<div class="form-note">No travelers yet. You can add travelers from Preparing Mode.</div>';
  return '<div class="traveler-checks">'+state.travelers.map(function(t){return '<label><input type="checkbox" name="travelerIds" value="'+esc(t.id)+'"><span>'+esc(t.display_name)+'</span></label>';}).join('')+'</div>';
}
function transportOptionRows(){
  return state.transport.map(function(t){var label=(t.transport_type||'transport')+' · '+(t.title||t.service_number||'Booking');return '<option value="'+esc(t.id||t.trip_item_id)+'">'+esc(label)+'</option>';}).join('');
}
function itemTitle(id){
  var x=state.timeline.find(function(i){return i.id===id;});return x?x.title:'Trip item';
}
function recovery(message,detail){
  var d=document.getElementById('recoveryDialog');
  if(!d){notify(message);return;}
  var title=document.getElementById('recoveryTitle'),body=document.getElementById('recoveryBody');
  if(title)title.textContent=message||'Something needs attention';
  if(body)body.textContent=detail||'Your existing trip data is safe. Review the fields and try again.';
  if(!d.open)d.showModal();
}
function localToUtc(localValue,timeZone){
  if(!localValue||!timeZone)throw new Error('Local time and IANA timezone are required.');
  var m=String(localValue).match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/);
  if(!m)throw new Error('Enter a valid local date and time.');
  try{new Intl.DateTimeFormat('en-US',{timeZone:timeZone}).format(new Date());}catch(_){throw new Error('Timezone must be a valid IANA timezone, for example Europe/Rome.');}
  var target=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]));
  var guess=target;
  for(var i=0;i<3;i++){
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
    var seen=Date.UTC(Number(o.year),Number(o.month)-1,Number(o.day),Number(o.hour),Number(o.minute));
    guess+=target-seen;
  }
  var checkParts=new Intl.DateTimeFormat('en-CA',{timeZone:timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  var c={};checkParts.forEach(function(p){if(p.type!=='literal')c[p.type]=p.value;});
  var check=[c.year,c.month,c.day].join('-')+'T'+c.hour+':'+c.minute;
  var wanted=[m[1],m[2],m[3]].join('-')+'T'+m[4]+':'+m[5];
  if(check!==wanted)throw new Error('That local time is ambiguous or unavailable because of a timezone/DST transition. Choose a different time or verify the booking.');
  return guess;
}
function utcToLocalInput(ms,timeZone){
  if(ms==null)return '';
  var tz=timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  try{
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(ms)));
    var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
    return [o.year,o.month,o.day].join('-')+'T'+o.hour+':'+o.minute;
  }catch(_){return '';}
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
  var travelersHtml=state.travelers.length?state.travelers.map(function(t){return '<div class="manager-row"><div><strong>'+esc(t.display_name)+'</strong><span>'+esc(t.traveler_type||'unknown')+'</span></div><div class="inline-actions"><button class="btn btn-ghost compact" data-traveler-edit="'+esc(t.id)+'">Edit</button><button class="btn btn-danger compact" data-traveler-delete="'+esc(t.id)+'">Remove</button></div></div>';}).join(''):'<div class="form-note">No travelers added yet.</div>';
  var connectionHtml=state.connections.length?state.connections.map(function(c){return '<div class="manager-row"><div><strong>'+esc(itemTitle(c.from_item_id))+' → '+esc(itemTitle(c.to_item_id))+'</strong><span>'+esc(c.connection_type)+' · '+(c.recommended_buffer_minutes==null?'buffer not set':c.recommended_buffer_minutes+' min buffer')+'</span></div><div class="connection-actions"><select data-connection-type="'+esc(c.id)+'" data-version="'+esc(c.version)+'"><option value="protected" '+(c.connection_type==='protected'?'selected':'')+'>Protected</option><option value="self_transfer" '+(c.connection_type==='self_transfer'?'selected':'')+'>Self-transfer</option><option value="planned_transfer" '+(c.connection_type==='planned_transfer'?'selected':'')+'>Planned transfer</option><option value="unknown" '+(c.connection_type==='unknown'?'selected':'')+'>Unknown</option></select><button class="btn btn-danger compact" data-connection-delete="'+esc(c.id)+'" data-version="'+esc(c.version)+'">Remove</button></div></div>';}).join(''):'<div class="form-note">No explicit connections yet. Add one when timing between bookings matters.</div>';
  return ''+
  '<dialog id="tripDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">New trip</div><h2>Create a trip</h2></div><button class="icon-btn" data-close="tripDialog">×</button></div><form id="tripForm" class="form"><div class="field"><label>Trip name</label><input name="title" maxlength="120" required placeholder="Rome 2026"></div><div class="two-col"><div class="field"><label>Starts</label><input type="date" name="startsOn"></div><div class="field"><label>Ends</label><input type="date" name="endsOn"></div></div><button class="btn btn-primary" type="submit">Create trip</button></form></div></dialog>'+
  '<dialog id="bookingDialog" class="dialog booking-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Quick Add</div><h2>Add to your trip</h2></div><button class="icon-btn" data-close="bookingDialog">×</button></div><div class="booking-grid"><button class="booking-choice" data-booking="flight"><span>✈</span><strong>Flight</strong><small>Timezone-safe scheduled booking</small></button><button class="booking-choice" data-booking="hotel"><span>▣</span><strong>Hotel / Stay</strong><small>Check-in, address, confirmation</small></button><button class="booking-choice" data-booking="train"><span>⇄</span><strong>Train</strong><small>Stations and event-local times</small></button><button class="booking-choice" data-booking="car"><span>⌁</span><strong>Car / Transfer</strong><small>Pickup and drop-off</small></button><button class="booking-choice" data-booking="activity"><span>★</span><strong>Activity</strong><small>Reservation or plan</small></button><button class="booking-choice" data-booking="traveler"><span>◉</span><strong>Travelers</strong><small>People on this trip</small></button></div></div></dialog>'+
  '<dialog id="planDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Add plan</div><h2>Add activity</h2></div><button class="icon-btn" data-close="planDialog">×</button></div><form id="planForm" class="form"><div class="field"><label>Type</label><select name="type"><option value="activity">Activity</option><option value="reservation">Reservation</option><option value="custom">Other</option></select></div><div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Vatican Museums"></div><div class="field"><label>When</label><input type="datetime-local" name="when" required></div><button class="btn btn-primary" type="submit">Add plan</button></form></div></dialog>'+
  '<dialog id="hotelDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Stay</div><h2 id="hotelDialogTitle">Add hotel or stay</h2></div><button class="icon-btn" data-close="hotelDialog">×</button></div><form id="hotelForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="locationId"><div class="field"><label>Property name</label><input name="propertyName" maxlength="160" required placeholder="Hotel Artemide"></div><div class="field"><label>Address</label><input name="address" maxlength="300" placeholder="Via Nazionale 22, Rome"></div><div class="field"><label>Local-language address</label><input name="localAddress" maxlength="300" placeholder="Optional"></div><div class="two-col"><div class="field"><label>Check-in</label><input type="date" name="checkInDate"></div><div class="field"><label>Check-out</label><input type="date" name="checkOutDate"></div></div><div class="field"><label>Confirmation number</label><input name="confirmationNumber" maxlength="100"></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="hotelSubmit" type="submit">Add stay</button></form></div></dialog>'+
  '<dialog id="flightDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Flight</div><h2 id="flightDialogTitle">Add scheduled flight</h2></div><button class="icon-btn" data-close="flightDialog">×</button></div><div class="fact-note">Times are interpreted in the airport timezones you enter, not in the device timezone. Live flight tracking remains off.</div><form id="flightForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="two-col"><div class="field"><label>Airline code</label><input name="airlineCode" maxlength="3" placeholder="LY"></div><div class="field"><label>Flight number</label><input name="flightNumber" maxlength="12" placeholder="383"></div></div><div class="route-form"><div><div class="field"><label>From airport</label><input name="fromName" required placeholder="Tel Aviv Ben Gurion"></div><div class="two-col"><div class="field"><label>IATA</label><input name="fromCode" maxlength="3" required placeholder="TLV"></div><div class="field"><label>Timezone</label><input name="fromTz" required placeholder="Asia/Jerusalem"></div></div></div><div><div class="field"><label>To airport</label><input name="toName" required placeholder="Rome Fiumicino"></div><div class="two-col"><div class="field"><label>IATA</label><input name="toCode" maxlength="3" required placeholder="FCO"></div><div class="field"><label>Timezone</label><input name="toTz" required placeholder="Europe/Rome"></div></div></div></div><div class="two-col"><div class="field"><label>Departure · local airport time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival · local airport time</label><input type="datetime-local" name="arrival" required></div></div><div class="two-col"><div class="field"><label>Departure terminal</label><input name="departureTerminal" maxlength="20"></div><div class="field"><label>Arrival terminal</label><input name="arrivalTerminal" maxlength="20"></div></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="flightSubmit" type="submit">Add flight</button></form></div></dialog>'+
  '<dialog id="trainDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Train</div><h2 id="trainDialogTitle">Add train</h2></div><button class="icon-btn" data-close="trainDialog">×</button></div><form id="trainForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="two-col"><div class="field"><label>Operator</label><input name="carrierName" maxlength="120" placeholder="Trenitalia"></div><div class="field"><label>Train / service number</label><input name="serviceNumber" maxlength="40" placeholder="FR 9520"></div></div><div class="two-col"><div class="field"><label>From station</label><input name="fromName" required placeholder="Roma Termini"></div><div class="field"><label>From timezone</label><input name="fromTz" required placeholder="Europe/Rome"></div></div><div class="two-col"><div class="field"><label>To station</label><input name="toName" required placeholder="Firenze S. M. Novella"></div><div class="field"><label>To timezone</label><input name="toTz" required placeholder="Europe/Rome"></div></div><div class="two-col"><div class="field"><label>Departure · local time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival · local time</label><input type="datetime-local" name="arrival" required></div></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="trainSubmit" type="submit">Add train</button></form></div></dialog>'+
  '<dialog id="carDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Ground transport</div><h2 id="carDialogTitle">Add car or transfer</h2></div><button class="icon-btn" data-close="carDialog">×</button></div><form id="carForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Airport → Hotel"></div><div class="two-col"><div class="field"><label>Pickup</label><input name="fromName" required placeholder="FCO Airport"></div><div class="field"><label>Drop-off</label><input name="toName" required placeholder="Hotel Artemide"></div></div><div class="field"><label>Timezone</label><input name="timezone" required placeholder="Europe/Rome"></div><div class="two-col"><div class="field"><label>Pickup · local time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Estimated arrival · local time</label><input type="datetime-local" name="arrival"></div></div><button class="btn btn-primary" id="carSubmit" type="submit">Add transport</button></form></div></dialog>'+
  '<dialog id="travelerDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Travelers</div><h2>People on this trip</h2></div><button class="icon-btn" data-close="travelerDialog">×</button></div><div class="manager-list">'+travelersHtml+'</div><form id="travelerForm" class="form manager-form"><input type="hidden" name="editId"><input type="hidden" name="version"><div class="two-col"><div class="field"><label>Name</label><input name="displayName" required maxlength="120" placeholder="Traveler name"></div><div class="field"><label>Type</label><select name="travelerType"><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option><option value="unknown">Unknown</option></select></div></div><button class="btn btn-primary" id="travelerSubmit" type="submit">Add traveler</button></form></div></dialog>'+
  '<dialog id="connectionDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Connections</div><h2>Connection protection</h2></div><button class="icon-btn" data-close="connectionDialog">×</button></div><div class="fact-note">Use Protected only when segments are actually on a protected through-ticket. Self-transfer means the next carrier may not protect you if the first segment is late.</div><div class="manager-list">'+connectionHtml+'</div><form id="connectionForm" class="form manager-form"><div class="two-col"><div class="field"><label>From</label><select name="fromItemId" required><option value="">Choose transport</option>'+transportOptionRows()+'</select></div><div class="field"><label>To</label><select name="toItemId" required><option value="">Choose transport</option>'+transportOptionRows()+'</select></div></div><div class="two-col"><div class="field"><label>Connection type</label><select name="connectionType"><option value="unknown">Unknown</option><option value="protected">Protected ticket</option><option value="self_transfer">Self-transfer</option><option value="planned_transfer">Planned transfer</option></select></div><div class="field"><label>Recommended buffer · minutes</label><input type="number" min="0" max="1440" name="recommendedBufferMinutes" value="90"></div></div><div class="connection-flags"><label><input type="checkbox" name="requiresBaggageReclaim"> Baggage reclaim</label><label><input type="checkbox" name="requiresImmigration"> Immigration</label><label><input type="checkbox" name="requiresAirportChange"> Airport change</label></div><button class="btn btn-primary" type="submit">Add connection</button></form></div></dialog>'+
  '<dialog id="detailDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow" id="detailEyebrow">Details</div><h2 id="detailTitle">Booking</h2></div><button class="icon-btn" data-close="detailDialog">×</button></div><div id="detailBody"></div></div></dialog>'+
  '<dialog id="recoveryDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Recovery</div><h2 id="recoveryTitle">Something needs attention</h2></div><button class="icon-btn" data-close="recoveryDialog">×</button></div><p class="subtle" id="recoveryBody">Your existing trip data is safe.</p><div class="inline-actions"><button class="btn btn-primary" data-action="recovery-refresh">Refresh trip</button><button class="btn" data-close="recoveryDialog">Close</button></div></div></dialog>'+
  '<dialog id="driverDialog" class="dialog driver-dialog"><div class="driver-sheet"><button class="driver-close" data-close="driverDialog">×</button><div class="driver-kicker">SHOW TO DRIVER</div><div class="driver-name">'+esc(driverName)+'</div><div class="driver-address">'+esc(driverAddress)+'</div><div class="driver-note">Saved trip address · available from cached trip data</div></div></dialog>';
}

function loadingView(){return shell('<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');}
function emptyView(){
  var intro=
    '<section class="onboarding-hero"><div class="onboarding-brand">tripto<span>.to</span></div><div class="eyebrow">Your travel companion</div><h1>Your trip.<br>Organized before you need it.</h1><p>Build one calm itinerary for transport, stays, plans, essentials and offline access.</p><div class="onboarding-actions"><button class="btn btn-primary btn-large" data-open="tripDialog" data-onboarding-start="1">Create my first trip</button><button class="btn btn-navy" data-action="show-how">How it works</button></div></section>'+
    '<section class="onboarding-grid">'+
      '<article class="onboarding-card"><div class="onboarding-icon">≡</div><div><strong>One timeline</strong><span>Flights, hotels, trains, transfers and activities in travel order.</span></div></article>'+
      '<article class="onboarding-card"><div class="onboarding-icon">✓</div><div><strong>Prepare smarter</strong><span>Travel-specific essentials and missing items surface before departure.</span></div></article>'+
      '<article class="onboarding-card"><div class="onboarding-icon">⇩</div><div><strong>Offline-first</strong><span>Cache core trip data so your itinerary stays useful without internet.</span></div></article>'+
    '</section>'+
    '<section id="howItWorks" class="how-section"><div class="eyebrow">How it works</div><div class="how-grid">'+
      '<div><b>1</b><strong>Create a trip</strong><span>Add dates and your first booking.</span></div>'+
      '<div><b>2</b><strong>Prepare</strong><span>Finish essentials and cache your trip.</span></div>'+
      '<div><b>3</b><strong>Travel</strong><span>Open Home for what is next and what needs attention.</span></div>'+
    '</div></section>';
  return shell(intro);
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
  return '<section class="next-card"><div class="eyebrow" style="color:#d8dcff">What’s next?</div><h3>'+esc(n.title)+'</h3><div class="next-time">'+timeLabelInZone(n.startsAtUtc,n.startTimezone)+'</div><p>'+fullDate(n.startsAtUtc)+(leave?' · Leave around '+timeLabelInZone(leave,n.startTimezone):' · Travel time unavailable')+'</p><div class="inline-actions"><button class="btn btn-primary" data-view="timeline">Open timeline</button></div></section>';
}
function flightCards(){
  var flights=state.transport.filter(function(x){return x.transport_type==='flight';});
  if(!flights.length)return '<section class="section-block"><div class="section-title"><h2>Flights</h2><button class="btn btn-ghost" data-booking-shortcut="flight">Add flight</button></div></section>';
  return '<section class="section-block"><div class="section-title"><h2>Flights</h2>'+badge('SCHEDULED DATA','badge-indigo')+'</div><div class="travel-card-grid">'+flights.map(function(f){
    var dep=locationShort(f.departure_location_id||f.start_location_id);
    var arr=locationShort(f.arrival_location_id||f.end_location_id);
    var code=(f.marketing_airline_code||f.carrier_name||'Flight')+' '+(f.marketing_flight_number||f.service_number||'');
    return '<article class="travel-card flight-card interactive-card" data-flight-detail="'+esc(f.id||f.trip_item_id)+'"><div class="travel-card-top"><div><div class="eyebrow">Flight</div><h3>'+esc(code.trim())+'</h3></div>'+badge('Confirmed','badge-green')+'</div><div class="route-row"><div><strong>'+esc(dep)+'</strong><span>'+timeLabelInZone(f.scheduled_departure_utc,f.departure_timezone)+'</span></div><div class="route-line">✈</div><div class="route-end"><strong>'+esc(arr)+'</strong><span>'+timeLabelInZone(f.scheduled_arrival_utc,f.arrival_timezone)+'</span></div></div><div class="travel-meta"><span>'+fullDate(f.scheduled_departure_utc)+'</span><span>'+(f.departure_terminal?'Terminal '+esc(f.departure_terminal):'Terminal unavailable')+'</span></div><div class="fact-note">Scheduled/confirmed booking data. Live flight tracking is not enabled.</div></article>';
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
  return '<div class="list">'+state.timeline.slice(0,5).map(function(x){return '<div class="list-item"><div class="item-icon">'+iconFor(x.type)+'</div><div class="item-body"><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.status)+' · '+esc(x.confidence)+'</div></div><div class="item-time">'+timeLabelInZone(x.starts_at_utc,x.start_timezone)+'</div></div>';}).join('')+'</div>';
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

function preparingDashboard(){
  if(modeForTrip()!=='preparing')return '';
  var p=setupProgress();
  return '<section class="card card-pad setup-card"><div class="section-title"><div><div class="eyebrow">Trip setup</div><h2>'+p.done+' of '+p.total+' ready</h2></div>'+badge(p.done===p.total?'Ready':'Preparing',p.done===p.total?'badge-green':'badge-yellow')+'</div>'+
    '<div class="setup-steps">'+p.steps.map(function(s){
      var attrs=s.view?'data-view="'+s.view+'"':'data-booking-shortcut="'+s.action+'"';
      return '<button class="setup-step '+(s.done?'done':'')+'" '+attrs+'><span class="setup-check">'+(s.done?'✓':'+')+'</span><span>'+esc(s.label)+'</span></button>';
    }).join('')+'</div>'+
    '<div class="setup-foot"><span>No health percentage. This only shows concrete preparation steps.</span></div></section>';
}
function quickActions(){
  return '<section class="quick-actions"><button data-booking-shortcut="flight"><span>✈</span><b>Flight</b></button><button data-booking-shortcut="hotel"><span>▣</span><b>Stay</b></button><button data-booking-shortcut="train"><span>⇄</span><b>Train</b></button><button data-booking-shortcut="activity"><span>★</span><b>Activity</b></button><button data-open="travelerDialog"><span>◉</span><b>Travelers</b></button><button data-open="connectionDialog"><span>↔</span><b>Connections</b></button></section>';
}

function homeView(){
  return shell(preparingBanner()+preparingDashboard()+'<div class="page-head"><div><div class="eyebrow">Home / Next</div><h1>'+esc(state.trip.title)+'</h1><div class="subtle">The trip changes. Home stays simple.</div></div>'+badge(state.trip.lifecycle_state||'draft')+'</div>'+quickActions()+'<div class="grid home-grid"><div class="grid">'+heroCard()+flightCards()+stayCards()+'<section class="card card-pad"><div class="section-title"><h2>Timeline</h2><button class="btn btn-ghost" data-view="timeline">View all</button></div>'+timelinePreview()+'</section></div><div class="grid">'+nextCard()+'<section class="card card-pad"><div class="section-title"><h2>Smart Essentials</h2><button class="btn btn-ghost" data-view="checklist">View all</button></div>'+smartEssentials()+'</section><section class="card card-pad"><div class="section-title"><h2>Trip Health</h2><button class="btn btn-ghost" data-view="health">Details</button></div>'+healthSummary()+'</section>'+readyOfflineCard(true)+'</div></div>');
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
    return '<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-box"><div class="timeline-top"><div><div class="timeline-title">'+iconFor(x.type)+' &nbsp;'+esc(x.title)+'</div><div class="item-sub">'+fullDate(x.starts_at_utc)+' · '+esc(x.status)+' · '+esc(x.confidence)+'</div></div><div class="item-time">'+timeLabelInZone(x.starts_at_utc,x.start_timezone)+'</div></div>'+extra+(x.subtitle?'<div class="subtle" style="margin-top:8px">'+esc(x.subtitle)+'</div>':'')+'</div></div>';
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
  document.querySelectorAll('[data-view]').forEach(function(el){el.addEventListener('click',function(){state.view=el.dataset.view;persistView();render();});});
  document.querySelectorAll('[data-open]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.open);if(d)d.showModal();});});
  document.querySelectorAll('[data-close]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.close);if(d)d.close();});});
  document.querySelectorAll('[data-trip]').forEach(function(el){el.addEventListener('click',async function(){
    state.trip=state.trips.find(function(t){return t.id===el.dataset.trip;})||state.trip;
    localStorage.setItem('tripto_selected_trip',state.trip.id); state.loading=true; render(); await loadTripDetails(); state.loading=false; state.view='home'; persistView(); render();
  });});
  document.querySelectorAll('[data-check]').forEach(function(el){el.addEventListener('click',async function(){
    var item=state.checklist.find(function(x){return x.id===el.dataset.check;}); if(!item)return;
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/checklist/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({version:item.version,completed:!item.completed_at})});await loadTripDetails();render();}catch(e){notify(e.message);}
  });});
  document.querySelectorAll('[data-action="refresh"]').forEach(function(el){el.addEventListener('click',loadTrips);});
  document.querySelectorAll('[data-action="add"]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById('bookingDialog');if(d)d.showModal();});});
  document.querySelectorAll('[data-action="seed"]').forEach(function(el){el.addEventListener('click',seedChecklist);});
  document.querySelectorAll('[data-action="recalc"]').forEach(function(el){el.addEventListener('click',recalcImpacts);});
  document.querySelectorAll('[data-action="recovery-refresh"]').forEach(function(el){el.addEventListener('click',async function(){var d=document.getElementById('recoveryDialog');if(d)d.close();await loadTrips();});});
  document.querySelectorAll('[data-traveler-edit]').forEach(function(el){el.addEventListener('click',function(){startEditTraveler(el.dataset.travelerEdit);});});
  document.querySelectorAll('[data-traveler-delete]').forEach(function(el){el.addEventListener('click',async function(){await removeTraveler(el.dataset.travelerDelete);});});
  document.querySelectorAll('[data-connection-type]').forEach(function(el){el.addEventListener('change',async function(){try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/connections/'+encodeURIComponent(el.dataset.connectionType),{method:'PATCH',body:JSON.stringify({version:Number(el.dataset.version),connectionType:el.value})});await loadTripDetails();render();notify('Connection updated.');}catch(e){recovery(e.message,'The connection was not changed. Refresh and review the latest trip data.');}});});
  document.querySelectorAll('[data-connection-delete]').forEach(function(el){el.addEventListener('click',async function(){if(!confirm('Remove this connection rule?'))return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/connections/'+encodeURIComponent(el.dataset.connectionDelete),{method:'DELETE',body:JSON.stringify({version:Number(el.dataset.version)})});await loadTripDetails();render();notify('Connection removed.');}catch(e){recovery(e.message);}});});
  document.querySelectorAll('[data-transport-detail]').forEach(function(el){el.addEventListener('click',function(){openTransportDetail(el.dataset.transportDetail);});});

  document.querySelectorAll('[data-action="show-how"]').forEach(function(el){el.addEventListener('click',function(){
    var section=document.getElementById('howItWorks'); if(section)section.scrollIntoView({behavior:'smooth',block:'start'});
  });});
  document.querySelectorAll('[data-onboarding-start]').forEach(function(el){el.addEventListener('click',markOnboardingSeen);});

  document.querySelectorAll('[data-booking]').forEach(function(el){el.addEventListener('click',function(){
    var chooser=document.getElementById('bookingDialog'); if(chooser)chooser.close();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog',traveler:'travelerDialog'};
    var d=document.getElementById(map[el.dataset.booking]); if(d)d.showModal();
  });});
  document.querySelectorAll('[data-booking-shortcut]').forEach(function(el){el.addEventListener('click',function(e){
    e.stopPropagation();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog',traveler:'travelerDialog'};
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
      state.trips.unshift(d.trip);state.trip=d.trip;localStorage.setItem('tripto_selected_trip',d.trip.id);markOnboardingSeen();document.getElementById('tripDialog').close();await loadTripDetails();state.view='home';persistView();render();
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
      var editId=String(fd.get('editId')||''), locationId=String(fd.get('locationId')||'')||null;
      var address=String(fd.get('address')||'').trim(), localAddress=String(fd.get('localAddress')||'').trim();
      if(!editId&&(address||localAddress)){
        var loc=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/locations',{method:'POST',body:JSON.stringify({type:'hotel',displayName:fd.get('propertyName'),formattedAddress:address||null,localAddress:localAddress||null})});
        locationId=loc.location.id;
      }
      var payload={propertyName:fd.get('propertyName'),propertyLocationId:locationId,checkInDate:fd.get('checkInDate')||null,checkOutDate:fd.get('checkOutDate')||null,confirmationNumber:fd.get('confirmationNumber')||null};
      if(editId){payload.version=Number(fd.get('version'));await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/stays/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify(payload)});notify('Stay updated.');}
      else{payload.travelerIds=selectedTravelerIds(hotelForm);await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/stays',{method:'POST',body:JSON.stringify(payload)});notify('Stay added.');}
      document.getElementById('hotelDialog').close();resetStayForm();await loadTripDetails();render();
    }catch(err){recovery(err.message,'The stay was not saved. Existing trip data is unchanged. Review the fields and try again.');}
  });
  var flightForm=document.getElementById('flightForm');
  if(flightForm)flightForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(flightForm);
    try{
      var fromTz=String(fd.get('fromTz')||'').trim(),toTz=String(fd.get('toTz')||'').trim();
      var depMs=localToUtc(String(fd.get('departure')||''),fromTz),arrMs=localToUtc(String(fd.get('arrival')||''),toTz);
      if(arrMs<depMs)throw new Error('Arrival instant cannot be before departure. Verify the local dates and timezones, especially on overnight/date-line travel.');
      var editId=String(fd.get('editId')||''),fromId=String(fd.get('fromLocationId')||''),toId=String(fd.get('toLocationId')||'');
      if(!editId){var from=await createLocation('airport',fd.get('fromName'),{iataCode:String(fd.get('fromCode')||'').toUpperCase(),timezone:fromTz});var to=await createLocation('airport',fd.get('toName'),{iataCode:String(fd.get('toCode')||'').toUpperCase(),timezone:toTz});fromId=from.id;toId=to.id;}
      var code=String(fd.get('airlineCode')||'').toUpperCase(),num=String(fd.get('flightNumber')||'').trim();
      var payload={transportType:'flight',title:(code||'Flight')+(num?' '+num:''),departureLocationId:fromId,arrivalLocationId:toId,scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs,departureTimezone:fromTz,arrivalTimezone:toTz,marketingAirlineCode:code||null,marketingFlightNumber:num||null,departureTerminal:fd.get('departureTerminal')||null,arrivalTerminal:fd.get('arrivalTerminal')||null};
      if(editId){payload.version=Number(fd.get('version'));delete payload.transportType;await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify(payload)});notify('Flight updated.');}
      else{payload.travelerIds=selectedTravelerIds(flightForm);await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify(payload)});notify('Flight added.');}
      document.getElementById('flightDialog').close();resetFlightForm();await loadTripDetails();render();
    }catch(err){recovery(err.message,'The flight was not saved. Use event-local IANA timezones such as Asia/Jerusalem or Europe/Rome.');}
  });

  var trainForm=document.getElementById('trainForm');
  if(trainForm)trainForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(trainForm);
    try{
      var fromTz=String(fd.get('fromTz')||'').trim(),toTz=String(fd.get('toTz')||'').trim();var depMs=localToUtc(String(fd.get('departure')||''),fromTz),arrMs=localToUtc(String(fd.get('arrival')||''),toTz);if(arrMs<depMs)throw new Error('Arrival cannot be before departure.');
      var editId=String(fd.get('editId')||''),fromId=String(fd.get('fromLocationId')||''),toId=String(fd.get('toLocationId')||'');
      if(!editId){var from=await createLocation('station',fd.get('fromName'),{timezone:fromTz});var to=await createLocation('station',fd.get('toName'),{timezone:toTz});fromId=from.id;toId=to.id;}
      var carrier=String(fd.get('carrierName')||'').trim(),service=String(fd.get('serviceNumber')||'').trim();var payload={title:(carrier||'Train')+(service?' '+service:''),carrierName:carrier||null,serviceNumber:service||null,departureLocationId:fromId,arrivalLocationId:toId,scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs,departureTimezone:fromTz,arrivalTimezone:toTz};
      if(editId){payload.version=Number(fd.get('version'));await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify(payload)});notify('Train updated.');}else{payload.transportType='train';payload.travelerIds=selectedTravelerIds(trainForm);await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify(payload)});notify('Train added.');}
      document.getElementById('trainDialog').close();resetTrainForm();await loadTripDetails();render();
    }catch(err){recovery(err.message,'The train was not saved. Check station-local times and timezones.');}
  });

  var carForm=document.getElementById('carForm');
  if(carForm)carForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(carForm);
    try{
      var tz=String(fd.get('timezone')||'').trim();var depMs=localToUtc(String(fd.get('departure')||''),tz);var arrivalValue=String(fd.get('arrival')||'');var arrMs=arrivalValue?localToUtc(arrivalValue,tz):null;if(arrMs!=null&&arrMs<depMs)throw new Error('Arrival cannot be before pickup.');
      var editId=String(fd.get('editId')||''),fromId=String(fd.get('fromLocationId')||''),toId=String(fd.get('toLocationId')||'');if(!editId){var from=await createLocation('address',fd.get('fromName'),{timezone:tz});var to=await createLocation('address',fd.get('toName'),{timezone:tz});fromId=from.id;toId=to.id;}
      var payload={title:fd.get('title'),departureLocationId:fromId,arrivalLocationId:toId,scheduledDepartureUtc:depMs,scheduledArrivalUtc:arrMs,departureTimezone:tz,arrivalTimezone:tz};
      if(editId){payload.version=Number(fd.get('version'));await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify(payload)});notify('Transport updated.');}else{payload.transportType='car';await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport',{method:'POST',body:JSON.stringify(payload)});notify('Transport added.');}
      document.getElementById('carDialog').close();resetCarForm();await loadTripDetails();render();
    }catch(err){recovery(err.message,'The transport was not saved. Existing trip data is unchanged.');}
  });

  var travelerForm=document.getElementById('travelerForm');
  if(travelerForm)travelerForm.addEventListener('submit',async function(e){e.preventDefault();var fd=new FormData(travelerForm);try{var editId=String(fd.get('editId')||'');var payload={displayName:fd.get('displayName'),travelerType:fd.get('travelerType')};if(editId){payload.version=Number(fd.get('version'));await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/travelers/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify(payload)});notify('Traveler updated.');}else{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/travelers',{method:'POST',body:JSON.stringify(payload)});notify('Traveler added.');}await loadTripDetails();render();var d=document.getElementById('travelerDialog');if(d)d.showModal();}catch(err){recovery(err.message);}});
  var connectionForm=document.getElementById('connectionForm');
  if(connectionForm)connectionForm.addEventListener('submit',async function(e){e.preventDefault();var fd=new FormData(connectionForm);try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/connections',{method:'POST',body:JSON.stringify({fromItemId:fd.get('fromItemId'),toItemId:fd.get('toItemId'),connectionType:fd.get('connectionType'),recommendedBufferMinutes:Number(fd.get('recommendedBufferMinutes')||0),requiresBaggageReclaim:fd.get('requiresBaggageReclaim')==='on',requiresImmigration:fd.get('requiresImmigration')==='on',requiresAirportChange:fd.get('requiresAirportChange')==='on'})});await loadTripDetails();render();var d=document.getElementById('connectionDialog');if(d)d.showModal();notify('Connection added.');}catch(err){recovery(err.message,'The connection was not saved. Verify the selected segments and protection type.');}});

}

async function createLocation(type,name,extra){
  extra=extra||{};
  var body={type:type,displayName:String(name||'').trim()};
  if(!body.displayName)throw new Error('Location name is required.');
  Object.keys(extra).forEach(function(k){if(extra[k]!=null&&extra[k]!=='')body[k]=extra[k];});
  var iata=body.iataCode?String(body.iataCode).toUpperCase():null,station=body.stationCode?String(body.stationCode).toUpperCase():null;
  var existing=state.locations.find(function(l){if(l.type!==type)return false;if(iata&&l.iata_code===iata)return true;if(station&&l.station_code===station)return true;return !iata&&!station&&String(l.display_name).toLowerCase()===body.displayName.toLowerCase()&&(!body.timezone||l.timezone===body.timezone);});
  if(existing)return existing;
  var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/locations',{method:'POST',body:JSON.stringify(body)});
  if(d.location)state.locations.push(d.location);
  return d.location;
}
function openFlightDetail(id){
  var f=state.transport.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!f)return;var dep=locationById(f.departure_location_id||f.start_location_id),arr=locationById(f.arrival_location_id||f.end_location_id);var title=((f.marketing_airline_code||f.carrier_name||'Flight')+' '+(f.marketing_flight_number||f.service_number||'')).trim();document.getElementById('detailEyebrow').textContent='Flight details';document.getElementById('detailTitle').textContent=title||'Flight';document.getElementById('detailBody').innerHTML='<div class="detail-route"><div><strong>'+esc(dep?(dep.iata_code||dep.display_name):'From')+'</strong><span>'+dateTimeLabelInZone(f.scheduled_departure_utc,f.departure_timezone)+'</span></div><div class="detail-plane">✈</div><div><strong>'+esc(arr?(arr.iata_code||arr.display_name):'To')+'</strong><span>'+dateTimeLabelInZone(f.scheduled_arrival_utc,f.arrival_timezone)+'</span></div></div><div class="detail-grid"><div><span>Departure terminal</span><strong>'+esc(f.departure_terminal||'Unavailable')+'</strong></div><div><span>Arrival terminal</span><strong>'+esc(f.arrival_terminal||'Unavailable')+'</strong></div><div><span>Status source</span><strong>Confirmed booking</strong></div><div><span>Live status</span><strong>Not enabled</strong></div></div><div class="fact-note">Scheduled booking data is never presented as live.</div><div class="inline-actions"><button class="btn btn-indigo" id="editFlightButton">Edit booking</button><button class="btn btn-danger" id="deleteFlightButton">Delete booking</button></div>';var d=document.getElementById('detailDialog');d.showModal();document.getElementById('editFlightButton').addEventListener('click',function(){d.close();startEditTransport(id);});document.getElementById('deleteFlightButton').addEventListener('click',function(){d.close();removeTransport(id);});
}
function openStayDetail(id){
  var st=state.stays.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!st)return;var loc=locationById(st.property_location_id||st.start_location_id);document.getElementById('detailEyebrow').textContent='Stay details';document.getElementById('detailTitle').textContent=st.property_name||st.title||'Stay';document.getElementById('detailBody').innerHTML='<div class="detail-grid"><div><span>Check-in</span><strong>'+esc(st.check_in_date?dateLabel(st.check_in_date):'Not set')+'</strong></div><div><span>Check-out</span><strong>'+esc(st.check_out_date?dateLabel(st.check_out_date):'Not set')+'</strong></div><div><span>Confirmation</span><strong>'+esc(st.confirmation_number||'Unavailable')+'</strong></div><div><span>Booking status</span><strong>'+esc(st.booking_status||'Confirmed')+'</strong></div></div><div class="detail-address"><span>Address</span><strong>'+esc(loc?(loc.local_address||loc.formatted_address||loc.display_name):'Unavailable')+'</strong></div><div class="inline-actions"><button class="btn btn-indigo" id="detailDriverButton">Show to driver</button><button class="btn" id="editStayButton">Edit stay</button><button class="btn btn-danger" id="deleteStayButton">Delete stay</button></div>';var detail=document.getElementById('detailDialog');detail.showModal();document.getElementById('detailDriverButton').addEventListener('click',function(){detail.close();var driver=document.getElementById('driverDialog');if(driver)driver.showModal();});document.getElementById('editStayButton').addEventListener('click',function(){detail.close();startEditStay(id);});document.getElementById('deleteStayButton').addEventListener('click',function(){detail.close();removeStay(id);});
}
function openTransportDetail(id){var t=state.transport.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!t)return;if(t.transport_type==='flight'){openFlightDetail(id);return;}var dep=locationById(t.departure_location_id||t.start_location_id),arr=locationById(t.arrival_location_id||t.end_location_id);document.getElementById('detailEyebrow').textContent=(t.transport_type||'Transport')+' details';document.getElementById('detailTitle').textContent=t.title||t.service_number||'Transport';document.getElementById('detailBody').innerHTML='<div class="detail-route"><div><strong>'+esc(dep?dep.display_name:'From')+'</strong><span>'+dateTimeLabelInZone(t.scheduled_departure_utc,t.departure_timezone)+'</span></div><div class="detail-plane">→</div><div><strong>'+esc(arr?arr.display_name:'To')+'</strong><span>'+dateTimeLabelInZone(t.scheduled_arrival_utc,t.arrival_timezone)+'</span></div></div><div class="inline-actions"><button class="btn btn-indigo" id="editTransportButton">Edit booking</button><button class="btn btn-danger" id="deleteTransportButton">Delete booking</button></div>';var d=document.getElementById('detailDialog');d.showModal();document.getElementById('editTransportButton').addEventListener('click',function(){d.close();startEditTransport(id);});document.getElementById('deleteTransportButton').addEventListener('click',function(){d.close();removeTransport(id);});}
function startEditTransport(id){var t=state.transport.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!t)return;var dep=locationById(t.departure_location_id||t.start_location_id),arr=locationById(t.arrival_location_id||t.end_location_id);if(t.transport_type==='flight'){var f=document.getElementById('flightForm');resetFlightForm();f.elements.editId.value=id;f.elements.version.value=t.version;f.elements.fromLocationId.value=t.departure_location_id||'';f.elements.toLocationId.value=t.arrival_location_id||'';f.elements.airlineCode.value=t.marketing_airline_code||'';f.elements.flightNumber.value=t.marketing_flight_number||'';f.elements.fromName.value=dep?dep.display_name:'';f.elements.fromCode.value=dep?dep.iata_code||'':'';f.elements.fromTz.value=t.departure_timezone||(dep&&dep.timezone)||'';f.elements.toName.value=arr?arr.display_name:'';f.elements.toCode.value=arr?arr.iata_code||'':'';f.elements.toTz.value=t.arrival_timezone||(arr&&arr.timezone)||'';f.elements.departure.value=utcToLocalInput(t.scheduled_departure_utc,f.elements.fromTz.value);f.elements.arrival.value=utcToLocalInput(t.scheduled_arrival_utc,f.elements.toTz.value);f.elements.departureTerminal.value=t.departure_terminal||'';f.elements.arrivalTerminal.value=t.arrival_terminal||'';setRouteReadonly(f,true);document.getElementById('flightDialogTitle').textContent='Edit scheduled flight';document.getElementById('flightSubmit').textContent='Save changes';document.getElementById('flightDialog').showModal();return;}if(t.transport_type==='train'){var tr=document.getElementById('trainForm');resetTrainForm();tr.elements.editId.value=id;tr.elements.version.value=t.version;tr.elements.fromLocationId.value=t.departure_location_id||'';tr.elements.toLocationId.value=t.arrival_location_id||'';tr.elements.carrierName.value=t.carrier_name||'';tr.elements.serviceNumber.value=t.service_number||'';tr.elements.fromName.value=dep?dep.display_name:'';tr.elements.toName.value=arr?arr.display_name:'';tr.elements.fromTz.value=t.departure_timezone||(dep&&dep.timezone)||'';tr.elements.toTz.value=t.arrival_timezone||(arr&&arr.timezone)||'';tr.elements.departure.value=utcToLocalInput(t.scheduled_departure_utc,tr.elements.fromTz.value);tr.elements.arrival.value=utcToLocalInput(t.scheduled_arrival_utc,tr.elements.toTz.value);setRouteReadonly(tr,true);document.getElementById('trainDialogTitle').textContent='Edit train';document.getElementById('trainSubmit').textContent='Save changes';document.getElementById('trainDialog').showModal();return;}var c=document.getElementById('carForm');resetCarForm();c.elements.editId.value=id;c.elements.version.value=t.version;c.elements.fromLocationId.value=t.departure_location_id||'';c.elements.toLocationId.value=t.arrival_location_id||'';c.elements.title.value=t.title||'';c.elements.fromName.value=dep?dep.display_name:'';c.elements.toName.value=arr?arr.display_name:'';c.elements.timezone.value=t.departure_timezone||(dep&&dep.timezone)||Intl.DateTimeFormat().resolvedOptions().timeZone;c.elements.departure.value=utcToLocalInput(t.scheduled_departure_utc,c.elements.timezone.value);c.elements.arrival.value=utcToLocalInput(t.scheduled_arrival_utc,c.elements.timezone.value);setRouteReadonly(c,true);document.getElementById('carDialogTitle').textContent='Edit ground transport';document.getElementById('carSubmit').textContent='Save changes';document.getElementById('carDialog').showModal();}
function startEditStay(id){var st=state.stays.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!st)return;var loc=locationById(st.property_location_id||st.start_location_id),f=document.getElementById('hotelForm');resetStayForm();f.elements.editId.value=id;f.elements.version.value=st.version;f.elements.locationId.value=st.property_location_id||'';f.elements.propertyName.value=st.property_name||st.title||'';f.elements.address.value=loc?loc.formatted_address||'':'';f.elements.localAddress.value=loc?loc.local_address||'':'';f.elements.address.readOnly=true;f.elements.localAddress.readOnly=true;f.elements.checkInDate.value=st.check_in_date||'';f.elements.checkOutDate.value=st.check_out_date||'';f.elements.confirmationNumber.value=st.confirmation_number||'';document.getElementById('hotelDialogTitle').textContent='Edit stay';document.getElementById('hotelSubmit').textContent='Save changes';document.getElementById('hotelDialog').showModal();}
async function removeTransport(id){var t=state.transport.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!t||!confirm('Delete this transport booking? The change will be recorded in trip history.'))return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/transport/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({version:t.version})});await loadTripDetails();render();notify('Booking deleted.');}catch(e){recovery(e.message);}}
async function removeStay(id){var st=state.stays.find(function(x){return String(x.id||x.trip_item_id)===String(id);});if(!st||!confirm('Delete this stay? The change will be recorded in trip history.'))return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/stays/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({version:st.version})});await loadTripDetails();render();notify('Stay deleted.');}catch(e){recovery(e.message);}}
function startEditTraveler(id){var t=state.travelers.find(function(x){return x.id===id;});if(!t)return;var f=document.getElementById('travelerForm');f.elements.editId.value=t.id;f.elements.version.value=t.version;f.elements.displayName.value=t.display_name;f.elements.travelerType.value=t.traveler_type||'unknown';document.getElementById('travelerSubmit').textContent='Save traveler';}
async function removeTraveler(id){var t=state.travelers.find(function(x){return x.id===id;});if(!t||!confirm('Remove this traveler from the trip?'))return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/travelers/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({version:t.version})});await loadTripDetails();render();var d=document.getElementById('travelerDialog');if(d)d.showModal();}catch(e){recovery(e.message,'The traveler was not removed. They may still be linked to booking data.');}}
function selectedTravelerIds(form){return Array.from(form.querySelectorAll('input[name="travelerIds"]:checked')).map(function(x){return x.value;});}
function setRouteReadonly(form,on){['fromName','fromCode','toName','toCode'].forEach(function(n){if(form.elements[n])form.elements[n].readOnly=on;});}
function resetFlightForm(){var f=document.getElementById('flightForm');if(!f)return;f.reset();['editId','version','fromLocationId','toLocationId'].forEach(function(n){f.elements[n].value='';});setRouteReadonly(f,false);document.getElementById('flightDialogTitle').textContent='Add scheduled flight';document.getElementById('flightSubmit').textContent='Add flight';}
function resetTrainForm(){var f=document.getElementById('trainForm');if(!f)return;f.reset();['editId','version','fromLocationId','toLocationId'].forEach(function(n){f.elements[n].value='';});setRouteReadonly(f,false);document.getElementById('trainDialogTitle').textContent='Add train';document.getElementById('trainSubmit').textContent='Add train';}
function resetCarForm(){var f=document.getElementById('carForm');if(!f)return;f.reset();['editId','version','fromLocationId','toLocationId'].forEach(function(n){f.elements[n].value='';});setRouteReadonly(f,false);document.getElementById('carDialogTitle').textContent='Add car or transfer';document.getElementById('carSubmit').textContent='Add transport';}
function resetStayForm(){var f=document.getElementById('hotelForm');if(!f)return;f.reset();['editId','version','locationId'].forEach(function(n){f.elements[n].value='';});f.elements.address.readOnly=false;f.elements.localAddress.readOnly=false;document.getElementById('hotelDialogTitle').textContent='Add hotel or stay';document.getElementById('hotelSubmit').textContent='Add stay';}
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