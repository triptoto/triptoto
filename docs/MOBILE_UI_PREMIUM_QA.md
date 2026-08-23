# Premium Mobile UI QA

## Required validation

Run `npm install`, `npm run check:ui`, and `npm run validate:candidate`. Confirm `/` and `/?preview=1` load without browser-console errors after service-worker activation. `/legacy.html` must resolve to the Product V2 SPA rather than an obsolete theme.

Inspect at 390×844: Home, Timeline, Flight Detail collapsed and expanded, Hotel Detail, Ready Offline, Add to Trip, Add Document, Show to Driver, Offline Home, loading, empty-trip, and recovery. Also inspect Home at 360×800, 375×812, 393×852, and 430×932.

Check no horizontal overflow, clipped important text, bottom-navigation overlap, focus loss after sheet dismissal, or broken browser Back behavior. Keyboard QA must cover visible focus, sheet Tab wrapping, Escape dismissal, native `details` disclosure, and focus restoration. Reduced-motion QA must confirm that slides, scale feedback, shimmer, and loading rotation are removed without hiding content.

Local screenshot-only state URLs are guarded by both preview mode and a localhost hostname:

- `/?preview=1&qaState=offline#home`
- `/?preview=1&qaState=loading#home`
- `/?preview=1&qaState=empty#home`
- `/?preview=1&qaState=error#home`

These controls are unavailable on production hosts and do not call backend APIs.

## Known limitations

- Live-flight integration remains disabled; operational status, delays, and gate updates are unavailable and labeled as scheduled data.
- R2 documents remain disabled. Documents are device-local and open only after checksum verification.
- Checklist creation and traveler editing use native Product V2 forms. Broader existing-booking editing remains progressively disclosed by the active detail screens.
- Property images render only when existing data supplies a local or embedded image; otherwise the bundled SVG remains the fallback.
