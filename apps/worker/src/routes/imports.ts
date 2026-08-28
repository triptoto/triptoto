import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';
import { parseForwardedEmail } from '../../../../packages/importer/src/index.ts';
import { recordBetaEvent, recordBookingMilestones } from '../beta-events.ts';
import { PRODUCT_LIMITS } from '../config.ts';

interface PreviewBody { sender?:unknown; subject?:unknown; body?:unknown; sourceTimestamp?:unknown; }
interface UploadPreviewBody { checksum?:unknown; filename?:unknown; documentKind?:unknown; candidate?:unknown; duplicateDisposition?:unknown; }
interface ResolveBody { candidateId?:unknown; action?:unknown; payload?:unknown; }
const actions=['confirm','reject'] as const;
const uploadTypes=['flight','hotel','train','car','transfer','ferry','activity','restaurant','reservation','generic_ticket'] as const;

export async function previewUploadedDocument(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<UploadPreviewBody>(request,64*1024);
  const checksum=requireString(body.checksum,'checksum',64).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(checksum))throw new HttpError(400,'VALIDATION_ERROR','checksum must be a SHA-256 hex digest.');
  const filename=optionalString(body.filename,'filename',240),documentKind=optionalString(body.documentKind,'documentKind',20);
  const raw=body.candidate;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'VALIDATION_ERROR','A structured recognition candidate is required.');
  const candidate=normalizeUploadCandidate(raw as Record<string,unknown>);
  const duplicate=await env.DB.prepare(`SELECT * FROM imports WHERE source_type='upload' AND (source_fingerprint=? OR source_fingerprint LIKE ?) ORDER BY created_at LIMIT 1`).bind(checksum,`${checksum}:%`).first<Record<string,unknown>>();
  const addAnyway=body.duplicateDisposition==='add_anyway';
  if(duplicate&&!addAnyway){
    const candidates=(await env.DB.prepare(`SELECT id,candidate_type,payload_json,confidence,validation_status,created_at FROM import_candidates WHERE import_id=? ORDER BY created_at`).bind(duplicate.id).all<Record<string,unknown>>()).results??[];
    return json({duplicate:true,import:duplicate,candidates:candidates.map(shapeCandidate),actions:['review_existing','update_existing','add_anyway']},{},request,env);
  }
  const now=nowMs(),importId=uuid(),candidateId=uuid(),fingerprint=addAnyway?`${checksum}:${uuid()}`:checksum;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO imports(id,trip_id,user_id,source_type,status,source_fingerprint,recovery_action,created_at) VALUES (?,?,?,'upload','needs_confirmation',?,'Review every recognized field before confirming.',?)`).bind(importId,tripId,auth.userId??null,fingerprint,now),
    env.DB.prepare(`INSERT INTO import_messages(id,import_id,sequence_no,subject,normalized_hash,created_at) VALUES (?,?,1,?,?,?)`).bind(uuid(),importId,filename,checksum,now),
    env.DB.prepare(`INSERT INTO import_candidates(id,import_id,candidate_type,payload_json,confidence,validation_status,created_at) VALUES (?,?,?,?,?,'pending',?)`).bind(candidateId,importId,candidate.type,JSON.stringify({...candidate.payload,documentKind,filename,checksum,warnings:candidate.warnings}),candidate.confidence,now),
  ]);
  await recordBetaEvent(env,auth,'import_previewed',tripId,'always');
  return json({duplicate:false,import:{id:importId,source_type:'upload',status:'needs_confirmation'},candidates:[shapeCandidate({id:candidateId,candidate_type:candidate.type,payload_json:JSON.stringify({...candidate.payload,warnings:candidate.warnings}),confidence:candidate.confidence,validation_status:'pending',created_at:now})],privacy:{rawBytesReceived:false,extractedTextReceived:false,rawDocumentStored:false}},{status:201},request,env);
}

export async function previewForwardedEmail(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<PreviewBody>(request,128*1024);
  const raw=requireString(body.body,'body',80000);
  const sender=optionalString(body.sender,'sender',320);
  const subject=optionalString(body.subject,'subject',500);
  const sourceTimestamp=optionalInteger(body.sourceTimestamp,'sourceTimestamp');
  const now=nowMs();
  const recent=await env.DB.prepare(`SELECT COUNT(*) AS count FROM imports WHERE trip_id=? AND created_at>?`).bind(tripId,now-86400000).first<{count:number}>();
  if(Number(recent?.count??0)>=PRODUCT_LIMITS.forwardedImportsPerDay)throw new HttpError(429,'IMPORT_DAILY_LIMIT',`Beta limit of ${PRODUCT_LIMITS.forwardedImportsPerDay} booking-email imports per trip per day reached.`);
  const parsed=parseForwardedEmail({sender,subject,body:raw});
  const fingerprint=await digestHex(`${tripId}\n${sender??''}\n${subject??''}\n${parsed.normalizedText}`);
  const existing=await env.DB.prepare(`SELECT * FROM imports WHERE source_type='forwarded_email' AND source_fingerprint=?`).bind(fingerprint).first<Record<string,unknown>>();
  if(existing){
    const candidates=(await env.DB.prepare(`SELECT id,candidate_type,payload_json,confidence,validation_status,created_at FROM import_candidates WHERE import_id=? ORDER BY created_at`).bind(existing.id).all<Record<string,unknown>>()).results??[];
    return json({duplicate:true,import:existing,candidates:candidates.map(shapeCandidate)}, {}, request, env);
  }
  const importId=uuid(); const messageId=uuid();
  const status=parsed.candidates.length?'needs_confirmation':'unsupported';
  const recovery=parsed.unsupportedReason??'Review extracted booking details before confirming.';
  const statements=[
    env.DB.prepare(`INSERT INTO imports(id,trip_id,user_id,source_type,status,source_fingerprint,recovery_action,created_at) VALUES (?,?,?,'forwarded_email',?,?,?,?)`).bind(importId,tripId,auth.userId??null,status,fingerprint,recovery,now),
    env.DB.prepare(`INSERT INTO import_messages(id,import_id,sequence_no,source_timestamp,sender,subject,normalized_hash,created_at) VALUES (?,?,1,?,?,?,?,?)`).bind(messageId,importId,sourceTimestamp,sender,subject,fingerprint,now),
  ];
  for(const candidate of parsed.candidates){
    statements.push(env.DB.prepare(`INSERT INTO import_candidates(id,import_id,candidate_type,payload_json,confidence,validation_status,created_at) VALUES (?,?,?,?,?,'pending',?)`).bind(uuid(),importId,candidate.candidateType,JSON.stringify({...candidate.payload,warnings:candidate.warnings}),candidate.confidence,now));
  }
  await env.DB.batch(statements);
  await recordBetaEvent(env,auth,'import_previewed',tripId,'always');
  const imported=await env.DB.prepare(`SELECT * FROM imports WHERE id=?`).bind(importId).first();
  const candidates=(await env.DB.prepare(`SELECT id,candidate_type,payload_json,confidence,validation_status,created_at FROM import_candidates WHERE import_id=? ORDER BY created_at`).bind(importId).all<Record<string,unknown>>()).results??[];
  return json({duplicate:false,import:imported,candidates:candidates.map(shapeCandidate),privacy:{rawBodyStored:false,note:'Raw forwarded-email body is parsed in-memory and not persisted.'}},{status:201},request,env);
}

export async function listImports(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const rows=(await env.DB.prepare(`SELECT i.id,i.source_type,i.status,i.recovery_action,i.created_at,i.completed_at,m.sender,m.subject,(SELECT COUNT(*) FROM import_candidates c WHERE c.import_id=i.id) candidate_count FROM imports i LEFT JOIN import_messages m ON m.import_id=i.id AND m.sequence_no=1 WHERE i.trip_id=? ORDER BY i.created_at DESC LIMIT 100`).bind(tripId).all()).results??[];
  return json({imports:rows},{},request,env);
}

export async function getImport(request:Request,env:Env,auth:AuthContext,tripId:string,importId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const imported=await env.DB.prepare(`SELECT * FROM imports WHERE id=? AND trip_id=?`).bind(importId,tripId).first();
  if(!imported)throw new HttpError(404,'IMPORT_NOT_FOUND','Import was not found.');
  const candidates=(await env.DB.prepare(`SELECT id,candidate_type,payload_json,confidence,validation_status,created_at FROM import_candidates WHERE import_id=? ORDER BY created_at`).bind(importId).all<Record<string,unknown>>()).results??[];
  return json({import:imported,candidates:candidates.map(shapeCandidate)},{},request,env);
}

export async function resolveImportCandidate(request:Request,env:Env,auth:AuthContext,tripId:string,importId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<ResolveBody>(request);
  const candidateId=requireString(body.candidateId,'candidateId',80);
  const action=enumValue(body.action,'action',actions);
  const candidate=await env.DB.prepare(`SELECT c.*,i.source_type FROM import_candidates c JOIN imports i ON i.id=c.import_id WHERE c.id=? AND c.import_id=? AND i.trip_id=?`).bind(candidateId,importId,tripId).first<Record<string,unknown>>();
  if(!candidate)throw new HttpError(404,'IMPORT_CANDIDATE_NOT_FOUND','Import candidate was not found.');
  if(candidate.validation_status!=='pending')throw new HttpError(409,'IMPORT_ALREADY_RESOLVED','This import candidate has already been resolved.');
  if(action==='reject'){
    await env.DB.prepare(`UPDATE import_candidates SET validation_status='rejected' WHERE id=? AND validation_status='pending'`).bind(candidateId).run();
    await updateImportStatus(env,importId);
    return json({resolved:'rejected'},{},request,env);
  }
  const stored=parsePayload(candidate.payload_json);
  const override=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload as Record<string,unknown>:{};
  const payload={...stored,...override}; delete payload.warnings;
  const resolvedType=candidate.source_type==='upload'&&payload.candidateType?enumValue(payload.candidateType,'candidateType',uploadTypes):String(candidate.candidate_type);
  const entitySource=candidate.source_type==='upload'?'upload':'email';
  delete payload.candidateType;
  let entityId:string;
  if(resolvedType==='flight')entityId=await materializeFlight(env,tripId,importId,payload,entitySource);
  else if(resolvedType==='stay'||resolvedType==='hotel')entityId=await materializeStay(env,tripId,importId,payload,entitySource);
  else if(['train','car','transfer','ferry'].includes(resolvedType))entityId=await materializeTransport(env,tripId,importId,resolvedType,payload);
  else if(['activity','restaurant','reservation','generic_ticket'].includes(resolvedType))entityId=await materializePlan(env,tripId,importId,resolvedType,payload);
  else throw new HttpError(400,'UNSUPPORTED_IMPORT_CANDIDATE','This candidate type cannot be confirmed.');
  await env.DB.prepare(`UPDATE import_candidates SET validation_status='confirmed',candidate_type=?,payload_json=? WHERE id=? AND validation_status='pending'`).bind(resolvedType,JSON.stringify(payload),candidateId).run();
  await updateImportStatus(env,importId);
  await recordBetaEvent(env,auth,'import_confirmed',tripId);
  await recordBookingMilestones(env,auth,tripId);
  return json({resolved:'confirmed',entityId,candidateType:resolvedType},{},request,env);
}

async function materializeFlight(env:Env,tripId:string,importId:string,p:Record<string,unknown>,source:'email'|'upload'='email'):Promise<string>{
  const airline=upper(requiredText(p.airlineCode,'airlineCode',3)); const number=requiredText(p.flightNumber,'flightNumber',12);
  const fromIata=upper(requiredText(p.departureIata,'departureIata',3)); const toIata=upper(requiredText(p.arrivalIata,'arrivalIata',3));
  const dep=requiredInt(p.scheduledDepartureUtc,'scheduledDepartureUtc'); const arr=requiredInt(p.scheduledArrivalUtc,'scheduledArrivalUtc');
  if(arr<dep)throw new HttpError(400,'VALIDATION_ERROR','Arrival cannot be before departure.');
  const depTz=optionalText(p.departureTimezone,80),arrTz=optionalText(p.arrivalTimezone,80);
  const from=await ensureLocation(env,tripId,'airport',fromIata,optionalText(p.departureName,160)??fromIata,depTz);
  const to=await ensureLocation(env,tripId,'airport',toIata,optionalText(p.arrivalName,160)??toIata,arrTz);
  const id=uuid(),now=nowMs(); const title=`${airline} ${number}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,?,'confirmed',?,?,1)`).bind(id,tripId,title,from,to,dep,arr,depTz,arrTz,source,now,now),
    env.DB.prepare(`INSERT INTO transport_segments(trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (?,'flight',?,?,?,?,?,?,?,?,?,'confirmed')`).bind(id,airline,number,from,to,dep,arr,depTz,arrTz,optionalText(p.confirmationNumber,80)),
    env.DB.prepare(`INSERT INTO flights(trip_item_id,marketing_airline_code,marketing_flight_number,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (?,?,?,?,?,'scheduled','none',0)`).bind(id,airline,number,dep,arr),
  ]);
  await recordChangeEvent(env,tripId,'trip_item',id,'import_confirmed',null,{importId,candidateType:'flight',title},source,importId);
  return id;
}

async function materializeStay(env:Env,tripId:string,importId:string,p:Record<string,unknown>,source:'email'|'upload'='email'):Promise<string>{
  const property=requiredText(p.propertyName,'propertyName',160); const checkIn=dateText(p.checkInDate,'checkInDate'); const checkOut=dateText(p.checkOutDate,'checkOutDate');
  if(checkIn&&checkOut&&checkOut<checkIn)throw new HttpError(400,'VALIDATION_ERROR','checkOutDate cannot be before checkInDate.');
  const address=optionalText(p.address,500); let locationId:string|null=null;
  if(address){locationId=await ensureNamedLocation(env,tripId,'hotel',property,address);}
  const id=uuid(),now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'stay','confirmed',?,?,?,'confirmed',?,?,1)`).bind(id,tripId,property,locationId,source,now,now),
    env.DB.prepare(`INSERT INTO stays(trip_item_id,property_name,property_location_id,check_in_date,check_out_date,confirmation_number,booking_status) VALUES (?,?,?,?,?,?,'confirmed')`).bind(id,property,locationId,checkIn,checkOut,optionalText(p.confirmationNumber,100)),
  ]);
  await recordChangeEvent(env,tripId,'trip_item',id,'import_confirmed',null,{importId,candidateType:'stay',title:property},source,importId);
  return id;
}

async function ensureLocation(env:Env,tripId:string,type:string,code:string,name:string,tz:string|null):Promise<string>{
  const existing=await env.DB.prepare(`SELECT l.id FROM locations l JOIN trip_locations tl ON tl.location_id=l.id WHERE tl.trip_id=? AND l.iata_code=? LIMIT 1`).bind(tripId,code).first<{id:string}>();
  if(existing)return existing.id;
  const id=uuid(),now=nowMs(); await env.DB.batch([
    env.DB.prepare(`INSERT INTO locations(id,type,display_name,timezone,iata_code,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,1)`).bind(id,type,name,tz,code,now,now),
    env.DB.prepare(`INSERT INTO trip_locations(trip_id,location_id,created_at) VALUES (?,?,?)`).bind(tripId,id,now),
  ]); return id;
}
async function ensureNamedLocation(env:Env,tripId:string,type:string,name:string,address:string):Promise<string>{
  const existing=await env.DB.prepare(`SELECT l.id FROM locations l JOIN trip_locations tl ON tl.location_id=l.id WHERE tl.trip_id=? AND lower(l.display_name)=lower(?) AND COALESCE(l.formatted_address,'')=? LIMIT 1`).bind(tripId,name,address).first<{id:string}>();
  if(existing)return existing.id;
  const id=uuid(),now=nowMs(); await env.DB.batch([
    env.DB.prepare(`INSERT INTO locations(id,type,display_name,formatted_address,local_address,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,1)`).bind(id,type,name,address,address,now,now),
    env.DB.prepare(`INSERT INTO trip_locations(trip_id,location_id,created_at) VALUES (?,?,?)`).bind(tripId,id,now),
  ]);return id;
}
async function updateImportStatus(env:Env,importId:string):Promise<void>{
  const counts=(await env.DB.prepare(`SELECT validation_status,COUNT(*) count FROM import_candidates WHERE import_id=? GROUP BY validation_status`).bind(importId).all<{validation_status:string;count:number}>()).results??[];
  const map=Object.fromEntries(counts.map(x=>[x.validation_status,Number(x.count)]));
  const pending=map.pending??0,confirmed=map.confirmed??0,rejected=map.rejected??0,invalid=map.invalid??0;
  let status='needs_confirmation'; let completedAt:null|number=null;
  if(pending===0){completedAt=nowMs();status=confirmed>0?(rejected||invalid?'partial':'completed'):'unsupported';}
  const statements=[env.DB.prepare(`UPDATE imports SET status=?,completed_at=? WHERE id=?`).bind(status,completedAt,importId)];
  if(status==='unsupported')statements.push(env.DB.prepare(`UPDATE inbound_booking_emails SET status='rejected',rejection_code='NO_CONFIRMED_CANDIDATE' WHERE import_id=?`).bind(importId));
  await env.DB.batch(statements);
}
function shapeCandidate(row:Record<string,unknown>){return {...row,payload:parsePayload(row.payload_json)};}
function parsePayload(value:unknown):Record<string,unknown>{try{return JSON.parse(String(value)) as Record<string,unknown>;}catch{return {};}}
async function digestHex(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function requiredText(v:unknown,n:string,max:number):string{if(typeof v!=='string'||!v.trim())throw new HttpError(400,'IMPORT_CONFIRMATION_REQUIRED',`${n} must be confirmed.`);const x=v.trim();if(x.length>max)throw new HttpError(400,'VALIDATION_ERROR',`${n} is too long.`);return x;}
function optionalText(v:unknown,max:number):string|null{if(v==null||v==='')return null;if(typeof v!=='string')throw new HttpError(400,'VALIDATION_ERROR','Text field is invalid.');const x=v.trim();if(x.length>max)throw new HttpError(400,'VALIDATION_ERROR','Text field is too long.');return x||null;}
function requiredInt(v:unknown,n:string):number{if(typeof v!=='number'||!Number.isSafeInteger(v))throw new HttpError(400,'IMPORT_CONFIRMATION_REQUIRED',`${n} must be confirmed.`);return v;}
function upper(v:string):string{return v.toUpperCase();}
function dateText(v:unknown,n:string):string|null{const x=optionalText(v,10);if(x==null)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||Number.isNaN(Date.parse(`${x}T00:00:00Z`)))throw new HttpError(400,'VALIDATION_ERROR',`${n} must be YYYY-MM-DD.`);return x;}

function normalizeUploadCandidate(raw:Record<string,unknown>){
  const type=enumValue(raw.type,'candidate.type',uploadTypes);
  const confidence=typeof raw.confidence==='number'&&Number.isFinite(raw.confidence)?Math.max(0,Math.min(1,raw.confidence)):0;
  const rawFields=raw.fields&&typeof raw.fields==='object'&&!Array.isArray(raw.fields)?raw.fields as Record<string,unknown>:{};
  if(Object.keys(rawFields).length>40)throw new HttpError(400,'VALIDATION_ERROR','Too many recognized fields.');
  const payload:Record<string,unknown>={},fieldMeta:Record<string,unknown>={};
  for(const [key,entry] of Object.entries(rawFields)){
    if(key==='barcodeValue')continue;
    if(!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)||!entry||typeof entry!=='object'||Array.isArray(entry))continue;
    const field=entry as Record<string,unknown>,value=field.value;
    if(!(typeof value==='string'||typeof value==='number'||value===null))continue;
    if(typeof value==='string'&&value.length>1000)throw new HttpError(400,'VALIDATION_ERROR','Recognized field is too long.');
    payload[key]=value;
    fieldMeta[key]={confidence:typeof field.confidence==='number'?Math.max(0,Math.min(1,field.confidence)):0,source:optionalText(field.source,30)};
  }
  payload.fieldMeta=fieldMeta;
  const warnings=Array.isArray(raw.warnings)?raw.warnings.filter(x=>typeof x==='string').slice(0,20).map(x=>String(x).slice(0,240)):[];
  return {type,confidence,payload,warnings};
}

async function materializeTransport(env:Env,tripId:string,importId:string,type:string,p:Record<string,unknown>):Promise<string>{
  const title=requiredText(p.title,'title',160),dep=nullableInt(p.scheduledDepartureUtc),arr=nullableInt(p.scheduledArrivalUtc);
  if(dep!=null&&arr!=null&&arr<dep)throw new HttpError(400,'VALIDATION_ERROR','Arrival cannot be before departure.');
  const from=await optionalImportLocation(env,tripId,optionalText(p.departureName,160),optionalText(p.departureTimezone,80));
  const to=await optionalImportLocation(env,tripId,optionalText(p.arrivalName,160),optionalText(p.arrivalTimezone,80));
  const id=uuid(),now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,'upload','confirmed',?,?,1)`).bind(id,tripId,title,from,to,dep,arr,optionalText(p.departureTimezone,80),optionalText(p.arrivalTimezone,80),now,now),
    env.DB.prepare(`INSERT INTO transport_segments(trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed')`).bind(id,type,optionalText(p.carrierName,120),optionalText(p.serviceNumber,40),from,to,dep,arr,optionalText(p.departureTimezone,80),optionalText(p.arrivalTimezone,80),optionalText(p.confirmationNumber,80)),
  ]);
  await recordChangeEvent(env,tripId,'trip_item',id,'import_confirmed',null,{importId,candidateType:type,title},'upload',importId);return id;
}
async function materializePlan(env:Env,tripId:string,importId:string,type:string,p:Record<string,unknown>):Promise<string>{
  const title=requiredText(p.title,'title',160),start=nullableInt(p.startsAtUtc),end=nullableInt(p.endsAtUtc);if(start!=null&&end!=null&&end<start)throw new HttpError(400,'VALIDATION_ERROR','End cannot be before start.');
  const itemType=type==='activity'?'activity':'reservation',id=uuid(),now=nowMs(),timezone=optionalText(p.timezone,80),reference=optionalText(p.confirmationNumber,100);
  const statements=[env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,'upload','confirmed',?,?,1)`).bind(id,tripId,itemType,'confirmed',title,start,end,timezone,timezone,now,now)];
  if(itemType==='activity')statements.push(env.DB.prepare(`INSERT INTO activities(trip_item_id,activity_type,reservation_reference,notes) VALUES (?,?,?,?)`).bind(id,type,reference,optionalText(p.notes,1000)));
  else statements.push(env.DB.prepare(`INSERT INTO reservations(trip_item_id,reservation_type,confirmation_number,window_start_utc,window_end_utc,notes) VALUES (?,?,?,?,?,?)`).bind(id,type,reference,start,end,optionalText(p.notes,1000)));
  await env.DB.batch(statements);await recordChangeEvent(env,tripId,'trip_item',id,'import_confirmed',null,{importId,candidateType:type,title},'upload',importId);return id;
}
async function optionalImportLocation(env:Env,tripId:string,name:string|null,tz:string|null):Promise<string|null>{if(!name)return null;const existing=await env.DB.prepare(`SELECT l.id FROM locations l JOIN trip_locations tl ON tl.location_id=l.id WHERE tl.trip_id=? AND lower(l.display_name)=lower(?) LIMIT 1`).bind(tripId,name).first<{id:string}>();if(existing)return existing.id;const id=uuid(),now=nowMs();await env.DB.batch([env.DB.prepare(`INSERT INTO locations(id,type,display_name,timezone,created_at,updated_at,version) VALUES (?,'other',?,?,?,?,1)`).bind(id,name,tz,now,now),env.DB.prepare(`INSERT INTO trip_locations(trip_id,location_id,created_at) VALUES (?,?,?)`).bind(tripId,id,now)]);return id;}
function nullableInt(v:unknown):number|null{if(v==null||v==='')return null;if(typeof v!=='number'||!Number.isSafeInteger(v))throw new HttpError(400,'VALIDATION_ERROR','Time must be an integer timestamp.');return v;}
