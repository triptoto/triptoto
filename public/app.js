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
  lastRefreshAt:null,
  installPrompt:null,
  pendingDeleteTripId:null,
  account:null,
  sharing:null,
  diagnostics:null,
  invitePreview:null,
  members:[],
  invites:[],
  lastInvite:null,
  pendingSyncCount:0,
  imports:[],
  localDocs:[],
  importReview:null,
  betaStatus:null,
  pendingInviteToken:(location.pathname.indexOf('/join/')===0?decodeURIComponent(location.pathname.slice(6)):null)
};
var app=document.getElementById('app');


function ApiError(message,status,code,requestId,details){
  this.name='ApiError';this.message=message||'Request failed';this.status=status||0;this.code=code||'REQUEST_FAILED';this.requestId=requestId||null;this.details=details;
  if(Error.captureStackTrace)Error.captureStackTrace(this,ApiError);
}
ApiError.prototype=Object.create(Error.prototype);ApiError.prototype.constructor=ApiError;

var PENDING_KEY='tripto_pending_mutations_v1';
function pendingMutations(){try{var raw=localStorage.getItem(PENDING_KEY);var rows=raw?JSON.parse(raw):[];return Array.isArray(rows)?rows:[];}catch(_){return [];}}
function savePendingMutations(rows){try{localStorage.setItem(PENDING_KEY,JSON.stringify(rows));}catch(_){}state.pendingSyncCount=rows.filter(function(x){return x.status!=='done';}).length;}
function updatePendingCount(){state.pendingSyncCount=pendingMutations().filter(function(x){return x.status!=='done';}).length;}
function queueChecklistToggle(item,completed){
  var rows=pendingMutations();
  rows=rows.filter(function(x){return !(x.type==='checklist-toggle'&&x.tripId===state.trip.id&&x.itemId===item.id&&x.status==='pending');});
  rows.push({id:'q_'+crypto.randomUUID(),type:'checklist-toggle',tripId:state.trip.id,itemId:item.id,version:item.version,completed:completed,status:'pending',createdAt:Date.now()});
  savePendingMutations(rows);
  item.completed_at=completed?Date.now():null;item.completion_source=completed?'user':'none';
  cacheWrite('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/checklist',{items:state.checklist});
}
async function flushPendingMutations(){
  if(!navigator.onLine)return;
  var rows=pendingMutations();if(!rows.length){updatePendingCount();return;}
  var changed=false;
  for(var i=0;i<rows.length;i++){
    var q=rows[i];if(q.status!=='pending')continue;
    try{
      if(q.type==='checklist-toggle'){
        await api('/api/v1/trips/'+encodeURIComponent(q.tripId)+'/checklist/'+encodeURIComponent(q.itemId),{method:'PATCH',body:JSON.stringify({version:q.version,completed:q.completed}),_fromQueue:true});
        q.status='done';changed=true;
      }
    }catch(e){
      if(e&&e.status===409){q.status='needs_review';q.error=e.message;q.requestId=e.requestId||null;changed=true;sendBetaEvent('offline_conflict_seen',q.tripId);}
      else{q.error=e&&e.message?e.message:'Sync failed';q.requestId=e&&e.requestId?e.requestId:null;}
    }
  }
  if(changed)rows=rows.filter(function(x){return x.status!=='done';});
  savePendingMutations(rows);
}

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
function ageLabel(ms){
  if(!ms)return 'Unknown age';var d=Math.max(0,Date.now()-Number(ms));
  if(d<60000)return 'updated just now';if(d<3600000)return 'updated '+Math.floor(d/60000)+'m ago';if(d<86400000)return 'updated '+Math.floor(d/3600000)+'h ago';return 'updated '+Math.floor(d/86400000)+'d ago';
}
function notify(message){
  var old=document.querySelector('.toast'); if(old)old.remove();
  var el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.textContent=message;
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

function betaEventLocalKey(eventName,tripId){return 'tripto_beta_event:'+new Date().toISOString().slice(0,10)+':'+(tripId||'-')+':'+eventName;}
function sendBetaEvent(eventName,tripId){
  if(!navigator.onLine||!state.token)return;
  tripId=tripId||(state.trip&&state.trip.id)||null;
  var key=betaEventLocalKey(eventName,tripId);try{if(localStorage.getItem(key)==='1')return;localStorage.setItem(key,'1');}catch(_){}
  fetch(API+'/api/v1/beta/events',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+state.token},body:JSON.stringify({eventName:eventName,tripId:tripId})}).catch(function(){try{localStorage.removeItem(key);}catch(_){}});
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


var sessionRefreshPromise=null;
function sessionExpiry(token){
  try{var body=String(token||'').split('.')[0];if(!body)return 0;var padded=body.replace(/-/g,'+').replace(/_/g,'/');padded+='='.repeat((4-padded.length%4)%4);var json=decodeURIComponent(Array.prototype.map.call(atob(padded),function(c){return '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2);}).join(''));var p=JSON.parse(json);return Number(p.exp)||0;}catch(_){return 0;}
}
async function refreshSessionIfNeeded(){
  if(!state.token||!navigator.onLine)return;
  var exp=sessionExpiry(state.token);if(!exp||exp-Date.now()>14*86400000)return;
  if(sessionRefreshPromise)return sessionRefreshPromise;
  sessionRefreshPromise=(async function(){
    var current=state.token;
    var r=await fetch(API+'/api/v1/session/refresh',{method:'POST',headers:{'authorization':'Bearer '+current,'content-type':'application/json'},body:'{}'});
    if(!r.ok){var rid=r.headers.get('x-request-id');throw new ApiError('Your device session could not be refreshed. Keep local browser data and try again while online.',r.status,'SESSION_REFRESH_FAILED',rid);}
    var d=await r.json();state.token=d.token;localStorage.setItem('tripto_token',state.token);
  })();
  try{return await sessionRefreshPromise;}finally{sessionRefreshPromise=null;}
}
async function ensureSession(){
  if(state.token){await refreshSessionIfNeeded();return state.token;}
  if(!navigator.onLine)throw new Error('No saved session is available offline.');
  var r=await fetch(API+'/api/v1/session/guest',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({platform:'web',appVersion:'beta-milestone-4',apiVersion:'v1'})
  });
  if(!r.ok)throw new Error('Could not start guest session.');
  var d=await r.json();
  state.token=d.token; localStorage.setItem('tripto_token',state.token);
  return state.token;
}
async function api(path,opts){
  opts=opts||{};
  var method=String(opts.method||'GET').toUpperCase();
  if(method!=='GET'&&!navigator.onLine)throw new Error('This change needs internet. Your cached trip remains available offline; reconnect and try again.');
  await ensureSession();
  var headers=Object.assign({'content-type':'application/json','authorization':'Bearer '+state.token},opts.headers||{});
  var r=await fetch(API+path,Object.assign({},opts,{headers:headers}));
  if(r.status===401){
    var rid401=r.headers.get('x-request-id');
    throw new ApiError('This device session is no longer accepted. Your cached trip remains on this device. Do not clear browser data; reconnect or use verified account recovery when available.',401,'SESSION_RECOVERY_REQUIRED',rid401);
  }
  if(!r.ok){
    var msg='Request failed ('+r.status+')',code='REQUEST_FAILED',rid=r.headers.get('x-request-id'),details=null;
    try{var e=await r.json();if(e.error){msg=e.error.message||msg;code=e.error.code||code;rid=e.error.requestId||rid;details=e.error.details;}}catch(_){}
    throw new ApiError(msg,r.status,code,rid,details);
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
    var pair=await Promise.all([apiGet('/api/v1/trips'),apiGet('/api/v1/account')]);
    var d=pair[0]; state.account=pair[1].account||null;
    state.trips=d.trips||[];
    var selected=localStorage.getItem('tripto_selected_trip');
    state.trip=state.trips.find(function(t){return t.id===selected;})||state.trips[0]||null;
    if(state.trip)localStorage.setItem('tripto_selected_trip',state.trip.id);
    if(navigator.onLine)await flushPendingMutations();
    await loadTripDetails();
    if(state.trip&&state.view==='home'){sendBetaEvent('whats_next_opened',state.trip.id);if(modeForTrip()==='active')sendBetaEvent('during_trip_home_opened',state.trip.id);}
    if(state.pendingInviteToken)await loadInvitePreview();
    state.lastRefreshAt=Date.now();
  }catch(e){notify(e.message);}
  finally{state.loading=false;render();}
}
async function loadTripDetails(){
  if(!state.trip){
    state.timeline=[];state.checklist=[];state.brain=null;state.impacts=[];
    state.transport=[];state.stays=[];state.locations=[];state.travelers=[];state.connections=[];state.imports=[];state.localDocs=[];state.sharing=null;state.betaStatus=null;return;
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
    '/api/v1/trips/'+id+'/connections',
    '/api/v1/trips/'+id+'/sharing',
    '/api/v1/trips/'+id+'/imports',
    '/api/v1/beta/status?tripId='+id
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
  if(r[9].status==='fulfilled')state.sharing=r[9].value.sharing||null;
  if(r[10].status==='fulfilled')state.imports=r[10].value.imports||[];
  if(r[11].status==='fulfilled')state.betaStatus=r[11].value.beta||null;
  state.localDocs=await listLocalDocs(state.trip.id);
}


async function loadInvitePreview(){
  if(!state.pendingInviteToken){state.invitePreview=null;return;}
  try{
    var d=await api('/api/v1/invites/preview',{method:'POST',body:JSON.stringify({token:state.pendingInviteToken})});
    state.invitePreview=d.invite||null;
  }catch(e){
    state.invitePreview={status:'unavailable',error:e.message,requestId:e.requestId||null};
  }
}
async function loadSharingManagement(){
  state.members=[];state.invites=[];state.lastInvite=null;
  if(!state.trip||!state.account||state.account.mode!=='account'||!state.sharing||!state.sharing.enabled)return;
  var id=encodeURIComponent(state.trip.id);
  var results=await Promise.allSettled([api('/api/v1/trips/'+id+'/members'),api('/api/v1/trips/'+id+'/invites')]);
  if(results[0].status==='fulfilled')state.members=results[0].value.members||[];
  if(results[1].status==='fulfilled')state.invites=results[1].value.invites||[];
}

var LOCAL_DOC_DB='tripto-local-docs-v1';
function openLocalDocDb(){
  return new Promise(function(resolve,reject){
    if(!('indexedDB' in window)){reject(new Error('IndexedDB is unavailable on this device.'));return;}
    var req=indexedDB.open(LOCAL_DOC_DB,1);
    req.onupgradeneeded=function(){var db=req.result;if(!db.objectStoreNames.contains('docs')){var store=db.createObjectStore('docs',{keyPath:'id'});store.createIndex('tripId','tripId',{unique:false});}};
    req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error||new Error('Could not open local document storage.'));};
  });
}
async function listLocalDocs(tripId){
  try{var db=await openLocalDocDb();var rows=await new Promise(function(resolve,reject){var tx=db.transaction('docs','readonly');var idx=tx.objectStore('docs').index('tripId');var req=idx.getAll(tripId);req.onsuccess=function(){resolve(req.result||[]);};req.onerror=function(){reject(req.error);};});return await Promise.all(rows.map(async function(row){if(!row.blob||!row.checksum)return Object.assign({},row,{integrity:'unverified'});try{var actual=await sha256Blob(row.blob);return Object.assign({},row,{integrity:actual===row.checksum?'verified':'corrupt'});}catch(_){return Object.assign({},row,{integrity:'unverified'});}}));}catch(_){return [];}
}
async function sha256Blob(blob){var bytes=await blob.arrayBuffer();var digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}
async function saveLocalDoc(file,type,travelerIds){
  if(!state.trip)throw new Error('Open a trip first.');
  if(!file)throw new Error('Choose a file.');
  if(file.size>10*1024*1024)throw new Error('Beta local-document limit is 10 MB per file.');
  var existing=await listLocalDocs(state.trip.id);if(existing.length>=20)throw new Error('Beta limit is 20 local documents per trip on this device.');
  var db=await openLocalDocDb();var checksum=await sha256Blob(file);var row={id:'doc_'+crypto.randomUUID(),tripId:state.trip.id,name:file.name||'document',mime:file.type||'application/octet-stream',size:file.size,type:type||'other',travelerIds:Array.isArray(travelerIds)?travelerIds:[],savedAt:Date.now(),checksum:checksum,integrity:'verified',blob:file};
  await new Promise(function(resolve,reject){var tx=db.transaction('docs','readwrite');tx.objectStore('docs').put(row);tx.oncomplete=function(){resolve();};tx.onerror=function(){reject(tx.error);};});
  state.localDocs=await listLocalDocs(state.trip.id);sendBetaEvent('local_document_saved',state.trip.id);return row;
}
async function removeLocalDoc(id){
  try{var db=await openLocalDocDb();await new Promise(function(resolve,reject){var tx=db.transaction('docs','readwrite');tx.objectStore('docs').delete(id);tx.oncomplete=function(){resolve();};tx.onerror=function(){reject(tx.error);};});state.localDocs=await listLocalDocs(state.trip.id);render();notify('Local document removed from this device.');}catch(e){showRecovery('Document was not removed.',e.message,'Your trip data is unchanged.');}
}

async function clearAllLocalBetaData(){
  try{await new Promise(function(resolve){if(!('indexedDB' in window)){resolve();return;}var req=indexedDB.deleteDatabase(LOCAL_DOC_DB);req.onsuccess=req.onerror=req.onblocked=function(){resolve();};});}catch(_){}
  try{if('caches' in window){var keys=await caches.keys();await Promise.all(keys.map(function(k){return caches.delete(k);}));}}catch(_){}
  try{localStorage.clear();sessionStorage.clear();}catch(_){}
}
async function openLocalDoc(id){
  var row=state.localDocs.find(function(x){return x.id===id;});if(!row||!row.blob){notify('Document is not available on this device.');return;}if(row.integrity!=='verified'){showRecovery('Document integrity could not be verified.','The saved file is missing a matching checksum.','Remove it and save a fresh copy before relying on it offline.');return;}sendBetaEvent('local_document_opened',state.trip&&state.trip.id);var url=URL.createObjectURL(row.blob);window.open(url,'_blank','noopener');setTimeout(function(){URL.revokeObjectURL(url);},60000);
}
function localDocTravelerLabel(d){var ids=Array.isArray(d.travelerIds)?d.travelerIds:[];if(!ids.length)return 'All / unassigned';var names=ids.map(function(id){var t=state.travelers.find(function(x){return x.id===id;});return t?t.display_name:null;}).filter(Boolean);return names.length?names.join(', '):ids.length+' traveler(s)';}
function localDocRows(){
  if(!state.localDocs.length)return '<div class="empty compact-empty"><p class="subtle">No local documents saved on this device yet.</p></div>';
  return '<div class="local-doc-list">'+state.localDocs.map(function(d){return '<div class="local-doc-row"><div class="local-doc-icon">▤</div><div class="local-doc-main"><strong>'+esc(d.name)+'</strong><span>'+esc(d.type||'other')+' · '+Math.max(1,Math.round(Number(d.size||0)/1024))+' KB · '+ageLabel(d.savedAt)+'</span><span>Traveler: '+esc(localDocTravelerLabel(d))+' · Integrity: '+esc(d.integrity||'unverified')+'</span></div><div class="inline-actions"><button class="btn btn-ghost compact" data-local-doc-open="'+esc(d.id)+'">Open</button><button class="btn btn-danger compact" data-local-doc-delete="'+esc(d.id)+'">Remove</button></div></div>';}).join('')+'</div>';
}
function importStatusCard(){
  var pending=state.imports.filter(function(x){return x.status==='needs_confirmation';}).length;
  return '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Booking import</div><h2>Forwarded email</h2></div>'+badge(pending?pending+' review':'Ready',pending?'badge-yellow':'badge-green')+'</div><div class="subtle">Paste a forwarded booking email. Parsing is deterministic and raw email body is not stored.</div><div class="inline-actions" style="margin-top:12px"><button class="btn btn-ghost" data-open="importDialog">Import booking email</button><button class="btn btn-ghost" data-view="imports">Import history</button></div></section>';
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
function showRecovery(title,message,hint){
  var detail=[message,hint].filter(Boolean).join(' ');
  recovery(title,detail);
}
function recoveryForError(title,error,hint){
  var req=error&&error.requestId?' Request ID: '+error.requestId+'.':'';
  if(error&&error.code==='RATE_LIMITED'){
    var wait=error.details&&error.details.retryAfterSeconds?Math.ceil(Number(error.details.retryAfterSeconds)/60):null;
    hint=(wait?'Try again in about '+wait+' minute(s). ':'')+(hint||'Your existing trip data is unchanged.');
  }
  showRecovery(title,(error&&error.message?error.message:'The request failed.')+req,hint);
}
function resolveBrowserLocalDateTime(localValue,timeZone){
  if(!localValue||!timeZone)throw new Error('Local time and IANA timezone are required.');
  var m=String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m)throw new Error('Enter a valid local date and time.');
  try{new Intl.DateTimeFormat('en-US',{timeZone:timeZone}).format(new Date());}catch(_){throw new Error('Timezone must be a valid IANA timezone, for example Europe/Rome.');}
  var target=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]));
  var offsets={};
  for(var h=-36;h<=36;h+=3){
    var instant=target+h*3600000;
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
    var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
    var seen=Date.UTC(Number(o.year),Number(o.month)-1,Number(o.day),Number(o.hour),Number(o.minute));
    offsets[Math.round((seen-instant)/60000)]=true;
  }
  var wanted=[m[1],m[2],m[3]].join('-')+'T'+m[4]+':'+m[5];
  var candidates=Object.keys(offsets).map(function(offset){return target-Number(offset)*60000;}).filter(function(candidate){
    var candidateParts=new Intl.DateTimeFormat('en-CA',{timeZone:timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(candidate));
    var c={};candidateParts.forEach(function(p){if(p.type!=='literal')c[p.type]=p.value;});
    return [c.year,c.month,c.day].join('-')+'T'+c.hour+':'+c.minute===wanted;
  }).filter(function(candidate,index,all){return all.indexOf(candidate)===index;}).sort(function(a,b){return a-b;});
  return {status:candidates.length===0?'invalid':candidates.length===1?'exact':'ambiguous',candidatesUtc:candidates};
}
function localToUtc(localValue,timeZone){
  var resolution=resolveBrowserLocalDateTime(localValue,timeZone);
  if(resolution.status!=='exact')throw new Error('That local time is ambiguous or unavailable because of a timezone/DST transition. Choose a different time or verify the booking.');
  return resolution.candidatesUtc[0];
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
  var accountMode=state.account&&state.account.mode==='account';
  return '<header class="topbar"><div class="topbar-inner"><button class="brand brand-button" data-view="home" aria-label="Home">tripto<span>.to</span></button>'+    '<div class="topbar-actions">'+      '<button class="guest-pill '+(accountMode?'account-pill':'')+'" data-view="account" title="Account status">'+(accountMode?'Account':'Guest beta')+'</button>'+      '<div role="status" aria-live="polite" class="status-pill '+(state.offline?'offline':state.pendingSyncCount?'syncing':'')+'"><span class="status-dot"></span>'+(state.offline?'Offline · cached':state.pendingSyncCount?('Sync '+state.pendingSyncCount):'Connected')+'</div>'+    '</div></div></header>';
}
function bottomNav(){
  var items=[['home','⌂','Home'],['trips','▣','Trips'],['add','＋',''],['timeline','≡','Timeline'],['checklist','✓','Checklist']];
  return '<nav class="nav" aria-label="Primary">'+items.map(function(i){
    if(i[0]==='add')return '<button class="add" data-action="add" aria-label="Add trip item">＋</button>';
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
  '<dialog id="bookingDialog" class="dialog booking-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Quick Add</div><h2>Add to your trip</h2></div><button class="icon-btn" data-close="bookingDialog">×</button></div><div class="booking-grid"><button class="booking-choice" data-booking="flight"><span>✈</span><strong>Flight</strong><small>Timezone-safe scheduled booking</small></button><button class="booking-choice" data-booking="hotel"><span>▣</span><strong>Hotel / Stay</strong><small>Check-in, address, confirmation</small></button><button class="booking-choice" data-booking="train"><span>⇄</span><strong>Train</strong><small>Stations and event-local times</small></button><button class="booking-choice" data-booking="car"><span>⌁</span><strong>Car / Transfer</strong><small>Pickup and drop-off</small></button><button class="booking-choice" data-booking="activity"><span>★</span><strong>Activity</strong><small>Reservation or plan</small></button><button class="booking-choice" data-booking="traveler"><span>◉</span><strong>Travelers</strong><small>People on this trip</small></button><button class="booking-choice" data-booking="import"><span>✉</span><strong>Forwarded email</strong><small>Deterministic preview + confirmation</small></button><button class="booking-choice" data-booking="document"><span>▤</span><strong>Local document</strong><small>Saved only on this device</small></button></div></div></dialog>'+
  '<dialog id="planDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Add plan</div><h2>Add activity</h2></div><button class="icon-btn" data-close="planDialog">×</button></div><form id="planForm" class="form"><div class="field"><label>Type</label><select name="type"><option value="activity">Activity</option><option value="reservation">Reservation</option><option value="custom">Other</option></select></div><div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Vatican Museums"></div><div class="field"><label>When</label><input type="datetime-local" name="when" required></div><button class="btn btn-primary" type="submit">Add plan</button></form></div></dialog>'+
  '<dialog id="hotelDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Stay</div><h2 id="hotelDialogTitle">Add hotel or stay</h2></div><button class="icon-btn" data-close="hotelDialog">×</button></div><form id="hotelForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="locationId"><div class="field"><label>Property name</label><input name="propertyName" maxlength="160" required placeholder="Hotel Artemide"></div><div class="field"><label>Address</label><input name="address" maxlength="300" placeholder="Via Nazionale 22, Rome"></div><div class="field"><label>Local-language address</label><input name="localAddress" maxlength="300" placeholder="Optional"></div><div class="two-col"><div class="field"><label>Check-in</label><input type="date" name="checkInDate"></div><div class="field"><label>Check-out</label><input type="date" name="checkOutDate"></div></div><div class="field"><label>Confirmation number</label><input name="confirmationNumber" maxlength="100"></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="hotelSubmit" type="submit">Add stay</button></form></div></dialog>'+
  '<dialog id="flightDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Flight</div><h2 id="flightDialogTitle">Add scheduled flight</h2></div><button class="icon-btn" data-close="flightDialog">×</button></div><div class="fact-note">Times are interpreted in the airport timezones you enter, not in the device timezone. Live flight tracking remains off.</div><form id="flightForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="two-col"><div class="field"><label>Airline code</label><input name="airlineCode" maxlength="3" placeholder="LY"></div><div class="field"><label>Flight number</label><input name="flightNumber" maxlength="12" placeholder="383"></div></div><div class="route-form"><div><div class="field"><label>From airport</label><input name="fromName" required placeholder="Tel Aviv Ben Gurion"></div><div class="two-col"><div class="field"><label>IATA</label><input name="fromCode" maxlength="3" required placeholder="TLV"></div><div class="field"><label>Timezone</label><input name="fromTz" required placeholder="Asia/Jerusalem"></div></div></div><div><div class="field"><label>To airport</label><input name="toName" required placeholder="Rome Fiumicino"></div><div class="two-col"><div class="field"><label>IATA</label><input name="toCode" maxlength="3" required placeholder="FCO"></div><div class="field"><label>Timezone</label><input name="toTz" required placeholder="Europe/Rome"></div></div></div></div><div class="two-col"><div class="field"><label>Departure · local airport time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival · local airport time</label><input type="datetime-local" name="arrival" required></div></div><div class="two-col"><div class="field"><label>Departure terminal</label><input name="departureTerminal" maxlength="20"></div><div class="field"><label>Arrival terminal</label><input name="arrivalTerminal" maxlength="20"></div></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="flightSubmit" type="submit">Add flight</button></form></div></dialog>'+
  '<dialog id="trainDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Train</div><h2 id="trainDialogTitle">Add train</h2></div><button class="icon-btn" data-close="trainDialog">×</button></div><form id="trainForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="two-col"><div class="field"><label>Operator</label><input name="carrierName" maxlength="120" placeholder="Trenitalia"></div><div class="field"><label>Train / service number</label><input name="serviceNumber" maxlength="40" placeholder="FR 9520"></div></div><div class="two-col"><div class="field"><label>From station</label><input name="fromName" required placeholder="Roma Termini"></div><div class="field"><label>From timezone</label><input name="fromTz" required placeholder="Europe/Rome"></div></div><div class="two-col"><div class="field"><label>To station</label><input name="toName" required placeholder="Firenze S. M. Novella"></div><div class="field"><label>To timezone</label><input name="toTz" required placeholder="Europe/Rome"></div></div><div class="two-col"><div class="field"><label>Departure · local time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Arrival · local time</label><input type="datetime-local" name="arrival" required></div></div><div class="field"><label>Travelers</label>'+travelerChecks()+'</div><button class="btn btn-primary" id="trainSubmit" type="submit">Add train</button></form></div></dialog>'+
  '<dialog id="carDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Ground transport</div><h2 id="carDialogTitle">Add car or transfer</h2></div><button class="icon-btn" data-close="carDialog">×</button></div><form id="carForm" class="form"><input type="hidden" name="editId"><input type="hidden" name="version"><input type="hidden" name="fromLocationId"><input type="hidden" name="toLocationId"><div class="field"><label>Title</label><input name="title" maxlength="160" required placeholder="Airport → Hotel"></div><div class="two-col"><div class="field"><label>Pickup</label><input name="fromName" required placeholder="FCO Airport"></div><div class="field"><label>Drop-off</label><input name="toName" required placeholder="Hotel Artemide"></div></div><div class="field"><label>Timezone</label><input name="timezone" required placeholder="Europe/Rome"></div><div class="two-col"><div class="field"><label>Pickup · local time</label><input type="datetime-local" name="departure" required></div><div class="field"><label>Estimated arrival · local time</label><input type="datetime-local" name="arrival"></div></div><button class="btn btn-primary" id="carSubmit" type="submit">Add transport</button></form></div></dialog>'+
  '<dialog id="travelerDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Travelers</div><h2>People on this trip</h2></div><button class="icon-btn" data-close="travelerDialog">×</button></div><div class="manager-list">'+travelersHtml+'</div><form id="travelerForm" class="form manager-form"><input type="hidden" name="editId"><input type="hidden" name="version"><div class="two-col"><div class="field"><label>Name</label><input name="displayName" required maxlength="120" placeholder="Traveler name"></div><div class="field"><label>Type</label><select name="travelerType"><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option><option value="unknown">Unknown</option></select></div></div><button class="btn btn-primary" id="travelerSubmit" type="submit">Add traveler</button></form></div></dialog>'+
  '<dialog id="connectionDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Connections</div><h2>Connection protection</h2></div><button class="icon-btn" data-close="connectionDialog">×</button></div><div class="fact-note">Use Protected only when segments are actually on a protected through-ticket. Self-transfer means the next carrier may not protect you if the first segment is late.</div><div class="manager-list">'+connectionHtml+'</div><form id="connectionForm" class="form manager-form"><div class="two-col"><div class="field"><label>From</label><select name="fromItemId" required><option value="">Choose transport</option>'+transportOptionRows()+'</select></div><div class="field"><label>To</label><select name="toItemId" required><option value="">Choose transport</option>'+transportOptionRows()+'</select></div></div><div class="two-col"><div class="field"><label>Connection type</label><select name="connectionType"><option value="unknown">Unknown</option><option value="protected">Protected ticket</option><option value="self_transfer">Self-transfer</option><option value="planned_transfer">Planned transfer</option></select></div><div class="field"><label>Recommended buffer · minutes</label><input type="number" min="0" max="1440" name="recommendedBufferMinutes" value="90"></div></div><div class="connection-flags"><label><input type="checkbox" name="requiresBaggageReclaim"> Baggage reclaim</label><label><input type="checkbox" name="requiresImmigration"> Immigration</label><label><input type="checkbox" name="requiresAirportChange"> Airport change</label></div><button class="btn btn-primary" type="submit">Add connection</button></form></div></dialog>'+
  '<dialog id="detailDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow" id="detailEyebrow">Details</div><h2 id="detailTitle">Booking</h2></div><button class="icon-btn" data-close="detailDialog">×</button></div><div id="detailBody"></div></div></dialog>'+
  '<dialog id="importDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Forwarded email</div><h2>Preview booking import</h2></div><button class="icon-btn" data-close="importDialog">×</button></div><div class="fact-note">No generative AI is used. The raw email body is parsed in memory and not stored. Nothing is added to the trip until you confirm.</div><form id="importEmailForm" class="form"><div class="two-col"><div class="field"><label>Sender (optional)</label><input name="sender" maxlength="320" placeholder="airline@example.com"></div><div class="field"><label>Subject (optional)</label><input name="subject" maxlength="500" placeholder="Fwd: Booking confirmation"></div></div><div class="field"><label>Forwarded email text</label><textarea name="body" rows="12" maxlength="80000" required placeholder="Paste the booking confirmation here…"></textarea></div><button class="btn btn-primary" type="submit">Parse and preview</button></form></div></dialog>'+
  '<dialog id="importReviewDialog" class="dialog wide-dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Safe Mode</div><h2>Confirm extracted booking</h2></div><button class="icon-btn" data-close="importReviewDialog">×</button></div><div id="importReviewBody"><div class="subtle">No candidate loaded.</div></div></div></dialog>'+
  '<dialog id="localDocDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Documents</div><h2>Save on this device</h2></div><button class="icon-btn" data-close="localDocDialog">×</button></div><div class="fact-note">R2 cloud document storage is still disabled. This file stays only in this browser/device and is available offline through IndexedDB.</div><form id="localDocForm" class="form"><div class="field"><label>Document type</label><select name="type"><option value="boarding_pass">Boarding pass</option><option value="ticket">Ticket</option><option value="hotel_confirmation">Hotel confirmation</option><option value="reservation">Reservation</option><option value="voucher">Voucher</option><option value="qr_code">QR code</option><option value="other" selected>Other</option></select></div><div class="field"><label>File · max 10 MB</label><input type="file" name="file" required></div><div class="field"><label>Traveler assignment (optional)</label>'+travelerChecks()+'</div><button class="btn btn-primary" type="submit">Save locally</button></form></div></dialog>'+
  '<dialog id="recoveryDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Recovery</div><h2 id="recoveryTitle">Something needs attention</h2></div><button class="icon-btn" data-close="recoveryDialog">×</button></div><p class="subtle" id="recoveryBody">Your existing trip data is safe.</p><div class="inline-actions"><button class="btn btn-primary" data-action="recovery-refresh">Refresh trip</button><button class="btn" data-close="recoveryDialog">Close</button></div></div></dialog>'+
  '<dialog id="deleteTripDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Delete trip</div><h2>This removes the trip</h2></div><button class="icon-btn" data-close="deleteTripDialog">×</button></div><div class="danger-box"><strong>Soft-delete from your trip list</strong><span>Current beta data is retained internally through tombstones/change history for sync safety, but the trip will disappear from the app.</span></div><form id="deleteTripForm" class="form"><div class="field"><label>Type DELETE to confirm</label><input name="confirm" autocomplete="off" required placeholder="DELETE"></div><button class="btn btn-danger" type="submit">Delete this trip</button></form></div></dialog>'+
  '<dialog id="deleteAllDataDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Privacy</div><h2>Delete all beta data</h2></div><button class="icon-btn" data-close="deleteAllDataDialog">×</button></div><div class="danger-box"><strong>This is broader than deleting one trip.</strong><span id="deleteAllDataEffect">Owned trips, account/device access and server-side beta data tied to this identity will be removed according to the current beta deletion policy.</span></div><form id="deleteAllDataForm" class="form"><div class="field"><label>Type DELETE to confirm</label><input name="confirm" autocomplete="off" required placeholder="DELETE"></div><button class="btn btn-danger" type="submit">Delete all my beta data</button></form></div></dialog>'+
  '<dialog id="guestInfoDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><div><div class="eyebrow">Guest beta</div><h2>Your current access</h2></div><button class="icon-btn" data-close="guestInfoDialog">×</button></div><div class="guest-info"><div class="health-line"><div class="health-icon warn">!</div><div><strong>Do not clear browser storage yet</strong><div class="subtle">This beta uses a device-bound guest session. Clearing site data can remove the token used to reopen guest trips.</div></div></div><div class="health-line"><div class="health-icon">✓</div><div><strong>No password required</strong><div class="subtle">Account sign-in and cross-device restore remain intentionally deferred until the auth layer is connected.</div></div></div></div><button class="btn btn-navy" data-close="guestInfoDialog">Got it</button></div></dialog>'+
  '<dialog id="driverDialog" class="dialog driver-dialog"><div class="driver-sheet"><button class="driver-close" data-close="driverDialog">×</button><div class="driver-kicker">SHOW TO DRIVER</div><div class="driver-name">'+esc(driverName)+'</div><div class="driver-address">'+esc(driverAddress)+'</div><div class="driver-note">Saved trip address · available from cached trip data</div></div></dialog>';
}

function loadingView(){return shell('<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');}
function emptyView(){
  var invite=state.pendingInviteToken?'<div class="invite-notice"><strong>Trip invite detected</strong><span>Verified account sign-in is required before accepting shared-trip invitations. Your invite link remains in this tab.</span></div>':'';
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
  return shell(invite+intro);
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
  return '<section class="card hero card-pad"><div class="eyebrow">'+esc(t.lifecycle_state||'trip')+'</div><div class="hero-title">'+esc(t.title)+'</div><div class="hero-meta">'+esc(dates)+'</div><div class="stat-row"><div class="stat"><strong>'+state.timeline.length+'</strong><span>Plans</span></div><div class="stat"><strong>'+state.checklist.filter(function(x){return !x.completed_at;}).length+'</strong><span>To do</span></div><div class="stat"><strong>'+activeIssues().length+'</strong><span>Issues</span></div></div><div class="hero-actions"><button class="btn btn-primary" data-view="timeline">View timeline</button><button class="btn" data-view="settings">Trip settings</button><button class="btn" data-action="refresh">Refresh</button></div></section>';
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
function travelerDocumentCoverage(){
  var verified=state.localDocs.filter(function(d){return d.integrity==='verified';});
  var requirements=[];
  state.transport.filter(function(t){return !['cancelled','skipped'].includes(t.status)&&(t.transport_type==='flight'||t.transport_type==='train');}).forEach(function(t){
    var ids=Array.isArray(t.traveler_ids)?t.traveler_ids:String(t.traveler_ids||'').split(',').filter(Boolean);
    ids.forEach(function(id){if(state.travelers.some(function(x){return x.id===id;})&&!requirements.some(function(r){return r.travelerId===id&&r.kind===t.transport_type;}))requirements.push({travelerId:id,kind:t.transport_type,types:t.transport_type==='flight'?['ticket','boarding_pass']:['ticket']});});
  });
  var rows=requirements.map(function(r){var traveler=state.travelers.find(function(t){return t.id===r.travelerId;});var ok=verified.some(function(d){return r.types.includes(d.type)&&Array.isArray(d.travelerIds)&&d.travelerIds.includes(r.travelerId);});var label=r.kind==='flight'?'flight ticket or boarding pass':'train ticket';return '<div class="offline-row"><div class="offline-check '+(ok?'ok':'warn')+'">'+(ok?'✓':'!')+'</div><div><strong>'+esc(traveler?traveler.display_name:'Traveler')+' · '+esc(label)+'</strong><span>'+(ok?'Checksum-verified and assigned':'Missing verified '+esc(label)+' for this traveler')+'</span></div></div>';}).join('');
  var stayRequired=state.stays.some(function(s){return !['cancelled','skipped'].includes(s.status);});
  if(stayRequired){var stayOk=verified.some(function(d){return d.type==='hotel_confirmation';});rows+='<div class="offline-row"><div class="offline-check '+(stayOk?'ok':'warn')+'">'+(stayOk?'✓':'!')+'</div><div><strong>Hotel confirmation</strong><span>'+(stayOk?'Checksum-verified trip-level confirmation':'Missing verified hotel confirmation')+'</span></div></div>';}
  return rows;
}
function readyOfflineCard(compact){
  var rows=offlineReadiness(), ok=rows.filter(function(x){return x.ok;}).length, total=rows.length;
  var list=rows.map(function(x){return '<div class="offline-row"><div class="offline-check '+(x.ok?'ok':'warn')+'">'+(x.ok?'✓':'!')+'</div><div><strong>'+esc(x.name)+'</strong><span>'+(x.ok?('Cached · '+ageLabel(x.at)):'Open online once to cache')+'</span></div></div>';}).join('');
  var pending=state.pendingSyncCount?'<div class="offline-row"><div class="offline-check warn">↻</div><div><strong>Pending sync</strong><span>'+state.pendingSyncCount+' local change(s) still need server sync or review.</span></div></div>':'<div class="offline-row"><div class="offline-check ok">✓</div><div><strong>Pending sync</strong><span>No unsynced local changes.</span></div></div>';
  var verifiedDocs=state.localDocs.filter(function(d){return d.integrity==='verified';});
  var documents='<div class="offline-row"><div class="offline-check '+(verifiedDocs.length?'ok':'warn')+'">'+(verifiedDocs.length?'✓':'!')+'</div><div><strong>Local documents</strong><span>'+(verifiedDocs.length?verifiedDocs.length+' checksum-verified local file(s)':state.localDocs.length?'Local files exist but checksum verification failed or is unavailable':'No local files saved yet')+' · cloud sync disabled</span></div></div>';
  if(compact)return '<section class="card card-pad"><div class="section-title"><h2>Ready Offline</h2>'+badge(ok+'/'+total,'badge-green')+'</div><div class="subtle">'+ok+' of '+total+' core trip datasets cached'+(state.pendingSyncCount?' · '+state.pendingSyncCount+' pending sync':'')+'.</div><button class="btn btn-ghost" style="margin-top:12px" data-view="ready">Review offline readiness</button></section>';
  return '<div class="page-head"><div><div class="eyebrow">Offline</div><h1>Ready Offline</h1><div class="subtle">Your trip should never disappear because your internet did.</div></div>'+badge(ok+'/'+total,'badge-green')+'</div><section class="card card-pad"><div class="offline-list">'+list+pending+documents+travelerDocumentCoverage()+'</div><div class="fact-note">Cached flight status is never presented as live. Live-flight integration is currently disabled.</div></section>';
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
  return '<section class="quick-actions"><button data-booking-shortcut="flight"><span>✈</span><b>Flight</b></button><button data-booking-shortcut="hotel"><span>▣</span><b>Stay</b></button><button data-booking-shortcut="train"><span>⇄</span><b>Train</b></button><button data-booking-shortcut="activity"><span>★</span><b>Activity</b></button><button data-open="travelerDialog"><span>◉</span><b>Travelers</b></button><button data-open="connectionDialog"><span>↔</span><b>Connections</b></button><button data-open="importDialog"><span>✉</span><b>Import</b></button><button data-view="documents"><span>▤</span><b>Documents</b></button></section>';
}

function homeView(){
  return shell(preparingBanner()+preparingDashboard()+'<div class="page-head"><div><div class="eyebrow">Home / Next</div><h1>'+esc(state.trip.title)+'</h1><div class="subtle">The trip changes. Home stays simple.</div></div>'+badge(state.trip.lifecycle_state||'draft')+'</div>'+quickActions()+'<div class="grid home-grid"><div class="grid">'+heroCard()+flightCards()+stayCards()+'<section class="card card-pad"><div class="section-title"><h2>Timeline</h2><button class="btn btn-ghost" data-view="timeline">View all</button></div>'+timelinePreview()+'</section></div><div class="grid">'+nextCard()+'<section class="card card-pad"><div class="section-title"><h2>Smart Essentials</h2><button class="btn btn-ghost" data-view="checklist">View all</button></div>'+smartEssentials()+'</section><section class="card card-pad"><div class="section-title"><h2>Trip Health</h2><button class="btn btn-ghost" data-view="health">Details</button></div>'+healthSummary()+'</section>'+importStatusCard()+readyOfflineCard(true)+'</div></div>');
}
function tripsView(){
  var cards=state.trips.length?'<div class="trip-list">'+state.trips.map(function(t){return '<article class="trip-card '+(state.trip&&t.id===state.trip.id?'active':'')+'" data-trip="'+esc(t.id)+'"><div class="trip-card-topline"><div>'+badge(t.lifecycle_state||'draft')+'</div><button class="trip-settings-btn" data-trip-settings="'+esc(t.id)+'" aria-label="Trip settings">•••</button></div><h3>'+esc(t.title)+'</h3><div class="trip-dates">'+esc(t.starts_on?dateLabel(t.starts_on):'No start date')+(t.ends_on?' → '+dateLabel(t.ends_on):'')+'</div></article>';}).join('')+'</div>':'<section class="card empty"><div class="empty-icon">✈</div><h2>No trips yet</h2><p class="subtle">Create a trip, then add the bookings you already have.</p><button class="btn btn-primary" data-open="tripDialog">Create trip</button></section>';
  return shell('<div class="page-head"><div><div class="eyebrow">Trips</div><h1>My trips</h1><div class="subtle">Upcoming, active and completed travel in one place.</div></div><button class="btn btn-primary" data-open="tripDialog">New trip</button></div>'+cards);
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


function accountView(){
  var a=state.account||{mode:'guest',migrationPreview:{}};
  var isAccount=a.mode==='account';
  var m=a.migrationPreview||{};
  var syncRows=pendingMutations();
  var review=syncRows.filter(function(x){return x.status==='needs_review';}).length;
  var invite=state.invitePreview;
  var inviteCard='';
  if(state.pendingInviteToken){
    if(invite&&invite.tripTitle){
      inviteCard='<section class="card card-pad invite-card"><div class="section-title"><div><div class="eyebrow">Shared trip invite</div><h2>'+esc(invite.tripTitle)+'</h2></div>'+badge(invite.status||'unknown',invite.status==='invited'?'badge-green':'badge-yellow')+'</div><div class="sharing-summary"><span>Role</span><strong>'+esc(invite.role||'viewer')+'</strong><span>Expires</span><strong>'+esc(invite.expiresAt?dateTimeLabel(invite.expiresAt):'—')+'</strong></div><div class="fact-note">'+(invite.emailRestricted?'This invitation is restricted to a matching verified email address.':'This invitation is link-based.')+'</div><div class="inline-actions" style="margin-top:12px">'+(isAccount&&invite.sharingEnabled&&invite.status==='invited'?'<button class="btn btn-primary" data-action="accept-invite">Accept invite</button>':'<button class="btn btn-ghost" disabled>Verified account required</button>')+'</div></section>';
    }else{
      inviteCard='<section class="card card-pad"><div class="eyebrow">Shared trip invite</div><h2>Invite detected</h2><div class="subtle">'+esc(invite&&invite.error?invite.error:'Checking invitation…')+'</div></section>';
    }
  }
  return shell(
    '<div class="page-head"><div><div class="eyebrow">Account & backup</div><h1>'+(isAccount?'Your account':'Guest beta')+'</h1><div class="subtle">Identity, restore readiness, exports and privacy-safe support tools.</div></div>'+(state.trip?'<button class="btn btn-ghost" data-view="home">Back to trip</button>':'')+'</div>'+inviteCard+
    '<div class="settings-grid">'+
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Identity</div><h2>'+(isAccount?'Verified account':'Device-bound guest')+'</h2></div>'+badge(isAccount?'Account':'Guest',isAccount?'badge-green':'badge-yellow')+'</div>'+
        (isAccount?'<div class="health-line"><div class="health-icon">✓</div><div><strong>Account ownership active</strong><div class="subtle">Trips can use owner/editor/viewer permissions and account-linked devices.</div></div></div>':'<div class="health-line"><div class="health-icon warn">!</div><div><strong>Keep this browser data</strong><div class="subtle">Clearing site data may remove the guest session used to reopen these trips.</div></div></div>')+
        '<div class="migration-box"><span>Guest trips ready to migrate</span><strong>'+esc(m.trips==null?'—':m.trips)+'</strong><span>Timeline items</span><strong>'+esc(m.timelineItems==null?'—':m.timelineItems)+'</strong></div>'+
        '<div class="fact-note">Apple / Google / email-code adapters remain unconnected. The internal verified-auth bridge cannot be called with unverified browser input.</div>'+
      '</section>'+
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Sync</div><h2>Device changes</h2></div>'+badge(state.pendingSyncCount?state.pendingSyncCount+' pending':'Up to date',state.pendingSyncCount?'badge-yellow':'badge-green')+'</div>'+
        '<div class="subtle">Offline checklist changes are queued with entity versions and replayed when connectivity returns.</div>'+
        (review?'<div class="danger-box"><strong>'+review+' change(s) need review</strong><span>A newer server version exists. Refresh the trip and apply the intended change again.</span></div>':'')+
        '<div class="inline-actions" style="margin-top:12px"><button class="btn btn-ghost" data-action="sync-now" '+(!navigator.onLine?'disabled':'')+'>Sync now</button>'+(review?'<button class="btn btn-danger" data-action="clear-sync-review">Clear review queue</button>':'')+'</div>'+
      '</section>'+
      (state.trip?'<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Backup</div><h2>'+esc(state.trip.title)+'</h2></div></div><div class="subtle">Create portable backups without exposing live session or invite secrets.</div><div class="backup-grid"><button class="btn btn-indigo" data-action="export-json">JSON backup</button><button class="btn btn-ghost" data-action="export-calendar">Calendar .ics</button><button class="btn btn-ghost" data-action="export-support">Support bundle</button></div></section>':'')+
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Diagnostics</div><h2>Beta status</h2></div></div><div class="subtle">Generate a privacy-safe runtime summary with feature flags, database counts and a request ID.</div><button class="btn btn-ghost" style="margin-top:12px" data-action="show-diagnostics">Run diagnostics</button></section>'+
    '</div>'
  );
}
function sharingView(){
  var isAccount=state.account&&state.account.mode==='account';
  var sh=state.sharing||{};
  if(!isAccount||!sh.enabled){
    return shell('<div class="page-head"><div><div class="eyebrow">Trip sharing</div><h1>Sharing is not active</h1><div class="subtle">The permissions and invite system are implemented, but verified account auth and the sharing flag must both be enabled first.</div></div><button class="btn btn-ghost" data-view="settings">Back</button></div><section class="card card-pad"><div class="health-line"><div class="health-icon warn">!</div><div><strong>No insecure guest sharing</strong><div class="subtle">tripto.to will not create pseudo-accounts or anonymous shared-trip permissions.</div></div></div></section>');
  }
  var owner=sh.role==='owner';
  var memberRows=state.members.length?state.members.map(function(x){return '<div class="member-row"><div><strong>'+esc(x.display_name||'Member')+'</strong><span>'+esc(x.role||'member')+'</span></div><div class="member-actions">'+(x.role==='owner'?badge('owner','badge-green'):(owner?'<select data-member-role="'+esc(x.user_id)+'"><option value="viewer" '+(x.role==='viewer'?'selected':'')+'>Viewer</option><option value="editor" '+(x.role==='editor'?'selected':'')+'>Editor</option></select><button class="mini-danger" data-member-remove="'+esc(x.user_id)+'">Remove</button>':badge(x.role||'viewer')))+'</div></div>';}).join(''):'<div class="subtle">No members loaded.</div>';
  var inviteRows=state.invites.length?state.invites.map(function(x){return '<div class="invite-row"><div><strong>'+esc(x.invited_email||'Link invitation')+'</strong><span>'+esc(x.role)+' · '+esc(x.status)+' · expires '+esc(dateTimeLabel(x.expires_at))+'</span></div>'+(owner&&x.status==='invited'?'<button class="mini-danger" data-invite-revoke="'+esc(x.id)+'">Revoke</button>':'')+'</div>';}).join(''):'<div class="subtle">No invitations yet.</div>';
  var newInvite=state.lastInvite?'<div class="new-invite"><strong>Invite created — copy it now</strong><code>'+esc(state.lastInvite.inviteUrl||((location.origin||'')+'/join/'+state.lastInvite.token))+'</code><button class="btn btn-primary" data-action="copy-last-invite">Copy invite link</button><span>The raw token is returned once and is not stored in D1.</span></div>':'';
  return shell('<div class="page-head"><div><div class="eyebrow">Trip sharing</div><h1>'+esc(state.trip.title)+'</h1><div class="subtle">Owner / editor / viewer permissions with expiring hashed invitations.</div></div><button class="btn btn-ghost" data-view="settings">Back</button></div>'+newInvite+'<div class="settings-grid"><section class="card card-pad"><div class="section-title"><h2>Members</h2>'+badge(state.members.length+'/'+(sh.maxMembers||10))+'</div>'+memberRows+'</section><section class="card card-pad"><div class="section-title"><h2>Invitations</h2></div>'+inviteRows+(owner?'<form id="inviteForm" class="form" style="margin-top:18px"><div class="field"><label>Email (optional)</label><input name="email" type="email" maxlength="254" placeholder="friend@example.com"></div><div class="two-col"><div class="field"><label>Role</label><select name="role"><option value="viewer">Viewer</option><option value="editor">Editor</option></select></div><div class="field"><label>Expires</label><select name="expiresInDays"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option></select></div></div><button class="btn btn-primary" type="submit">Create invite</button></form>':'')+'</section></div>');
}


function importsView(){
  var rows=state.imports.length?'<div class="import-history">'+state.imports.map(function(x){return '<article class="import-history-row"><div><strong>'+esc(x.subject||'Forwarded booking email')+'</strong><span>'+esc(x.sender||'Sender unavailable')+' · '+esc(x.status)+' · '+ageLabel(x.created_at)+'</span></div><div class="inline-actions">'+badge(x.candidate_count+' candidate(s)',x.status==='completed'?'badge-green':x.status==='needs_confirmation'?'badge-yellow':'')+(x.status==='needs_confirmation'?'<button class="btn btn-ghost compact" data-import-open="'+esc(x.id)+'">Review</button>':'')+'</div></article>';}).join('')+'</div>':'<div class="empty compact-empty"><p class="subtle">No booking-email imports yet.</p></div>';
  return shell('<div class="page-head"><div><div class="eyebrow">Imports</div><h1>Booking email history</h1><div class="subtle">Every extracted booking requires confirmation. Duplicate emails are detected by a normalized hash.</div></div><button class="btn btn-primary" data-open="importDialog">Import email</button></div><section class="card card-pad"><div class="section-title"><h2>'+state.imports.length+' import(s)</h2>'+badge('No AI','badge-indigo')+'</div>'+rows+'</section>');
}
function documentsView(){
  return shell('<div class="page-head"><div><div class="eyebrow">Documents</div><h1>Offline documents</h1><div class="subtle">Boarding passes, tickets and confirmations stored locally on this device while R2 remains disabled.</div></div><button class="btn btn-primary" data-open="localDocDialog">Add document</button></div><section class="local-only-banner"><strong>Local-only beta storage</strong><span>These files are not synced to another device and will be lost if this browser site data is removed.</span></section><section class="card card-pad"><div class="section-title"><h2>'+state.localDocs.length+' saved file(s)</h2>'+badge('Device only','badge-yellow')+'</div>'+localDocRows()+'</section>');
}

function betaLaunchCard(){
  var b=state.betaStatus||{};var a=b.activation||{};var trip=b.trip||{};
  var steps=[
    ['Create a trip',!!a.createdTrip],['Add 2 bookings',!!a.addedSecondBooking],['Open What’s Next',!!a.usedWhatsNext],['Open Timeline',!!a.usedTimeline],['Check Ready Offline',!!a.usedReadyOffline],['Complete a trip',!!a.completedTrip],['Create a second trip',!!a.createdSecondTrip]
  ];
  var done=steps.filter(function(x){return x[1];}).length;
  var rows=steps.map(function(x){return '<div class="launch-step '+(x[1]?'done':'')+'"><span>'+(x[1]?'✓':'•')+'</span><strong>'+esc(x[0])+'</strong></div>';}).join('');
  var quota=trip.importPreviewsRemaining==null?'—':trip.importPreviewsRemaining;
  return '<section class="card card-pad launch-card"><div class="section-title"><div><div class="eyebrow">Beta readiness</div><h2>'+done+' of '+steps.length+' signals</h2></div>'+badge(b.release||'Milestone 4','badge-indigo')+'</div><div class="launch-steps">'+rows+'</div><div class="launch-meta"><span>Booking-email previews remaining today</span><strong>'+esc(quota)+'</strong><span>Urgent trip issues</span><strong>'+esc(trip.urgentImpacts==null?'—':trip.urgentImpacts)+'</strong></div><div class="fact-note">These are product-activation signals, not a health score. Metrics store only coarse event names, internal IDs and timestamps — never itinerary text, locations, confirmation numbers, email bodies or document bytes.</div></section>';
}
function settingsView(){
  var t=state.trip;
  var installAvailable=!!state.installPrompt;
  var accountMode=state.account&&state.account.mode==='account';
  var sharing=state.sharing||{};
  var sharingText=accountMode?(sharing.enabled?'Sharing is enabled for this account.':'Sharing contracts are ready, but the environment flag is still off.'):'Trips are device-bound until verified account sign-in is connected.';
  var pendingInvite=state.pendingInviteToken?'<div class="invite-notice"><strong>Invite link detected</strong><span>A verified account is required before this invite can be accepted. The token is kept only in this tab.</span></div>':'';
  return shell(
    '<div class="page-head"><div><div class="eyebrow">Trip settings</div><h1>'+esc(t.title)+'</h1><div class="subtle">Trip identity, lifecycle, backup and beta access.</div></div><button class="btn btn-ghost" data-view="trips">Back to trips</button></div>'+pendingInvite+
    '<div class="settings-grid">'+betaLaunchCard()+
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Trip</div><h2>Basics</h2></div>'+badge(t.lifecycle_state||'draft')+'</div>'+ 
        '<form id="tripSettingsForm" class="form">'+
          '<div class="field"><label>Trip name</label><input name="title" maxlength="120" required value="'+esc(t.title||'')+'"></div>'+ 
          '<div class="two-col"><div class="field"><label>Starts</label><input type="date" name="startsOn" value="'+esc(t.starts_on||'')+'"></div><div class="field"><label>Ends</label><input type="date" name="endsOn" value="'+esc(t.ends_on||'')+'"></div></div>'+ 
          '<div class="field"><label>Lifecycle</label><select name="lifecycleState">'+lifecycleOptions(t.lifecycle_state)+'</select></div>'+ 
          '<div class="lifecycle-help">'+lifecycleHelp(t.lifecycle_state)+'</div>'+ 
          '<button class="btn btn-primary" type="submit">Save trip settings</button>'+ 
        '</form>'+ 
      '</section>'+ 
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Identity</div><h2>'+(accountMode?'Account':'Guest beta')+'</h2></div>'+badge(accountMode?'Account':'Device-bound',accountMode?'badge-green':'badge-yellow')+'</div>'+ 
        '<div class="health-line"><div class="health-icon '+(accountMode?'':'warn')+'">'+(accountMode?'✓':'!')+'</div><div><strong>'+(accountMode?'Account identity attached':'Keep this browser data')+'</strong><div class="subtle">'+(accountMode?'This device can use the account ownership model.':'Until verified sign-in is connected, clearing site data may break access to guest trips.')+'</div></div></div>'+ 
        '<div class="fact-note">Guest → account migration is implemented server-side but intentionally cannot be triggered without a verified Apple, Google or email-code auth adapter.</div>'+ 
        '<div class="inline-actions"><button class="btn btn-ghost" data-open="guestInfoDialog">Identity details</button>'+(installAvailable?'<button class="btn btn-indigo" data-action="install-app">Install app</button>':'')+'</div>'+ 
      '</section>'+ 
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Sharing</div><h2>Trip members</h2></div>'+badge(sharing.enabled?'Enabled':'Foundation',sharing.enabled?'badge-green':'')+'</div>'+ 
        '<div class="subtle">'+esc(sharingText)+'</div>'+ 
        '<div class="sharing-summary"><span>Role</span><strong>'+esc(sharing.role||'owner')+'</strong><span>Members</span><strong>'+esc(sharing.activeMembers==null?'—':sharing.activeMembers)+'</strong></div>'+ 
        '<button class="btn btn-ghost" style="margin-top:12px" data-action="sharing-info">'+(accountMode&&sharing.enabled?'Manage sharing':'Why sharing is not active')+'</button>'+ 
      '</section>'+ 
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Backup</div><h2>Export trip</h2></div>'+badge('JSON')+'</div>'+ 
        '<div class="subtle">Download structured trip data, travelers, timeline, transport, stays, checklist and document metadata. File bytes are not included.</div>'+ 
        '<div class="inline-actions" style="margin-top:12px"><button class="btn btn-indigo" data-action="export-json">Export JSON</button><button class="btn btn-ghost" data-action="show-diagnostics">Diagnostics</button></div>'+ 
      '</section>'+ 
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Offline</div><h2>Local trip cache</h2></div></div>'+ 
        '<div class="subtle">Clear only cached API snapshots for this trip. This does not delete D1 trip data.</div>'+ 
        '<button class="btn btn-ghost" style="margin-top:12px" data-action="clear-trip-cache">Clear cached trip data</button>'+ 
      '</section>'+ 
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Imports</div><h2>Booking email</h2></div>'+badge(state.imports.length+' import(s)')+'</div><div class="subtle">Forwarded-email parsing is deterministic and always requires confirmation before creating trip data.</div><div class="inline-actions" style="margin-top:12px"><button class="btn btn-ghost" data-open="importDialog">Import email</button><button class="btn btn-ghost" data-view="imports">View history</button></div></section>'+
      '<section class="card card-pad"><div class="section-title"><div><div class="eyebrow">Documents</div><h2>Local offline files</h2></div>'+badge(state.localDocs.length+' file(s)',state.localDocs.length?'badge-green':'badge-yellow')+'</div><div class="subtle">Cloud document storage remains disabled. Local files are stored in IndexedDB only on this device.</div><button class="btn btn-ghost" style="margin-top:12px" data-view="documents">Manage documents</button></section>'+
      '<section class="card card-pad data-delete-card"><div class="section-title"><div><div class="eyebrow danger-text">Privacy</div><h2>Delete all beta data</h2></div></div>'+
        '<div class="subtle">Permanently remove all server-side trips owned by this guest device/account, sessions and identity data. Shared trips owned by someone else are not deleted.</div>'+
        '<button class="btn btn-danger" style="margin-top:12px" data-action="delete-all-data">Delete all my beta data</button>'+
      '</section>'+
      '<section class="card card-pad danger-card"><div class="section-title"><div><div class="eyebrow danger-text">Danger zone</div><h2>Delete trip</h2></div></div>'+ 
        '<div class="subtle">Deletion requires the current version and a typed confirmation. This avoids accidental destructive actions.</div>'+ 
        '<button class="btn btn-danger" style="margin-top:12px" data-action="delete-trip">Delete '+esc(t.title)+'</button>'+ 
      '</section>'+ 
    '</div>'
  );
}
function downloadJson(filename,data){
  try{
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }catch(e){showRecovery('Export could not be created.',e.message,'Your trip data is unchanged.');}
}

async function downloadAuthenticated(path,defaultName){
  if(!navigator.onLine)throw new Error('Downloads require internet. Cached trip data remains available offline.');
  await ensureSession();
  var r=await fetch(API+path,{headers:{'authorization':'Bearer '+state.token}});
  if(!r.ok){
    var msg='Download failed ('+r.status+')',rid=r.headers.get('x-request-id'),code='DOWNLOAD_FAILED';
    try{var e=await r.json();if(e.error){msg=e.error.message||msg;rid=e.error.requestId||rid;code=e.error.code||code;}}catch(_){}
    throw new ApiError(msg,r.status,code,rid);
  }
  var blob=await r.blob();var cd=r.headers.get('content-disposition')||'';var m=cd.match(/filename="?([^";]+)"?/i);var name=m?m[1]:defaultName;
  var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1200);
}
async function exportCurrentCalendar(){
  if(!state.trip)return;
  try{await downloadAuthenticated('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/export/calendar.ics','tripto-calendar.ics');notify('Calendar export created.');}
  catch(e){recoveryForError('Calendar export failed.',e,'Reconnect and try again.');}
}
async function exportSupportBundle(){
  if(!state.trip)return;
  try{await downloadAuthenticated('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/support','tripto-support.json');notify('Support bundle created.');}
  catch(e){recoveryForError('Support bundle failed.',e,'Your trip data is unchanged.');}
}
async function exportCurrentTrip(){
  if(!state.trip)return;
  try{
    var data=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/export/json');
    var name=String(state.trip.title||'trip').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,50)||'trip';
    downloadJson(name+'-tripto-export.json',data);notify('Trip export created.');
  }catch(e){recoveryForError('Trip export failed.',e,'Reconnect if you are offline, then try again.');}
}
async function showDiagnostics(){
  try{
    var d=await api('/api/v1/diagnostics');state.diagnostics=d.diagnostics||null;
    var x=state.diagnostics||{};var f=x.features||{};
    showRecovery('Beta diagnostics','Mode: '+(x.mode||'unknown')+' · Trips: '+(x.tripCount==null?'—':x.tripCount)+' · DB tables: '+(x.database&&x.database.tables!=null?x.database.tables:'—')+' · Migrations: '+(x.database&&x.database.migrations!=null?x.database.migrations:'—')+' · Account auth: '+(f.accountAuth?'on':'off')+' · Sharing: '+(f.sharing?'on':'off')+' · Live flights: '+(f.liveFlights?'on':'off')+' · AI: '+(f.generativeAI?'on':'off')+' · Request ID: '+(x.requestId||'—'),'No secrets or booking contents are included in this diagnostic summary.');
  }catch(e){recoveryForError('Diagnostics unavailable.',e,'Your trip data is unchanged.');}
}
function lifecycleOptions(current){
  return ['draft','upcoming','active','completed','cancelled'].map(function(v){
    var labels={draft:'Draft',upcoming:'Upcoming',active:'Active / travelling',completed:'Completed',cancelled:'Cancelled'};
    return '<option value="'+v+'" '+(v===current?'selected':'')+'>'+labels[v]+'</option>';
  }).join('');
}
function lifecycleHelp(current){
  var copy={
    draft:'Still being assembled. Use this before the trip is committed.',
    upcoming:'Confirmed future travel. Preparing Mode can guide setup.',
    active:'Trip is in progress. Home prioritizes what is next.',
    completed:'Travel has finished. The trip remains available for reference.',
    cancelled:'Trip was cancelled. Data remains explicit instead of being silently deleted.'
  };
  return '<span>'+esc(copy[current]||copy.draft)+'</span>';
}
function clearTripCache(){
  if(!state.trip)return;
  var id=encodeURIComponent(state.trip.id);
  var prefixes=[
    '/api/v1/trips/'+id,
    '/api/v1/trips'
  ];
  try{
    Object.keys(localStorage).forEach(function(k){
      if(k.indexOf(CACHE_PREFIX)!==0)return;
      var logical=k.slice(CACHE_PREFIX.length);
      if(prefixes.some(function(p){return logical.indexOf(p)===0;}))localStorage.removeItem(k);
    });
    notify('Cached trip snapshots cleared. Live trip data was not deleted.');
  }catch(e){notify('Could not clear cache on this device.');}
}

function readyView(){return shell(readyOfflineCard(false));}

function renderImportReview(){
  var host=document.getElementById('importReviewBody');if(!host)return;
  var data=state.importReview;
  if(!data||!Array.isArray(data.candidates)){host.innerHTML='<div class="subtle">No import preview loaded.</div>';return;}
  if(!data.candidates.length){host.innerHTML='<div class="danger-box"><strong>No supported booking found</strong><span>'+esc((data.import&&data.import.recovery_action)||'Enter the booking manually instead.')+'</span></div>';return;}
  host.innerHTML='<div class="fact-note">'+(data.duplicate?'This email was already previewed. ':'')+'Nothing is created until you press Confirm. Low-confidence fields remain editable.</div>'+data.candidates.map(function(c){
    var p=c.payload||{},warnings=Array.isArray(p.warnings)?p.warnings:[];var status=c.validation_status||'pending';
    var warningHtml=warnings.length?'<div class="import-warnings">'+warnings.map(function(w){return '<span>! '+esc(w)+'</span>';}).join('')+'</div>':'';
    if(c.candidate_type==='flight'){
      return '<section class="import-candidate" data-import-candidate="'+esc(c.id)+'" data-type="flight"><div class="section-title"><div><div class="eyebrow">Flight candidate</div><h3>'+esc((p.airlineCode||'Flight')+' '+(p.flightNumber||''))+'</h3></div>'+badge(Math.round(Number(c.confidence||0)*100)+'% extracted',Number(c.confidence||0)>=.8?'badge-green':'badge-yellow')+'</div>'+warningHtml+'<div class="route-form"><div><div class="field"><label>Airline code</label><input data-f="airlineCode" maxlength="3" value="'+esc(p.airlineCode||'')+'"></div><div class="field"><label>From IATA</label><input data-f="departureIata" maxlength="3" value="'+esc(p.departureIata||'')+'"></div><div class="field"><label>Departure timezone</label><input data-f="departureTimezone" placeholder="Asia/Jerusalem" value="'+esc(p.departureTimezone||'')+'"></div><div class="field"><label>Departure local time</label><input data-f="departureLocal" type="datetime-local" value="'+esc(p.departureLocal||'')+'"></div></div><div><div class="field"><label>Flight number</label><input data-f="flightNumber" maxlength="12" value="'+esc(p.flightNumber||'')+'"></div><div class="field"><label>To IATA</label><input data-f="arrivalIata" maxlength="3" value="'+esc(p.arrivalIata||'')+'"></div><div class="field"><label>Arrival timezone</label><input data-f="arrivalTimezone" placeholder="Europe/Rome" value="'+esc(p.arrivalTimezone||'')+'"></div><div class="field"><label>Arrival local time</label><input data-f="arrivalLocal" type="datetime-local" value="'+esc(p.arrivalLocal||'')+'"></div></div></div><div class="field"><label>Confirmation / PNR</label><input data-f="confirmationNumber" maxlength="80" value="'+esc(p.confirmationNumber||'')+'"></div><div class="inline-actions"><button class="btn btn-primary" data-import-confirm="'+esc(c.id)+'" '+(status!=='pending'?'disabled':'')+'>Confirm flight</button><button class="btn btn-ghost" data-import-reject="'+esc(c.id)+'" '+(status!=='pending'?'disabled':'')+'>Reject</button>'+badge(status,status==='confirmed'?'badge-green':status==='rejected'?'badge-red':'')+'</div></section>';
    }
    return '<section class="import-candidate" data-import-candidate="'+esc(c.id)+'" data-type="stay"><div class="section-title"><div><div class="eyebrow">Stay candidate</div><h3>'+esc(p.propertyName||'Stay')+'</h3></div>'+badge(Math.round(Number(c.confidence||0)*100)+'% extracted',Number(c.confidence||0)>=.8?'badge-green':'badge-yellow')+'</div>'+warningHtml+'<div class="field"><label>Property name</label><input data-f="propertyName" maxlength="160" value="'+esc(p.propertyName||'')+'"></div><div class="two-col"><div class="field"><label>Check-in</label><input data-f="checkInDate" type="date" value="'+esc(p.checkInDate||'')+'"></div><div class="field"><label>Check-out</label><input data-f="checkOutDate" type="date" value="'+esc(p.checkOutDate||'')+'"></div></div><div class="field"><label>Address</label><input data-f="address" maxlength="500" value="'+esc(p.address||'')+'"></div><div class="field"><label>Confirmation</label><input data-f="confirmationNumber" maxlength="100" value="'+esc(p.confirmationNumber||'')+'"></div><div class="inline-actions"><button class="btn btn-primary" data-import-confirm="'+esc(c.id)+'" '+(status!=='pending'?'disabled':'')+'>Confirm stay</button><button class="btn btn-ghost" data-import-reject="'+esc(c.id)+'" '+(status!=='pending'?'disabled':'')+'>Reject</button>'+badge(status,status==='confirmed'?'badge-green':status==='rejected'?'badge-red':'')+'</div></section>';
  }).join('');
  bindImportReviewActions();
}
function candidatePayloadFromCard(card){
  var type=card.dataset.type,p={};card.querySelectorAll('[data-f]').forEach(function(el){p[el.dataset.f]=el.value||null;});
  if(type==='flight'){
    p.airlineCode=String(p.airlineCode||'').toUpperCase();p.flightNumber=String(p.flightNumber||'').toUpperCase();p.departureIata=String(p.departureIata||'').toUpperCase();p.arrivalIata=String(p.arrivalIata||'').toUpperCase();
    p.scheduledDepartureUtc=localToUtc(String(p.departureLocal||''),String(p.departureTimezone||''));p.scheduledArrivalUtc=localToUtc(String(p.arrivalLocal||''),String(p.arrivalTimezone||''));
    if(p.scheduledArrivalUtc<p.scheduledDepartureUtc)throw new Error('Arrival cannot be before departure.');
  }
  return p;
}
function bindImportReviewActions(){
  document.querySelectorAll('[data-import-confirm]').forEach(function(el){el.addEventListener('click',async function(){
    var card=el.closest('[data-import-candidate]');if(!card||!state.importReview||!state.trip)return;
    try{var payload=candidatePayloadFromCard(card);await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/imports/'+encodeURIComponent(state.importReview.import.id)+'/resolve',{method:'POST',body:JSON.stringify({candidateId:el.dataset.importConfirm,action:'confirm',payload:payload})});var c=state.importReview.candidates.find(function(x){return x.id===el.dataset.importConfirm;});if(c)c.validation_status='confirmed';await loadTripDetails();renderImportReview();notify('Booking added from confirmed email data.');}catch(e){recoveryForError('Import was not confirmed.',e,'Check the extracted fields and event-local timezones. Nothing was added automatically.');}
  });});
  document.querySelectorAll('[data-import-reject]').forEach(function(el){el.addEventListener('click',async function(){
    if(!state.importReview||!state.trip)return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/imports/'+encodeURIComponent(state.importReview.import.id)+'/resolve',{method:'POST',body:JSON.stringify({candidateId:el.dataset.importReject,action:'reject'})});var c=state.importReview.candidates.find(function(x){return x.id===el.dataset.importReject;});if(c)c.validation_status='rejected';renderImportReview();notify('Candidate rejected.');}catch(e){recoveryForError('Candidate was not rejected.',e);}
  });});
}
function render(){
  if(state.loading){app.innerHTML=loadingView();bind();return;}
  if(state.view==='account'){app.innerHTML=accountView();bind();return;}
  if(state.view==='trips'){app.innerHTML=tripsView();bind();return;}
  if(!state.trip){app.innerHTML=emptyView();bind();return;}
  var out=state.view==='timeline'?timelineView():state.view==='checklist'?checklistView():state.view==='health'?healthView():state.view==='ready'?readyView():state.view==='settings'?settingsView():state.view==='sharing'?sharingView():state.view==='documents'?documentsView():state.view==='imports'?importsView():homeView();
  app.innerHTML=out; bind();
}

function bind(){
  document.querySelectorAll('.icon-btn[data-close]').forEach(function(el){if(!el.getAttribute('aria-label'))el.setAttribute('aria-label','Close dialog');});
  document.querySelectorAll('button[data-check]').forEach(function(el){if(!el.getAttribute('aria-label'))el.setAttribute('aria-label','Toggle checklist item');});
  document.querySelectorAll('[data-view]').forEach(function(el){el.addEventListener('click',async function(){state.view=el.dataset.view;persistView();if(state.view==='timeline')sendBetaEvent('timeline_opened');if(state.view==='ready')sendBetaEvent('ready_offline_opened');if(state.view==='home'){sendBetaEvent('whats_next_opened');if(modeForTrip()==='active')sendBetaEvent('during_trip_home_opened');}if(state.view==='sharing')await loadSharingManagement();render();});});
  document.querySelectorAll('[data-open]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.open);if(d)d.showModal();});});
  document.querySelectorAll('[data-close]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(el.dataset.close);if(d)d.close();});});
  document.querySelectorAll('[data-trip]').forEach(function(el){el.addEventListener('click',async function(){
    state.trip=state.trips.find(function(t){return t.id===el.dataset.trip;})||state.trip;
    localStorage.setItem('tripto_selected_trip',state.trip.id); state.loading=true; render(); await loadTripDetails(); state.loading=false; state.view='home'; persistView(); render();
  });});
  document.querySelectorAll('[data-check]').forEach(function(el){el.addEventListener('click',async function(){
    var item=state.checklist.find(function(x){return x.id===el.dataset.check;}); if(!item)return;
    var completed=!item.completed_at;
    if(!navigator.onLine){queueChecklistToggle(item,completed);render();notify('Saved on this device. It will sync when you reconnect.');return;}
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/checklist/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({version:item.version,completed:completed})});await loadTripDetails();render();}
    catch(e){recoveryForError('Checklist change was not saved.',e,'Refresh and try again.');}
  });});
  document.querySelectorAll('[data-action="refresh"]').forEach(function(el){el.addEventListener('click',loadTrips);});
  document.querySelectorAll('[data-action="add"]').forEach(function(el){el.addEventListener('click',function(){var d=document.getElementById(state.trip?'bookingDialog':'tripDialog');if(d)d.showModal();});});
  document.querySelectorAll('[data-action="seed"]').forEach(function(el){el.addEventListener('click',seedChecklist);});
  document.querySelectorAll('[data-action="recalc"]').forEach(function(el){el.addEventListener('click',recalcImpacts);});
  document.querySelectorAll('[data-trip-settings]').forEach(function(el){el.addEventListener('click',async function(e){
    e.stopPropagation();
    var target=state.trips.find(function(t){return t.id===el.dataset.tripSettings;});
    if(target){
      state.trip=target;localStorage.setItem('tripto_selected_trip',target.id);
      state.loading=true;render();await loadTripDetails();state.loading=false;state.view='settings';persistView();render();
    }
  });});
  document.querySelectorAll('[data-action="install-app"]').forEach(function(el){el.addEventListener('click',async function(){
    if(!state.installPrompt){notify('Install is not currently offered by this browser.');return;}
    state.installPrompt.prompt();
    try{await state.installPrompt.userChoice;}catch(_){}
    state.installPrompt=null;render();
  });});
  document.querySelectorAll('[data-action="clear-trip-cache"]').forEach(function(el){el.addEventListener('click',clearTripCache);});
  document.querySelectorAll('[data-action="export-json"]').forEach(function(el){el.addEventListener('click',exportCurrentTrip);});
  document.querySelectorAll('[data-action="export-calendar"]').forEach(function(el){el.addEventListener('click',exportCurrentCalendar);});
  document.querySelectorAll('[data-action="export-support"]').forEach(function(el){el.addEventListener('click',exportSupportBundle);});
  document.querySelectorAll('[data-action="show-diagnostics"]').forEach(function(el){el.addEventListener('click',showDiagnostics);});
  document.querySelectorAll('[data-action="sync-now"]').forEach(function(el){el.addEventListener('click',async function(){
    await flushPendingMutations();await loadTrips();notify(state.pendingSyncCount?'Some changes still need review.':'Device changes synced.');
  });});
  document.querySelectorAll('[data-action="clear-sync-review"]').forEach(function(el){el.addEventListener('click',function(){
    var rows=pendingMutations().filter(function(x){return x.status!=='needs_review';});savePendingMutations(rows);render();notify('Review queue cleared. Server trip data was not changed.');
  });});
  document.querySelectorAll('[data-action="accept-invite"]').forEach(function(el){el.addEventListener('click',async function(){
    if(!state.pendingInviteToken)return;
    try{
      var d=await api('/api/v1/invites/accept',{method:'POST',body:JSON.stringify({token:state.pendingInviteToken})});
      state.pendingInviteToken=null;state.invitePreview=null;history.replaceState(null,'','/');await loadTrips();
      var target=state.trips.find(function(t){return t.id===d.tripId;});if(target){state.trip=target;localStorage.setItem('tripto_selected_trip',target.id);await loadTripDetails();}
      state.view='home';persistView();render();notify('Shared trip added.');
    }catch(e){recoveryForError('Invite was not accepted.',e,'Confirm that the verified account matches the invitation and try again.');}
  });});
  document.querySelectorAll('[data-action="copy-last-invite"]').forEach(function(el){el.addEventListener('click',async function(){
    if(!state.lastInvite)return;var value=state.lastInvite.inviteUrl||((location.origin||'')+'/join/'+state.lastInvite.token);
    try{await navigator.clipboard.writeText(value);notify('Invite link copied.');}catch(_){showRecovery('Copy unavailable.',value,'Copy this link manually.');}
  });});
  document.querySelectorAll('[data-invite-revoke]').forEach(function(el){el.addEventListener('click',async function(){
    if(!confirm('Revoke this invitation?'))return;
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/invites/'+encodeURIComponent(el.dataset.inviteRevoke),{method:'DELETE',body:'{}'});await loadSharingManagement();render();notify('Invite revoked.');}
    catch(e){recoveryForError('Invite was not revoked.',e,'Refresh sharing and try again.');}
  });});
  document.querySelectorAll('[data-member-role]').forEach(function(el){el.addEventListener('change',async function(){
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/members/'+encodeURIComponent(el.dataset.memberRole),{method:'PATCH',body:JSON.stringify({role:el.value})});await loadSharingManagement();render();notify('Member role updated.');}
    catch(e){recoveryForError('Member role was not changed.',e,'Refresh sharing and try again.');}
  });});
  document.querySelectorAll('[data-member-remove]').forEach(function(el){el.addEventListener('click',async function(){
    if(!confirm('Remove this member from the trip?'))return;
    try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/members/'+encodeURIComponent(el.dataset.memberRemove),{method:'DELETE',body:'{}'});await loadSharingManagement();render();notify('Member removed.');}
    catch(e){recoveryForError('Member was not removed.',e,'Refresh sharing and try again.');}
  });});

  document.querySelectorAll('[data-action="sharing-info"]').forEach(function(el){el.addEventListener('click',async function(){
    if(state.account&&state.account.mode==='account'&&state.sharing&&state.sharing.enabled){state.view='sharing';persistView();await loadSharingManagement();render();}
    else showRecovery('Sharing is not active yet.','The owner/editor/viewer model, invite tokens and access controls are implemented, but verified account auth and the sharing feature flag remain disabled.','This prevents insecure guest sharing during beta.');
  });});
  document.querySelectorAll('[data-action="delete-trip"]').forEach(function(el){el.addEventListener('click',function(){
    state.pendingDeleteTripId=state.trip&&state.trip.id;
    var d=document.getElementById('deleteTripDialog');if(d)d.showModal();
  });});

  document.querySelectorAll('[data-action="delete-all-data"]').forEach(function(el){el.addEventListener('click',async function(){
    updatePendingCount();
    if(state.pendingSyncCount){showRecovery('Local data cannot be removed yet.',state.pendingSyncCount+' unsynced change(s) still need sync or conflict review.','Reconnect, resolve every pending change, then retry deletion.');return;}
    try{
      var d=await api('/api/v1/account/deletion-preview');var x=d.deletion||{};var effect=document.getElementById('deleteAllDataEffect');
      if(effect)effect.textContent=(x.effect||'All beta data attached to this identity will be deleted.')+' Owned trips: '+(x.ownedTrips==null?'—':x.ownedTrips)+'. Devices: '+(x.devices==null?'—':x.devices)+'.';
      var dialog=document.getElementById('deleteAllDataDialog');if(dialog)dialog.showModal();
    }catch(e){recoveryForError('Deletion preview unavailable.',e,'No data was deleted.');}
  });});
  document.querySelectorAll('[data-action="recovery-refresh"]').forEach(function(el){el.addEventListener('click',async function(){var d=document.getElementById('recoveryDialog');if(d)d.close();await loadTrips();});});
  document.querySelectorAll('[data-traveler-edit]').forEach(function(el){el.addEventListener('click',function(){startEditTraveler(el.dataset.travelerEdit);});});
  document.querySelectorAll('[data-traveler-delete]').forEach(function(el){el.addEventListener('click',async function(){await removeTraveler(el.dataset.travelerDelete);});});
  document.querySelectorAll('[data-connection-type]').forEach(function(el){el.addEventListener('change',async function(){try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/connections/'+encodeURIComponent(el.dataset.connectionType),{method:'PATCH',body:JSON.stringify({version:Number(el.dataset.version),connectionType:el.value})});await loadTripDetails();render();notify('Connection updated.');}catch(e){recovery(e.message,'The connection was not changed. Refresh and review the latest trip data.');}});});
  document.querySelectorAll('[data-connection-delete]').forEach(function(el){el.addEventListener('click',async function(){if(!confirm('Remove this connection rule?'))return;try{await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/connections/'+encodeURIComponent(el.dataset.connectionDelete),{method:'DELETE',body:JSON.stringify({version:Number(el.dataset.version)})});await loadTripDetails();render();notify('Connection removed.');}catch(e){recovery(e.message);}});});
  document.querySelectorAll('[data-transport-detail]').forEach(function(el){el.addEventListener('click',function(){openTransportDetail(el.dataset.transportDetail);});});



  document.querySelectorAll('[data-import-open]').forEach(function(el){el.addEventListener('click',async function(){
    if(!state.trip)return;try{var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/imports/'+encodeURIComponent(el.dataset.importOpen));state.importReview=d;var review=document.getElementById('importReviewDialog');if(review)review.showModal();renderImportReview();}catch(e){recoveryForError('Import could not be opened.',e,'Refresh the import history and try again.');}
  });});
  document.querySelectorAll('[data-local-doc-open]').forEach(function(el){el.addEventListener('click',function(){openLocalDoc(el.dataset.localDocOpen);});});
  document.querySelectorAll('[data-local-doc-delete]').forEach(function(el){el.addEventListener('click',function(){if(confirm('Remove this local document from this device?'))removeLocalDoc(el.dataset.localDocDelete);});});
  document.querySelectorAll('[data-action="show-how"]').forEach(function(el){el.addEventListener('click',function(){
    var section=document.getElementById('howItWorks'); if(section)section.scrollIntoView({behavior:'smooth',block:'start'});
  });});
  document.querySelectorAll('[data-onboarding-start]').forEach(function(el){el.addEventListener('click',markOnboardingSeen);});

  document.querySelectorAll('[data-booking]').forEach(function(el){el.addEventListener('click',function(){
    var chooser=document.getElementById('bookingDialog'); if(chooser)chooser.close();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog',traveler:'travelerDialog',import:'importDialog',document:'localDocDialog'};
    var d=document.getElementById(map[el.dataset.booking]); if(d)d.showModal();
  });});
  document.querySelectorAll('[data-booking-shortcut]').forEach(function(el){el.addEventListener('click',function(e){
    e.stopPropagation();
    var map={flight:'flightDialog',hotel:'hotelDialog',train:'trainDialog',car:'carDialog',activity:'planDialog',traveler:'travelerDialog',import:'importDialog',document:'localDocDialog'};
    var d=document.getElementById(map[el.dataset.bookingShortcut]); if(d)d.showModal();
  });});
  document.querySelectorAll('[data-flight-detail]').forEach(function(el){el.addEventListener('click',function(){
    openFlightDetail(el.dataset.flightDetail);
  });});
  document.querySelectorAll('[data-stay-detail]').forEach(function(el){el.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('[data-open=\"driverDialog\"]'))return;
    openStayDetail(el.dataset.stayDetail);
  });});




  var importEmailForm=document.getElementById('importEmailForm');
  if(importEmailForm)importEmailForm.addEventListener('submit',async function(e){
    e.preventDefault();if(!state.trip)return;var fd=new FormData(importEmailForm);
    try{
      var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/imports/forwarded-email/preview',{method:'POST',body:JSON.stringify({sender:fd.get('sender')||null,subject:fd.get('subject')||null,body:fd.get('body')})});
      state.importReview=d;document.getElementById('importDialog').close();var review=document.getElementById('importReviewDialog');if(review)review.showModal();renderImportReview();await loadTripDetails();
    }catch(err){recoveryForError('Email could not be previewed.',err,'Paste the plain booking-confirmation text or add the booking manually.');}
  });
  var localDocForm=document.getElementById('localDocForm');
  if(localDocForm)localDocForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(localDocForm);var input=localDocForm.elements.file;var file=input&&input.files&&input.files[0];
    try{await saveLocalDoc(file,String(fd.get('type')||'other'),selectedTravelerIds(localDocForm));document.getElementById('localDocDialog').close();localDocForm.reset();render();notify('Document saved on this device for offline use.');}catch(err){showRecovery('Document was not saved.',err.message,'Choose a supported file up to 10 MB. Cloud document storage remains disabled.');}
  });

  var inviteForm=document.getElementById('inviteForm');
  if(inviteForm)inviteForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(inviteForm);
    try{
      var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id)+'/invites',{method:'POST',body:JSON.stringify({email:fd.get('email')||null,role:fd.get('role'),expiresInDays:Number(fd.get('expiresInDays'))})});
      state.lastInvite=d.invite||null;await loadSharingManagement();state.lastInvite=d.invite||null;render();notify('Invite created. Copy it now.');
    }catch(err){recoveryForError('Invite was not created.',err,'Review the email, member limit and feature status.');}
  });

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

  var deleteAllDataForm=document.getElementById('deleteAllDataForm');
  if(deleteAllDataForm)deleteAllDataForm.addEventListener('submit',async function(e){
    e.preventDefault();var fd=new FormData(deleteAllDataForm);
    if(String(fd.get('confirm')||'').trim()!=='DELETE'){notify('Type DELETE exactly to confirm.');return;}
    updatePendingCount();
    if(state.pendingSyncCount){showRecovery('Local data cannot be removed yet.',state.pendingSyncCount+' unsynced change(s) still need sync or conflict review.','Reconnect, resolve every pending change, then retry deletion.');return;}
    try{
      await api('/api/v1/account',{method:'DELETE',body:JSON.stringify({confirm:'DELETE'})});
      await clearAllLocalBetaData();location.replace('/');
    }catch(err){recoveryForError('Your beta data was not deleted.',err,'Nothing is removed unless the server confirms the deletion.');}
  });

  var tripSettingsForm=document.getElementById('tripSettingsForm');
  if(tripSettingsForm)tripSettingsForm.addEventListener('submit',async function(e){
    e.preventDefault();
    var fd=new FormData(tripSettingsForm);
    try{
      var payload={
        version:state.trip.version,
        title:fd.get('title'),
        startsOn:fd.get('startsOn')||null,
        endsOn:fd.get('endsOn')||null,
        lifecycleState:fd.get('lifecycleState')
      };
      var d=await api('/api/v1/trips/'+encodeURIComponent(state.trip.id),{method:'PATCH',body:JSON.stringify(payload)});
      state.trip=d.trip;
      state.trips=state.trips.map(function(t){return t.id===d.trip.id?d.trip:t;});
      localStorage.setItem('tripto_selected_trip',d.trip.id);
      await loadTripDetails();render();notify('Trip settings saved.');
    }catch(err){showRecovery('Trip settings were not saved.',err.message,'Refresh the trip and try again.');}
  });

  var deleteTripForm=document.getElementById('deleteTripForm');
  if(deleteTripForm)deleteTripForm.addEventListener('submit',async function(e){
    e.preventDefault();
    var fd=new FormData(deleteTripForm);
    if(String(fd.get('confirm')||'').trim()!=='DELETE'){notify('Type DELETE exactly to confirm.');return;}
    if(!state.trip||state.pendingDeleteTripId!==state.trip.id){notify('Trip selection changed. Reopen delete confirmation.');return;}
    try{
      var deletedId=state.trip.id;
      await api('/api/v1/trips/'+encodeURIComponent(deletedId),{method:'DELETE',body:JSON.stringify({version:state.trip.version})});
      document.getElementById('deleteTripDialog').close();
      state.pendingDeleteTripId=null;
      state.trips=state.trips.filter(function(t){return t.id!==deletedId;});
      state.trip=state.trips[0]||null;
      if(state.trip)localStorage.setItem('tripto_selected_trip',state.trip.id);else localStorage.removeItem('tripto_selected_trip');
      state.view=state.trip?'home':'trips';persistView();
      if(state.trip)await loadTripDetails();else{state.timeline=[];state.checklist=[];state.transport=[];state.stays=[];state.locations=[];state.travelers=[];state.brain=null;state.impacts=[];}
      render();notify('Trip deleted.');
    }catch(err){showRecovery('Trip was not deleted.',err.message,'Refresh before trying again. The trip may have changed on another client.');}
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


window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  state.installPrompt=e;
  if(state.view==='settings')render();
});
window.addEventListener('appinstalled',function(){
  state.installPrompt=null;
  notify('tripto.to installed on this device.');
});
window.addEventListener('online',function(){state.offline=false;flushPendingMutations().finally(loadTrips);});
window.addEventListener('offline',function(){state.offline=true;render();});
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
updatePendingCount();
loadTrips();
})();
