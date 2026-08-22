# Product V2 Prototype — Design QA

## Evidence

- Source visual truth: `/Users/arthurberlin/.codex/generated_images/01a02032-728d-7ce2-b111-775c80ec1cf0/exec-24110133-03ab-4a84-8989-181300287d3b.png`
- Implemented Welcome screenshot: `screenshots/final/01-welcome.png`
- Combined comparison: `screenshots/welcome-comparison.png`
- Full flow contact sheet: `screenshots/final/tripto-v2-final-contact-sheet.png`
- Source pixels: 853 × 1842.
- Implementation pixels: 393 × 852 at a 393 × 852 CSS viewport and device scale factor 1.
- Density normalization: the source was downsampled to 393 × 852 before the combined comparison.
- State: signed-out Welcome plus the complete Product Strategy V2 core and document prototype.

## Full-view comparison

The implemented Welcome preserves the selected direction's composition: off-white canvas, compact tripto.to lockup, two-line navy promise, muted support copy, a five-step vertical travel path with a single yellow active step, a full-width Google action, a quiet tour action, and subdued legal links. The device status bar and home indicator are supplied by the protected mobile runtime rather than duplicated in app content.

The implementation intentionally removes the source image's decorative placeholder lines beside journey steps. The labels remain complete and legible, while the result is calmer and more product-like. This is acceptable simplification rather than a hierarchy change.

## Focused-region comparison

No separate crop was required because the normalized side-by-side comparison keeps the logo, headline, journey labels, CTA, and legal links readable at full resolution. The Welcome action region and journey rail were additionally inspected in the individual 393 × 852 capture.

## Required fidelity surfaces

- Fonts and typography: Apple system stack is used for the app-specific implementation. Headline weight, line height, wrapping, and secondary copy hierarchy match the selected direction without truncation.
- Spacing and layout rhythm: the full 852px app viewport is used; headline, journey, CTA, and footer form one intentional vertical sequence. Timeline screens and sheets now anchor to the complete phone viewport.
- Colors and tokens: deep navy, indigo, golden yellow, off-white, muted blue-gray, and green status tokens are consistently mapped in `src/prototype.css`.
- Image quality and asset fidelity: no raster hero asset is required. Icons use the installed Radix icon family; no emoji, inline SVG approximation, or external image request was added.
- Copy and content: Welcome copy matches the selected direction. All other screens use short traveler-facing language and clearly labeled representative prototype data.
- Accessibility: semantic headings, buttons, labels, focus-visible treatment, minimum practical touch targets, and reduced-motion overrides are present.
- Responsiveness: every app state measured 393px client width and 393px scroll width. No horizontal overflow was found.

## Comparison history

### Pass 1 — blocked

- P1: the app content did not establish a full-height containing block, so bottom navigation and actions floated above a large unused region.
- P1: Radix sheet autofocus scrolled the device viewport and exposed the hidden simulated keyboard.
- P2: Welcome used four generic journey steps rather than the selected direction's five-step travel path.

Fixes:

- Established full-height app, page, and Welcome containers.
- Kept the device viewport non-scrolling while retaining the runtime's internal `MobileScroll` behavior, and reset transient sheet autofocus scrolling.
- Implemented five labeled journey steps and aligned legal copy with the selected direction.

Post-fix evidence: `screenshots/final/01-welcome.png`, `screenshots/final/13-trip-selector.png`, `screenshots/final/16-plus-menu.png`, and `screenshots/final/tripto-v2-final-contact-sheet.png`.

### Pass 2 — passed

No actionable P0, P1, or P2 visual differences remain. The residual icon-subject differences from the generated concept are P3 and use one coherent installed icon family.

## Interaction and runtime evidence

- Tested Welcome → Sign in → Create Trip directly.
- Tested Timeline → Booking Detail → Tickets & Documents → document open state.
- Tested Timeline header → trip-level Tickets & Documents → Needs Attention → Link to Booking.
- Verified multiple documents per booking plus offline and device-local storage language.
- Verified document removal explains that the booking remains and the confirmation sheet closes correctly.
- Tested Create Trip input, enabled action, and transition to Add Booking.
- Tested Add Booking → Add Manually → first Timeline.
- Tested Upload Booking → select synthetic file → review → Timeline.
- Tested Forward Confirmation → copy address → confirmation → Timeline.
- Tested representative Manual Flight fields, departure selection, validation, and Timeline return.
- Tested + → Create New Trip as a distinct addressable task.
- Tested trip selector and primary Add sheet.
- Tested the one-surface date range selector, booking-detail disclosure, legal links, account actions, contextual recovery actions, and Sign out confirmation.
- Tested all 13 primary routes for width overflow.
- Browser console errors and warnings checked: none.
- `npm run check:runtime`: passed; all 28 protected runtime files unchanged.
- `npm run build`: passed.
- `npm run test:sites`: 4 passed, 0 failed.

## Remaining P3 polish

- The generated source uses more literal airport/destination pictograms; the prototype uses the closest coherent Radix icons.
- Google sign-in and forwarded-email import are intentionally non-production prototype interactions.

final result: passed
