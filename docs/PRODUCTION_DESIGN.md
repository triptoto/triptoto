# tripto.to production design

This document is the visual and navigation source of truth for the traveler-facing Product V2 application.

## One presentation layer

The application has one production design. There is no theme selector, stored theme preference, alternate theme class, or legacy traveler-facing stylesheet. Historical designs remain recoverable only through Git and immutable Worker versions; they are not shipped as parallel runtime themes.

The app is mobile-first from 360px through 430px and remains centered at a maximum width of 430px on wider browsers.

## Production palette

- Application canvas: `#FBF8F7`
- Raised surface/card: `#FFFFFF`
- Quiet control surface: `#F3EFF0`
- Divider: `#E6E0E5`
- Primary text and icons: `#05152D`
- Secondary text: `#596474`
- Primary accent: `#5547B7`
- Primary add action: `#FBC840`
- Next/action cue: `#B84D16`
- Verified success text: `#006B49`
- Flight marker: `#D9E4FB`
- Transfer marker: `#FEE4CF`
- Stay marker: `#D1EDDE`
- Activity marker: `#E7E1FB`
- Notification badge: `#5547B7` with white text

The Welcome screen uses the same warm canvas, navy typography, and pastel journey colors as the authenticated product. Its compact route matrix is part of the same production design, not a selectable theme.

Welcome typography, artwork, spacing, and action heights scale against both viewport width and available viewport height. The layout uses `100svh`, remains no-scroll with mobile browser chrome present, and retains 44px minimum interactive targets.

## Typography and controls

All text—including trip and booking titles, navigation, controls, forms, labels,
metadata, status, and body copy—uses the native Apple/San Francisco system stack
with standard system fallbacks. The semantic scale is 40 / 28 / 20 / 16 / 14 /
12px for display, screen, section, body, metadata, and labels; travel route
numbers share the 40px display size. Controls have a
minimum 44×44px touch target. Primary, secondary, compact, and row actions use
the shared height tokens. Focus remains visible for keyboard users, and
reduced-motion preferences are respected. No external font request is made.

## Authenticated navigation

The bottom navigation is always ordered and labeled exactly:

`Trip | Alerts | + | To-do | Account`

- **Trip** opens the selected trip Timeline.
- **Alerts** opens traveler-facing notifications and exceptions.
- **+** opens Add Booking / Create New Trip actions.
- **To-do** opens the trip checklist.
- **Account** opens identity, trip history, booking email, help, privacy, and account controls.

Welcome and focused creation/authentication tasks may omit bottom navigation. The center `+` is the only filled circular navigation action.

## Component language

- Timeline is the main authenticated surface.
- Use strong hierarchy, compact rows, restrained cards, and honest unavailable states.
- Keep scheduled booking data distinct from live status.
- Never invent gate, terminal, seat, time, document, or location data.
- Use the locally generated Phosphor SVG sprite consistently: Regular for normal controls and travel categories, Fill only for the selected bottom-navigation state. Timeline icons sit in semantic pastel circles, while standard controls remain unboxed unless a touch target needs a visible surface. Do not add external icon or font requests.
- Fixed navigation and actions must respect device safe areas and never cover content.

## Release and preview rule

Every UI release bumps both the asset query version in `public/index.html` and the shell cache name in `public/sw.js`. Review builds use a Cloudflare Worker preview alias derived from the exact Git commit SHA. Production is changed only by a separate production deployment.
