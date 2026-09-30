import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, nowMs, readJson, uuid } from '../http.ts';

export async function deletionPreview(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  if(auth.userId){
    const counts=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM trips WHERE owner_user_id=? AND deleted_at IS NULL) owned_trips,
      (SELECT COUNT(*) FROM trip_members WHERE user_id=? AND status='active' AND role!='owner') shared_memberships,
      (SELECT COUNT(*) FROM devices WHERE user_id=? AND revoked_at IS NULL) devices,
      (SELECT COUNT(*) FROM trip_invites WHERE created_by_user_id=? AND status='invited') pending_invites
    `).bind(auth.userId,auth.userId,auth.userId,auth.userId).first<Record<string,unknown>>();
    return json({deletion:{mode:'account',requiresConfirmation:'DELETE',ownedTrips:Number(counts?.owned_trips??0),sharedMemberships:Number(counts?.shared_memberships??0),devices:Number(counts?.devices??0),pendingInvites:Number(counts?.pending_invites??0),effect:'Owned trips are permanently deleted. Memberships, verified identities and sessions are removed. Shared trips owned by someone else remain for their owners.'}}, {}, request, env);
  }
  const counts=await env.DB.prepare(`SELECT COUNT(*) trips FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(auth.deviceId).first<{trips:number}>();
  return json({deletion:{mode:'guest',requiresConfirmation:'DELETE',ownedTrips:Number(counts?.trips??0),devices:1,effect:'Guest trips attached to this device and the server-side guest device record are permanently deleted.'}}, {}, request, env);
}

// D1 does NOT enforce foreign-key cascades at runtime (the PRAGMA in migrations
// applies only during migration), so every child row of the trips being deleted
// must be removed explicitly — otherwise "delete my data" leaves travelers,
// stays, documents, booking details, etc. orphaned in the database. `scope` is a
// single-`?` subquery selecting the trip ids to erase; the same bind arg is used
// for every statement. Statements that read via a subquery (trip_items / documents
// / imports / trip_checklist_items) are ordered before those parents are deleted.
function tripChildDeleteSql(scope:string):string[]{
  const items=`SELECT id FROM trip_items WHERE trip_id IN (${scope})`;
  const docs=`SELECT id FROM documents WHERE trip_id IN (${scope})`;
  const imports=`SELECT id FROM imports WHERE trip_id IN (${scope})`;
  const checks=`SELECT id FROM trip_checklist_items WHERE trip_id IN (${scope})`;
  return [
    // trip_items children (removed before trip_items itself)
    `DELETE FROM trip_item_travelers WHERE trip_item_id IN (${items})`,
    `DELETE FROM transport_segments WHERE trip_item_id IN (${items})`,
    `DELETE FROM flight_live_status WHERE trip_item_id IN (${items})`,
    `DELETE FROM flights WHERE trip_item_id IN (${items})`,
    `DELETE FROM stays WHERE trip_item_id IN (${items})`,
    `DELETE FROM activities WHERE trip_item_id IN (${items})`,
    `DELETE FROM reservations WHERE trip_item_id IN (${items})`,
    `DELETE FROM journey_group_items WHERE trip_item_id IN (${items})`,
    `DELETE FROM traveler_booking_details WHERE trip_item_id IN (${items})`,
    `DELETE FROM planning_stops WHERE collection_item_id IN (${items})`,
    `DELETE FROM planning_collections WHERE trip_item_id IN (${items})`,
    `DELETE FROM document_trip_items WHERE trip_item_id IN (${items})`,
    // documents / imports / checklist children (removed before their parents)
    `DELETE FROM document_travelers WHERE document_id IN (${docs})`,
    `DELETE FROM import_candidates WHERE import_id IN (${imports})`,
    `DELETE FROM import_messages WHERE import_id IN (${imports})`,
    `DELETE FROM traveler_checklist_items WHERE trip_checklist_item_id IN (${checks})`,
    // direct trip_id children
    `DELETE FROM connections WHERE trip_id IN (${scope})`,
    `DELETE FROM alerts WHERE trip_id IN (${scope})`,
    `DELETE FROM impact_assessments WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_contacts WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_time_markers WHERE trip_id IN (${scope})`,
    `DELETE FROM journey_groups WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_checklist_items WHERE trip_id IN (${scope})`,
    `DELETE FROM travelers WHERE trip_id IN (${scope})`,
    `DELETE FROM documents WHERE trip_id IN (${scope})`,
    `DELETE FROM change_events WHERE trip_id IN (${scope})`,
    `DELETE FROM imports WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_locations WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_invites WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_sync_cursors WHERE trip_id IN (${scope})`,
    `DELETE FROM sync_idempotency WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_health_runs WHERE trip_id IN (${scope})`,
    `DELETE FROM manual_booking_idempotency WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_create_idempotency WHERE trip_id IN (${scope})`,
    `DELETE FROM beta_events WHERE trip_id IN (${scope})`,
    `DELETE FROM inbound_booking_emails WHERE trip_id IN (${scope})`,
    `DELETE FROM trip_members WHERE trip_id IN (${scope})`,
    // trip_items last, once all of its children above are gone
    `DELETE FROM trip_items WHERE trip_id IN (${scope})`,
  ];
}

export async function deleteMyData(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  const body=await readJson<{confirm?:unknown}>(request);
  if(body.confirm!=='DELETE')throw new HttpError(400,'DELETE_CONFIRMATION_REQUIRED','Type DELETE exactly to confirm data deletion.');
  const now=nowMs(); const deletionId=uuid();
  if(auth.userId){
    const trips=(await env.DB.prepare(`SELECT id,version FROM trips WHERE owner_user_id=? AND deleted_at IS NULL`).bind(auth.userId).all<{id:string;version:number}>()).results??[];
    const devices=(await env.DB.prepare(`SELECT id FROM devices WHERE user_id=?`).bind(auth.userId).all<{id:string}>()).results??[];
    for(const trip of trips){
      await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(trip.id,trip.version+1,now).run();
    }
    await env.DB.prepare(`INSERT INTO privacy_deletions(id,mode,deleted_trips,deleted_devices,created_at) VALUES (?,'account',?,?,?)`).bind(deletionId,trips.length,devices.length,now).run();
    // Erase every child row of the owned trips (subqueries read trips, which still
    // exist at this point), then the trips, then the user's cross-trip artefacts.
    const scope=`SELECT id FROM trips WHERE owner_user_id=?`;
    await env.DB.batch(tripChildDeleteSql(scope).map(sql=>env.DB.prepare(sql).bind(auth.userId)));
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM trips WHERE owner_user_id=?`).bind(auth.userId),
      // The user's own memberships/invites/verified identities on ANY trip.
      env.DB.prepare(`DELETE FROM trip_members WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM trip_invites WHERE created_by_user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM verified_sender_emails WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM inbound_booking_emails WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM identity_events WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM beta_events WHERE user_id=?`).bind(auth.userId),
      // OIDC identity links + entitlements the deletion preview promises to remove.
      env.DB.prepare(`DELETE FROM auth_identities WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM tripto_plus_lifetime_grants WHERE user_id=?`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM tripto_plus_subscriptions WHERE (subject_type='user' AND subject_id=?) OR (subject_type='device' AND subject_id IN (SELECT id FROM devices WHERE user_id=?))`).bind(auth.userId,auth.userId),
      env.DB.prepare(`DELETE FROM auth_challenges WHERE device_id IN (SELECT id FROM devices WHERE user_id=?)`).bind(auth.userId),
      // sync_conflicts hangs off sync_operations by operation_id, so purge it first.
      env.DB.prepare(`DELETE FROM sync_conflicts WHERE operation_id IN (SELECT id FROM sync_operations WHERE user_id=?)`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM sync_operations WHERE user_id=?`).bind(auth.userId),
      // Device-scoped create-replay idempotency has no trip_id, so purge it by the
      // user's devices before those device rows are deleted below.
      env.DB.prepare(`DELETE FROM create_idempotency WHERE device_id IN (SELECT id FROM devices WHERE user_id=?)`).bind(auth.userId),
      env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='user' AND scope_id=?`).bind(`user:${auth.userId}`),
    ]);
    for(const device of devices)await env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='user' AND scope_id=?`).bind(`device:${device.id}`).run();
    await env.DB.prepare(`DELETE FROM devices WHERE user_id=?`).bind(auth.userId).run();
    await env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(auth.userId).run();
    await cleanupOrphanLocations(env);
    return json({deleted:true,mode:'account',deletedTrips:trips.length,deletedDevices:devices.length,localCleanupRequired:true},{},request,env);
  }
  const trips=(await env.DB.prepare(`SELECT id,version FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(auth.deviceId).all<{id:string;version:number}>()).results??[];
  for(const trip of trips){
    await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(trip.id,trip.version+1,now).run();
  }
  await env.DB.prepare(`INSERT INTO privacy_deletions(id,mode,deleted_trips,deleted_devices,created_at) VALUES (?,'guest',?,1,?)`).bind(deletionId,trips.length,now).run();
  const scope=`SELECT id FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL`;
  await env.DB.batch(tripChildDeleteSql(scope).map(sql=>env.DB.prepare(sql).bind(auth.deviceId)));
  await env.DB.prepare(`DELETE FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL`).bind(auth.deviceId).run();
  // Device-scoped guest artefacts (no user row exists to cascade from).
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sync_conflicts WHERE operation_id IN (SELECT id FROM sync_operations WHERE device_id=?)`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM sync_operations WHERE device_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM identity_events WHERE device_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM auth_challenges WHERE device_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM tripto_plus_subscriptions WHERE subject_type='device' AND subject_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM beta_events WHERE device_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM create_idempotency WHERE device_id=?`).bind(auth.deviceId),
    env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='user' AND scope_id=?`).bind(`device:${auth.deviceId}`),
  ]);
  await env.DB.prepare(`DELETE FROM devices WHERE id=?`).bind(auth.deviceId).run();
  await cleanupOrphanLocations(env);
  return json({deleted:true,mode:'guest',deletedTrips:trips.length,deletedDevices:1,localCleanupRequired:true},{},request,env);
}

// Remove locations no longer referenced by ANY surviving row. This runs AFTER all
// of the deleted trips' child rows are gone (see tripChildDeleteSql), so every
// remaining reference belongs to another user's trip. locations.id is referenced
// from ten columns across eight tables — guarding only trip_locations would wrongly
// reclaim a location still used by a surviving trip's stay/activity/segment/plan.
async function cleanupOrphanLocations(env:Env):Promise<void>{
  await env.DB.prepare(`DELETE FROM locations WHERE id NOT IN (
    SELECT location_id FROM trip_locations WHERE location_id IS NOT NULL
    UNION SELECT primary_destination_location_id FROM trips WHERE primary_destination_location_id IS NOT NULL
    UNION SELECT start_location_id FROM trip_items WHERE start_location_id IS NOT NULL
    UNION SELECT end_location_id FROM trip_items WHERE end_location_id IS NOT NULL
    UNION SELECT departure_location_id FROM transport_segments WHERE departure_location_id IS NOT NULL
    UNION SELECT arrival_location_id FROM transport_segments WHERE arrival_location_id IS NOT NULL
    UNION SELECT property_location_id FROM stays WHERE property_location_id IS NOT NULL
    UNION SELECT venue_location_id FROM activities WHERE venue_location_id IS NOT NULL
    UNION SELECT central_location_id FROM planning_collections WHERE central_location_id IS NOT NULL
    UNION SELECT location_id FROM planning_stops WHERE location_id IS NOT NULL
  )`).run();
}
