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
    await env.DB.prepare(`DELETE FROM trips WHERE owner_user_id=?`).bind(auth.userId).run();
    await env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='user' AND scope_id=?`).bind(`user:${auth.userId}`).run();
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
  await env.DB.prepare(`DELETE FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL`).bind(auth.deviceId).run();
  await env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='user' AND scope_id=?`).bind(`device:${auth.deviceId}`).run();
  await env.DB.prepare(`DELETE FROM devices WHERE id=?`).bind(auth.deviceId).run();
  await cleanupOrphanLocations(env);
  return json({deleted:true,mode:'guest',deletedTrips:trips.length,deletedDevices:1,localCleanupRequired:true},{},request,env);
}

async function cleanupOrphanLocations(env:Env):Promise<void>{
  await env.DB.prepare(`DELETE FROM locations WHERE id NOT IN (SELECT location_id FROM trip_locations)`).run();
}
