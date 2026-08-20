import type { AuthContext, Env } from '../types.ts';
import { HttpError, json } from '../http.ts';
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
    exportSchemaVersion:1,
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
  const safeTitle=String(trip.title??'trip').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'trip';
  return json(payload,{headers:{'content-disposition':`attachment; filename="${safeTitle}-tripto-export.json"`}},request,env);
}
