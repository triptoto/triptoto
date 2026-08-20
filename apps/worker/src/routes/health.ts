import type { Env } from '../types.ts';
import { json } from '../http.ts';

export async function health(request: Request, env: Env): Promise<Response> {
  let database: { ok: boolean; tables?: number; error?: string };
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").first<{ count: number }>();
    database = { ok: true, tables: Number(row?.count ?? 0) };
  } catch (error) {
    console.error('D1 health check failed', error);
    database = { ok: false, error: 'D1_UNAVAILABLE' };
  }

  return json({
    ok: database.ok,
    service: 'tripto-api',
    build: 'beta-milestone-2',
    database,
    features: {
      liveFlights: env.LIVE_FLIGHTS_ENABLED === 'true',
      generativeAI: env.AI_ENABLED === 'true',
      gmailSync: env.GMAIL_SYNC_ENABLED === 'true',
      r2Documents: env.R2_DOCUMENTS_ENABLED === 'true',
      accountAuth: env.ACCOUNT_AUTH_ENABLED === 'true',
      sharing: env.SHARING_ENABLED === 'true',
      demoTools: env.DEMO_TOOLS_ENABLED === 'true',
    },
    timestamp: Date.now(),
  }, { status: database.ok ? 200 : 503 }, request, env);
}
