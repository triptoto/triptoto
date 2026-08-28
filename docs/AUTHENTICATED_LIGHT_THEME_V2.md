# Authenticated Light Theme (Daylight) — V2

Bright, white-and-blue theme applied to the **authenticated app**. The pre-auth
Welcome experience is deliberately left on the dark **Harbor** theme.

## Boundary: Welcome stays dark, the app goes bright

Theme is a class on `<html>`, toggled in `applyTheme()` /
`syncFirstRunPresentation()` (`public/mobile-app.js`):

- While the Welcome / first-run screen is active, the class is forced to
  `theme-harbor` regardless of the user's stored choice, so the dark hero,
  artwork, typography and colors are untouched.
- Once authenticated (Welcome deactivates), the class switches to the user's
  chosen theme — `theme-daylight` by default.

Because `html.theme-daylight` is never set during Welcome, none of the Daylight
CSS below can leak into the pre-auth experience.

## What changed

Color / surface only. No layout, IA, navigation, component geometry, spacing,
Timeline structure or Trip Map behavior was changed. Typography is unchanged —
only text colors move.

## Architecture

- `:root` (in `public/mobile-app.css`) is the Classic grayscale base and the
  shared token contract.
- `html.theme-harbor` repoints tokens to the dark navy/amber palette.
- `html.theme-daylight` repoints the same tokens to the bright palette. Only
  elements that hardcoded `#fff` text on the (now white) chrome get per-element
  overrides.

No scattered hex in components — everything reads from the semantic tokens.
`!important` is used only where the base already used it (the form Save bar CTA).

## Daylight tokens

| Token | Value | Role |
|-------|-------|------|
| `--paper` / `--card` | `#ffffff` | page + raised card |
| `--surface` | `#f3f7fe` | inset fields / segmented track |
| `--ink` / `--ink-strong` | `#0a2c66` / `#082b63` | primary text (deep navy) |
| `--muted` / `--muted-soft` | `#60789e` / `#93a6c4` | secondary text (blue-gray) |
| `--line` / `--line-strong` | `#e3eaf3` / `#d6e0ef` | hairlines / field borders |
| `--icon` / `--indigo` | `#2f6ff5` | vivid blue interactive accent |
| `--accent` (`--accent-ink`) | `#ffbf1a` (`#0a2c66`) | warm yellow — primary CTAs only |
| `--blue-soft` | `#eef4ff` | pale-blue selected / soft fills |
| `--navy` / `--yellow` | `#0a2c66` / `#ffbf1a` | hue tokens (split back out) |
| `--green(-soft)` | `#1f9d6b` / `#e7f6ee` | success |
| `--amber(-soft)` | `#c8820a` / `#fff3d6` | warning |
| `--red(-soft)` | `#dc4a44` / `#fdeceb` | danger |
| `--shadow-card` / `--shadow-soft` | low cool shadows | flat depth |

## Per-element overrides (why they exist)

- **Chrome text** (`.app-header`, `.app-bar`, `.app-bar--dark`, `.brand`,
  `.header-icon`/`.icon-button`, `.app-bar-title span`): chrome flips to white, so
  the hardcoded `#fff` text is recolored to ink; icon hover uses `--blue-soft`.
- **Brand dot** → yellow accent.
- **Bottom nav**: muted inactive, `--indigo` active, yellow FAB.
- **Form Save bar**: yellow CTA on the white bar; delete-trip text goes red.
- **Destructive confirm** (`.discard-dialog-actions .mobile-danger-action`): red fill.
- **Account "signed in" row**: hardcoded `#313133` fill → surface card, ink text,
  yellow sign-out pill.
- **Focus rings**: blue (`--indigo` border + `--blue-soft` ring), not yellow.
- **Protected-dark**: the document viewer bar stays dark over its dark media
  stage; `.dark-detail` linked-document rows (previously `#fff` text) recolor to ink.

## Switching themes

Account screen → **Appearance** → Daylight / Harbor swatches
(`data-action="set-theme"`). Choice is stored in `localStorage`
(`tripto_theme_v2`) and reapplied on boot via `loadStoredTheme()`. The status-bar
`theme-color` meta follows the active theme (`themeCanvasColor()`).

## Not touched

Welcome/first-run visuals, photos, QR codes, maps, and document content are not
forced bright. Layout and typography systems are unchanged.
