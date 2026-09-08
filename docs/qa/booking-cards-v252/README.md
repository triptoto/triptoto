# Unified booking cards v252

Booking summary cards now match the supporting detail card: white theme surface, 1px theme outline, 16px corners and 16px horizontal inset. The category icon uses the same 40px neutral tile as detail rows. Flight, hotel, train/ferry and all plan/transport variants share this treatment.

Horizontal separators are removed from action rows, document rows, the expanded Flight details panel and decorative route/time/stay tracks. Content, status labels, timing, documents and editing behavior are preserved. An attached hotel cover keeps its joined silhouette without a line across the image seam. Changes are scoped to booking details; global theme tokens and other page layouts are unchanged.

## Verification

- `npm run check:ui` passed, including regenerated shell assets, icon/import/search builds and existing UI, design-system and button-size contracts.
- Header navigation, viewport, booking notes and smart-import/auth contracts passed separately. The previous v251 Edit/Share menu remains functional.
- Local browser: 16 route variants × 320×740 / 390×844 / 430×932 = 48 final checks. Both cards have matching white surfaces, 1px outlines, 16px lower corners, 16px horizontal padding and aligned widths. No horizontal overflow, row separators or decorative horizontal tracks remained.
- Variants: flight, hotel, train, tasting, ferry, bus, car, taxi, transfer, class, restaurant, event, museum, idea, long title/confirmation/notes, hotel with cover image.
- Expanded Flight details remained visible and contained no separators; a linked document row and the note editor opened correctly. Cancelling the note editor preserved the details. Menu retained Edit, Share and its existing links/actions. Browser console had no errors.
- Initial transport fixture checks lacked the timeline entries required by plan routes. The local fixture was corrected and those 12 cases rerun successfully. Application routing was not changed.
- Fixtures are local only, injected by `scripts/design-audit/server.py` with `navigation-fixture.js` and `qaState=booking-cards`. No real travel data was created or altered.
- Cloudflare dry run passed with the verified production account. Cache namespace: `tripto-shell-product-v252-booking-cards`; shell query: `flat-design-system-v174`.

This release changes presentation only. The backend/D1 integration suite was not repeated. Public deployment and served-file verification are recorded separately in `release.json`.

## Publication

Application commit `a5b206f` is pushed to `fix/keyboard-header-20260907`; main was not merged. Worker `4509b7c8-7b28-4b8a-8f23-a3c6f3bc9336` serves 100% of traffic. All six checked public app files exactly match the release. `/health` and D1 are healthy and feature flags remain unchanged.

Published flight, hotel, train and activity screens were checked at 390×844 using isolated preview data on the production host. They use the matching white card surface, 1px outline and 16px corners with no internal dividers. The Flight details disclosure works. No browser errors or production data mutations occurred.
