# Mobile Component System

The mobile UI remains plain HTML, CSS, and JavaScript. Rendering helpers in `public/mobile-app.js` and shared classes in `public/mobile-app.css` implement the component system without changing application data contracts.

Core primitives are Mobile App Bar, Bottom Navigation, Primary CTA, Secondary Button, Icon Button, Status Label, Flight Ticket Card, Timeline Row, Health Summary Row, Offline Requirement Row, Booking List Row, Detail Information Grid, Bottom Sheet, Toast, Loading Skeleton, Empty State, Recovery State, and Connectivity State.

Rules:

- Palette: navy `#141948`, indigo `#2F3BAB`, yellow `#FEBF02`, and off-white `#F2F4F7`.
- Spacing uses the approved compact 12–16px rhythm; fixed navigation is protected by safe-area-aware page padding.
- Yellow is limited to primary action and attention states.
- Every actionable control is at least 44px, has a visible focus indicator, and carries text or an accessible label.
- Inline SVG icons use a 24×24 viewBox, rounded caps/joins, and consistent optical stroke weight. No emoji or external icon dependency is used.
- Bottom sheets share one renderer, focus trap, focus restoration, body scroll lock, safe-area padding, and thresholded handle drag.
- Add options that do not yet have native forms continue through `/legacy.html`.
- Desktop browsers show the same centered application at a maximum width of 430px.

No component may imply scheduled data is live, mark an unverified document Ready, obscure unresolved sync state, or create travel facts that are absent from source data.
