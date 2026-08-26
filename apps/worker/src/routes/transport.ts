import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';
import { recordBookingMilestones } from '../beta-events.ts';
import { claimManualBookingCreate, completeManualBookingCreate, manualBookingLocationFingerprint, recoverManualBookingCreate } from '../manual-booking-idempotency.ts';

const transportTypes=['flight','train','bus','ferry','car','transfer','other'] as const;
const statuses=['planned','confirmed','completed','cancelled','skipped','unknown'] as const;
interface Body { transportType?:unknown; title?:unknown; status?:unknown; carrierName?:unknown; serviceNumber?:unknown; departureLocationId?:unknown; arrivalLocationId?:unknown; scheduledDepartureUtc?:unknown; scheduledArrivalUtc?:unknown; departureTimezone?:unknown; arrivalTimezone?:unknown; bookingReference?:unknown; bookingStatus?:unknown; marketingAirlineCode?:unknown; marketingFlightNumber?:unknown; operatingAirlineCode?:unknown; operatingFlightNumber?:unknown; departureTerminal?:unknown; departureGate?:unknown; arrivalTerminal?:unknown; arrivalGate?:unknown; boardingTimeUtc?:unknown; gateCloseTimeUtc?:unknown; travelerIds?:unknown; version?:unknown; }

export async function listTransport(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId);
 const result=await env.DB.prepare(`SELECT ti.*,ts.transport_type,ts.carrier_name,ts.service_number,ts.departure_location_id,ts.arrival_location_id,ts.scheduled_departure_utc,ts.scheduled_arrival_utc,ts.departure_timezone,ts.arrival_timezone,ts.booking_reference,ts.booking_status,f.marketing_airline_code,f.marketing_flight_number,f.operating_airline_code,f.operating_flight_number,f.departure_terminal,f.departure_gate,f.arrival_terminal,f.arrival_gate,f.boarding_time_utc,f.gate_close_time_utc,f.operational_phase,f.disruption_state,(SELECT GROUP_CONCAT(tit.traveler_id, ',') FROM trip_item_travelers tit WHERE tit.trip_item_id=ti.id) traveler_ids FROM trip_items ti JOIN transport_segments ts ON ts.trip_item_id=ti.id LEFT JOIN flights f ON f.trip_item_id=ti.id WHERE ti.trip_id=? AND ti.deleted_at IS NULL ORDER BY ti.starts_at_utc`).bind(tripId).all();
 return json({transport:result.results??[]},{},request,env);
}

export async function createTransport(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId,true); const body=await readJson<Body>(request);
 const transportType=enumValue(body.transportType,'transportType',transportTypes); const title=requireString(body.title,'title',160);
 const dep=optionalInteger(body.scheduledDepartureUtc,'scheduledDepartureUtc'); const arr=optionalInteger(body.scheduledArrivalUtc,'scheduledArrivalUtc');
 if(dep!=null&&arr!=null&&arr<dep) throw new HttpError(400,'VALIDATION_ERROR','scheduledArrivalUtc cannot be before scheduledDepartureUtc.');
 if(transportType==='flight'&&dep==null) throw new HttpError(400,'VALIDATION_ERROR','Flights require a scheduled departure time.');
 const departureLocationId=optionalString(body.departureLocationId,'departureLocationId',80); const arrivalLocationId=optionalString(body.arrivalLocationId,'arrivalLocationId',80);
 await ensureLocations(env,tripId,[departureLocationId,arrivalLocationId]);
 const normalized={transportType,title,departureLocationId,arrivalLocationId,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:optionalString(body.departureTimezone,'departureTimezone',80),arrivalTimezone:optionalString(body.arrivalTimezone,'arrivalTimezone',80),carrierName:optionalString(body.carrierName,'carrierName',120),serviceNumber:optionalString(body.serviceNumber,'serviceNumber',40),bookingReference:optionalString(body.bookingReference,'bookingReference',80),bookingStatus:optionalString(body.bookingStatus,'bookingStatus',60),marketingAirlineCode:upper(body.marketingAirlineCode,3),marketingFlightNumber:optionalString(body.marketingFlightNumber,'marketingFlightNumber',12),operatingAirlineCode:upper(body.operatingAirlineCode,3),operatingFlightNumber:optionalString(body.operatingFlightNumber,'operatingFlightNumber',12),departureTerminal:optionalString(body.departureTerminal,'departureTerminal',20),departureGate:optionalString(body.departureGate,'departureGate',20),arrivalTerminal:optionalString(body.arrivalTerminal,'arrivalTerminal',20),arrivalGate:optionalString(body.arrivalGate,'arrivalGate',20),boardingTimeUtc:optionalInteger(body.boardingTimeUtc,'boardingTimeUtc'),gateCloseTimeUtc:optionalInteger(body.gateCloseTimeUtc,'gateCloseTimeUtc')};
 const travelerIds=arrayOfIds(body.travelerIds); await ensureTravelers(env,tripId,travelerIds);
 const departureLocation=await manualBookingLocationFingerprint(env,tripId,departureLocationId),arrivalLocation=await manualBookingLocationFingerprint(env,tripId,arrivalLocationId),claim=await claimManualBookingCreate(request,env,auth,tripId,'transport',{...normalized,departureLocationId:undefined,arrivalLocationId:undefined,departureLocation,arrivalLocation,travelerIds:[...travelerIds].sort()});
 const replay=await recoverManualBookingCreate(env,claim,id=>getTransport(env,tripId,id),item=>({eventType:'transport_added',newValue:{item,transportType:item.transport_type}}));if(replay)return json({item:replay,transportType:replay.transport_type},{status:201},request,env);
 const id=claim.resourceId,now=nowMs(); const statements=[
  env.DB.prepare(`INSERT INTO trip_items (id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,'manual','confirmed',?,?,1)`).bind(id,tripId,title,departureLocationId,arrivalLocationId,dep,arr,normalized.departureTimezone,normalized.arrivalTimezone,now,now),
  env.DB.prepare(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,transportType,normalized.carrierName,normalized.serviceNumber,departureLocationId,arrivalLocationId,dep,arr,normalized.departureTimezone,normalized.arrivalTimezone,normalized.bookingReference,normalized.bookingStatus),
 ];
 if(transportType==='flight') statements.push(env.DB.prepare(`INSERT INTO flights (trip_item_id,marketing_airline_code,marketing_flight_number,operating_airline_code,operating_flight_number,departure_terminal,departure_gate,arrival_terminal,arrival_gate,boarding_time_utc,gate_close_time_utc,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'scheduled','none',0)`).bind(id,normalized.marketingAirlineCode,normalized.marketingFlightNumber,normalized.operatingAirlineCode,normalized.operatingFlightNumber,normalized.departureTerminal,normalized.departureGate,normalized.arrivalTerminal,normalized.arrivalGate,normalized.boardingTimeUtc,normalized.gateCloseTimeUtc,dep,arr));
 for(const travelerId of travelerIds) statements.push(env.DB.prepare(`INSERT INTO trip_item_travelers (trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
 await env.DB.batch(statements); const item=await getTransport(env,tripId,id);if(!item)throw new HttpError(500,'BOOKING_CREATE_FAILED','The transport booking was not available after saving.');await completeManualBookingCreate(env,claim,{eventType:'transport_added',newValue:{item,transportType}});
 await recordBookingMilestones(env,auth,tripId);
 return json({item,transportType},{status:201},request,env);
}

export async function updateTransport(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId,true);
 const existing=await getTransport(env,tripId,itemId);
 if(!existing) throw new HttpError(404,'TRANSPORT_NOT_FOUND','Transport item was not found.');
 const body=await readJson<Body>(request);
 if(!Number.isSafeInteger(body.version)) throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
 if(Number(existing.version)!==body.version) throw new HttpError(409,'VERSION_CONFLICT','Transport changed on another client.',{currentVersion:existing.version});
 const transportType=existing.transport_type as typeof transportTypes[number];
 if(body.transportType!==undefined&&body.transportType!==transportType) throw new HttpError(400,'TRANSPORT_TYPE_IMMUTABLE','Change transport type by creating a new booking.');
 const title=body.title===undefined?String(existing.title):requireString(body.title,'title',160);
 const status=body.status===undefined?existing.status as typeof statuses[number]:enumValue(body.status,'status',statuses);
 const dep=body.scheduledDepartureUtc===undefined?nullableNumber(existing.scheduled_departure_utc):optionalInteger(body.scheduledDepartureUtc,'scheduledDepartureUtc');
 const arr=body.scheduledArrivalUtc===undefined?nullableNumber(existing.scheduled_arrival_utc):optionalInteger(body.scheduledArrivalUtc,'scheduledArrivalUtc');
 if(dep!=null&&arr!=null&&arr<dep) throw new HttpError(400,'VALIDATION_ERROR','scheduledArrivalUtc cannot be before scheduledDepartureUtc.');
 if(transportType==='flight'&&dep==null) throw new HttpError(400,'VALIDATION_ERROR','Flights require a scheduled departure time.');
 const departureLocationId=body.departureLocationId===undefined?nullableString(existing.departure_location_id):optionalString(body.departureLocationId,'departureLocationId',80);
 const arrivalLocationId=body.arrivalLocationId===undefined?nullableString(existing.arrival_location_id):optionalString(body.arrivalLocationId,'arrivalLocationId',80);
 await ensureLocations(env,tripId,[departureLocationId,arrivalLocationId]);
 const departureTimezone=body.departureTimezone===undefined?nullableString(existing.departure_timezone):optionalString(body.departureTimezone,'departureTimezone',80);
 const arrivalTimezone=body.arrivalTimezone===undefined?nullableString(existing.arrival_timezone):optionalString(body.arrivalTimezone,'arrivalTimezone',80);
 const carrierName=body.carrierName===undefined?nullableString(existing.carrier_name):optionalString(body.carrierName,'carrierName',120);
 const serviceNumber=body.serviceNumber===undefined?nullableString(existing.service_number):optionalString(body.serviceNumber,'serviceNumber',40);
 const bookingReference=body.bookingReference===undefined?nullableString(existing.booking_reference):optionalString(body.bookingReference,'bookingReference',80);
 const bookingStatus=body.bookingStatus===undefined?nullableString(existing.booking_status):optionalString(body.bookingStatus,'bookingStatus',60);
 const now=nowMs();
 const statements=[
   env.DB.prepare(`UPDATE transport_segments SET carrier_name=?,service_number=?,departure_location_id=?,arrival_location_id=?,scheduled_departure_utc=?,scheduled_arrival_utc=?,departure_timezone=?,arrival_timezone=?,booking_reference=?,booking_status=? WHERE trip_item_id=? AND EXISTS (SELECT 1 FROM trip_items WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL)`).bind(carrierName,serviceNumber,departureLocationId,arrivalLocationId,dep,arr,departureTimezone,arrivalTimezone,bookingReference,bookingStatus,itemId,itemId,tripId,body.version),
 ];
 if(transportType==='flight') statements.push(env.DB.prepare(`UPDATE flights SET marketing_airline_code=?,marketing_flight_number=?,operating_airline_code=?,operating_flight_number=?,departure_terminal=?,departure_gate=?,arrival_terminal=?,arrival_gate=?,boarding_time_utc=?,gate_close_time_utc=?,scheduled_departure_utc=?,scheduled_arrival_utc=? WHERE trip_item_id=? AND EXISTS (SELECT 1 FROM trip_items WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL)`).bind(
   body.marketingAirlineCode===undefined?nullableString(existing.marketing_airline_code):upper(body.marketingAirlineCode,3),
   body.marketingFlightNumber===undefined?nullableString(existing.marketing_flight_number):optionalString(body.marketingFlightNumber,'marketingFlightNumber',12),
   body.operatingAirlineCode===undefined?nullableString(existing.operating_airline_code):upper(body.operatingAirlineCode,3),
   body.operatingFlightNumber===undefined?nullableString(existing.operating_flight_number):optionalString(body.operatingFlightNumber,'operatingFlightNumber',12),
   body.departureTerminal===undefined?nullableString(existing.departure_terminal):optionalString(body.departureTerminal,'departureTerminal',20),
   body.departureGate===undefined?nullableString(existing.departure_gate):optionalString(body.departureGate,'departureGate',20),
   body.arrivalTerminal===undefined?nullableString(existing.arrival_terminal):optionalString(body.arrivalTerminal,'arrivalTerminal',20),
   body.arrivalGate===undefined?nullableString(existing.arrival_gate):optionalString(body.arrivalGate,'arrivalGate',20),
   body.boardingTimeUtc===undefined?nullableNumber(existing.boarding_time_utc):optionalInteger(body.boardingTimeUtc,'boardingTimeUtc'),
   body.gateCloseTimeUtc===undefined?nullableNumber(existing.gate_close_time_utc):optionalInteger(body.gateCloseTimeUtc,'gateCloseTimeUtc'),dep,arr,itemId,itemId,tripId,body.version));
 statements.push(env.DB.prepare(`UPDATE trip_items SET status=?,title=?,start_location_id=?,end_location_id=?,starts_at_utc=?,ends_at_utc=?,start_timezone=?,end_timezone=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(status,title,departureLocationId,arrivalLocationId,dep,arr,departureTimezone,arrivalTimezone,now,itemId,tripId,body.version));
 await env.DB.batch(statements);
 const updated=await getTransport(env,tripId,itemId);
 if(!updated||Number(updated.version)!==Number(body.version)+1) throw new HttpError(409,'VERSION_CONFLICT','Transport changed on another client.');
 await recordChangeEvent(env,tripId,'trip_item',itemId,'transport_updated',existing,updated);
 return json({item:updated},{},request,env);
}

export async function deleteTransport(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId,true);
 const existing=await getTransport(env,tripId,itemId);
 if(!existing) throw new HttpError(404,'TRANSPORT_NOT_FOUND','Transport item was not found.');
 const body=await readJson<{version?:unknown}>(request);
 if(!Number.isSafeInteger(body.version)) throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
 if(Number(existing.version)!==body.version) throw new HttpError(409,'VERSION_CONFLICT','Transport changed on another client.',{currentVersion:existing.version});
 const now=nowMs();
 await env.DB.prepare(`UPDATE trip_items SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(now,now,itemId,tripId,body.version).run();
 const row=await env.DB.prepare(`SELECT version,deleted_at FROM trip_items WHERE id=? AND trip_id=?`).bind(itemId,tripId).first<{version:number;deleted_at:number|null}>();
 if(!row?.deleted_at) throw new HttpError(409,'VERSION_CONFLICT','Transport changed on another client.');
 await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip_item',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(itemId,row.version,row.deleted_at).run();
 await recordChangeEvent(env,tripId,'trip_item',itemId,'transport_removed',existing,{deletedAt:row.deleted_at});
 return new Response(null,{status:204});
}

async function getTransport(env:Env,tripId:string,itemId:string):Promise<Record<string,unknown>|null>{
 return env.DB.prepare(`SELECT ti.id,ti.trip_id,ti.status,ti.title,ti.starts_at_utc,ti.ends_at_utc,ti.start_timezone,ti.end_timezone,ti.version,ti.deleted_at,ts.transport_type,ts.carrier_name,ts.service_number,ts.departure_location_id,ts.arrival_location_id,ts.scheduled_departure_utc,ts.scheduled_arrival_utc,ts.departure_timezone,ts.arrival_timezone,ts.booking_reference,ts.booking_status,f.marketing_airline_code,f.marketing_flight_number,f.operating_airline_code,f.operating_flight_number,f.departure_terminal,f.departure_gate,f.arrival_terminal,f.arrival_gate,f.boarding_time_utc,f.gate_close_time_utc FROM trip_items ti JOIN transport_segments ts ON ts.trip_item_id=ti.id LEFT JOIN flights f ON f.trip_item_id=ti.id WHERE ti.trip_id=? AND ti.id=? AND ti.deleted_at IS NULL`).bind(tripId,itemId).first<Record<string,unknown>>();
}
async function ensureLocations(env:Env,tripId:string,ids:(string|null)[]){ for(const id of ids){ if(!id)continue; const row=await env.DB.prepare(`SELECT 1 AS ok FROM trip_locations WHERE trip_id=? AND location_id=?`).bind(tripId,id).first(); if(!row)throw new HttpError(400,'LOCATION_NOT_IN_TRIP','Location does not belong to this trip.'); }}
async function ensureTravelers(env:Env,tripId:string,ids:string[]){ for(const id of ids){const row=await env.DB.prepare(`SELECT 1 AS ok FROM travelers WHERE trip_id=? AND id=? AND deleted_at IS NULL`).bind(tripId,id).first(); if(!row)throw new HttpError(400,'TRAVELER_NOT_IN_TRIP','Traveler does not belong to this trip.');}}
function arrayOfIds(value:unknown):string[]{if(value==null)return[]; if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||!v)) throw new HttpError(400,'VALIDATION_ERROR','travelerIds must be an array of IDs.'); return [...new Set(value as string[])];}
function upper(value:unknown,max:number):string|null{const out=optionalString(value,'airlineCode',max);return out?.toUpperCase()??null;}
function nullableString(value:unknown):string|null{return value==null?null:String(value);}
function nullableNumber(value:unknown):number|null{return value==null?null:Number(value);}
