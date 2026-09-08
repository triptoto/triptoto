# Shared header icon tiles v254

All standalone header icon actions now match the existing Trips header: 44×44px touch target, 24px glyph, 12px corners, theme surface `#f3eff0` and ink `#05152d`. Hover, pressed/expanded and keyboard-focus states are shared. The existing Trips default appearance and its Account/Create trip arrangement remain unchanged.

Coverage includes standard pages and forms, the main timeline notification/Add/Menu actions, Neighborhood, welcome and recovery headers, the driver view, full-screen date and destination pickers, sheet close buttons, document viewer and the separate Privacy/Terms headers. The document viewer Back control now uses an icon tile with its accessible name retained. Decorative icons embedded in titles or text buttons are not standalone icon actions.

## Verification

- Measured the existing Trips buttons before editing: 44×44px, 24px SVG, 12px radius, surface `rgb(243, 239, 240)`, ink `rgb(5, 21, 45)`.
- 74 route/form variants at 320×740, 390×844 and 430×932: 222 passing header checks, covering 666 rendered icon buttons. No style mismatches or horizontal overflow. Inventory and measured invariants are in `browser-matrix.json`.
- Separate 390×844 checks passed for driver controls, date-picker Back, destination-search Back, welcome Add/Menu and the document viewer Back/Download controls.
- Opened a real PNG from an unsaved local booking attachment, verified both viewer controls and returned to the form. Discarded the test draft. The PNG was the repository's public favicon; no production document or booking was created or modified.
- The ordinary Add Document preview path intentionally reports a simulated save, so the image-viewer check used the real staged-attachment path instead. The hidden 1px input was reached through its visible Add files label.
- `npm run check:ui` passed after rebuilding shell assets. Header navigation, collections, viewport, Trips journal and smart-import/auth contracts also passed; legal JavaScript syntax and `git diff --check` passed.
- Removed the obsolete collection-only purple Add assertion: that control now follows the shared dark header treatment. Its action, access guards and timeline contracts remain tested.
- Initial UI validation identified the old selector-based navigation contract; retaining the component's explicit shared control selector resolved it. Final validation and all browser measurements passed.
- Protected Trips renderer SHA256 remains `3754d20db9b86cbfe54a498c22d7dd7123be00d7b4bb01e6144c3874f5836432`.
- Cloudflare dry run passed for `travelinkme@gmail.com`. Cache `tripto-shell-product-v254-header-icons`, shell query `flat-design-system-v176`, legal CSS query `header-icons-v254`.

The browser matrix verifies header presentation, not every underlying business workflow. Backend/D1 integration suites were not repeated for this presentation change. Public publication is recorded in `release.json`.
