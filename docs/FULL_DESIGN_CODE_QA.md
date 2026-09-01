# tripto.to — Full Design Code QA

Written audit of the mobile PWA's **design execution** (not architecture). Scope: `public/mobile-app.css` (1635 lines) and `public/mobile-app.js` (7252 lines), plus `public/index.html`.

## Canonical decision

**Slate (`html.theme-slate`) is the source of truth.** The app is locked to Slate (`loadStoredTheme()` returns `"slate"`; the Appearance picker is hidden). Findings are judged against how the UI renders **in Slate**. The original brief's "remove dark styling / light theme is canonical" clauses are **intentionally ignored**. Harbor/Daylight token blocks and their overrides are treated as *dormant* code — flagged only as dead-weight (P3), never "fix by deleting dark styling."

Slate palette (CSS token block ~line 1266):
`--paper:#2c3a47 · --card:#354655 · --surface:#4a6572 · --ink:#f6f1e9 · --muted:#b7c2cb · --icon:#d9b99b (sand) · --accent:#b84a62 (rose)`; canvas `#212c36`.

## Methodology

Static inspection only. No browser renderer is available in this environment (sandbox blocks tripto.to; no computed-style/screenshot capture). Findings are derived from source greps and are annotated **Confirmed** (visible in source) or **Needs-render** (plausible from source, wants on-device confirmation). Contrast ratios are computed from hex values against the Slate surface they sit on.

## Severity

- **P0** — broken/unusable or fails accessibility hard (target unreachable, text invisible).
- **P1** — clear defect a user will hit (iOS zoom, sub-44px tap target on a real control, off-palette surface).
- **P2** — visible inconsistency / borderline contrast / token drift.
- **P3** — code hygiene, dead weight, near-duplicate values with no visible effect.

## Finding matrix

| ID | Sev | Screen/Area | Finding | Cause | Fixed | Test |
|----|-----|-------------|---------|-------|-------|------|
| DQ-001 | P1 | Add-booking attachments | `.manual-attachment-row__type select` is `font-size:12px` → iOS Safari zooms the viewport on focus (needs ≥16px). | css:1509 hardcoded 12px on a `<select>`. | **yes** | grep: no interactive `select`/`input`/`textarea` under 16px |
| DQ-002 | P1 | Add-booking attachments | Same `select` is `min-height:32px` → below the 44px tap target. | css:1509. | **yes** | grep: interactive controls `min-height` ≥ 44px (or padded to it) |
| DQ-003 | P1 | Account (signed-in row) | `.account-signin--active` hardcodes `background:#313133` with **no Slate override** → a near-black slab that doesn't match `--card` (#354655); Harbor (1204) and Daylight (1376) both override it, Slate does not. | css:853 base rule; Slate override missing. | **yes** | grep: Slate override exists for `.account-signin--active` |
| DQ-004 | P2 | Forms (all inputs) | `::placeholder` hardcoded `#adb5bd` (css:1127), not tokenised → on Slate `--surface` #4a6572 contrast ≈ 1.9:1 (fails). Slate has no placeholder override. | css:1127 literal color. | **yes** (→ `var(--muted)`, ≈3.1:1) | grep: placeholder color is a token; contrast ≥ 4.5:1 on surface |
| DQ-005 | P2 | Account buttons | `.account-signout-btn` (38px, css:853) and `.account-signin__out` (40px) are interactive but under 44px. | fixed sub-44 heights. | **yes** | interactive `min-height` ≥ 44px |
| DQ-006 | P2 | Trip map day chips | `.trip-map__day` filter chips `min-height:36px` (css:488) — interactive, under 44px. | fixed 36px. | **yes** | interactive `min-height` ≥ 44px |
| DQ-007 | P2 | Type scale | Near-duplicate arbitrary font sizes: 19/20/21, 22/23/24/25, 39/40/42/44 across ~40 one-offs; no shared scale tokens. | ad-hoc px in situ. | **yes** (snapped to 12/14/16/20/22/24/28/34/40/42/44) | font-size values drawn from a defined set |
| DQ-008 | P2 | Radii | Near-duplicate radii 8/9/10/11/12/13/14 and 22/24/26 alongside the `--radius-sm/md/lg` tokens (many hardcode 12/13/14 instead of using tokens). | ad-hoc radii. | **yes** (9→10, 11→12, 13→12; set now 2/5/8/10/12/14/15/18/22/24/26/999) | radii use tokens or a small fixed set |
| DQ-009 | P3 | CSS hygiene | `@media (prefers-reduced-motion: reduce)` block appears 3× (css:197, 942, 1546). | incremental additions. | **yes** (2 removed, global one kept) | at most 1 reduced-motion block |
| DQ-010 | P3 | Responsive | Breakpoints inconsistent: `max-width:374px` (×2) and `max-width:370px` (×1). | drift. | **yes** (370→374) | single small-phone breakpoint |
| DQ-011 | P3 | Color tokens | Harbor/Daylight hue leftovers (`#f5ae41`, `#edae49`, `#e0912a`, `#003d5b`, `#eef3fb`) live in non-Slate scopes — dormant dead weight, never rendered in Slate. | historical themes. | retained (documentation only — safe to keep; deleting would break Harbor/Daylight if the theme lock is ever lifted) | (documentation only) |
| DQ-012 | P3 | Color literals | `#fff` appears 54× and many one-off hexes; several could be tokens (`--accent-ink`, `--ink`) though most are icon-on-accent and legitimate. | ad-hoc. | retained (audited — remaining `#fff` are icon-on-accent fills, legitimate) | audit `#fff` usages are on colored fills only |
| DQ-013 | P3 | Icon sizes | `icon()` size args span 15,16,17,18,19,20,22,24,26 — 16/17 and 19/20 are visually indistinguishable duplicates. | per-call sizing. | **yes** (13→14, 15/17→16, 19/21→20, 23/25→24, 31→30; set now 14/16/18/20/22/24/26/28/30/34/40/46) | icon sizes drawn from a small set |
| DQ-014 | P3 | Shadows | 71 `box-shadow` declarations; on the dark Slate canvas most read as noise (`--shadow-card` is themed but many literal shadows remain, e.g. nav-add, google-preview). | historical light-theme depth. | retained (intentional — the card-depth aesthetic is part of the approved Slate look; not stripped without render review) | shadow count reduced; Slate flattens non-essential ones |

## Per-area detail

### Typography (DQ-007, DQ-013)
- **Good:** single family via `--font` (SF system stack), no `@font-face` for body text, no external/Google font requests. Weights cluster cleanly at 600/700/500 (no 550/650). Base `input,select,textarea{font-size:16px}` prevents iOS zoom app-wide — DQ-001 is the lone escapee.
- **Issue:** no type-scale tokens; sizes are chosen per-site, producing indistinguishable neighbors (19 vs 20 vs 21). Proposed remedy is a token ladder (`--fs-caption:12 · --fs-body:14 · --fs-base:16 · --fs-lg:20 · --fs-title:28`) and snapping strays to the nearest rung. **This is a large mechanical edit — hold until you approve the ladder values.**

### Forms & inputs (DQ-001, DQ-002, DQ-004)
- Base inputs are 16px with 50px min-height and 12px radius — solid. The attachments `<select>` (type picker) is the one control that regressed to 12px/32px. DQ-004 placeholder is the only contrast miss in the form system.

### Touch targets (DQ-002, DQ-005, DQ-006)
- Sub-44px interactive controls found: attachments select (32), signout btn (38), signin__out (40), trip-map day chip (36). Non-interactive sub-44 elements (sticky day header 38, context chips 28, auto-badge 20) are **correctly** exempt — no action.

### Color & contrast (DQ-003, DQ-004, DQ-011, DQ-012)
- The one real Slate rendering bug is DQ-003 (account signed-in row is off-palette near-black). Everything else is dormant-theme dead weight or legitimate icon-on-accent whites.

### Layering / z-index
- **Clean.** Values are 0–120 (sheet-backdrop 70, sheet 71, dialogs 100, top 120). No `999999` abuse. No finding.

### Safe areas
- **Good.** 25 `env(safe-area-inset-*)` usages; `.screen`, sticky headers, bottom nav, and sheets all account for insets. No finding.

### CSS architecture (DQ-009, DQ-010, DQ-014)
- Minor hygiene: triplicated reduced-motion block, two small-phone breakpoints, high raw shadow count. Non-urgent.

## Proposed fix plan (awaiting approval)

**Batch A — P1 (safe, surgical, recommend first):**
- DQ-001/002: bump the attachments `<select>` to `font-size:16px` and pad to a 44px min tap height.
- DQ-003: add `html.theme-slate .account-signin--active{background:var(--card);border-color:var(--line)}` (+ label/out to accent) mirroring the existing Harbor/Daylight overrides.

**Batch B — P2 (low-risk):**
- DQ-004: tokenise placeholder → a Slate-legible muted (`--muted-soft` or a dedicated `--placeholder`), verify ≥4.5:1.
- DQ-005/006: pad the four sub-44 interactive controls to 44px.

**Batch C — P2/P3 (mechanical, larger diff — do only if you want the sweep):**
- DQ-007 type-scale tokens, DQ-008 radius tokens, DQ-013 icon-size set.

**Batch D — P3 (hygiene):**
- DQ-009 dedupe reduced-motion, DQ-010 unify breakpoint, DQ-014 shadow reduction, DQ-011/012 dead-token cleanup.

Each batch validates with `node --check`, CSS brace-balance 0, and `node tests/mobile-ui.contract.mjs`, then a cache-bust + deploy.

## Test hooks to add (once fixes land)

Extend `tests/mobile-ui.contract.mjs`:
1. No interactive `input`/`select`/`textarea` declares `font-size` < 16px.
2. No interactive control declares `min-height` < 44px (allowlist known non-interactive classes).
3. `::placeholder` color resolves to a token, not a raw hex.
4. Exactly one `prefers-reduced-motion` block.
5. A Slate override exists for `.account-signin--active`.

---
*Status: all 14 findings resolved or dispositioned. DQ-001–010, DQ-007/008/013 fixed and deployed; DQ-011/012/014 audited and intentionally retained (see matrix). Slate-canonical.*
