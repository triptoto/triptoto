import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';

const locationTypes=['airport','station','hotel','restaurant','attraction','port','address','city','other'] as const;
interface LocationBody { placeId?:unknown; type?:unknown; displayName?:unknown; localName?:unknown; formattedAddress?:unknown; localAddress?:unknown; latitude?:unknown; longitude?:unknown; countryName?:unknown; countryCode?:unknown; region?:unknown; regionCode?:unknown; city?:unknown; timezone?:unknown; iataCode?:unknown; icaoCode?:unknown; stationCode?:unknown; }

export async function listLocations(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const result=await env.DB.prepare(`SELECT l.* FROM locations l JOIN trip_locations tl ON tl.location_id=l.id WHERE tl.trip_id=? ORDER BY l.display_name`).bind(tripId).all();
  return json({locations:result.results??[]},{},request,env);
}

export async function createLocation(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<LocationBody>(request); const values=normalize(body);
  const id=uuid(),now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO locations (id,place_id,type,display_name,local_name,formatted_address,local_address,latitude,longitude,country_name,country_code,region,region_code,city,timezone,iata_code,icao_code,station_code,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(id,values.placeId,values.type,values.displayName,values.localName,values.formattedAddress,values.localAddress,values.latitude,values.longitude,values.countryName,values.countryCode,values.region,values.regionCode,values.city,values.timezone,values.iataCode,values.icaoCode,values.stationCode,now,now),
    env.DB.prepare(`INSERT INTO trip_locations (trip_id,location_id,created_at) VALUES (?,?,?)`).bind(tripId,id,now),
  ]);
  const location=await env.DB.prepare(`SELECT * FROM locations WHERE id=?`).bind(id).first();
  await recordChangeEvent(env,tripId,'location',id,'location_added',null,location);
  return json({location},{status:201},request,env);
}

function normalize(body:LocationBody){
  const placeId=optionalString(body.placeId,'placeId',120);
  const type=enumValue(body.type,'type',locationTypes,'other');
  const displayName=requireString(body.displayName,'displayName',160);
  const localName=optionalString(body.localName,'localName',160);
  const formattedAddress=optionalString(body.formattedAddress,'formattedAddress',500);
  const localAddress=optionalString(body.localAddress,'localAddress',500);
  const latitude=coordinate(body.latitude,'latitude',-90,90); const longitude=coordinate(body.longitude,'longitude',-180,180);
  const countryName=optionalString(body.countryName,'countryName',120); const countryCode=upper(body.countryCode,'countryCode',2); const region=optionalString(body.region,'region',160); const regionCode=upper(body.regionCode,'regionCode',20);
  const city=optionalString(body.city,'city',120); const timezone=optionalString(body.timezone,'timezone',80);
  const iataCode=upper(body.iataCode,'iataCode',3); const icaoCode=upper(body.icaoCode,'icaoCode',4); const stationCode=upper(body.stationCode,'stationCode',12);
  return {placeId,type,displayName,localName,formattedAddress,localAddress,latitude,longitude,countryName,countryCode,region,regionCode,city,timezone,iataCode,icaoCode,stationCode};
}
function coordinate(value:unknown,name:string,min:number,max:number):number|null{ if(value==null)return null; if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) throw new HttpError(400,'VALIDATION_ERROR',`${name} is invalid.`); return value; }
function upper(value:unknown,name:string,max:number):string|null{ const out=optionalString(value,name,max); return out?.toUpperCase()??null; }
