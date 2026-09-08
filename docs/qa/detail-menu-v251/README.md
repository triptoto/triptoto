# Booking detail menu v251

Booking details now show one 68px header row: Back, title, Add and Menu. Edit and Share are inside the existing compact Menu, followed by Move to another day and Delete so the old management capabilities remain reachable. Edit opens the populated editor directly. The four global navigation links remain available below the booking actions.

Flight, hotel, train/ferry and plan detail renderers share the change. Legacy ideas retain their own edit/delete handlers. View-only members see Share without mutation actions. Forms retain their visible Save button. The All trips renderer is byte-for-byte unchanged.

Menu closes before native sharing or a deletion confirmation opens. Cancelling native sharing is handled without an error toast; other sharing errors still propagate. Clipboard fallback remains available.

## Verification

- Full `npm run validate:v2` passed: UI/build, typecheck, scenarios, local D1, import/auth, live-flight contracts, collaboration, collections, loading recovery, notes, viewport and header navigation.
- The expanded header-navigation contract passed after the full run. It exercises record targeting for flight, stay, train, ferry, bus, class and idea; direct Edit; native Share/cancellation/clipboard fallback; Delete confirmation handoff; view-only guards; and existing dirty-form/focus behavior. No application changes followed the full run.
- Real local browser: 5 detail routes at 320×740, 390×844 and 430×932, 15 geometry/menu checks. Each header is 68px, each header control 44×44px, menu rows 48px, no extra action row, horizontal overflow or row dividers. Menu height is 488px.
- Browser interaction: Menu → Edit opens the correct prefilled Wine tasting editor; Back restores the detail; Move to another day opens the date selector; Delete → Keep booking leaves the booking intact.
- View-only browser menu exposes Share and four navigation links. Account has only the four links. At 390×350 the menu stays within the viewport and its contents scroll (279px visible, 424px content).
- Browser console: no errors. Native sharing was tested with the real handler and mocked browser APIs; no messages were sent. A physical iPhone share sheet was not exercised.
- Cloudflare dry run passed with the production account. Cache namespace is `tripto-shell-product-v251-detail-menu`; shell asset query is `flat-design-system-v173`.

Production deployment and public verification are recorded separately in `release.json`.

## Publication

Application commit `2ab9d18` is pushed to `fix/keyboard-header-20260907` without a main merge. Worker `5fa27827-544c-4aee-a2ae-8a1079ef48de` serves 100% of traffic. All six checked public assets match the local release. `/health` and D1 are healthy, with feature flags unchanged.

The public browser loaded `flat-design-system-v173`. Normal-mode Trips retained its protected header. Detail Menu and direct Edit were verified using isolated preview data on the production host because the available signed-in trip contained no bookings. No production records were changed.
