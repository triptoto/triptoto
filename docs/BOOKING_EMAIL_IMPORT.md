# Deterministic booking-email import

Milestone 3 added a rules-based booking-email import path without generative AI.
The forwarding pipeline (`go@tripto.to`) hardening described below builds on it.

## Two entry points, one deterministic parser

1. **Paste / preview** (`/api/v1/trips/:id/imports/forwarded-email/preview`) — the user
   pastes plain text; candidates are previewed and only materialize after review.
2. **Inbound forwarding** (Cloudflare Email Routing → Worker `email()` →
   `receiveBookingEmail`) — a real email sent to `go@tripto.to` is parsed into a
   review package and shown in the signed-in user's Email Inbox.

Both call the same deterministic `parseForwardedEmail` importer. No generative AI, no
timezone guessing, no high-impact action from uncertain data.

## Inbound forwarding pipeline (`apps/worker/src/inbound-email.ts`)

1. Recipient gate: only `go@tripto.to` / the routing destination are accepted; anything
   else is `setReject`ed.
2. Raw payload read with a bounded reader (`MAX_BYTES = 5 MB`, raised from the old 512 KB
   that rejected realistic confirmations). Oversize input is rejected, not truncated blind.
3. **Safe MIME parse** (`packages/importer/src/mime.ts`): the raw RFC822/MIME is never
   treated as plain text. It extracts Subject / From / Message-ID, a clean text body
   (`text/plain` preferred, sanitized `text/html` fallback), and attachment **metadata
   only**. Handles multipart/alternative, multipart/mixed/related, `message/rfc822`,
   quoted-printable (UTF-8 correct), base64, and RFC2047 encoded words. HTML is reduced to
   text — scripts/styles stripped, **nothing executed and no remote resource fetched**.
   Extracted text is length-bounded (`MAX_TEXT_CHARS = 256 KB`) so inline images / huge
   attachments can never block or blow up text parsing. Attachment bytes never enter the
   text stream or storage.
4. Content fingerprint = `sender + Message-ID + normalized text` (SHA-256, UNIQUE).
   Forwarding the same email twice is idempotent: no second import, no duplicate booking.
5. **Verified-sender gate**: unverified senders are bounced at SMTP (`setReject`), a
   recoverable "verify this address" signal — never a silent disappearance. Verification is
   never weakened.
6. **Deterministic trip matching** (`scoreTripMatch`): scores every eligible trip on
   booking dates vs trip start/end, destination IATA codes, place/property names, and
   locations already on the trip. A booking is associated only to a clear winner (strong
   score AND a decisive margin over the runner-up). A single eligible trip is attached.
   A genuinely ambiguous result is parked as `needs_trip` and surfaced for the user to
   choose — never guessed onto the wrong trip and never used to create a draft trip.
7. **Review-first behavior**:
   - every recognized candidate is persisted with `source_type='forwarded_email'`;
   - a clear trip match opens the normal import review for that trip;
   - an ambiguous or unmatched email appears in Email Inbox with **Choose trip**;
   - no trip item reaches Timeline until the traveler confirms the extracted candidate;
   - unsupported content remains visible with a recovery explanation.
   Nothing silently fails and no travel data is invented.

## Supported candidates (expanded)

flight, stay/hotel, train, car rental, transfer, cruise (filed as the closest allowed
transport type, `ferry`, with the original type preserved for provenance), ferry,
restaurant, activity/event, and a generic reservation fallback. Stray keywords without a
confirmation, date, or route never fabricate a booking.

## User-facing status vocabulary

Pending email work is exposed account-wide via `GET /api/v1/booking-emails`; assignment and
dismissal use the corresponding account-scoped endpoints. Per-trip import review continues
through the existing import APIs. The UI shows **Needs trip**, **Ready to review**, or a
calm unsupported/recovery state without exposing internal status names.

## Duplicate safety

Paste path: fingerprint = trip ID + sender + subject + normalized text. Inbound path:
fingerprint = sender + Message-ID + normalized text (UNIQUE column). Either way, repeating
the same booking returns/needs nothing new instead of duplicating trip entities.

## Data model

Migration `0021_inbound_email_status_expansion.sql` expands the
`inbound_booking_emails.status` CHECK to add `received, processing, added, needs_review,
couldnt_read` while retaining every original value (lossless table rebuild; no data reset).
Depends on `0017` (`verified_sender_emails`, `inbound_booking_emails`).

## Tests

- `tests/scenarios/import.scenarios.ts` — every booking type + stray-keyword and
  locale-ambiguity safety.
- `tests/scenarios/inbound-email.scenarios.ts` — MIME safety: plain-text passthrough,
  header extraction, multipart/alternative, sanitized HTML (no execution/fetch),
  quoted-printable, base64, attachment-metadata-only, forwarded `message/rfc822`, bounded
  huge-attachment handling, end-to-end import.
- `tests/integration/local-d1.integration.mjs` — drives the real `email()` handler:
  unknown-recipient reject, unverified-sender bounce, recognized hotel/flight review
  packages, idempotent re-forward, ambiguous multi-trip assignment, and explicit proof
  that no booking is materialized before user confirmation.

## Quotas

- max forwarded-email text (paste path): 80,000 characters;
- max inbound raw payload: 5 MB; max extracted text handed to the parser: 256 KB;
- max 20 booking-email previews per trip per rolling 24 hours.
