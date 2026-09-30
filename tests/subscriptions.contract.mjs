import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('public/mobile-app.js', 'utf8');
const routes = readFileSync('apps/worker/src/index.ts', 'utf8');
const trips = readFileSync('apps/worker/src/routes/trips.ts', 'utf8');
const subscriptions = readFileSync('apps/worker/src/routes/subscriptions.ts', 'utf8');
const migration = readFileSync('migrations/0026_triptoplus_subscriptions.sql', 'utf8');
const lifetimeMigration = readFileSync('migrations/0027_triptoplus_lifetime_grants.sql', 'utf8');

assert.match(app, /checkout\[custom\]\[tripto_subject\]/, 'checkout must identify the entitled Tripto actor');
assert.match(app, /checkout\[custom\]\[tripto_plan\]/, 'checkout must identify the selected plan');
assert.match(routes, /\/api\/v1\/billing\/lemonsqueezy\/webhook/, 'signed billing webhook route missing');
assert.match(routes, /\/api\/v1\/subscription/, 'subscription status route missing');
assert.match(trips, /TRIPTO_PLUS_REQUIRED/, 'server must reject a second active trip without Plus');
assert.match(subscriptions, /x-signature/, 'webhook signature verification missing');
assert.match(subscriptions, /crypto\.subtle\.sign/, 'webhook must use HMAC verification');
assert.match(subscriptions, /tripto_plus_webhook_events/, 'webhook retries must be idempotent');
assert.match(migration, /CREATE TABLE tripto_plus_subscriptions/, 'subscription persistence migration missing');
assert.match(migration, /provider_subscription_id TEXT NOT NULL UNIQUE/, 'provider subscription id must be unique');
assert.match(lifetimeMigration, /CREATE TABLE tripto_plus_lifetime_grants/, 'lifetime Plus grant persistence missing');
assert.match(subscriptions, /hasLifetimeGrant/, 'lifetime Plus grant must be checked before a provider subscription');
assert.match(app, /Tripto Plus — Lifetime/, 'account must identify a lifetime Plus member');
assert.match(app, /trips-header-plus/, 'Trips header must expose a dedicated Tripto Plus action');
assert.match(app, /error\?\.code === "TRIPTO_PLUS_REQUIRED"/, 'second-trip paywall must happen after a create attempt, not when tapping the add button');
assert.match(app, /Manage or cancel subscription/, 'paid Plus members need a visible self-service cancellation path');
assert.match(app, /!lifetimePlus/, 'lifetime members must not receive a paid-subscription cancellation action');
console.log('Tripto Plus server entitlement and webhook contracts passed.');
