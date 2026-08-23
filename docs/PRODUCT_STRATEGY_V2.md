# tripto.to Product Strategy V2

Status: strategy baseline for prototype review. This document does not authorize production deployment.

## Product vision

tripto.to is the calm, chronological home for a real trip. A traveler creates a trip, adds or forwards bookings, and sees everything in one Timeline. The product quietly evaluates the underlying data and surfaces only what matters next.

The backend may remain sophisticated. The traveler experience must not require knowledge of Trip Brain, Impact Engine, sync queues, confidence models, checklists, or document subsystems.

## Core product promise

> Create your trip. Add your bookings. Everything appears in one Timeline, and tripto.to tells you what matters next.

The first successful journey is:

`Welcome → Sign in → Create Trip → Add Booking → Timeline`

The repeat-use loop is:

`Trip Timeline ↔ + ↔ Account`

## Primary traveler

The primary traveler is an independent leisure traveler managing one or more real trips from a phone. They may be in an airport, on a street, in another timezone, or temporarily offline. They need fast answers, not a travel dashboard.

Primary jobs:

- collect bookings without learning a data model;
- understand the order of the trip at a glance;
- know the next relevant action;
- open the right ticket, confirmation, or directions quickly;
- recover safely when data is incomplete, stale, conflicted, or offline.

Secondary personas are a family organizer and a frequent traveler managing several upcoming trips. Both use the same core Timeline; additional travelers and trips add scope, not a different product model.

## Product principles

1. Timeline is the product, not a destination behind Home.
2. One primary action per state.
3. Show results, not internal engines.
4. Never invent travel facts or imply scheduled data is live.
5. Progressive disclosure: compact rows first, relevant detail on demand.
6. Preserve work across offline, authentication, retries, and conflicts.
7. Every visible control works, is explicitly disabled with a reason, or is absent.
8. Existing trip and booking identifiers remain stable.

## Full user journey

### First visit

1. The unauthenticated traveler sees Welcome, never the application dashboard.
2. They choose Continue with Google or Take a Tour.
3. Continue with Google enters a transient authenticating state; there is no separate sign-in decision screen. Identity only is requested; Gmail, Drive, and Calendar permissions are not requested.
4. If the browser already contains guest trips, the verified account adopts them through the existing migration boundary without changing IDs.
5. A traveler with no trips sees one action: Create Trip.
6. Trip creation asks for destination and date range, with an optional trip name.
7. Success continues directly to Add Booking.
8. The first accepted booking appears in the Timeline.

### Returning visit

1. A valid account session opens the relevant Timeline directly.
2. The app selects an active trip, otherwise the nearest upcoming trip, otherwise the most relevant recent trip.
3. The Timeline emphasizes the next meaningful event or the highest-priority issue.
4. The traveler uses + to add a booking or create another trip.

### Offline return

- A previously authenticated device may reopen locally cached eligible trip data.
- The product says Offline in plain language and preserves provenance/staleness labels.
- Account sign-in cannot start offline.
- Unsynced changes stay visible and survive logout/recovery decisions.

## Welcome

Welcome is a navless, premium, mobile-first screen with three responsibilities only:

- explain the product in one short promise;
- provide Continue with Google as the primary action;
- provide Take a Tour as a quiet secondary action.

It must not contain a feature grid, app dashboard, fake trip facts, or a guest-session shortcut. Privacy and Terms may appear as low-emphasis footer links.

## Take a Tour

The tour explains the workflow, not a feature catalogue:

1. **Create your trip** — tell tripto.to where and when you are traveling.
2. **Add your bookings** — upload a confirmation, forward an email, or add it manually.
3. **Everything becomes one Timeline** — bookings appear in chronological order.
4. **Know what matters next** — tripto.to surfaces the next relevant action before and during travel.

The final action is Start planning. The tour is available before sign-in and later from Account → Help. It does not create or persist example travel data.

## Authentication

### V2 decision

Google Identity Services is the first provider. The UI and server adapter remain provider-neutral so Apple or email-code authentication can be added later. Password authentication is not part of V2.

### Security rules

- Verify the Google ID token server-side against signature, issuer, audience, expiry, and nonce.
- Use `provider = google` and the verified Google `sub` as `provider_subject`.
- Email is profile/contact data, never the stable identity key.
- Request only `openid`, `email`, and `profile` identity scopes.
- Use short-lived sign-in state/nonce protections and the existing signed application session.
- Do not expose a route that trusts browser-submitted identity claims.
- Keep `ACCOUNT_AUTH_ENABLED=false` until credentials, origin restrictions, tests, and rollback are ready in an isolated environment.

### Guest migration

After identity verification, use the existing verified-auth bridge and guest-to-account migration. Preserve trip IDs, booking IDs, traveler assignments, import ownership, pending sync operations, and device continuity. If the device is already linked to another user, stop with explicit recovery instead of merging accounts silently.

## No-trip entry

After authentication, an account with no trips opens **Create Trip** directly. There is no intermediate “Ready for your next trip?” screen, empty dashboard, healthy-trip message, Timeline chrome, or invented destination.

## Create Trip

The creation flow asks only:

- Where are you going? (required)
- Start and end date through one mobile date-range interaction (required unless a deliberate “dates not set” legacy path is retained for imported records)
- Optional trip name customization

There are no advanced settings. Validation preserves entered values. Meaningful unsaved changes require discard confirmation. On success the app opens Add Booking for the newly created trip.

Legacy trips with missing dates continue to load and show Dates not set; V2 does not backfill or invent dates.

## Add Booking

Add Booking always begins with exactly three choices:

1. **Upload Booking** — select a ticket, confirmation, or reservation file.
2. **Forward Confirmation Email** — forward to `bookings@tripto.to` from a verified sender.
3. **Add Manually** — choose a booking type and complete a focused form.

The + menu does not jump directly into booking categories. Its first choice is Add Booking for the current trip or Create New Trip.

## Manual booking taxonomy

Top-level categories:

- Flight
- Hotel / Stay
- Train
- Car Rental
- Transfer
- Cruise
- Ferry
- Restaurant
- Activity / Event
- Other

Activity / Event may progressively disclose Tour, Concert, Theatre, Museum, Attraction, Sports, Meeting, Show, and Other. Search may help once the list grows, but the first view must not show dozens of types. Each category uses a specific compact form rather than a universal data form.

## Timeline

Timeline is the default authenticated trip screen. The header contains the selected trip name/destination, date range, and at most one contextual phrase such as “6 days to go” or “Day 3 of 7.” The trip name opens the trip selector.

Collapsed booking rows show only the information required to identify and act on the item:

- type icon;
- essential title or route;
- local date/time;
- one meaningful status or exception when necessary.

Rows do not expose empty database fields. Tapping a row opens a type-specific detail view with relevant actions and contextual documents.

## Contextual trip states

### Before trip

The Timeline may lead with **Before you go** and the single highest-priority action. If additional issues exist, show “2 more things to check” rather than five equal alerts.

Priority is strict and shared by every Timeline consumer: **urgent/critical disruption → NEXT/current during-trip action → time-sensitive preparation → general preparation → informational context**. Exactly one primary contextual surface is shown. First-booking success returns straight to Timeline with a small contextual confirmation.

Examples:

- Boarding pass not saved
- Hotel confirmation missing
- Booking needs review

### Day before

Lead with tomorrow's first meaningful event, its event-local time, and a ticket/confirmation readiness result. Scheduled data remains labeled as scheduled.

### During trip

Lead with **NEXT** and the immediate journey action, such as Open Ticket or Directions. The Timeline remains available directly below it.

### Completed trip

Show **Trip completed** and retain the Timeline as history. Editing becomes secondary. The completed trip moves out of the default upcoming selector but remains available in Past Trips.

## Multiple trips

The Timeline header is the trip selector. Order:

1. active trip;
2. upcoming trips by start time;
3. create-new action;
4. Past Trips entry.

Automatic initial selection uses active, nearest upcoming, then relevant recent state. The selection is persisted per account/device but never prevents switching.

## Primary navigation

Only three concepts are primary:

- **Trip** — current trip Timeline;
- **+** — Add Booking or Create New Trip;
- **Account** — identity, trips, forwarding email, help, privacy, and sign out.

The existing Home / Trip / Add / Bookings / Account bar is not the V2 mental model.

## Account

Account is a short grouped list:

- Profile: name and verified identity.
- Trip History: past and cancelled. Active/upcoming switching belongs only to the trip selector.
- Booking Email: forwarding address and verified sender emails.
- Notifications: major traveler-facing preferences only.
- Help: Take the Tour, support, privacy, terms.
- Account: sign out and delete account.

Logout or local-data removal must warn when unsynced work exists. Delete Account remains an explicit destructive confirmation.

## Needs Attention

Needs Attention is the single user-facing aggregation layer over existing deterministic systems. It can consume Trip Brain, Impact Engine, checklist, offline-readiness, import-confidence, and conflict results without naming those systems.

Priority order is safety/time-critical, action deadline, data integrity, recovery, then preparation. At most one issue dominates the Timeline. Remaining issues are summarized and progressively disclosed.

## Tickets & Documents product model

Timeline remains the product. Tickets and documents strengthen it; they do not become a separate primary destination. The primary path follows the traveler's mental model: open the Flight for a boarding pass or e-ticket, the Hotel for a confirmation or voucher, and the Train or Activity for its ticket. Booking Detail shows **Tickets & Documents** only when files exist or their absence is itself an actionable problem.

A second, clearly labeled **Tickets & Documents** action in the current Trip header opens every file for that trip. It groups files by booking in journey order—not folders, MIME types, or internal taxonomies—and keeps past-trip files with the relevant Past Trip. Documents never appear as a bottom-navigation tab or an Account-first destination.

### Association and recovery

- Upload and forwarded-email flows automatically link source documents when the booking relationship is reliable.
- Low-confidence association never guesses. The original is retained under **Needs Attention** with **Link to Booking**.
- Manual linking presents human booking names plus **Other / Keep unlinked**; it never exposes entity IDs.
- Multiple documents per booking are supported, including traveler-specific boarding passes and shared booking documents.
- The representable types include boarding passes, e-tickets, hotel confirmations/vouchers, train/cruise/ferry/activity/concert/theatre tickets, car/transfer/restaurant confirmations, tour vouchers, QR/barcode tickets, and other travel documents. Only contextually present types appear in the interface.

### Storage and availability truth

Structured booking data may sync through the account/D1 architecture while original files remain local to one device. The interface therefore distinguishes **Available offline**, **Available on this device**, **Stored on this device**, and **Not available offline**. It never claims **Backed up**, **Synced to your account**, or **Available on all devices** unless private cloud storage actually exists. The underlying readiness engine remains internal; the traveler sees the result on the relevant document.

R2 remains disabled in this milestone. The information architecture allows a future private cloud original plus verified offline cache without moving documents or changing the traveler's mental model.

### Ownership and deletion safety

- Removing a document never deletes its booking.
- Removing or cancelling a booking does not silently destroy associated document history; the consequence must be explicit and recoverable where the storage model permits.
- Destructive document actions identify exactly what is removed and require confirmation.
- Failed open, upload, link, or remove actions keep the user in a recoverable state with no dead controls.
- Current-trip documents never mix across trips or enter analytics as normal user activity when created by QA.

Verified local bytes and checksum remain required before an item is described as available offline. Missing, stale, and unverified states remain explicit.

## Forwarding email

The public address is `bookings@tripto.to`. Account ownership is resolved from a verified envelope sender, not display-name text or a user-visible unique address. The inbound adapter stores the minimum metadata required, applies rate/size limits, scans attachments, and passes normalized content to the existing deterministic importer.

Trip matching uses verified sender + booking dates/destination + the user's eligible trips. A high-confidence unique match may be proposed; uncertainty always asks “Which trip is this for?” Candidate data is reviewed before materialization when confidence or required values are incomplete. Duplicate detection remains deterministic.

Verified sender management lives in Account. Adding a sender requires a verification challenge. Unknown or spoofed senders never attach data to an account.

## Legacy feature mapping

| Existing concept | V2 destination |
| --- | --- |
| Home / What's Next | Removed as a primary screen; result appears at top of Timeline |
| Trips | Timeline selector for active/upcoming + Account → Trip History for past/cancelled |
| Bookings | Chronological Timeline |
| Trip Health | Contextual Needs Attention result |
| Ready Offline | Contextual “saved/missing on this phone” message |
| Smart Essentials | Before you go actions |
| Documents | Contextual booking documents + secondary archive |
| Import history | Recovery/history within Add Booking or Account, not primary nav |
| Sync status | Plain Offline/Syncing/Needs review recovery state only when relevant |
| Confidence diagnostics | “Booking needs review” with explicit uncertain fields |
| Sharing | Remains disabled and outside V2 primary UX until separately approved |
| Demo/Ops tools | Never traveler-facing; remain disabled |

## Features removed from primary UX

- standalone dashboard Home;
- five-tab navigation;
- standalone Trip Health, Ready Offline, and Documents destinations;
- technical engine names;
- equal-weight alert lists;
- booking-type dashboards;
- import/sync diagnostics in ordinary traveler views;
- public guest mode as the default V2 entrance.

## Success criteria

- A new traveler can explain the product after one screen.
- Sign-in → first Timeline requires no unnecessary navigation.
- The user can add a booking through upload, forwarding, or manual entry.
- The current trip and next meaningful action are understandable within seconds.
- Existing data loads without destructive migration.
- Offline, stale, scheduled, missing, and uncertain states remain truthful.
- No visible interaction is dead.

## Implementation phases

### Phase A — strategy and prototype

Lock the strategy documents, use the approved visual direction, build the complete core and document prototype, and review a single contact sheet. No production routing changes.

### Phase B — account foundation

Implement and test the Google Identity Services adapter, nonce/state verification, account session issuance, guest-data adoption, logout recovery, and account-disabled rollback. Deploy only to an isolated preview environment first.

### Phase C — entry and first-trip journey

Implement Welcome, Tour, direct zero-trip routing to Create Trip, and the automatic handoff to Add Booking behind a V2 feature flag.

### Phase D — Add Booking architecture

Unify entry around Upload, Forward Email, and Add Manually. Preserve deterministic parsing, duplicate protection, review-before-materialization, local document integrity, and existing type-specific APIs.

### Phase E — Timeline as primary experience

Introduce the V2 Timeline shell, compact booking rows, booking details, contextual documents, trip selector, and Trip / + / Account navigation. Keep the old UI as a fallback during parity validation.

### Phase F — contextual guidance

Map existing deterministic outputs into Before you go, NEXT, and Needs Attention. Validate prioritization, local timezones, stale/unavailable labels, connection rules, and offline correctness.

### Phase G — account and multiple trips

Complete Past and Cancelled Trip History, verified sender management, Help/Tour, sign out, deletion, and unsynced-work safeguards. Active and upcoming switching remains exclusively in the Timeline selector.

### Phase H — inbound forwarding

Connect Cloudflare Email Routing/Email Worker or an equivalent inbound adapter to `bookings@tripto.to`, with verified sender ownership, quarantine, attachment safety, trip matching, and recovery.

### Phase I — migration and cleanup

Run old→new parity checks, progressively enable V2, monitor failures, retain rollback, and remove legacy primary screens only after their replacements are complete.

### Phase J — ten-scenario candidate validation

Run all ten mandatory production scenarios against an isolated preview candidate. Require separate automated, iPhone Safari, Android Chrome, and deployed-candidate evidence. Fix P0/P1 defects at the state/data boundary and rerun affected scenarios.

### Phase K — controlled launch and hardening

Enable V2 progressively behind rollback-ready flags only after 10/10 PASS. Monitor authentication, import, offline/reconnect, document recovery, and trip-isolation failures while retaining the V1 fallback until parity is proven.

## Backend work required

The existing D1 identity and migration foundation is reusable. V2 still requires:

- a server-side Google token verification adapter and public login endpoint;
- Google client/audience configuration, nonce/state protection, origin restrictions, and session tests;
- account-aware startup routing and safe sign-out/recovery behavior;
- an upload intake path that connects verified local files to the deterministic import/review pipeline without enabling R2 by accident;
- an inbound email adapter, verified-sender management, quarantine/recovery, and trip-matching orchestration;
- a V2 release flag and isolated preview environment before production enablement;
- new product analytics names or mappings that exclude QA traffic and avoid exposing internal engine concepts.

No generative AI, Gmail mailbox permission, live-flight provider, public sharing, demo tools, ops UI, or paid mandatory service is required.

## Migration expectations

No destructive migration is justified for the UX reset. Existing migrations must remain immutable.

Google login can use the current `users`, `auth_identities`, `devices`, `trip_members`, and `identity_events` tables. An additive migration is likely for inbound forwarding, including verified sender addresses, verification challenges, inbound message envelopes, quarantine/match state, and indexes for normalized sender/status. Raw message retention should be minimized and explicitly time-bounded.

If OAuth nonce/replay state cannot be safely held in a signed short-lived cookie, use an additive single-purpose table with expiry and one-time consumption. Do not add it speculatively before the chosen auth flow is implemented.

## Major risks

- A hard auth wall could hide previously cached guest travel data during an outage; recovery must remain available.
- Incorrect guest-to-account linking could expose or strand trips; stable provider subject and device ownership checks are mandatory.
- Sender-address spoofing could attach inbound mail to the wrong account; verified envelope sender and provider authenticity checks are mandatory.
- Automatic trip matching could silently misfile a booking; ambiguous matches must ask the traveler.
- Upload support without R2 requires a clear local/document lifecycle; a UI promise must not exceed actual byte availability.
- Reframing several deterministic engines into one Needs Attention result can create priority drift; mappings need contract tests.
- Replacing five-tab navigation may strand advanced recovery features; the old→new map must remain until parity is proven. Product V2 parity has since retired the legacy visual fallback.
- Service-worker cache drift can expose mixed V1/V2 shells; V2 needs isolated cache/versioning and upgrade tests.
- Authentication and forwarding introduce abuse, quota, privacy, and deletion obligations not present in a purely guest UI.

## Recommended challenge to the brief

The product should require authentication before creating new V2 data, as specified, but previously cached guest trips should remain readable on their original device during a temporary auth outage. Forcing a hard login wall over already available offline travel data would violate the product's safety and offline promise. The Welcome/auth layer should therefore gate new cloud use while an explicit recovery path protects previously cached trips.
