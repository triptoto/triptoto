import type { AuthContext, Env } from '../types.ts';
import { json } from '../http.ts';

export async function accountStatus(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const device = await env.DB.prepare(`SELECT id,platform,app_version,api_version,created_at,last_seen_at,user_id FROM devices WHERE id=?`)
    .bind(auth.deviceId).first<Record<string,unknown>>();

  if (!auth.userId) {
    return json({
      account: {
        mode: 'guest',
        accountAuthEnabled: env.ACCOUNT_AUTH_ENABLED === 'true',
        migrationReady: true,
        device: device ? { id: device.id, platform: device.platform, createdAt: device.created_at } : null,
        providers: [
          { provider: 'apple', enabled: false },
          { provider: 'google', enabled: false },
          { provider: 'email', enabled: false },
        ],
      },
    }, {}, request, env);
  }

  const user = await env.DB.prepare(`SELECT id,display_name,primary_email,locale,timezone,created_at,updated_at FROM users WHERE id=? AND deleted_at IS NULL`)
    .bind(auth.userId).first<Record<string,unknown>>();
  const identities = (await env.DB.prepare(`SELECT provider,email,email_verified,last_used_at FROM auth_identities WHERE user_id=? ORDER BY created_at`).bind(auth.userId).all()).results ?? [];
  return json({
    account: {
      mode: 'account',
      accountAuthEnabled: env.ACCOUNT_AUTH_ENABLED === 'true',
      user,
      identities,
      device: device ? { id: device.id, platform: device.platform, createdAt: device.created_at } : null,
    },
  }, {}, request, env);
}
