import type { AuthContext, Env } from '../types.ts';
import { HttpError, applyCors, json, requestId } from '../http.ts';
import { requireTripAccess } from '../access.ts';

export async function exportTripJson(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const trip=await env.DB.prepare(`SELECT * FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<Record<string,unknown>>();
  if(!trip)throw new HttpError(404,'TRIP_NOT_FOUND','Trip was not found.');

  const [travelers,locations,items,transport,flights,stays,activities,reservations,connections,checklist,travelerChecklist,documents,itemTravelers]=await Promise.all([
    env.DB.prepare(`SELECT * FROM travelers WHERE trip_id=? AND deleted_at IS NULL ORDER BY created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT l.* FROM locations l JOIN trip_locations tl ON tl.location_id=l.id WHERE tl.trip_id=? ORDER BY l.display_name`).bind(tripId).all(),
    env.DB.prepare(`SELECT * FROM trip_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY CASE WHEN starts_at_utc IS NULL THEN 1 ELSE 0 END,starts_at_utc,created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT ts.* FROM transport_segments ts JOIN trip_items ti ON ti.id=ts.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT f.* FROM flights f JOIN trip_items ti ON ti.id=f.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT s.* FROM stays s JOIN trip_items ti ON ti.id=s.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT a.* FROM activities a JOIN trip_items ti ON ti.id=a.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT r.* FROM reservations r JOIN trip_items ti ON ti.id=r.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT * FROM connections WHERE trip_id=? ORDER BY created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT * FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT tci.* FROM traveler_checklist_items tci JOIN trip_checklist_items i ON i.id=tci.trip_checklist_item_id WHERE i.trip_id=? AND i.deleted_at IS NULL`).bind(tripId).all(),
    env.DB.prepare(`SELECT id,trip_id,original_filename,mime_type,file_size,checksum,document_type,server_status,created_at,updated_at,version FROM documents WHERE trip_id=? AND deleted_at IS NULL ORDER BY created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT tit.* FROM trip_item_travelers tit JOIN trip_items ti ON ti.id=tit.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL`).bind(tripId).all(),
  ]);

  const payload={
    exportSchemaVersion:2,
    exportedAt:Date.now(),
    product:'tripto.to',
    trip,
    travelers:travelers.results??[],
    locations:locations.results??[],
    timeline:items.results??[],
    transport:transport.results??[],
    flights:flights.results??[],
    stays:stays.results??[],
    activities:activities.results??[],
    reservations:reservations.results??[],
    connections:connections.results??[],
    checklist:checklist.results??[],
    travelerChecklist:travelerChecklist.results??[],
    documents:documents.results??[],
    itemTravelers:itemTravelers.results??[],
    notes:{documents:'Document metadata only. File bytes are not included in this JSON export.'},
  };
  const safeTitle=safeFileTitle(trip.title);
  return json(payload,{headers:{'content-disposition':`attachment; filename="${safeTitle}-tripto-export.json"`}},request,env);
}

export async function exportTripCalendar(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const trip=await env.DB.prepare(`SELECT id,title,lifecycle_state,starts_on,ends_on FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<Record<string,unknown>>();
  if(!trip)throw new HttpError(404,'TRIP_NOT_FOUND','Trip was not found.');

  const timed=(await env.DB.prepare(`SELECT ti.id,ti.title,ti.subtitle,ti.starts_at_utc,ti.ends_at_utc,ti.status,sl.display_name start_location,el.display_name end_location
    FROM trip_items ti
    LEFT JOIN locations sl ON sl.id=ti.start_location_id
    LEFT JOIN locations el ON el.id=ti.end_location_id
    WHERE ti.trip_id=? AND ti.deleted_at IS NULL AND ti.status NOT IN ('cancelled','skipped') AND ti.starts_at_utc IS NOT NULL
    ORDER BY ti.starts_at_utc`).bind(tripId).all<Record<string,unknown>>()).results??[];
  const stays=(await env.DB.prepare(`SELECT ti.id,ti.title,s.property_name,s.check_in_date,s.check_out_date,l.display_name location_name
    FROM stays s JOIN trip_items ti ON ti.id=s.trip_item_id LEFT JOIN locations l ON l.id=s.property_location_id
    WHERE ti.trip_id=? AND ti.deleted_at IS NULL AND ti.status NOT IN ('cancelled','skipped') AND s.check_in_date IS NOT NULL
    ORDER BY s.check_in_date`).bind(tripId).all<Record<string,unknown>>()).results??[];

  const now=icsUtc(Date.now());
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//tripto.to//Travel Companion//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${icsText(String(trip.title??'tripto.to Trip'))}`];
  for(const row of timed){
    lines.push('BEGIN:VEVENT',`UID:${icsText(String(row.id))}@tripto.to`,`DTSTAMP:${now}`,`DTSTART:${icsUtc(Number(row.starts_at_utc))}`);
    if(row.ends_at_utc!=null&&Number(row.ends_at_utc)>=Number(row.starts_at_utc))lines.push(`DTEND:${icsUtc(Number(row.ends_at_utc))}`);
    lines.push(`SUMMARY:${icsText(String(row.title??'Travel plan'))}`);
    const loc=[row.start_location,row.end_location].filter(Boolean).map(String).join(' → ');if(loc)lines.push(`LOCATION:${icsText(loc)}`);
    if(row.subtitle)lines.push(`DESCRIPTION:${icsText(String(row.subtitle))}`);
    lines.push('END:VEVENT');
  }
  for(const row of stays){
    lines.push('BEGIN:VEVENT',`UID:${icsText(String(row.id))}-stay@tripto.to`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${icsDate(String(row.check_in_date))}`);
    if(row.check_out_date)lines.push(`DTEND;VALUE=DATE:${icsDate(String(row.check_out_date))}`);
    lines.push(`SUMMARY:${icsText(`Stay · ${String(row.property_name??row.title??'Accommodation')}`)}`);
    if(row.location_name)lines.push(`LOCATION:${icsText(String(row.location_name))}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  const headers=new Headers({
    'content-type':'text/calendar; charset=utf-8',
    'cache-control':'no-store',
    'content-disposition':`attachment; filename="${safeFileTitle(trip.title)}-tripto-calendar.ics"`,
    'x-request-id':requestId(request),
  });
  applyCors(headers,request,env);
  return new Response(lines.join('\r\n')+'\r\n',{status:200,headers});
}

function safeFileTitle(value:unknown):string{return String(value??'trip').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'trip';}
function icsUtc(ms:number):string{const d=new Date(ms);if(Number.isNaN(d.getTime()))return '';return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
function icsDate(value:string):string{return value.replace(/-/g,'');}
function icsText(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
