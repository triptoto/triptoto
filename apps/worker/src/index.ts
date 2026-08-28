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
import { previewForwardedEmail, previewUploadedDocument, listImports, getImport, resolveImportCandidate } from './routes/imports.ts';
import { acknowledgeGoogleHandoff, createGoogleChallenge, exchangeGoogleHandoff, googleSignIn, googleSignInRedirect, signOut } from './routes/google-auth.ts';
import { betaStatus, recordClientBetaEvent } from './routes/beta.ts';
import { opsSummary } from './routes/ops.ts';
import { deletionPreview, deleteMyData } from './routes/privacy.ts';
import { enforceActorRateLimit, enforcePublicRateLimit } from './rate-limit.ts';
import { PRODUCT_LIMITS } from './config.ts';
import { listJourneys, createJourney, updateJourney, replaceJourneyItems, deleteJourney } from './routes/journeys.ts';
import { listActivities, createActivity, updateActivity, deleteActivity } from './routes/activities.ts';
import { listBookingDetails, upsertBookingDetail, deleteBookingDetail } from './routes/booking-details.ts';
import { listContacts, createContact, updateContact, deleteContact } from './routes/contacts.ts';
import { listTimeMarkers, createTimeMarker, updateTimeMarker, deleteTimeMarker } from './routes/time-markers.ts';
import { expandedTripHealth } from './routes/intelligence.ts';
import { syncStatus, syncChanges, acknowledgeSync, queueSyncOperation, listSyncConflicts } from './routes/sync-v2.ts';
import { readiness } from './routes/readiness.ts';
import { currentWeather, geocodePlace } from './routes/weather.ts';
import { receiveBookingEmail, type InboundEmailMessage } from './inbound-email.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Await the routed handler so a rejected handler promise (e.g. an HttpError
      // thrown inside a route) is caught here and converted to a JSON error,
      // instead of escaping as an uncaught rejection => Cloudflare Worker 1101 (500).
      // A returned-but-not-awaited promise's rejection bypasses this try/catch.
      return await (async (): Promise<Response> => {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'GET' && path === '/health') return health(request, env);
      if (request.method === 'GET' && path === '/api/v1/readiness') return readiness(request, env);
      if (request.method === 'GET' && path === '/api/v1/weather') {
        await enforcePublicRateLimit(request,env,{action:'weather',limit:120,windowMs:60*60*1000});
        return currentWeather(request, env);
      }
      if (request.method === 'GET' && path === '/api/v1/geocode') {
        await enforcePublicRateLimit(request,env,{action:'geocode',limit:120,windowMs:60*60*1000});
        return geocodePlace(request, env);
      }
      if (request.method === 'GET' && path === '/api/v1') return json({ service: 'tripto-api', version: 'v1', build: env.BETA_RELEASE || 'beta-candidate-1' }, {}, request, env);
      if (request.method === 'POST' && path === '/api/v1/session/guest') {
        await enforcePublicRateLimit(request,env,{action:'guest_session',limit:PRODUCT_LIMITS.guestSessionsPerHourPerFingerprint,windowMs:60*60*1000});
        return createGuestSession(request, env);
      }
      // Await the public redirect handler so HttpError rejections are converted
      // by this fetch handler's catch block instead of escaping as Worker 1101.
      if (request.method === 'POST' && path === '/api/v1/auth/google/callback') return await googleSignInRedirect(request,env);
      if (request.method === 'POST' && path === '/api/v1/auth/google/exchange') return exchangeGoogleHandoff(request,env);

      const auth = await requireAuth(request, env);
      if (['POST','PUT','PATCH','DELETE'].includes(request.method)) await enforceActorRateLimit(env,auth,{action:'api_write',limit:PRODUCT_LIMITS.actorWritesPerHour,windowMs:60*60*1000});
      if (request.method === 'POST' && path === '/api/v1/session/refresh') return refreshSession(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account') return accountStatus(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account/migration-preview') return accountMigrationPreview(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/auth/google/challenge') {
        await enforceActorRateLimit(env,auth,{action:'google_auth',limit:PRODUCT_LIMITS.googleAuthAttemptsPerHour,windowMs:60*60*1000});
        return createGoogleChallenge(request,env,auth);
      }
      if (request.method === 'POST' && path === '/api/v1/auth/google') {
        await enforceActorRateLimit(env,auth,{action:'google_auth',limit:PRODUCT_LIMITS.googleAuthAttemptsPerHour,windowMs:60*60*1000});
        return googleSignIn(request,env,auth);
      }
      if (request.method === 'POST' && path === '/api/v1/auth/google/exchange/ack') return acknowledgeGoogleHandoff(request,env,auth);
      if (request.method === 'POST' && path === '/api/v1/auth/signout') return signOut(request,env,auth);
      if (request.method === 'GET' && path === '/api/v1/account/deletion-preview') return deletionPreview(request,env,auth);
      if (request.method === 'DELETE' && path === '/api/v1/account') return deleteMyData(request,env,auth);
      if (request.method === 'GET' && path === '/api/v1/diagnostics') return diagnostics(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/beta/status') return betaStatus(request,env,auth);
      if (request.method === 'POST' && path === '/api/v1/beta/events') return recordClientBetaEvent(request,env,auth);
      if (request.method === 'GET' && path === '/api/v1/internal/ops/summary') return opsSummary(request,env,auth);
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
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/upload\/preview$/);
      if (match && request.method==='POST') return previewUploadedDocument(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/([^/]+)$/);
      if (match && request.method==='GET') return getImport(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/([^/]+)\/resolve$/);
      if (match && request.method==='POST') return resolveImportCandidate(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));

      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/journeys$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listJourneys(request,env,auth,tripId); if(request.method==='POST') return createJourney(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/journeys\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), journeyId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateJourney(request,env,auth,tripId,journeyId); if(request.method==='DELETE') return deleteJourney(request,env,auth,tripId,journeyId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/journeys\/([^/]+)\/items$/);
      if (match && request.method==='PUT') return replaceJourneyItems(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/activities$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listActivities(request,env,auth,tripId); if(request.method==='POST') return createActivity(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/activities\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), itemId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateActivity(request,env,auth,tripId,itemId); if(request.method==='DELETE') return deleteActivity(request,env,auth,tripId,itemId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/booking-details$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listBookingDetails(request,env,auth,tripId); if(request.method==='PUT'||request.method==='POST') return upsertBookingDetail(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/booking-details\/([^/]+)\/([^/]+)$/);
      if (match && request.method==='DELETE') return deleteBookingDetail(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]),decodeURIComponent(match[3]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/contacts$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listContacts(request,env,auth,tripId); if(request.method==='POST') return createContact(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/contacts\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), contactId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateContact(request,env,auth,tripId,contactId); if(request.method==='DELETE') return deleteContact(request,env,auth,tripId,contactId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/time-markers$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listTimeMarkers(request,env,auth,tripId); if(request.method==='POST') return createTimeMarker(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/time-markers\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), markerId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateTimeMarker(request,env,auth,tripId,markerId); if(request.method==='DELETE') return deleteTimeMarker(request,env,auth,tripId,markerId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/health\/expanded$/);
      if (match && request.method==='GET') return expandedTripHealth(request,env,auth,decodeURIComponent(match[1]),false);
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/health\/recalculate$/);
      if (match && request.method==='POST') return expandedTripHealth(request,env,auth,decodeURIComponent(match[1]),true);
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sync\/status$/);
      if (match && request.method==='GET') return syncStatus(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sync\/changes$/);
      if (match && request.method==='GET') return syncChanges(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sync\/ack$/);
      if (match && request.method==='POST') return acknowledgeSync(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sync\/operations$/);
      if (match && request.method==='POST') return queueSyncOperation(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/sync\/conflicts$/);
      if (match && request.method==='GET') return listSyncConflicts(request,env,auth,decodeURIComponent(match[1]));

      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/impacts$/);
      if (match && request.method==='GET') return listImpacts(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/impacts\/recalculate$/);
      if (match && request.method==='POST') return recalculateImpacts(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/changes$/);
      if (match && request.method==='GET') return listChanges(request,env,auth,decodeURIComponent(match[1]));

      return json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }, { status: 404 }, request, env);
      })();
    } catch (error) {
      return errorResponse(error, request, env);
    }
  },
  async email(message: InboundEmailMessage, env: Env): Promise<void> {
    await receiveBookingEmail(message, env);
  },
};
