# Security / Privacy baseline

## Smart Import and Google identity

- Smart Import never uploads raw documents, OCR text, archive contents or barcode evidence to the Worker.
- Upload fingerprints are SHA-256 values used for duplicate detection; filenames and reviewed structured fields are the only document metadata sent.
- PDF, OCR, ZIP and barcode processing use same-origin code and bounded input/file counts. No document HTML or DOCX markup is injected into the page.
- Google ID tokens are verified for RS256 signature, issuer, audience, expiry, subject, verified email and a one-time device-bound nonce.
- Google tokens and nonces are not logged or stored in browser persistence. JWKs are bounded and cached according to Google response lifetime.
- Google is unavailable unless both the account feature flag and client ID are configured. CSP permits only the GIS script/frame/connect origins and Google profile images.

## Collaboration / trip sharing

- Collaboration is free for every signed-in account. There is no Pro tier, paywall, entitlement, or upgrade check anywhere in the sharing path. `SHARING_ENABLED` is an operational kill-switch (503 `SHARING_DISABLED` when off), never a paid gate.
- Roles are owner / editor / viewer. Only editor and viewer are ever assignable; `'owner'` can never be granted through an invite or a role change (`const roles = ['editor','viewer']`, DB `CHECK(role IN ('editor','viewer'))`, and `OWNER_ROLE_FIXED`).
- The server never trusts a role supplied by the client. Every mutation re-derives the caller's role from D1; an accepted member's role is copied from the stored invite row, not from the request body.
- Invite tokens are 32 bytes of `crypto.getRandomValues`, stored only as a SHA-256 hash (`token_hash` UNIQUE). The plaintext token is never persisted, logged, or sent to analytics. Lookups hash the incoming token before querying.
- Invites are time-limited (1–30 days), revocable, and one-time: acceptance is an atomic guarded update (`status='invited' AND expires_at>?`) with a post-write owner-of-race re-check.
- Email-restricted invites are validated only against the accepting user's own verified identities. Invite creation never probes whether an arbitrary email has an account, so account existence is not disclosed.
- Trip deletion and cancel are owner-only; editors and viewers get 403 `OWNER_REQUIRED`. Viewers are read-only for all writes (403 `FORBIDDEN`). The owner cannot leave or be removed without an explicit ownership transfer, which never leaves a trip ownerless.

- Authenticate, authorize object access, validate input, apply rate limits, then execute.
- R2 is private. No permanent public document URLs.
- Booking references, QR/barcodes, tickets, and confirmation numbers are sensitive.
- Do not store document contents, exact locations, hotel addresses, PNRs, or file names in analytics.
- Avoid requesting passports in V1 unless a future feature genuinely requires them.
- Contextual permissions only (notifications, location, files/photos).
- No unnecessary continuous location history.
- Account deletion must cover D1 data, R2 objects, sessions, shares, and pending jobs.
- Shared-trip role checks occur server-side.
