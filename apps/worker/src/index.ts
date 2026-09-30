import type { Env } from './types.ts';
import { HttpError, corsPreflight, ensureApiCors, errorResponse, json } from './http.ts';
import { requireAuth } from './auth.ts';
import { health } from './routes/health.ts';
import { createGuestSession, refreshSession } from './routes/session.ts';
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from './routes/trips.ts';
import { createTimelineItem, deleteTimelineItem, listTimeline, updateTimelineItem } from './routes/timeline.ts';
import { createChecklistItem, deleteChecklistItem, listChecklist, seedTripChecklist, updateChecklistItem } from './routes/checklist.ts';
import { tripBrain } from './routes/brain.ts';
import { listTravelers, createTraveler, updateTraveler, deleteTraveler } from './routes/travelers.ts';
import { listLocations, createLocation } from './routes/locations.ts';
import { listTransport, createTransport, updateTransport, deleteTransport } from './routes/transport.ts';
import { listStays, createStay, updateStay, deleteStay } from './routes/stays.ts';
import { listConnections, createConnection, updateConnection, deleteConnection } from './routes/connections.ts';
import { listImpacts, recalculateImpacts, listChanges } from './routes/impacts.ts';
import { accountStatus, accountMigrationPreview, updateAccountLocale } from './routes/account.ts';
import { diagnostics } from './routes/diagnostics.ts';
import { exportTripJson, exportTripCalendar } from './routes/export.ts';
import { tripSupportBundle } from './routes/support.ts';
import { sharingStatus, previewInvite, listMembers, listInvites, createInvite, revokeInvite, acceptInvite, updateMemberRole, removeMember, leaveTrip, transferOwnership } from './routes/sharing.ts';
import { createDemoTrip } from './routes/demo.ts';
import { previewForwardedEmail, previewUploadedDocument, listImports, getImport, resolveImportCandidate, listInboundEmails, deleteImport } from './routes/imports.ts';
import { acknowledgeGoogleHandoff, createGoogleChallenge, exchangeGoogleHandoff, googleSignIn, googleSignInRedirect, signOut } from './routes/google-auth.ts';
import { betaStatus, recordClientBetaEvent } from './routes/beta.ts';
import { opsSummary } from './routes/ops.ts';
import { deletionPreview, deleteMyData } from './routes/privacy.ts';
import { enforceActorRateLimit, enforceGlobalRateLimit, enforcePublicRateLimit, pruneExpiredUsageCounters } from './rate-limit.ts';
import { PRODUCT_LIMITS } from './config.ts';
import { listJourneys, createJourney, updateJourney, replaceJourneyItems, deleteJourney } from './routes/journeys.ts';
import { listActivities, createActivity, updateActivity, deleteActivity } from './routes/activities.ts';
import { listCollections, createCollection, updateCollection, deleteCollection, addStop, updateStop, deleteStop, reorderStops } from './routes/planning-collections.ts';
import { listBookingDetails, upsertBookingDetail, deleteBookingDetail } from './routes/booking-details.ts';
import { listContacts, createContact, updateContact, deleteContact } from './routes/contacts.ts';
import { listTimeMarkers, createTimeMarker, updateTimeMarker, deleteTimeMarker } from './routes/time-markers.ts';
import { expandedTripHealth } from './routes/intelligence.ts';
import { syncStatus, syncChanges, acknowledgeSync, queueSyncOperation, listSyncConflicts } from './routes/sync-v2.ts';
import { readiness } from './routes/readiness.ts';
import { currentWeather, geocodePlace } from './routes/weather.ts';
import { currencyRates } from './routes/currency.ts';
import { receiveBookingEmail, type InboundEmailMessage } from './inbound-email.ts';
import { lemonSqueezyWebhook, subscriptionStatus } from './routes/subscriptions.ts';
import { assignBookingEmail, dismissBookingEmail, listBookingEmails } from './routes/booking-emails.ts';
import { refreshLiveFlight, updateLiveFlightMonitoring } from './routes/live-flights.ts';
import { runScheduledLiveFlightRefresh } from './live-flights.ts';
import { taxFreeCatalog, taxFreeRule, taxFreeCandidates, reviewTaxFreeCandidate, publishTaxFreeDraft, rollbackTaxFreeVersion } from './routes/tax-free.ts';
import { runScheduledTaxFreeSourceChecks } from './tax-free-monitor.ts';
// The machine-readable AI catalog is served directly from the worker (not the
// static-asset bucket) so it can NEVER fall through to the SPA index.html
// fallback (not_found_handling: "single-page-application"). A missing asset
// would otherwise return the HTML shell, and agent validators reject that with
// "Malformed JSON: Unexpected token '<', "<!doctype "...". Importing the file
// keeps public/ai-catalog.json as the single source of truth.
import aiCatalog from '../../../public/ai-catalog.json' with { type: 'json' };

const APP_PATHS = [
  /^\/(?:home|timeline|trips|add|day-plan|save-later|bookings|documents|ready-offline|trip-health|account|trip-map|weather|currency|tax-free|saved-spots|trip-options|esim|before-you-go|help|travelers|pending-changes|collaboration|plan-idea)(?:\/.*)?$/,
  /^\/(?:flights|hotels|trains|plans|collections|join)(?:\/.*)?$/,
];
const STATIC_ASSET_PATH = /\.(?:css|js|json|xml|txt|webmanifest|svg|png|jpg|jpeg|webp|ico|map|ttf|otf|woff|woff2)$/i;

// Content-Security-Policy for served HTML documents. Kept in the worker (not the
// _headers file) because the full third-party allow-list plus the inline-script
// sha256 hashes exceed Cloudflare's 2000-char-per-line _headers limit. script-src
// has no 'unsafe-inline'; every inline <script> in a served HTML page is allowed
// by its stable sha256 hash (the four in index.html plus the shared legal/landing
// theme-bootstrap hash). These are deploy-independent (the asset-version token is
// read from a <meta> tag, never inlined), so the hashes never change per release.
// tests/seo-release.contract.mjs recomputes the hashes and fails if any drift.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'sha256-KBSes116HebjqHvxmJXbjM0Py040wqmrJZ93ZQFieaM=' 'sha256-R6555leUrF4qgqhOkgeaAcVag9K+MqUo+VciDo2VsCE=' 'sha256-CJ850s8HZfOvkdNKpRxLrdkOINWM/83lsCUZNndrAkc=' 'sha256-H/rQFRGeVg7AKee498X61n9+NDOQMkxqd74qqXgoAw8=' 'sha256-cM1uCIDgiJMwQrus7zfQ95xBaXMFvZzsgQ9LTY8bCEw=' 'sha256-ny/Z5znEr6fA1fGfqebPT7Ckj2TNr5wKx2QSiZBJlw8=' 'sha256-0UtseHxFccx6ffbOzGSA4eulVApYUD1WeP2dpsuLV+o=' 'sha256-H5epmeOGBAUbELfBPGCBhy2AgT/caUgrTNhiNdjMlvA=' https://www.googletagmanager.com https://cdn.jsdelivr.net https://accounts.google.com https://scripts.stay22.com https://widgets.stay22.com https://tpwgt.com https://cdn.b2b.welcomepickups.com https://*.welcomepickups.com https://tpo.gg https://*.tpo.gg https://tp.media https://www.aviasales.com https://*.aviasales.com https://*.avs.io https://avsplow.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.googleapis.com https://tpwgt.com https://*.welcomepickups.com https://tp.media https://www.aviasales.com https://*.aviasales.com",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.googleusercontent.com https://www.google-analytics.com https://*.google-analytics.com https://tpwgt.com https://*.tpwgt.com https://tp.media https://*.welcomepickups.com https://tpo.gg https://*.tpo.gg https://www.aviasales.com https://*.aviasales.com https://*.avs.io",
  "connect-src 'self' https://cdn.jsdelivr.net https://tiles.openfreemap.org https://accounts.google.com https://id.h2.stay22.com https://www.stay22.com https://widgets.stay22.com https://tpwgt.com https://*.tpwgt.com https://tp.media https://*.welcomepickups.com https://tpo.gg https://*.tpo.gg https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.aviasales.com https://*.aviasales.com https://*.avs.io https://avsplow.com https://*.avsplow.com https://www.apistp.com https://*.apistp.com",
  "frame-src https://accounts.google.com https://widgets.stay22.com https://tpwgt.com https://*.tpwgt.com https://www.travelpayouts.com https://tp.media https://*.welcomepickups.com https://www.aviasales.com https://*.aviasales.com",
  "font-src 'self' https://fonts.gstatic.com https://*.welcomepickups.com https://tp.media https://www.aviasales.com https://*.aviasales.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.aviasales.com https://*.aviasales.com",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

// Attach the CSP to an HTML-document response. Rebuilds the response because
// env.ASSETS responses carry immutable headers.
function withCsp(response: Response, method: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

// Digital Asset Links for Android App Links (https://tripto.to/join/... opens the
// app). Fingerprints come from ANDROID_APP_LINK_SHA256 (Play App Signing key and
// upload key, from Play Console); until they are configured the file is 404 and
// invite links simply keep opening in the browser.
const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
function assetLinksResponse(request: Request, env: Env): Response {
  const fingerprints = (env.ANDROID_APP_LINK_SHA256 ?? '').split(',').map((v) => v.trim().toUpperCase()).filter((v) => SHA256_FINGERPRINT.test(v));
  const packageName = (env.ANDROID_APP_PACKAGE ?? '').trim();
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' };
  if (!packageName || !fingerprints.length) return new Response(request.method === 'HEAD' ? null : '[]', { status: 404, headers });
  const body = JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints } }]);
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}

export async function frontendResponse(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!env.ASSETS || !['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  if (path === '/' || path === '/index.html') return withCsp(await env.ASSETS.fetch(request), request.method);
  if (path === '/landing' || path === '/landing/' || path === '/landing.html') {
    url.pathname = '/landing.html';
    return withCsp(await env.ASSETS.fetch(new Request(url, request)), request.method);
  }
  if (path === '/.well-known/assetlinks.json') return assetLinksResponse(request, env);
  if (['/privacy', '/terms', '/cookies', '/contact', '/delete-account'].includes(path)) {
    url.pathname = `${path}.html`;
    return withCsp(await env.ASSETS.fetch(new Request(url, request)), request.method);
  }
  if (path === '/ai-catalog.json') {
    const body = JSON.stringify(aiCatalog);
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  if (STATIC_ASSET_PATH.test(path)) return env.ASSETS.fetch(request);
  if (APP_PATHS.some((pattern) => pattern.test(path))) {
    url.pathname = '/index.html';
    const shell = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(shell.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    return new Response(request.method === 'HEAD' ? null : shell.body, { status: shell.status, statusText: shell.statusText, headers });
  }
  // Useful, on-brand 404: serve the styled page (with a link home) instead of a
  // bare "Not found" message, and keep the correct 404 status + noindex header.
  url.pathname = '/404.html';
  const notFound = await env.ASSETS.fetch(new Request(url, request));
  const headers = new Headers(notFound.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return new Response(request.method === 'HEAD' ? null : notFound.body, { status: 404, statusText: 'Not Found', headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Await the routed handler so a rejected handler promise (e.g. an HttpError
      // thrown inside a route) is caught here and converted to a JSON error,
      // instead of escaping as an uncaught rejection => Cloudflare Worker 1101 (500).
      // A returned-but-not-awaited promise's rejection bypasses this try/catch.
      const response = await (async (): Promise<Response> => {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health') {
        const response = await health(request, env);
        return request.method === 'HEAD' ? new Response(null, response) : response;
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/api/v1/readiness') {
        const response = await readiness(request, env);
        return request.method === 'HEAD' ? new Response(null, response) : response;
      }
      if (request.method === 'GET' && path === '/api/v1/weather') {
        await enforcePublicRateLimit(request,env,{action:'weather',limit:120,windowMs:60*60*1000});
        return currentWeather(request, env);
      }
      if (request.method === 'GET' && path === '/api/v1/geocode') {
        await enforcePublicRateLimit(request,env,{action:'geocode',limit:120,windowMs:60*60*1000});
        try {
          await enforceGlobalRateLimit(env,{action:'nominatim',limit:1,windowMs:1100});
          return geocodePlace(request, env);
        } catch (error) {
          // Nominatim permits about one request per second globally. When its
          // shared allowance is busy, use the city-level provider rather than
          // returning a blank marker or an opaque 429 to the map.
          if (error instanceof HttpError && error.code === 'RATE_LIMITED') return geocodePlace(request, env, false);
          throw error;
        }
      }
      if (request.method === 'GET' && path === '/api/v1/currency') {
        await enforcePublicRateLimit(request,env,{action:'currency',limit:120,windowMs:60*60*1000});
        return currencyRates(request, env);
      }
      if (request.method === 'GET' && path === '/api/v1/tax-free') {
        await enforcePublicRateLimit(request,env,{action:'tax_free_catalog',limit:120,windowMs:60*60*1000});
        return taxFreeCatalog(request,env);
      }
      const publicTaxFreeMatch=path.match(/^\/api\/v1\/tax-free\/([A-Za-z]{2})$/);
      if(request.method==='GET'&&publicTaxFreeMatch){
        await enforcePublicRateLimit(request,env,{action:'tax_free_rule',limit:180,windowMs:60*60*1000});
        return taxFreeRule(request,env,publicTaxFreeMatch[1]);
      }
      if (!path.startsWith('/api/')) {
        const frontend = await frontendResponse(request, env, path);
        if (frontend) return frontend;
      }
      if (request.method === 'GET' && path === '/api/v1') return json({ service: 'tripto-api', version: 'v1', build: env.BETA_RELEASE || 'beta-candidate-1' }, {}, request, env);
      if (request.method === 'POST' && path === '/api/v1/session/guest') {
        await enforcePublicRateLimit(request,env,{action:'guest_session',limit:PRODUCT_LIMITS.guestSessionsPerHourPerFingerprint,windowMs:60*60*1000});
        await enforcePublicRateLimit(request,env,{action:'guest_session_ip',limit:PRODUCT_LIMITS.guestSessionsPerHourPerFingerprint*2,windowMs:60*60*1000},{ipOnly:true});
        return createGuestSession(request, env);
      }
      if (request.method === 'POST' && path === '/api/v1/billing/lemonsqueezy/webhook') return lemonSqueezyWebhook(request, env);
      // Await the public redirect handler so HttpError rejections are converted
      // by this fetch handler's catch block instead of escaping as Worker 1101.
      if (['GET','POST'].includes(request.method) && path === '/api/v1/auth/google/callback') return await googleSignInRedirect(request,env);
      if (request.method === 'POST' && path === '/api/v1/auth/google/exchange') return exchangeGoogleHandoff(request,env);

      const auth = await requireAuth(request, env);
      if (['POST','PUT','PATCH','DELETE'].includes(request.method)) await enforceActorRateLimit(env,auth,{action:'api_write',limit:PRODUCT_LIMITS.actorWritesPerHour,windowMs:60*60*1000});
      else if (request.method === 'GET') await enforceActorRateLimit(env,auth,{action:'api_read',limit:PRODUCT_LIMITS.actorReadsPerHour,windowMs:60*60*1000});
      if (request.method === 'POST' && path === '/api/v1/session/refresh') return refreshSession(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account') return accountStatus(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/subscription') return subscriptionStatus(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/account/migration-preview') return accountMigrationPreview(request, env, auth);
      if (request.method === 'PATCH' && path === '/api/v1/account/locale') return updateAccountLocale(request, env, auth);
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
      if(request.method==='GET'&&path==='/api/v1/internal/tax-free/candidates')return taxFreeCandidates(request,env,auth);
      let taxFreeAdminMatch=path.match(/^\/api\/v1\/internal\/tax-free\/candidates\/([^/]+)\/review$/);
      if(request.method==='POST'&&taxFreeAdminMatch)return reviewTaxFreeCandidate(request,env,auth,decodeURIComponent(taxFreeAdminMatch[1]));
      taxFreeAdminMatch=path.match(/^\/api\/v1\/internal\/tax-free\/drafts\/([^/]+)\/publish$/);
      if(request.method==='POST'&&taxFreeAdminMatch)return publishTaxFreeDraft(request,env,auth,decodeURIComponent(taxFreeAdminMatch[1]));
      taxFreeAdminMatch=path.match(/^\/api\/v1\/internal\/tax-free\/versions\/([^/]+)\/rollback$/);
      if(request.method==='POST'&&taxFreeAdminMatch)return rollbackTaxFreeVersion(request,env,auth,decodeURIComponent(taxFreeAdminMatch[1]));
      if (request.method === 'POST' && path === '/api/v1/invites/preview') return previewInvite(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/invites/accept') return acceptInvite(request, env, auth);
      if (request.method === 'POST' && path === '/api/v1/internal/demo-trips') return createDemoTrip(request, env, auth);
      if (request.method === 'GET' && path === '/api/v1/booking-emails') return listBookingEmails(request,env,auth);
      let bookingEmailMatch = path.match(/^\/api\/v1\/booking-emails\/([^/]+)\/(assign|dismiss)$/);
      if (bookingEmailMatch && request.method === 'POST') {
        const emailId=decodeURIComponent(bookingEmailMatch[1]);
        return bookingEmailMatch[2] === 'assign' ? assignBookingEmail(request,env,auth,emailId) : dismissBookingEmail(request,env,auth,emailId);
      }
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
      if (match && request.method === 'DELETE') return deleteChecklistItem(request, env, auth, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
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
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/transport\/([^/]+)\/live$/);
      if (match && request.method==='PATCH') return updateLiveFlightMonitoring(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/transport\/([^/]+)\/live\/refresh$/);
      if (match && request.method==='POST') return refreshLiveFlight(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
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
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/leave$/);
      if (match && request.method==='POST') return leaveTrip(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/transfer-ownership$/);
      if (match && request.method==='POST') return transferOwnership(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/invites$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listInvites(request,env,auth,tripId); if(request.method==='POST') return createInvite(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/invites\/([^/]+)$/);
      if (match && request.method==='DELETE') return revokeInvite(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listImports(request,env,auth,tripId); }
      if (path==='/api/v1/inbound-emails' && request.method==='GET') return listInboundEmails(request,env,auth);
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/forwarded-email\/preview$/);
      if (match && request.method==='POST') return previewForwardedEmail(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/upload\/preview$/);
      if (match && request.method==='POST') return previewUploadedDocument(request,env,auth,decodeURIComponent(match[1]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/imports\/([^/]+)$/);
      if (match && request.method==='GET') return getImport(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      if (match && request.method==='DELETE') return deleteImport(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
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
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/collections$/);
      if (match) { const tripId=decodeURIComponent(match[1]); if(request.method==='GET') return listCollections(request,env,auth,tripId); if(request.method==='POST') return createCollection(request,env,auth,tripId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/collections\/([^/]+)\/stops\/order$/);
      if (match && request.method==='PUT') return reorderStops(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/collections\/([^/]+)\/stops$/);
      if (match && request.method==='POST') return addStop(request,env,auth,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/collections\/([^/]+)\/stops\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), itemId=decodeURIComponent(match[2]), stopId=decodeURIComponent(match[3]); if(request.method==='PATCH') return updateStop(request,env,auth,tripId,itemId,stopId); if(request.method==='DELETE') return deleteStop(request,env,auth,tripId,itemId,stopId); }
      match = path.match(/^\/api\/v1\/trips\/([^/]+)\/collections\/([^/]+)$/);
      if (match) { const tripId=decodeURIComponent(match[1]), itemId=decodeURIComponent(match[2]); if(request.method==='PATCH') return updateCollection(request,env,auth,tripId,itemId); if(request.method==='DELETE') return deleteCollection(request,env,auth,tripId,itemId); }
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
      return ensureApiCors(response, request, env);
    } catch (error) {
      return errorResponse(error, request, env);
    }
  },
  async email(message: InboundEmailMessage, env: Env): Promise<void> {
    await receiveBookingEmail(message, env);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await Promise.allSettled([runScheduledLiveFlightRefresh(env),runScheduledTaxFreeSourceChecks(env),pruneExpiredUsageCounters(env)]);
  },
};
