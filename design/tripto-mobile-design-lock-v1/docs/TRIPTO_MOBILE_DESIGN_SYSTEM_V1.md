# tripto.to Mobile Design System v1 — Locked Specification

## Product posture

tripto.to is a mobile application. Primary viewport: **390 × 844 CSS pixels**. Supported widths: 360, 375, 390, 393, and 430px.

A wider browser displays the same mobile app centered at a maximum width of 430px. No desktop dashboard is permitted.

The traveler should understand the next action in 2–3 seconds.

## Visual character

The visual direction is locked to:

- Apple Wallet clarity and density;
- Flighty-like travel hierarchy;
- Apple Maps-like calm, direct actions;
- deep navy travel surfaces;
- white/off-white application surfaces;
- yellow only for the primary action or urgent attention;
- restrained shadows;
- no Material Design;
- no generic SaaS dashboard;
- no emoji icons.

## Apple system typography

Do not use Inter as the primary face.

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Helvetica Neue",
  Arial,
  sans-serif;
```

Do not add or distribute font files.

| Role | Size | Weight | Line height | Notes |
|---|---:|---:|---:|---|
| Airport code | 58px | 780 | .88 | letter spacing -3.4px |
| App logo | 29px | 850 | 1 | letter spacing -1.3px |
| Screen title | 25–29px | 800–850 | 1.05 | SF Pro Display style |
| Primary time | 31px | 740 | 1.05 | tabular numbers |
| Card title | 15–18px | 760–800 | 1.15 | concise |
| Body | 13–15px | 500–650 | 1.35 | no paragraphs |
| Metadata | 12px | 500–650 | 1.25 | muted |
| Uppercase label | 9–11px | 790 | 1.2 | tracking .08–.12em |
| Primary CTA | 17px | 800 | 1 | one-line label |

Use `font-variant-numeric: tabular-nums` for travel times and numeric facts.

## Spacing

Use this scale only:

`4, 8, 12, 16, 20, 24, 32, 40`

Rules:

- page side margin: 20px;
- compact side margin at ≤375px: 16px;
- major section gap: 24px;
- related-item gap: 8–12px;
- fixed navigation protection: at least 86px plus safe area.

## Colors

```css
--navy: #141948;
--navy-deep: #071536;
--navy-mid: #0B1C4D;
--indigo: #2F3BAB;
--indigo-bright: #4358D5;
--indigo-soft: #E9EEFF;
--yellow: #FEBF02;
--yellow-highlight: #FFD83D;
--paper: #F2F4F7;
--surface: #FFFFFF;
--ink: #0E1B44;
--muted: #687697;
--line: #E7EAF1;
--success: #42E884;
--warning: #F4A800;
--danger: #E4473B;
```

Yellow is never decorative.

## Radii

- small control: 12px;
- standard control: 16px;
- elevated card: 22px;
- flight pass and hero sheet: 28–30px;
- pill: 999px.

## Flight pass

The approved flight pass is the central visual component.

### Home variant

- route, flight number, status, departure, terminal, seat;
- primary boarding-pass action only;
- target height: 300–320px at 390px screen width;
- Upcoming Journey and Trip Health remain visible in the first viewport.

### Flight Detail variant

- route and duration;
- departure and arrival event-local times;
- terminal, gate, seat;
- primary Boarding Pass and secondary Airport Directions;
- no table-like generic web card.

Never invent gate, seat, boarding time, live status, duration, or document availability.

## Status semantics

- `Confirmed` is a booking fact and may be green.
- `Scheduled data` is provenance and stays small and neutral.
- Live status appears only with enabled provider data and timestamp.
- Stale data must show last update or become unavailable.

## Bottom navigation

Locked order:

`Home | Trip | Add | Bookings | Account`

- 72px base height plus safe area;
- white translucent surface;
- one-pixel top divider;
- center Add button: 58px circular indigo control;
- navigation must never cover content.

## Bottom sheet

- 28px top radii;
- 20px side padding;
- 38 × 4px drag handle;
- 64px minimum option rows;
- 44 × 44px icon boxes;
- backdrop blur;
- safe-area padding;
- Escape, close button, backdrop dismiss, focus trap, and focus restoration.

## Accessibility

- all targets at least 44 × 44px;
- visible focus states;
- semantic buttons;
- correct `aria-current`, `aria-expanded`, `aria-modal`;
- reduced-motion support;
- no information communicated by color alone.

## Performance

- no third-party animation library;
- no external fonts;
- no external icon service;
- no map SDK in V1;
- animate transform and opacity only where practical;
- no horizontal overflow at supported widths.
