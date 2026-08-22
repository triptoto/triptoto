# Security / Privacy baseline

## Smart Import and Google identity

- Smart Import never uploads raw documents, OCR text, archive contents or barcode evidence to the Worker.
- Upload fingerprints are SHA-256 values used for duplicate detection; filenames and reviewed structured fields are the only document metadata sent.
- PDF, OCR, ZIP and barcode processing use same-origin code and bounded input/file counts. No document HTML or DOCX markup is injected into the page.
- Google ID tokens are verified for RS256 signature, issuer, audience, expiry, subject, verified email and a one-time device-bound nonce.
- Google tokens and nonces are not logged or stored in browser persistence. JWKs are bounded and cached according to Google response lifetime.
- Google is unavailable unless both the account feature flag and client ID are configured. CSP permits only the GIS script/frame/connect origins and Google profile images.

- Authenticate, authorize object access, validate input, apply rate limits, then execute.
- R2 is private. No permanent public document URLs.
- Booking references, QR/barcodes, tickets, and confirmation numbers are sensitive.
- Do not store document contents, exact locations, hotel addresses, PNRs, or file names in analytics.
- Avoid requesting passports in V1 unless a future feature genuinely requires them.
- Contextual permissions only (notifications, location, files/photos).
- No unnecessary continuous location history.
- Account deletion must cover D1 data, R2 objects, sessions, shares, and pending jobs.
- Shared-trip role checks occur server-side.
