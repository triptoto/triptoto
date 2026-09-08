# All trips header navigation — v249

The `/trips` inventory no longer renders the bottom navigation. Account is available through a 44×44px icon button on the left of the centered Trips header; Create trip stays on the right. Both use the existing header control and icon system. The shared flex layout gives the recovered space to the scrolling trip list without adding a replacement spacer.

The change is scoped to All your trips. Account and an opened trip retain their existing bottom navigation. Data, filters, trip creation and routing handlers are unchanged. The two existing UI/design contracts now enforce the requested navigation arrangement instead of requiring a bottom bar on Trips.

## Verification

- `npm run check:ui`, `node tests/smart-import-auth.contract.mjs` and `node tests/app-viewport.contract.mjs`: passed. Output is in `validation.log`.
- Local browser checks at actual 320×740, 390×844 and 430×932 viewports: no bottom navigation on `/trips`, no horizontal overflow, and the scrolling main reaches the viewport bottom. Header height is 68px; Account/Create targets are 44×44px. The title remained centered, including at 320px.
- Account from the header and Back to Trips: passed with a populated list and an empty list.
- Create trip from the header opens `/trips/new`; Back returns to Trips: passed without creating test data.
- Current filter with no matches and Show all trips: passed. Opening Rome from the populated list restored its normal timeline/bottom navigation.
- Empty list: Account, header Create trip and the existing first-trip CTA remain available.
- No local browser console errors observed. These are browser viewport checks, not physical iPhone testing.

The loopback-only fixture adds `qaState=trips-empty`; no fixture data is bundled into production. Cache is `tripto-shell-product-v249-trips-header`, and both generated asset URLs use `flat-design-system-v171`. Publication and live checks are recorded separately in `release.json`.
