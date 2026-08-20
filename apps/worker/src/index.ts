import type { Env } from './types.ts';
import { corsPreflight, errorResponse, json } from './http.ts';
import { requireAuth } from './auth.ts';
import { health } from './routes/health.ts';
import { createGuestSession, refreshSession } from './routes/session.ts';
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from './routes/trips.ts';
import { createTimelineItem, deleteTimelineItem, listTimeline, updateTimelineItem } from './routes/timeline.ts';
import { createChecklistItem, listChecklist, seedTripChecklist, updateChecklistItem } from './routes/checklist.ts';
import { tripBrain } from './routes/brain.ts';
import { listTravelers, createTraveler, updateTraveler, deleteTraveler } from './routes/travelers.ts';
import { listLocations, createLocation } from './routes/locations.ts';
import { listTransport, createTransport, updateTransport, deleteTransport } from './routes/transport.ts';
import { listStays, createStay, updateStay, deleteStay } from './routes/stays.ts';
import { listConnections, createConnection, updateConnection, deleteConnection } from './routes/connections.ts';
import { listImpacts, recalculateImpacts, listChanges } from './routes/impacts.ts';
import { accountStatus, accountMigrationPreview } from './routes/account.ts';
import { diagnostics } from './routes/diagnostics.ts';
import { exportTripJson, exportTripCalendar } from './routes/export.ts';
import { tripSupportBundle } from './routes/support.ts';
import { sharingStatus, previewInvite, listMembers, listInvites, createInvite, revokeInvite, acceptInvite, updateMemberRole, removeMember } from './routes/sharing.ts';
import { createDemoTrip } from './routes/demo.ts';
import { previewForwardedEmail, listImports, getImport, resolveImportCandidate } from './routes/imports.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'GET' && path === '/health') return health(request, env);
      if (request.method === 'GET' && path === '/api/v1') return json({ service: 'tripto-api', version: 'v1', build: 'beta-milestone-3' }, {}, request, env);
      if (request.method === 'POST' && path === '/api/v1/session/guest') return createGuestSession(request, env);

      const auth = await requireAuth(request, env);
      if (request.method === 'POST' && path === '/api/v1/session/refresh') return refreshSession(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account') return accountStatus(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account/migration-preview') return accountMigrationPreview(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/diagnostics') return diagnostics(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/invites/preview') return previewInvite(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/invites/accept') return acceptInvite(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/internal/demo-trips') return createDemoTrip(request, env, auth);
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


      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/travelers$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listTravelers(request,env,auth,tripId); if(request.method==='POST') return createTraveler(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/travelers\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), travelerId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateTraveler(request,env,auth,tripId,travelerId); if(request.method==='DELETE') return deleteTraveler(request,env,auth,tripId,travelerId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/locations$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listLocations(request,env,auth,tripId); if(request.method==='POST') return createLocation(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/transport$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listTransport(request,env,auth,tripId); if(request.method==='POST') return createTransport(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/transport\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), itemId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateTransport(request,env,auth,tripId,itemId); if(request.method==='DELETE') return deleteTransport(request,env,auth,tripId,itemId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/stays$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listStays(request,env,auth,tripId); if(request.method==='POST') return createStay(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/stays\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), itemId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateStay(request,env,auth,tripId,itemId); if(request.method==='DELETE') return deleteStay(request,env,auth,tripId,itemId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/connections$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listConnections(request,env,auth,tripId); if(request.method==='POST') return createConnection(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/connections\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), connectionId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateConnection(request,env,auth,tripId,connectionId); if(request.method==='DELETE') return deleteConnection(request,env,auth,tripId,connectionId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/export\/json$/);
      if (match && request.method==='GET') return exportTripJson(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/export\/calendar\.ics$/);
      if (match && request.method==='GET') return exportTripCalendar(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/support$/);
      if (match && request.method==='GET') return tripSupportBundle(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sharing$/);
      if (match && request.method==='GET') return sharingStatus(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/members$/);
      if (match && request.method==='GET') return listMembers(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/members\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), userId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateMemberRole(request,env,auth,tripId,userId); if(request.method==='DELETE') return removeMember(request,env,auth,tripId,userId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/invites$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listInvites(request,env,auth,tripId); if(request.method==='POST') return createInvite(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/invites\/([^/]+)$/);
      if (match && request.method==='DELETE') return revokeInvite(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listImports(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/forwarded-email\/preview$/);
      if (match && request.method==='POST') return previewForwardedEmail(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/([^/]+)$/);
      if (match && request.method==='GET') return getImport(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/([^/]+)\/resolve$/);
      if (match && request.method==='POST') return resolveImportCandidate(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/impacts$/);
      if (match && request.method==='GET') return listImpacts(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/impacts\/recalculate$/);
      if (match && request.method==='POST') return recalculateImpacts(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/changes$/);
      if (match && request.method==='GET') return listChanges(request,env,auth,decodeURIComponent(match[1]));

      return json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }, { status: 404 }, request, env);
    } catch (error) {
      return errorResponse(error, request, env);
    }
  },
};
