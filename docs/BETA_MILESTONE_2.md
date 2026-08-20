# tripto.to Beta Milestone 2

This milestone is intentionally broad. It consolidates account/auth readiness, sharing UX, backup/export, support diagnostics, offline mutation safety, guest-session retention, internal QA scenarios, and automated coverage into one cumulative package.

## Major additions

### Account and identity boundary
- Internal `completeVerifiedIdentityLogin()` bridge for Apple / Google / email-code adapters after they verify identity.
- No public endpoint accepts a claimed identity from the browser.
- Stable user IDs remain independent of email.
- Guest-device trips migrate to a verified user through the existing audited migration path.
- Returning verified identities resolve to the same stable user.
- Unverified email identities are rejected.
- Account migration preview shows how much guest trip data is ready to migrate without performing migration.

### Session retention
- Guest/account sessions are issued for 90 days.
- Authenticated session refresh endpoint extends a valid device session.
- Web app proactively refreshes sessions before expiry.
- A 401 no longer silently creates a new guest device and abandons access to existing guest trips.
- Cached trip data remains readable if session recovery is needed.

### Sharing
- Invite preview without exposing the invited email address.
- Full members / invitations management UI becomes available only when verified account mode and `SHARING_ENABLED=true` are both present.
- Duplicate pending email invites are rejected.
- Invite revoke/member update/remove paths validate entity existence.
- Raw invite tokens are still returned once and only hashes are stored.

### Offline / sync
- Offline checklist toggles can be queued locally with the current entity version.
- Queued changes replay when connectivity returns.
- Version conflicts become `needs_review` instead of being silently overwritten.
- Ready Offline shows pending sync and cache age.
- Other high-impact writes remain online-only until a more complete sync engine is connected.

### Backup and support
- JSON export schema v2.
- Calendar `.ics` export for timed trip items and stays.
- Privacy-safe trip support bundle with counts, confidence/source distribution, recent event types, active impacts, and feature flags.
- Support bundle excludes confirmation numbers, invite tokens, addresses, traveler names, document bytes, and email bodies.
- Request IDs are returned in response headers and error envelopes for debugging.

### Internal QA
Demo tools remain disabled publicly, but the internal scenario generator now covers:
- normal trip
- self-transfer
- overnight flight
- family trip
- missing essentials
- airport change
- date-line crossing
- cancelled flight
- road trip
- provider outage

### Automated checks
- TypeScript typecheck
- frontend JavaScript syntax check
- core + extended + Milestone 2 scenario suites
- in-memory D1 integration covering auth bridge, guest migration, session refresh, JSON/calendar export, support bundle, sharing/invites, and airport-change impact behavior
- remote smoke test that explicitly expects demo tools to return 404 while disabled

## Still intentionally disabled

```text
LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false
```

Do not enable account auth until a real provider adapter verifies Apple/Google tokens or email codes. Do not enable sharing until account auth is working end to end.

## Deployment

This package is cumulative. Copy it over the existing repository:

```bash
cp -R ~/Downloads/tripto-beta-milestone-2/. ~/triptoto/
cd ~/triptoto
npm install
npm run check:ui
npm run typecheck
npm run test:scenarios
npm run test:integration
```

No new D1 schema migration is introduced in Milestone 2. `0012_accounts_sharing.sql` from Milestone 1 remains the latest migration.

Deploy:

```bash
npx wrangler deploy
bash scripts/smoke-beta-milestone.sh
```

Expected final line:

```text
Beta Milestone 2 smoke test completed.
```

Then commit:

```bash
git add .
git commit -m "Add beta milestone 2 account sync sharing and backup hardening"
git push origin main
```
