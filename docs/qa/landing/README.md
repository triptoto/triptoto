# Tripto landing page — local review

Route: `/landing` (also `/landing/` and `/landing.html`).
Local preview: http://localhost:4317/landing

A separate marketing page created with Meng To's landing-page and product-proof-saas guidance. Existing app entry points are preserved. Primary actions lead to `/trips`; footer links use existing `/privacy` and `/terms` routes. The itinerary is explicitly illustrative. Tabs and checklist only change local sample state. No invented customer counts, testimonials, pricing, live flight data, or AI capability claims.

## Verification

- Browser layout and interactions passed at 320, 390, 430, 768, and 1440 CSS pixels.
- No horizontal overflow or browser console errors in the viewport matrix.
- Keyboard tab navigation (arrows/Home/End), saved-place panel, checklist counter, and FAQ disclosure tested.
- Reduced-motion mode disables entry animations.
- 200% CSS content magnification at a 720-pixel viewport has no horizontal overflow after reflow adjustment.
- TypeScript check, frontend routing scenarios, JavaScript syntax, and diff whitespace checks passed.
- Assets are local and use existing Tripto SVG icons; no external font, image, or analytics dependency.

Screenshots: `desktop-preview.png`, `1440.png`, `390.png`.

Published to https://tripto.to/landing on 2026-09-11. Worker version: `6c6004b2-cb15-4850-9099-b26c9e2d786f`. Full `validate:candidate` passed before deployment. No Git push was performed. The checkout already contained unrelated changes, including changes in the Worker entry file; the landing integration adds only its dedicated route block there. No existing app shell or service worker files were changed by this task.
