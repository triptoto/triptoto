import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, nowMs, optionalInteger, optionalString, readJson } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';

interface Body{tripItemId?:unknown;travelerId?:unknown;seat?:unknown;cabinClass?:unknown;fareClass?:unknown;ticketNumber?:unknown;checkedBags?:unknown;cabinBags?:unknown;personalItems?:unknown;mealPreference?:unknown;specialAssistance?:unknown;version?:unknown;}

export async function listBookingDetails(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const result=await env.DB.prepare(`SELECT tbd.*,tr.display_name,ti.title AS item_title,ti.type AS item_type FROM traveler_booking_details tbd JOIN travelers tr ON tr.id=tbd.traveler_id JOIN trip_items ti ON ti.id=tbd.trip_item_id WHERE tr.trip_id=? AND tr.deleted_at IS NULL AND ti.deleted_at IS NULL ORDER BY ti.starts_at_utc,tr.created_at`).bind(tripId).all();
  return json({bookingDetails:result.results??[]},{},request,env);
}

export async function upsertBookingDetail(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<Body>(request);
  const tripItemId=id(body.tripItemId,'tripItemId');
  const travelerId=id(body.travelerId,'travelerId');
  await ensurePair(env,tripId,tripItemId,travelerId);
  const existing=await env.DB.prepare(`SELECT * FROM traveler_booking_details WHERE trip_item_id=? AND traveler_id=?`).bind(tripItemId,travelerId).first<Record<string,unknown>>();
  if(existing){if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required for an existing booking detail.');if(existing.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','Traveler booking details changed on another client.',{currentVersion:existing.version});}
  const now=nowMs();
  const values={seat:optionalString(body.seat,'seat',20),cabinClass:optionalString(body.cabinClass,'cabinClass',40),fareClass:optionalString(body.fareClass,'fareClass',20),ticketNumber:optionalString(body.ticketNumber,'ticketNumber',80),checkedBags:bag(body.checkedBags,'checkedBags'),cabinBags:bag(body.cabinBags,'cabinBags'),personalItems:bag(body.personalItems,'personalItems'),mealPreference:optionalString(body.mealPreference,'mealPreference',100),specialAssistance:optionalString(body.specialAssistance,'specialAssistance',500)};
  if(existing){
    await env.DB.prepare(`UPDATE traveler_booking_details SET seat=?,cabin_class=?,fare_class=?,ticket_number=?,checked_bags=?,cabin_bags=?,personal_items=?,meal_preference=?,special_assistance=?,updated_at=?,version=version+1 WHERE trip_item_id=? AND traveler_id=?`).bind(values.seat,values.cabinClass,values.fareClass,values.ticketNumber,values.checkedBags,values.cabinBags,values.personalItems,values.mealPreference,values.specialAssistance,now,tripItemId,travelerId).run();
  }else{
    await env.DB.prepare(`INSERT INTO traveler_booking_details(trip_item_id,traveler_id,seat,cabin_class,fare_class,ticket_number,checked_bags,cabin_bags,personal_items,meal_preference,special_assistance,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(tripItemId,travelerId,values.seat,values.cabinClass,values.fareClass,values.ticketNumber,values.checkedBags,values.cabinBags,values.personalItems,values.mealPreference,values.specialAssistance,now,now).run();
  }
  const detail=await env.DB.prepare(`SELECT * FROM traveler_booking_details WHERE trip_item_id=? AND traveler_id=?`).bind(tripItemId,travelerId).first();
  await recordChangeEvent(env,tripId,'traveler_booking_detail',`${tripItemId}:${travelerId}`,existing?'booking_detail_updated':'booking_detail_created',existing,detail);
  return json({bookingDetail:detail},{status:existing?200:201},request,env);
}

export async function deleteBookingDetail(request:Request,env:Env,auth:AuthContext,tripId:string,tripItemId:string,travelerId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  await ensurePair(env,tripId,tripItemId,travelerId);
  const existing=await env.DB.prepare(`SELECT * FROM traveler_booking_details WHERE trip_item_id=? AND traveler_id=?`).bind(tripItemId,travelerId).first();
  if(!existing)throw new HttpError(404,'BOOKING_DETAIL_NOT_FOUND','Traveler booking details were not found.');
  await env.DB.prepare(`DELETE FROM traveler_booking_details WHERE trip_item_id=? AND traveler_id=?`).bind(tripItemId,travelerId).run();
  await recordChangeEvent(env,tripId,'traveler_booking_detail',`${tripItemId}:${travelerId}`,'booking_detail_deleted',existing,null);
  return new Response(null,{status:204});
}

function id(value:unknown,name:string):string{if(typeof value!=='string'||!value.trim()||value.length>80)throw new HttpError(400,'VALIDATION_ERROR',`${name} is required.`);return value.trim();}
function bag(value:unknown,name:string):number|null{const out=optionalInteger(value,name);if(out!=null&&(out<0||out>20))throw new HttpError(400,'VALIDATION_ERROR',`${name} must be between 0 and 20.`);return out;}
async function ensurePair(env:Env,tripId:string,tripItemId:string,travelerId:string){const item=await env.DB.prepare(`SELECT 1 AS ok FROM trip_items WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(tripItemId,tripId).first();if(!item)throw new HttpError(400,'ITEM_NOT_IN_TRIP','Booking item does not belong to this trip.');const traveler=await env.DB.prepare(`SELECT 1 AS ok FROM travelers WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(travelerId,tripId).first();if(!traveler)throw new HttpError(400,'TRAVELER_NOT_IN_TRIP','Traveler does not belong to this trip.');}
