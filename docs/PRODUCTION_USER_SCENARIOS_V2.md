# tripto.to V2 Mandatory Production User Scenarios

Status: release-gate specification. Initial status is **NOT TESTED** until the implemented V2 candidate passes both automated checks and required real-browser QA.

## Release rule

All ten scenarios must be **PASS**. A single **FAIL** or **NOT TESTED** means V2 is not production-ready. Screenshots and unit tests are supporting evidence, not substitutes for critical-flow interaction in a real browser.

Use dedicated QA accounts, trips, sender addresses, and documents. Mark them as test data and isolate them from production metrics. Never use unrelated customer data.

## Required coverage

- iPhone Safari
- Android Chrome
- Desktop Chromium as a secondary environment
- Core viewports: 360×800, 390×844, 430×932

Scenarios 1, 3, 4, 6, 7, 9, and 10 require real-browser interaction on the production candidate. Device/browser results must be recorded separately.

## Scenario 1 — New user → sign in → first trip

**Purpose:** Prove that a new traveler can understand the product, create one stable account, create one trip, and reach Add Booking without duplication or dead ends.

**Starting state:** Dedicated Google QA identity never used with tripto.to; clean browser profile/storage; no trips.

**Exact user steps and expected results:**

1. Open tripto.to. **Expected:** Welcome renders without authenticated navigation, console errors, or horizontal overflow.
2. Open Take a Tour. **Expected:** Four ordered steps render; controls are reachable and focus is contained.
3. Close the Tour using close, backdrop where allowed, Escape on desktop, and browser Back in separate runs. **Expected:** Welcome returns, focus/scroll restore, no invisible overlay remains.
4. Choose Continue with Google. **Expected:** Google Identity Services starts identity-only authentication; no Gmail, Drive, or Calendar scope is requested.
5. Complete authentication. **Expected:** The verified Google `sub` resolves to exactly one internal user and a fresh account session; the transient authenticating state routes directly to Create Trip without a separate sign-in decision screen.
6. Return to tripto.to. **Expected:** Create Trip opens directly; Welcome/onboarding does not loop and no redundant no-trip screen appears.
7. Confirm Create Trip. **Expected:** Focused form is visible without bottom navigation.
8. Enter destination/name and one start/end date range. **Expected:** values are readable and preserved while moving between fields.
9. Submit. **Expected:** one trip is created, selected, and persisted; user continues directly to Add Booking.
10. Reload and use browser Back/Forward. **Expected:** the same account/trip returns exactly once and navigation remains coherent.

**Data that must be preserved:** Google provider subject, internal user ID, device link, session, trip ID, destination/name, start/end dates, creation audit event, and any pre-existing eligible guest data.

**Failure/recovery expectations:** Google cancel returns to Welcome without data mutation. Auth/network failure offers retry. Validation and save failure preserve form values. Repeated submit/refresh does not duplicate account or trip. Guest migration failure stops safely and does not partially reassign data.

**Mobile/browser coverage:** iPhone Safari, Android Chrome, desktop Chromium; 360×800, 390×844, 430×932; software-keyboard and date-range interaction on both mobile platforms.

**Automated tests where practical:** server token-verification contract; `(provider, provider_subject)` uniqueness; nonce/audience/issuer/expiry rejection; guest migration ID preservation; idempotent trip creation/double-submit guard; auth/no-trip routing; Tour focus trap and Back behavior; form draft preservation.

**Manual production QA:** Real Google authentication on the candidate origin; inspect requested scopes; create/reload trip; verify network calls and console; test Tour close paths and mobile keyboard/date picker.

**Status:** NOT TESTED

## Scenario 2 — Returning user login

**Purpose:** Prove that Google identity restores the same account and selects the relevant existing Timeline without replaying onboarding.

**Starting state:** Dedicated Google QA identity with one upcoming trip and known stable internal IDs; fresh browser session.

**Exact user steps and expected results:**

1. Open tripto.to. **Expected:** Welcome appears only when no valid session exists.
2. Sign in with the same Google identity. **Expected:** the existing `auth_identities` row resolves the same user.
3. Allow account/trips to load. **Expected:** no duplicate account, identity, device ownership, or trip is created.
4. Observe initial route. **Expected:** active trip opens; otherwise nearest upcoming trip opens.
5. Refresh. **Expected:** session remains valid or restores cleanly; the selected/relevant Timeline returns.
6. Close and reopen the browser. **Expected:** normal session policy applies without new-user onboarding.

**Data that must be preserved:** internal user and identity IDs, trip/booking IDs and versions, memberships, selected/relevant trip rules, documents, and pending sync state.

**Failure/recovery expectations:** Expired/revoked session leads to clear reauthentication. Identity conflict stops without account merge. API failure shows recovery rather than an empty account or blank app.

**Mobile/browser coverage:** iPhone Safari, Android Chrome, desktop Chromium; at least 390×844 plus platform-standard viewport.

**Automated tests where practical:** repeated Google login idempotency; provider-subject lookup; session refresh; active/upcoming/recent trip selection; new-user screen exclusion; failed account-load recovery.

**Manual production QA:** Sign in from a fresh profile, compare known IDs before/after, refresh/reopen, confirm relevant Timeline and absence of onboarding.

**Status:** NOT TESTED

## Scenario 3 — Add booking by upload

**Purpose:** Prove mobile file selection, deterministic extraction/review, integrity handling, and exactly-once Timeline creation.

**Starting state:** Authenticated QA user with an existing trip; supported representative flight/stay/train confirmation files containing no customer data.

**Exact user steps and expected results:**

1. Open the trip Timeline. **Expected:** correct trip context and three-item navigation.
2. Press +. **Expected:** exactly Add Booking and Create New Trip appear.
3. Choose Add Booking. **Expected:** Upload, Forward Email, and Add Manually appear.
4. Choose Upload Booking. **Expected:** mobile file chooser opens and supported types/limits are understandable.
5. Select a representative file. **Expected:** selection is retained while processing; document integrity rules run.
6. Process. **Expected:** deterministic candidates appear, or a clear review/manual fallback appears; uncertain values are not invented.
7. Correct any uncertain fields. **Expected:** edited values remain visible and validation identifies required data.
8. Confirm Add to Trip once, then test a repeated tap separately. **Expected:** one booking is materialized.
9. Return to Timeline and reload. **Expected:** booking remains in the correct chronological position and structured data persists.
10. Open the related document. **Expected:** the uploaded source remains accessible, links automatically to the created booking only when reliable, and is available only when the current storage/integrity state truthfully supports it. An uncertain source remains under Needs Attention and never disappears.

**Data that must be preserved:** selected file/draft until completion or explicit discard, checksum/integrity state, import fingerprint/candidate review, booking ID/type/times/timezones, source provenance, and booking-document association.

**Failure/recovery expectations:** Unsupported/corrupt/oversized files give actionable errors. Processing/network failure preserves recoverable input where platform constraints allow. Retry is idempotent. Local-only bytes are not claimed available on another device. No R2 dependency is implied while disabled.

**Mobile/browser coverage:** Real iPhone Safari and Android Chrome file pickers; desktop Chromium secondary; 360×800, 390×844, 430×932.

**Automated tests where practical:** type/size/integrity validation; parser ambiguity; duplicate fingerprint; double-submit; exactly-once materialization; chronological insertion; reload persistence; unavailable document state.

**Manual production QA:** Use real mobile file pickers and representative fixtures; interrupt/retry processing; inspect candidate correction, Timeline position, document opening, console, and failed assets.

**Status:** NOT TESTED

## Scenario 4 — Add booking by forwarded email

**Purpose:** Prove sender ownership, inbound authenticity, deterministic parsing, safe trip matching, duplicate protection, and recoverable review.

**Starting state:** Authenticated QA account with at least one trip and a verified forwarding sender; isolated representative email fixtures.

**Exact user steps and expected results:**

1. Forward a representative confirmation to `bookings@tripto.to`. **Expected:** inbound provider authenticity and message limits are checked.
2. Resolve the envelope sender. **Expected:** only a verified sender maps to the account.
3. Parse the confirmation. **Expected:** deterministic candidate/provenance is produced; ambiguous values remain unresolved.
4. Match eligible trips. **Expected:** a unique safe match associates the candidate; ambiguous matches ask “Which trip is this for?”
5. Open tripto.to. **Expected:** safe accepted data appears as “New booking added”; uncertain data appears as “1 booking needs your review.”
6. Review/confirm where required. **Expected:** one booking is materialized in the chosen Timeline; relevant attachments are associated when reliable and otherwise retained for linking. Current device-local storage limitations are stated honestly.
7. Forward the same message again. **Expected:** no duplicate booking is created.
8. Repeat with an unverified/spoofed sender. **Expected:** no silent account/trip injection occurs.

**Data that must be preserved:** verified sender identity, inbound authenticity result, minimal envelope/message metadata, normalized hash/fingerprint, candidate/recovery status, explicit trip choice, booking ID, and processing audit data. Raw sensitive content must not enter analytics/logs.

**Failure/recovery expectations:** Unknown sender, parser failure, ambiguous trip, and unavailable service remain quarantined/recoverable. No silent guess or data loss. Retry is idempotent. Privacy deletion covers retained inbound metadata.

**Mobile/browser coverage:** Open/review flow on iPhone Safari and Android Chrome; desktop Chromium secondary. Actual email sending/receipt must be exercised against the candidate inbound environment.

**Automated tests where practical:** inbound signature validation; sender normalization/verification; spoof rejection; duplicate fingerprint; ambiguous/no-match routing; parser locale/HTML/codeshare fixtures; log redaction; retry idempotency.

**Manual production QA:** Send real QA emails from verified and unverified senders; verify delivery, matching, review, duplicate handling, contextual indication, and absence of sensitive body content in logs/analytics.

**Status:** NOT TESTED

## Scenario 5 — Add booking manually

**Purpose:** Prove the three-choice Add Booking architecture and focused forms for representative booking types.

**Starting state:** Authenticated QA user viewing a selected trip.

**Exact user steps and expected results:**

1. Press +. **Expected:** Add Booking and Create New Trip only.
2. Choose Add Booking → Add Manually. **Expected:** understandable top-level category selector appears.
3. Add a Flight. **Expected:** only relevant flight fields appear; required local times/timezones are validated.
4. Add a Hotel/Stay. **Expected:** one date-range interaction captures check-in/out; relevant stay fields only.
5. Add a Restaurant or Activity/Event. **Expected:** relevant compact form and event-local date/time.
6. Cancel/back from a changed form. **Expected:** discard warning; trip remains unchanged unless confirmed.
7. Save each valid booking and reload. **Expected:** each appears once at the correct Timeline position.

**Data that must be preserved:** drafts until save/discard, IDs, type-specific values, event-local timezone/provenance, versions, traveler/document associations, and audit history.

**Failure/recovery expectations:** Validation focuses the first error and preserves values. Network failure retains draft. Repeated taps do not duplicate. Missing optional data stays absent. Back/cancel never corrupts the trip.

**Mobile/browser coverage:** iPhone Safari, Android Chrome, desktop Chromium; keyboard/date/time controls at 360×800, 390×844, 430×932.

**Automated tests where practical:** category/form routing; required-field validation; timezone/DST/overnight handling; date-range behavior; draft recovery; double-submit; cancel/discard; Timeline ordering.

**Manual production QA:** Create all three representative types on mobile, exercise native controls and keyboard, cancel/retry, reload, and inspect ordering/details.

**Status:** NOT TESTED

## Scenario 6 — Complete Timeline journey

**Purpose:** Prove Timeline is the complete chronological product across types, days, details, documents, directions, and browser history.

**Starting state:** QA trip with Flight, Transfer, Hotel, Restaurant, Train, and Activity/Event across multiple days, including overnight/date-changing items and known local timezones.

**Exact user steps and expected results:**

1. Open the trip. **Expected:** Timeline is primary; correct trip/date/contextual state appears.
2. Scroll from first to last event. **Expected:** rows remain compact, ordered, readable, and free of horizontal overflow.
3. Open every booking type. **Expected:** type-specific relevant facts/actions only; unavailable rows are omitted.
4. Return using UI Back and browser Back. **Expected:** same Timeline/trip and prior scroll position return.
5. Open each booking's available ticket/document, then open Trip → Tickets & Documents. **Expected:** booking-contextual access works, all expected trip files are findable in journey groups, and local/offline availability is truthful.
6. Use Directions and Show to Driver where real data supports them. **Expected:** correct destination/action; unsupported action is absent or explicitly disabled.
7. Inspect past/current/future and overnight boundaries. **Expected:** event-local chronology is correct and scheduled/stale semantics remain truthful.

**Data that must be preserved:** trip/item IDs, ordering keys, local timestamps/timezones, source/provenance, booking-document relationships, navigation/scroll context, and versions.

**Failure/recovery expectations:** Missing data never creates empty/fake rows. Failed external navigation leaves app recoverable. Back does not switch trips. Broken document yields explicit recovery, not a dead control.

**Mobile/browser coverage:** Real iPhone Safari and Android Chrome; desktop Chromium; all core viewports. Test device timezone change separately from event-local display.

**Automated tests where practical:** mixed-type sorting; overnight/date-line/DST/device-timezone cases; detail field omission; route preservation; document association; Back/scroll restoration; action availability contracts.

**Manual production QA:** Traverse every row/action in real browsers, verify local times against fixtures, inspect console/static assets, and record every dead/disabled control.

**Status:** NOT TESTED

## Scenario 7 — Multiple trips + create new trip

**Purpose:** Prove trip isolation, the two-choice + menu, selector behavior, and deterministic relevant-trip selection.

**Starting state:** QA account with a populated upcoming Rome trip.

**Exact user steps and expected results:**

1. Open Rome Timeline. **Expected:** Rome context and data only.
2. Press +. **Expected:** exactly Add Booking and Create New Trip.
3. Confirm Add Booking copy targets Rome. **Expected:** destination context is explicit.
4. Choose Create New Trip. **Expected:** focused Create Trip opens.
5. Create London and add one booking. **Expected:** distinct trip/booking IDs; London Timeline selected.
6. Open trip selector. **Expected:** Rome and London appear; past trips remain secondary.
7. Switch Rome → London → Rome and inspect each trip's Tickets & Documents. **Expected:** no item/document/traveler mixing.
8. Reload. **Expected:** active/nearest selection follows documented rules and retains data.
9. Complete one test trip. **Expected:** it remains accessible in Past Trips without replacing active/upcoming selection.

**Data that must be preserved:** both trip IDs, memberships, bookings, travelers, documents, versions, selected-trip preference, lifecycle state, and chronological data.

**Failure/recovery expectations:** Failed trip creation leaves Rome untouched and preserves form values. Stale selector data refreshes safely. Add Booking never writes to a trip other than the explicitly current/selected target.

**Mobile/browser coverage:** Real iPhone Safari and Android Chrome; desktop Chromium; 360×800, 390×844, 430×932.

**Automated tests where practical:** + menu contract; target-trip scoping; two-trip isolation; selector ordering; active/upcoming/recent selection; completed-trip placement; reload persistence; concurrency/version checks.

**Manual production QA:** Create/switch/reload on both mobile platforms; verify IDs/data via dedicated QA diagnostics; inspect selector and contextual copy.

**Status:** NOT TESTED

## Scenario 8 — Edit / cancel / delete safety

**Purpose:** Prove stable identity, optimistic-lock safety, lifecycle truth, and destructive-action confirmation.

**Starting state:** Populated QA trip with editable and cancellable representative bookings.

**Exact user steps and expected results:**

1. Open a booking and edit a safe field. **Expected:** relevant editor opens with current version.
2. Save and reload. **Expected:** same entity ID, incremented version, updated Timeline/detail.
3. Simulate concurrent edit/version conflict. **Expected:** newer server data is never silently overwritten; explicit recovery appears.
4. Cancel a booking. **Expected:** cancellation semantics/history are clear; booking is not treated as active.
5. Attempt document removal and booking remove/delete where allowed. **Expected:** consequence-specific confirmation appears; removing a document does not delete its booking, and booking removal does not silently destroy document history.
6. Double-tap save/delete in controlled QA. **Expected:** no duplicate operation or unintended entity removal.
7. Use Back/cancel from unsaved edits. **Expected:** discard warning and unchanged persisted data.

**Data that must be preserved:** stable entity IDs, prior/current versions, change events/history, cancellation state, trip association, documents, and conflict evidence.

**Failure/recovery expectations:** 409 conflict exposes current version and recovery. Failed save/delete preserves form and entity. Destructive actions require explicit confirmation and affect only the selected entity.

**Mobile/browser coverage:** iPhone Safari, Android Chrome, desktop Chromium; at least 390×844 plus a narrow 360×800 destructive dialog check.

**Automated tests where practical:** optimistic-lock conflict; stable IDs; cancel/lifecycle mapping; double-submit idempotency; delete scope/cascade safety; discard dialog; Timeline refresh.

**Manual production QA:** Two-session conflict test; edit/reload; cancel; inspect history; exercise all confirmation close/back paths and verify exact records with QA diagnostics.

**Status:** NOT TESTED

## Scenario 9 — Offline → reconnect

**Purpose:** Prove the offline-first promise, truthful availability, queued mutation behavior, conflict visibility, and safe reconnection.

**Starting state:** Populated QA trip opened online; required Timeline data cached; at least one document physically stored and integrity-verified locally; supported offline mutation identified.

**Exact user steps and expected results:**

1. Open trip online and verify Timeline/documents. **Expected:** cache is current and local document readiness is truthful.
2. Put device/browser offline. **Expected:** labeled Offline state appears; no fake connected/live state.
3. Reload/navigate Timeline. **Expected:** cached trip remains available and correctly scoped.
4. Open documents marked Available Offline and inspect a device-local/nonlocal document. **Expected:** verified offline bytes open; documents not locally available never claim offline readiness, and device-local originals are not described as account-synced.
5. Inspect next booking. **Expected:** scheduled/cached/stale provenance is explicit.
6. Make one supported offline mutation. **Expected:** pending local operation is visible and preserved.
7. Restore internet. **Expected:** reconnect fetches deltas and applies idempotent safe operations.
8. Exercise a conflicting server edit in a separate run. **Expected:** conflict remains visible and is not silently overwritten.
9. Reload. **Expected:** no duplicate booking/change and normal online operation resumes.

**Data that must be preserved:** cached Timeline, local verified bytes/checksum, pending operation UUID/base version/payload/status, sync cursor, conflicts, and stale timestamps/provenance.

**Failure/recovery expectations:** Provider/API outage preserves cache and pending work. Logout/local-data removal warns about unsynced changes. Reconnect retries without duplication. Unsupported offline edits are disabled with a reason.

**Mobile/browser coverage:** Real iPhone Safari and Android Chrome airplane/offline mode; desktop Chromium network emulation secondary; 360×800, 390×844, 430×932.

**Automated tests where practical:** cache population/read; document integrity; offline mutation queue; idempotent replay; delta ordering; same-field conflict; stale/unavailable labels; logout protection; service-worker upgrade.

**Manual production QA:** Real device online→airplane→reopen→edit→reconnect sequence, verified document opening, conflicting edit run, console/network inspection, and persistence after reload.

**Status:** NOT TESTED

## Scenario 10 — Account / failure / recovery

**Purpose:** Prove the product remains recoverable through identity, session, network, save/import, navigation, overlay, and destructive-account failures.

**Starting state:** Authenticated dedicated QA account with at least one populated trip and known recoverable drafts.

**Exact user steps and expected results:**

1. Sign out and sign back in. **Expected:** trips return under the same user; unsynced work warning appears when applicable.
2. Expire/revoke the session. **Expected:** clear reauthentication path; no blank app or silent local deletion.
3. Simulate temporary API/network failure. **Expected:** cached/recovery state and working Retry.
4. Fail a booking save and document open/upload/link in separate runs. **Expected:** entered values and source documents remain recoverable, retry does not duplicate, and every failed document task has a working recovery path.
5. Fail an email import. **Expected:** recoverable review/inbox state, no silent loss or wrong trip association.
6. Refresh during normal usage and a focused form in separate runs. **Expected:** normal state restores; meaningful draft is recovered where promised.
7. Exercise close/X/back/backdrop/Escape across every V2 sheet/dialog, including document linking/removal. **Expected:** intended dismissal, focus/scroll restoration, no invisible overlay, dead document button, or trap.
8. Navigate to account deletion and stop at final confirmation. **Expected:** consequences and scope are explicit; no deletion occurs before confirmation.
9. Cancel each failure/recovery path. **Expected:** user returns to a usable state.

**Data that must be preserved:** account/identity IDs, trips/bookings, drafts, pending sync operations, local documents, session recovery context, import recovery state, focus/scroll position where relevant, and deletion eligibility state.

**Failure/recovery expectations:** Retry performs the failed action safely. Session failure never creates a new account implicitly. Overlays always restore body scrolling. No accidental deletion. Support detail may expose request ID without sensitive data.

**Mobile/browser coverage:** Real iPhone Safari and Android Chrome for sign-out/recovery and sheets; desktop Chromium for Escape/focus/Back; all core viewports.

**Automated tests where practical:** session expiry/revocation; auth recovery; failed fetch/save/import draft retention; retry idempotency; focus trap/restoration; backdrop/Escape/browser Back; body scroll unlock; unsynced logout guard; delete confirmation contract.

**Manual production QA:** Exercise all failure modes against the candidate/controlled fault environment; inspect console, overlays, focus, scrolling, account/trip identity, and verify no destructive request before final confirmation.

**Status:** NOT TESTED

## Release summary

| # | Scenario | Automated | iPhone | Android | Production candidate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | New user → first trip | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 2 | Returning user login | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 3 | Add by upload | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 4 | Add by forwarded email | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 5 | Add manually | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 6 | Complete Timeline | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 7 | Multiple trips | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 8 | Edit/cancel/delete safety | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 9 | Offline → reconnect | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| 10 | Account/failure/recovery | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

**Release decision:** NOT READY — 0/10 scenarios have production evidence.

## Regression rule

Every P0/P1 defect found during these scenarios must be fixed at the underlying state/navigation/data boundary, receive an automated regression test where technically practical, and be rerun through the affected real-browser scenario. A visual symptom fix without state/data correction does not close the issue.

## Final release report contract

Before recommending release, report:

- 10/10 scenario status;
- automated validation;
- iPhone Safari and Android Chrome status;
- Google authentication;
- Upload Booking;
- `bookings@tripto.to`;
- Manual Add;
- Timeline;
- multiple trips;
- offline/reconnect;
- account recovery;
- remaining P0/P1 blockers;
- non-blocking P2/P3 issues.

Only recommend **RELEASE** when every mandatory scenario is PASS.
