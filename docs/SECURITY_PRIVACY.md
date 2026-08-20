# Security / Privacy baseline

- Authenticate, authorize object access, validate input, apply rate limits, then execute.
- R2 is private. No permanent public document URLs.
- Booking references, QR/barcodes, tickets, and confirmation numbers are sensitive.
- Do not store document contents, exact locations, hotel addresses, PNRs, or file names in analytics.
- Avoid requesting passports in V1 unless a future feature genuinely requires them.
- Contextual permissions only (notifications, location, files/photos).
- No unnecessary continuous location history.
- Account deletion must cover D1 data, R2 objects, sessions, shares, and pending jobs.
- Shared-trip role checks occur server-side.
