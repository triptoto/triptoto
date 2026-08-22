import type { AuthContext, Env } from '../types.ts';
import { json } from '../http.ts';

export async function accountStatus(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const device = await env.DB.prepare(`SELECT id,platform,app_version,api_version,created_at,last_seen_at,user_id FROM devices WHERE id=?`)
    .bind(auth.deviceId).first<Record<string,unknown>>();

  if (!auth.userId) {
    const preview = await guestMigrationPreview(env, auth.deviceId);
    return json({
      account: {
        mode: 'guest',
        accountAuthEnabled: googleEnabled(env),
        migrationReady: true,
        migrationPreview: preview,
        device: device ? { id: device.id, platform: device.platform, createdAt: device.created_at } : null,
        providers: [
          { provider: 'apple', enabled: false },
          { provider: 'google', enabled: googleEnabled(env), clientId: googleEnabled(env) ? env.GOOGLE_CLIENT_ID : undefined },
          { provider: 'email', enabled: false },
        ],
      },
    }, {}, request, env);
  }

  const user = await env.DB.prepare(`SELECT id,display_name,primary_email,locale,timezone,avatar_url,created_at,updated_at FROM users WHERE id=? AND deleted_at IS NULL`)
    .bind(auth.userId).first<Record<string,unknown>>();
  const identities = (await env.DB.prepare(`SELECT provider,email,email_verified,last_used_at FROM auth_identities WHERE user_id=? ORDER BY created_at`).bind(auth.userId).all()).results ?? [];
  return json({
    account: {
      mode: 'account',
      accountAuthEnabled: googleEnabled(env),
      migrationReady: false,
      migrationPreview: { trips: 0, travelers: 0, timelineItems: 0, checklistItems: 0 },
      user,
      identities,
      providers: [{ provider:'google', enabled:googleEnabled(env), clientId:googleEnabled(env)?env.GOOGLE_CLIENT_ID:undefined }],
      device: device ? { id: device.id, platform: device.platform, createdAt: device.created_at } : null,
    },
  }, {}, request, env);
}

function googleEnabled(env:Env):boolean{return env.ACCOUNT_AUTH_ENABLED==='true'&&typeof env.GOOGLE_CLIENT_ID==='string'&&env.GOOGLE_CLIENT_ID.length>20;}

export async function accountMigrationPreview(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (auth.userId) {
    return json({ migration: { mode: 'account', eligible: false, reason: 'ALREADY_ACCOUNT', trips: 0, travelers: 0, timelineItems: 0, checklistItems: 0 } }, {}, request, env);
  }
  const preview = await guestMigrationPreview(env, auth.deviceId);
  return json({ migration: { mode: 'guest', eligible: true, reason: null, ...preview, accountAuthEnabled: env.ACCOUNT_AUTH_ENABLED === 'true' } }, {}, request, env);
}

async function guestMigrationPreview(env: Env, deviceId: string): Promise<{trips:number;travelers:number;timelineItems:number;checklistItems:number}> {
  const rows = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT t.id) AS trips,
      COUNT(DISTINCT tr.id) AS travelers,
      COUNT(DISTINCT ti.id) AS timeline_items,
      COUNT(DISTINCT ci.id) AS checklist_items
    FROM trips t
    LEFT JOIN travelers tr ON tr.trip_id=t.id AND tr.deleted_at IS NULL
    LEFT JOIN trip_items ti ON ti.trip_id=t.id AND ti.deleted_at IS NULL
    LEFT JOIN trip_checklist_items ci ON ci.trip_id=t.id AND ci.deleted_at IS NULL
    WHERE t.created_by_device_id=? AND t.owner_user_id IS NULL AND t.deleted_at IS NULL
  `).bind(deviceId).first<Record<string,unknown>>();
  return {
    trips: Number(rows?.trips ?? 0),
    travelers: Number(rows?.travelers ?? 0),
    timelineItems: Number(rows?.timeline_items ?? 0),
    checklistItems: Number(rows?.checklist_items ?? 0),
  };
}
