# Neighborhood header menu v253

Neighborhood detail pages now keep a single header row with Back, the page title, Add place and Menu. The separate Edit/Delete row is removed. Menu starts with Edit Neighborhood, followed by the four existing navigation links. Delete is not added to this menu.

The edit action resolves the displayed collection, closes the menu, and opens its populated form. Owners and editors can edit; viewers and missing/error states receive no edit action. The existing collection timeline, Add place flow and deletion handlers elsewhere are preserved.

## Verification

- `npm run check:ui` passed, rebuilding the minified assets and running UI, design-system, input/button sizing, currency, checklist, timezone and places contracts.
- Header navigation, collections, detail loading, app viewport and smart-import/auth contracts passed. Navigation coverage includes canonical and alias IDs, owner/editor/viewer permissions, missing/error/auth-handoff states, direct Edit routing and menu dismissal.
- Local browser at 320×740, 390×844 and 430×932: header 68px high; all three icon buttons 44×44px; no second action row, Delete action or horizontal overflow. Only the timeline retains vertical scrolling.
- At all three widths the compact menu is 332px high, with one 48px Edit Neighborhood row and the four original links.
- Edit opened the selected plan with its title, city, time and notes populated. Back returned to that plan, and Add place opened its place form. No form was submitted and no travel data was changed.
- Escape dismissed Menu and returned focus to its trigger. Viewer menu contained only the four navigation links. Browser console had no errors.
- Local fixture: `scripts/design-audit/navigation-fixture.js`, served by `scripts/design-audit/server.py` with `TRIPTO_AUDIT_PORT=4196`; open `/collections/audit-neighborhood?preview=1`. Viewer case adds `qaState=navigation-viewer`.
- The protected All trips renderer SHA256 remains `3754d20db9b86cbfe54a498c22d7dd7123be00d7b4bb01e6144c3874f5836432`.
- Cloudflare dry run passed for the verified `travelinkme@gmail.com` account. Cache is `tripto-shell-product-v253-neighborhood-menu`; both shell asset queries are `flat-design-system-v175`.

This is a bounded navigation/UI change. Backend mutation and D1 integration suites were not repeated. Publication and public verification are recorded separately in `release.json`.

## Publication

Application commit `9fb6e25` is pushed to `fix/keyboard-header-20260907`; main was not merged. Worker `6ff4a861-22e6-4a31-b84c-7c5f81799c20` serves 100% of traffic. All six checked public files match the local release exactly. `/health` reports healthy service and database; feature flags are unchanged.

The HTML comparison uses `/`, the canonical shell URL. An initial check against `/index.html` received its empty redirect response; the corrected canonical URL matched the build. No application change was needed.

The signed-in public `/trip-options` page was checked at 390×844: 68px header, no overflow, all four menu links, no misplaced collection action and no console errors. Neighborhood-specific flows were verified with local fixtures; no production plan was created or edited.
