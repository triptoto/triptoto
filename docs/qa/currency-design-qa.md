# Currency converter design QA

- Source visual truth: `/Users/arthurberlin/Downloads/Screenshot 2026-09-03 at 13.42.09.png`
- Implementation screenshot: `docs/qa/currency-implementation-375-final.png`
- Combined comparison: `docs/qa/currency-design-comparison-final.png`
- Viewport/state: 390 × 844 CSS px requested; in-app capture rendered the Product V2 shell at 375 CSS px wide, preview Rome trip, EUR/USD pair after Swap, amount 250.
- Source pixels: 1260 × 2736. Normalized source: 375 px wide for comparison.
- Implementation pixels: 375 × 1023, browser-normalized screenshot at device scale 2.

## Full-view comparison evidence

The implementation preserves the reference hierarchy—trip-aware currency notice, rate/source metadata, amount, quick values, conversion result, and a prominent refresh action—while using the existing Tripto warm canvas, pastel semantic surfaces, purple action color, Apple system typography, and Phosphor icon system. It intentionally uses one clear From/To result instead of duplicating conversion outputs.

## Required fidelity surfaces

- Fonts and typography: native Apple system stack; numeric output uses tabular figures; labels, amount, result, and metadata have distinct optical hierarchy without clipping.
- Spacing and layout: 16 px page gutter, compact vertical rhythm, 44 px minimum controls, and no horizontal overflow in the tested mobile shell.
- Colors and tokens: only current Tripto theme tokens are used. Green communicates destination context, blue rate context, lavender conversion output, and purple the primary action.
- Image and asset fidelity: the screen requires no raster imagery. Currency, refresh, and swap use the approved local Phosphor sprite; no emoji or handcrafted SVG was added.
- Copy and content: concise traveler-facing wording, explicit reference-rate disclaimer, offline status, and a clear statement that entered amounts are calculated on-device.

## Interaction and accessibility evidence

- Amount entry recalculated 250 EUR to USD immediately.
- Swap changed the pair and recalculated the result.
- From/To controls are labeled native selects.
- All buttons and inputs measured at least 44 px high.
- Result uses `aria-live`; error copy uses a status region.
- Console error/warning check: none in the preview interaction pass.

## Comparison history

1. First comparison found a P2 hierarchy gap: the implementation only had a small icon refresh control while the reference used a strong full-width update action.
2. Added a full-width `Update rates` button using the existing Tripto primary-action component and retained the compact header refresh as a secondary convenience.
3. Re-captured and compared at the same mobile state. No actionable P0/P1/P2 visual or interaction findings remain.

## Residual P3 difference

- The reference displays two converted currencies simultaneously. Tripto uses one editable From/To pair to reduce density and make swapping unambiguous; this is an intentional product adaptation, not a broken state.

final result: passed
