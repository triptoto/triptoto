# tripto.to Flight Detail reference-match final — visual QA

## Evidence

- Visual source of truth:
  - `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/work/mobile-app-ui-v1/design/tripto-mobile-design-lock-v1/reference/approved-flight-pass.png`
- Browser-rendered implementation:
  - `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/outputs/flight-detail-reference-match-final/flight-detail-390x844.png`
  - `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/outputs/flight-detail-reference-match-final/flight-detail-360x800.png`
  - `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/outputs/flight-detail-reference-match-final/flight-detail-expanded-390x844.png`
- Verified viewports: 390 × 844, 360 × 800, and 430 × 932 CSS pixels at browser density 1.
- State: the application's isolated preview trip using the real runtime data contract, with a confirmed scheduled TLV → FCO flight and checksum-verified local boarding-pass document.
- Scope control: all finishing selectors and markup branches are restricted to Flight Detail. The approved Home screen was not changed in this pass.

## Comparison

The exact approved pass reference and all three final implementation captures were viewed together. The implementation now follows the reference's single premium surface, dominant route, strong confirmed status, compact local-time row, three-fact layout, and 64:36 action hierarchy. The card begins 14px below the 52px app bar and uses an adaptive 510–568px height to avoid an accidental empty region while retaining the complete composition at 360px.

The implementation intentionally renders the current preview trip's event-local times and duration rather than copying sample travel facts from the reference.

## Required details

- Local inline SVGs provide the night, day, terminal, gate, and seat symbols; no emoji or external icon package is used.
- The status area includes the restrained top-right chevron.
- Missing gate data reads `Not assigned` in full. No unavailable value is truncated or inferred.
- The 60px action row uses a 64:36 primary/secondary split with a 12px gap. `Open Boarding Pass` and `Airport directions` remain on one line at all verified widths.
- `Flight details` is a separate semantic button with `aria-expanded`, `aria-controls`, native focus, explicit Enter/Space handling, and down/up chevron states.
- Expanded details contain only available values. In the preview fixture this is baggage, PNR, ticket, and airline; absent boarding time and operating-carrier data are omitted.
- The pass begins directly below the app bar rather than being vertically centered; its adaptive height intentionally fills the available phone canvas without invented content.
- At all three widths, the document matches the viewport width, action labels remain on one line, and the disclosure is fully reachable above the bottom-navigation safe area. At 390 × 844 the expanded panel ends 30px above navigation.
- Browser verification confirmed Back returns to the previous route, Enter expands the disclosure, the button exposes the correct accessibility state, and the console has no warnings or errors.
- Pointer activation keeps the disclosure's standard subtle border with no outline. Keyboard Enter/Space activation retains a 2px yellow `:focus-visible` indicator, correct down/up chevrons, and focus after the 180ms collapse transition. Reduced motion disables that transition.

## Findings history

1. The prior locked implementation had a truncated primary action and a text-heavy icon treatment.
2. Action proportions, padding, and icon scale were corrected; restrained local SVGs and complete unavailable labels were added.
3. A final dynamic-data audit found that missing airport codes, long airport names, and long cabin labels could overflow outside the preview fixture. Flight Detail now uses a short non-invented code fallback and allows complete names and fact subtitles to wrap without ellipsis.
4. Final browser measurements found no horizontal overflow, clipped text, wrapped action labels, or bottom-navigation overlap at any required viewport.
5. The original plus affordance and placeholder-filled details were replaced with accessible directional chevrons and filtered real-data rows. The expanded panel ends 58px above the fixed navigation at 390 × 844.
6. The production lock removes forced pointer focus after rerendering. Input-modality tracking now limits the yellow focus indicator to keyboard navigation without weakening keyboard accessibility.

## Findings

No actionable P0, P1, P2, or P3 visual-fidelity finding remains in the requested Flight Detail scope.

final result: passed
