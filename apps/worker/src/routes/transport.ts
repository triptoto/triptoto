import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';

const transportTypes=['flight','train','bus','ferry','car','transfer','other'] as const;
interface Body { transportType?:unknown; title?:unknown; status?:unknown; carrierName?:unknown; serviceNumber?:unknown; departureLocationId?:unknown; arrivalLocationId?:unknown; scheduledDepartureUtc?:unknown; scheduledArrivalUtc?:unknown; departureTimezone?:unknown; arrivalTimezone?:unknown; bookingReference?:unknown; bookingStatus?:unknown; marketingAirlineCode?:unknown; marketingFlightNumber?:unknown; operatingAirlineCode?:unknown; operatingFlightNumber?:unknown; departureTerminal?:unknown; arrivalTerminal?:unknown; boardingTimeUtc?:unknown; gateCloseTimeUtc?:unknown; travelerIds?:unknown; }

export async function listTransport(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId);
 const result=await env.DB.prepare(`SELECT ti.*,ts.*,f.marketing_airline_code,f.marketing_flight_number,f.operating_airline_code,f.operating_flight_number,f.departure_terminal,f.arrival_terminal,f.boarding_time_utc,f.gate_close_time_utc,f.operational_phase,f.disruption_state FROM trip_items ti JOIN transport_segments ts ON ts.trip_item_id=ti.id LEFT JOIN flights f ON f.trip_item_id=ti.id WHERE ti.trip_id=? AND ti.deleted_at IS NULL ORDER BY ti.starts_at_utc`).bind(tripId).all();
 return json({transport:result.results??[]},{},request,env);
}

export async function createTransport(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
 await requireTripAccess(env,auth,tripId,true); const body=await readJson<Body>(request);
 const transportType=enumValue(body.transportType,'transportType',transportTypes); const title=requireString(body.title,'title',160);
 const dep=optionalInteger(body.scheduledDepartureUtc,'scheduledDepartureUtc'); const arr=optionalInteger(body.scheduledArrivalUtc,'scheduledArrivalUtc');
 if(dep!=null&&arr!=null&&arr<dep) throw new HttpError(400,'VALIDATION_ERROR','scheduledArrivalUtc cannot be before scheduledDepartureUtc.');
 if(transportType==='flight'&&(dep==null||arr==null)) throw new HttpError(400,'VALIDATION_ERROR','Flights require scheduled departure and arrival times.');
 const departureLocationId=optionalString(body.departureLocationId,'departureLocationId',80); const arrivalLocationId=optionalString(body.arrivalLocationId,'arrivalLocationId',80);
 await ensureLocations(env,tripId,[departureLocationId,arrivalLocationId]);
 const id=uuid(),now=nowMs(); const statements=[
  env.DB.prepare(`INSERT INTO trip_items (id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,'manual','confirmed',?,?,1)`).bind(id,tripId,title,departureLocationId,arrivalLocationId,dep,arr,optionalString(body.departureTimezone,'departureTimezone',80),optionalString(body.arrivalTimezone,'arrivalTimezone',80),now,now),
  env.DB.prepare(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,transportType,optionalString(body.carrierName,'carrierName',120),optionalString(body.serviceNumber,'serviceNumber',40),departureLocationId,arrivalLocationId,dep,arr,optionalString(body.departureTimezone,'departureTimezone',80),optionalString(body.arrivalTimezone,'arrivalTimezone',80),optionalString(body.bookingReference,'bookingReference',80),optionalString(body.bookingStatus,'bookingStatus',60)),
 ];
 if(transportType==='flight') statements.push(env.DB.prepare(`INSERT INTO flights (trip_item_id,marketing_airline_code,marketing_flight_number,operating_airline_code,operating_flight_number,departure_terminal,arrival_terminal,boarding_time_utc,gate_close_time_utc,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,'scheduled','none',0)`).bind(id,upper(body.marketingAirlineCode,3),optionalString(body.marketingFlightNumber,'marketingFlightNumber',12),upper(body.operatingAirlineCode,3),optionalString(body.operatingFlightNumber,'operatingFlightNumber',12),optionalString(body.departureTerminal,'departureTerminal',20),optionalString(body.arrivalTerminal,'arrivalTerminal',20),optionalInteger(body.boardingTimeUtc,'boardingTimeUtc'),optionalInteger(body.gateCloseTimeUtc,'gateCloseTimeUtc'),dep,arr));
 const travelerIds=arrayOfIds(body.travelerIds); await ensureTravelers(env,tripId,travelerIds); for(const travelerId of travelerIds) statements.push(env.DB.prepare(`INSERT INTO trip_item_travelers (trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
 await env.DB.batch(statements); const item=await env.DB.prepare(`SELECT * FROM trip_items WHERE id=?`).bind(id).first(); await recordChangeEvent(env,tripId,'trip_item',id,'transport_added',null,{item,transportType});
 return json({item,transportType},{status:201},request,env);
}

async function ensureLocations(env:Env,tripId:string,ids:(string|null)[]){ for(const id of ids){ if(!id)continue; const row=await env.DB.prepare(`SELECT 1 AS ok FROM trip_locations WHERE trip_id=? AND location_id=?`).bind(tripId,id).first(); if(!row)throw new HttpError(400,'LOCATION_NOT_IN_TRIP','Location does not belong to this trip.'); }}
async function ensureTravelers(env:Env,tripId:string,ids:string[]){ for(const id of ids){const row=await env.DB.prepare(`SELECT 1 AS ok FROM travelers WHERE trip_id=? AND id=? AND deleted_at IS NULL`).bind(tripId,id).first(); if(!row)throw new HttpError(400,'TRAVELER_NOT_IN_TRIP','Traveler does not belong to this trip.');}}
function arrayOfIds(value:unknown):string[]{if(value==null)return[]; if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||!v)) throw new HttpError(400,'VALIDATION_ERROR','travelerIds must be an array of IDs.'); return [...new Set(value as string[])];}
function upper(value:unknown,max:number):string|null{const out=optionalString(value,'airlineCode',max);return out?.toUpperCase()??null;}
