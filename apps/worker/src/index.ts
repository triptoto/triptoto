import { FEATURE_FLAGS } from './config';

export interface Env {
  DB?: unknown;      // D1 binding added after Cloudflare account/resource creation.
  DOCUMENTS?: unknown; // R2 binding added after Cloudflare account/resource creation.
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, liveFlights: FEATURE_FLAGS.liveFlights, generativeAI: FEATURE_FLAGS.generativeAI });
    }
    return Response.json({ error: 'NOT_IMPLEMENTED' }, { status: 501 });
  },
};
