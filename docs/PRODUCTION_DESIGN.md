# tripto.to production design

This document is the visual and navigation source of truth for the traveler-facing Product V2 application.

## One presentation layer

The application has one production design. There is no theme selector, stored theme preference, alternate theme class, or legacy traveler-facing stylesheet. Historical designs remain recoverable only through Git and immutable Worker versions; they are not shipped as parallel runtime themes.

The app is mobile-first from 360px through 430px and remains centered at a maximum width of 430px on wider browsers.

## Production palette

- Application canvas: `#EEEEEE`
- Raised surface/card: `#FFFFFF`
- Quiet control surface: `#E4E4E4`
- Divider: `#DDDDDD`
- Primary text and icons: `#111217`
- Secondary text: `#5A5A5A`
- Primary accent: `#CB2957`
- Verified success text: `#1B704B`
- Notification badge: `#B72B35` with white text

The Welcome screen is the single intentional exception to the authenticated canvas: it uses one uninterrupted bright brand background `#CB2957` from edge to edge with white typography. The journey is an editable local SVG route (`welcome-thread-line-v1.svg`) with three independently positioned HTML icon markers; it must not appear as a separate card or second background. This is part of the same production design, not a selectable theme.

Welcome typography, artwork, spacing, and action heights scale against both viewport width and available viewport height. The layout uses `100svh`, remains no-scroll with mobile browser chrome present, and retains 44px minimum interactive targets.

## Typography and controls

Use locally hosted DM Serif Display only for traveler-authored trip and booking
titles. All interface text—including navigation, controls, forms, labels,
metadata, status, and body copy—uses the native Apple system stack with standard
system fallbacks. The semantic scale is 52 / 40 / 28 / 20 / 16 / 13 / 11px for
display, route, screen, section, body, metadata, and labels. Controls have a
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
- Use locally bundled Phosphor Regular for normal UI and Phosphor Fill for selected/current states. Reserve custom SVG for weather, destination, or branded illustration work; do not add external icon or font requests.
- Fixed navigation and actions must respect device safe areas and never cover content.

## Release and preview rule

Every UI release bumps both the asset query version in `public/index.html` and the shell cache name in `public/sw.js`. Review builds use a Cloudflare Worker preview alias derived from the exact Git commit SHA. Production is changed only by a separate production deployment.
