# Product V2 release

## Traveler experience

Product V2 replaces the five-tab V1 dashboard with a focused journey:

`Welcome → Google sign-in → Create Trip → Add Booking → Timeline`

Returning travelers land on the active trip, nearest upcoming trip, or most relevant recent trip. Primary navigation is `Trip | + | Account`. The plus menu contains only Add Booking and Create New Trip.

## Safety boundaries

- Google Identity Services is authentication only. The Worker validates the signed ID token and uses `(provider, provider_subject)` as the stable identity.
- Gmail, Drive, Calendar, generative AI, live flights, R2, sharing, demo tools, and ops remain disabled.
- Scheduled travel data is labeled as scheduled and is never presented as live.
- Uploaded originals remain local to the device and retain checksum/integrity requirements.
- Inbound booking email stores normalized metadata and deterministic candidates, not the raw message body.
- Ambiguous trip association becomes `needs_trip`; the Worker never guesses.

## Migration

Apply additive migrations in order. Product V2 adds:

- `0016_google_auth_smart_import.sql`: Google auth challenges and avatar profile data.
- `0017_product_v2_booking_email.sql`: verified sender identities and inbound booking-email receipt/deduplication state.

No migration deletes or rewrites existing trips, bookings, travelers, imports, documents, or ownership identifiers.

## Required production configuration

Set `GOOGLE_CLIENT_ID` to the Google Web OAuth client ID for `https://tripto.to`, then set `ACCOUNT_AUTH_ENABLED=true`. No client secret or OAuth redirect is used by the GIS ID-token flow.

After the Worker is deployed, configure Cloudflare Email Routing for the literal address `bookings@tripto.to` with action `Send to a Worker` and destination `tripto-api`. Do not create catch-all or public per-user addresses.

## Validation

```bash
npm install
npm run validate:v2
npx wrangler d1 migrations list tripto-db --remote
```

## Deployment

```bash
npx wrangler d1 migrations apply tripto-db --remote
npx wrangler deploy
bash scripts/smoke-beta-candidate.sh https://tripto.to
```

## Rollback

Deploy the immutable V1 production tag without rolling back D1; the V2 migrations are additive and safe to leave in place.

```bash
git switch --detach v1-production-final
npm install
npx wrangler deploy
```
