import type { Env } from './types.ts';
import { corsPreflight, errorResponse, json } from './http.ts';
import { requireAuth } from './auth.ts';
import { health } from './routes/health.ts';
import { createGuestSession } from './routes/session.ts';
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from './routes/trips.ts';
import { createTimelineItem, deleteTimelineItem, listTimeline, updateTimelineItem } from './routes/timeline.ts';
import { createChecklistItem, listChecklist, seedTripChecklist, updateChecklistItem } from './routes/checklist.ts';
import { tripBrain } from './routes/brain.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'GET' && path === '/health') return health(request, env);
      if (request.method === 'GET' && path === '/api/v1') return json({ service: 'tripto-api', version: 'v1' }, {}, request, env);
      if (request.method === 'POST' && path === '/api/v1/session/guest') return createGuestSession(request, env);

      const auth = await requireAuth(request, env);
      if (path === '/api/v1/trips') {
        if (request.method === 'GET') return listTrips(request, env, auth);
        if (request.method === 'POST') return createTrip(request, env, auth);
      }

      let match = path.match(/^\/api\/v1\/trips\/([^/]+)$/);
      if (match) {
        const tripId = decodeURIComponent(match[1]);
        if (request.method === 'GET') return getTrip(request, env, auth, tripId);
        if (request.method === 'PATCH') return updateTrip(request, env, auth, tripId);
        if (request.method === 'DELETE') return deleteTrip(request, env, auth, tripId);
      }

      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/timeline$/);
      if (match) {
        const tripId = decodeURIComponent(match[1]);
        if (request.method === 'GET') return listTimeline(request, env, auth, tripId);
        if (request.method === 'POST') return createTimelineItem(request, env, auth, tripId);
      }

      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/timeline\/([^/]+)$/);
      if (match) {
        const tripId = decodeURIComponent(match[1]), itemId = decodeURIComponent(match[2]);
        if (request.method === 'PATCH') return updateTimelineItem(request, env, auth, tripId, itemId);
        if (request.method === 'DELETE') return deleteTimelineItem(request, env, auth, tripId, itemId);
      }

      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/checklist$/);
      if (match) {
        const tripId = decodeURIComponent(match[1]);
        if (request.method === 'GET') return listChecklist(request, env, auth, tripId);
        if (request.method === 'POST') return createChecklistItem(request, env, auth, tripId);
      }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/checklist\/seed$/);
      if (match && request.method === 'POST') return seedTripChecklist(request, env, auth, decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/checklist\/([^/]+)$/);
      if (match && request.method === 'PATCH') return updateChecklistItem(request, env, auth, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/brain$/);
      if (match && request.method === 'GET') return tripBrain(request, env, auth, decodeURIComponent(match[1]));

      return json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }, { status: 404 }, request, env);
    } catch (error) {
      return errorResponse(error, request, env);
    }
  },
};
