# Tripto language and visual QA — 2026-09-16

## Scope and evidence

Opened the local application in a 390 × 844 browser viewport with deterministic preview data. Captured all five locales (`en`, `de`, `fr`, `es`, `ru`) on 60 directly reachable route/form cases (300 captures), plus 28 internal screens, dialog actions, and popup cases (140 captures). Together these exercise all 38 renderer screen types, including subscription, import review, neighborhood place detail, and the long-press menus. Scrolled long route pages to the bottom and captured additional screenshots. The four legal documents and the independent `/landing` page were inspected in all five languages (25 captures). Repeated 16 representative application routes at 320 × 700 in all five languages (80 captures).

- Route text, buttons, screenshot and overflow data: `docs/design-audit/evidence/i18n-fixed-20260916/i18n-pages/`
- Internal screen/dialog matrix: `docs/design-audit/evidence/i18n-fixed-20260916/i18n-states/`
- Narrow-screen matrix: `docs/design-audit/evidence/i18n-final-20260916/i18n-narrow/`
- Public document and landing captures: `docs/design-audit/evidence/i18n-final-20260916/i18n-legal/`
- In-place language switching and currency regression: `docs/design-audit/evidence/i18n-fixed-20260916/i18n-regression/`

Two direct URLs in the route loop (`/subscription`, `/bookings/import/review` without an import ID) correctly landed on the welcome route; they were **not** counted as coverage for those screens. The internal screen matrix explicitly opened and captured both. No horizontal document overflow was detected in the application matrix, 320 px matrix, or legal documents. Narrow account/day-plan icon wrappers report their 40 px SVG geometry inside 36 px icon tiles; screenshots show this is an icon geometry detail, not text clipping.

## Issues fixed

1. In-place language changes left legal text and titles in the previous language while changing the selector and document `lang`. Preserve the original node content and attributes, restore/retranslate on each switch, synchronize the selector, and discard older asynchronous locale responses.
2. The plural matcher accepted arbitrary words as a zero count. A destination line turned into “0 Reisen”/“0 поездок” on the currency screen. Require a numeric count before pluralization. Translate the visible currency amount and status labels separately.
3. Added missing visible labels for traveler types, confirmation status, reservation/essential actions, neighborhood form, and generic ticket. Corrected German form labels, Russian critical priority, and date punctuation after locale-specific date abbreviations.
4. Notification popup now localizes singular/plural review prompts and generic change summaries. The system-generated fixture item names and notes remain user content and are intentionally not rewritten.
5. At 320 px, Help support links in Russian pushed a three-column grid wider than its container, and a German exchange-rate status did not wrap. The support actions use two columns on compact phones, and the status wraps.
6. The separate marketing landing page now loads the shared locale system, exposes a language selector, and includes translations for its previously missing heading fragments.

## Verification boundary

These are local browser renders against preview fixtures, not authenticated journeys on a physical phone. The fixture deliberately does not call production APIs. In particular, the account deletion action is refused in preview, secure checkout is unavailable without a signed-in subscription response, and imported/notification example content is synthetic. No assertion is made that real external OAuth, payment, or device-specific PWA state has been exercised. A source-map overlap detector may flag valid homographs such as French “Arrive” and Spanish “Actual”; these were visually reviewed rather than counted as untranslated copy.

The scripts under `scripts/design-audit/i18n-*.py` reproduce the matrices using the local preview server and Chrome CDP. `scripts/i18n-qa-overrides.mjs` preserves the supplemental translations across locale bundle regeneration. `npm run check:ui`, `npm run typecheck`, `npm run test:scenarios`, and `bash scripts/validate-candidate.sh` are the release checks.
