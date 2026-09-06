# tripto.to — UI/UX Design Audit (AUDIT_ONLY)

- App: tripto.to travel PWA
- Version: `0.9.0-beta.1`
- Git HEAD: `7c8453893b00a2fc24120a29cfaa7c00f85424cc` (short `7c84538`)
- Working copy: 17 uncommitted changes present at audit time (prior header/width fixes, already deployed)
- Audit date: 2026-09-05
- Mode: **AUDIT_ONLY** — no application files were modified. Fixes below are *proposals only*.

## Scope and honest limitations

This sandbox has **no browser and no network access**. That means:

- No live rendering of the deployed site.
- No computed-box measurement at real viewports.
- No real screenshots (the `evidence/` folder contains executed-test logs, not images — none were fabricated).
- No keyboard, focus-order, or screen-reader (VoiceOver/TalkBack) runtime passes.

**This is a static code + design-system audit.** Static code analysis is **not** a substitute for visual verification of the running app. Every item whose truth depends on rendering, real content length, device chrome, or assistive tech is marked **NEEDS_VERIFICATION**. Items provable from source alone are **CONFIRMED**. Opinion-level improvements are **DESIGN_SUGGESTION**.

The requested viewport sweep (320×568, 360×800, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1440×900, 1920×1080) could **not** be executed visually. What is verifiable statically — the single-column frame, breakpoints, overflow guards, and safe-area handling that govern behavior across those widths — was analyzed and is reported under "Responsive / frame".

## Absolute numbers

| Metric | Count | Denominator / note |
|---|---|---|
| Screen render functions found | 39 | includes 2 dead (homeScreen, bookingsScreen) + helpers |
| Screens statically analyzed | 39 / 39 | 100% of render functions read |
| Screens visually verified | 0 / 39 | no browser available (all BLOCKED) |
| Overlay/transient surfaces found | 14 | 12 bottom sheets + 2 full-screen pickers |
| Static routes | 22 | `mobile-routes.js` STATIC_PATHS |
| Dynamic detail routes | 7 | `/flights/:id`, `/hotels/:id`, `/trains/:id`, `/plans/:id`, `/travelers/:id`, `/bookings/import/review/:id`, `/join/:id` |
| CONFIRMED findings | 6 | provable from source |
| NEEDS_VERIFICATION findings | 11 | require runtime/AT/real content |
| DESIGN_SUGGESTION items | 3 | improvements, no defect |
| Executed contract tests | 2 / 2 PASS | see Evidence |

## Executed evidence (real, in this sandbox)

```
node tests/button-size.contract.mjs   -> "Button sizing contract passed."   exit=0
node tests/mobile-ui.contract.mjs     -> "Product V2 mobile UI contract passed." exit=0
```

Full log: `evidence/executed-tests.txt`. `npm run validate:v2` was green during the immediately-prior fix phase (timeline-header safe-area fix, deployed as shell token `v149-timeline-header-safe`); it was not re-run during this read-only pass.

## Coverage matrix

Per-screen matrix in `COVERAGE.csv` (39 screens + 14 overlays × dimensions: static_analysis, visual_render, typography, color_contrast, layout_frame, accessibility). Cell values: `PASS` (statically clean), `BLOCKED` (needs a browser), `NOT_APPLICABLE` (dead code), or a finding ID (`C#`/`NV#`). Every `visual_render` cell is `BLOCKED` — this is the honest state of runtime coverage.

---

## Findings (grouped by priority)

Priorities: **P0** ship-blocker, **P1** major, **P2** moderate, **P3** minor/polish. Full structured list with proposed fixes in `FINDINGS.json`.

### P0 / P1
None. No ship-blocking or major CONFIRMED defect was found. The codebase is unusually disciplined: single Apple system font stack, WCAG-checked palette (contract-asserted), global `:focus-visible`, labeled form fields with `role="alert"` error association, global reduced-motion guard, `inert`+focus-trap modals, and alt text on all three `<img>` elements.

### P2 (moderate)

- **C1 — iOS input-zoom, currency `<select>` 14px** (`mobile-app.css:554`). Viewport allows zoom (no `maximum-scale`), so focusing a sub-16px control auto-zooms on iOS Safari. CONFIRMED. Fix: `>=16px`.
- **C2 — iOS input-zoom, booking-note `<textarea>` 15px** (`mobile-app.css:886`). Same cause. CONFIRMED. Fix: `>=16px`.
- **C3 — Flight/Hotel/Train detail screens have zero headings** (`mobile-app.js:4343 / 4387 / 4661`). The app-bar title is a `<strong>` (`3339`), and these bodies emit no `h1`/`h2`; the Plan detail (`4724`) does have an `<h1>`, so this is an inconsistency. CONFIRMED. Fix: add `<h1>` (or promote app-bar title app-wide — see DS2).
- **NV1 — Discard/confirm dialog (z100) can hide behind full-screen picker/doc-viewer (z120)** (`mobile-app.css:1106` vs `1055/1355/1791`). Reachable if a confirm is raised over an open place-search/date picker/doc viewer. Needs runtime check.
- **NV2 — google-auth-recovery header lacks `env(safe-area-inset-top)`** (`mobile-app.js:6932`, `mobile-app.css:1102`). Notch-clip risk; it is not `.app-header` so misses the inset rule at `css:280`. Needs a notched-device check.
- **NV5 — `--muted-soft` on `--surface` = 4.34:1 (below AA 4.5)**. Passes on paper/card; only fails on `--surface`. No confirmed shipping placement found — verify no small note renders on a `--surface` fill.
- **NV8 — Single-line ellipsis truncation on many important titles** (trip name, place/airport names, booking-detail rows, currency names, etc.; see `FINDINGS.json` for the full line list). The clip is CONFIRMED; whether it actually cuts real content depends on content length/locale. On touch there is no hover reveal. Verify with representative long strings.
- **NV11 — Modal focus order, `role="switch"`, combobox announcements** (`mobile-app.js:6102`, `5555-5640`, modal traps `620-650/7136-7169/9885-9903`). Code patterns are correct; runtime AT behavior unverifiable here.

### P3 (minor / polish)

- **C4 — Notifications empty-state `<h3>` skips levels** (`mobile-app.js:3894`). CONFIRMED. Normalize to `<h2>`.
- **C5 — Dead `--app-width:600px` override + hardcoded `600` literal** (`mobile-app.css:3270`, `3306`). CONFIRMED maintainability. Remove override; use `var(--app-width)`.
- **C6 — Welcome "Take a tour" (40px) + legal links (~28-42px) below 44px** (`mobile-app.css:1981`, `1984`). Meet the 24px AA floor, below the 44px comfort target. CONFIRMED.
- **NV3 — Loading splash fills only `55svh`** (`mobile-app.css:3246`), empty paper below within `100dvh` `.phone-app`. Visual check.
- **NV4 — Empty-booking (`4352`) and error (`6928`) screens bypass the flex frame** (`.screen` without `<main>`), falling back to the legacy fixed-nav model. Verify they match framed screens.
- **NV6 — Past timeline marker border near-invisible** (`mobile-app.css:2154`, `rgba(255,255,255,.6)` on pastel). Likely intentional de-emphasis.
- **NV7 — Latent "designed-for-dark" base rules** shadowed only by `html`-prefixed overrides (`css:1467-1519`, `2617+`). No active bug today; a renamed override would resurface white-on-white. Suggest deleting dead base rules.
- **NV9 — Welcome 700/701px breakpoints on a 520px column** (`css:1986/2006/2005`). Semantically stale, harmless.
- **NV10 — bookings `.intro-block` is an untargeted direct `.screen` child** (`mobile-app.js:4423`); may steal height on short screens.
- **DS1 — Sub-13px descriptive body copy** (`css:997/1003/1031/2031/2146`, incl. non-integer 12.5px). Consider 13-14px.
- **DS2 — Promote `appBar()` title to `<h1>` app-wide** (`mobile-app.js:3339`) — fixes C3 uniformly.
- **DS3 — Use `var(--app-width)` instead of literal widths.**

---

## What is CONFIRMED healthy (no action)

- **Typography:** one native Apple system stack (`--font-ui`, `css:47-49`), no webfonts (no FOUT/FOIT). No font-weight < 400. Body line-height 1.45. Tight tracking only on large display headings.
- **Color/contrast:** palette contrast pairs asserted `>=4.5` in `tests/mobile-ui.contract.mjs:24` and independently recomputed (ink/paper 17.26:1, accent/card 7.07:1, muted/paper 5.68:1, status colors 5.3-5.7:1). No transparent sticky header → no content-bleed.
- **Layout/frame:** unified single 600px column; breakpoints clean (no stale 430/431 literals; `min-width:601` correctly = 600+1). No horizontal scroll at 320px (`overflow-x:hidden/clip` on html/body/.phone-app; fixed overlays use `width:min(100%,var(--app-width))`). Bottom safe-area insets on every bottom-fixed bar. No interactive control below the 24px AA floor.
- **Accessibility:** global `:focus-visible`; every field has a persistent `<label for>`; errors use `role="alert"` + `aria-invalid` + `aria-describedby`; icons are `aria-hidden`; icon-only buttons have `aria-label`; global reduced-motion guard covers all animations; modals use `aria-modal` + `inert` background + Tab trap + Escape + focus return.

## Recommended fix order (proposals only — not applied)

1. C1, C2 (iOS zoom, 2-line CSS change) — quick, real user impact on iPhone.
2. C3 / DS2 (headings on detail screens; ideally the app-wide `<h1>` promotion).
3. NV1, NV2, NV5, NV8 — verify in a browser first, then fix if confirmed.
4. C4, C5, C6 and remaining P3 polish.

## Deliverables

- `docs/audits/ui-ux/REPORT.md` — this file.
- `docs/audits/ui-ux/COVERAGE.csv` — per-screen/overlay coverage matrix.
- `docs/audits/ui-ux/FINDINGS.json` — structured findings with IDs, locations, proposed fixes, `modified:false`.
- `docs/audits/ui-ux/evidence/executed-tests.txt` — real executed-test output.
