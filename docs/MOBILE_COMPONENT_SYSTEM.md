# Mobile Component System

The mobile UI remains plain HTML, CSS, and JavaScript. Rendering helpers in `public/mobile-app.js` and shared classes in `public/mobile-app.css` implement the component system without changing application data contracts.

Core primitives are Mobile App Bar, Bottom Navigation, Primary CTA, Secondary Button, Icon Button, Status Label, Flight Ticket Card, Timeline Row, Health Summary Row, Offline Requirement Row, Booking List Row, Detail Information Grid, Bottom Sheet, Toast, Loading Skeleton, Empty State, Recovery State, and Connectivity State.

Rules:

- Palette: white `#FFFFFF`, cool concrete `#F1F3F5`, silver slate borders `#CED4DA`, asphalt grey icons and secondary text `#495057`, and jet black `#111215`.
- Spacing uses the approved compact 12–16px rhythm; fixed navigation is protected by safe-area-aware page padding.
- Primary actions use jet black; attention states use text and icon labels rather than extra colors.
- Every actionable control is at least 44px, has a visible focus indicator, and carries text or an accessible label.
- The locally bundled Phosphor icon font uses consistent optical weight. No emoji or external icon request is used.
- Bottom sheets share one renderer, focus trap, focus restoration, body scroll lock, safe-area padding, and thresholded handle drag.
- Traveler-facing add and edit entry points stay inside the Product V2 mobile shell.
- Desktop browsers show the same centered application at a maximum width of 430px.

No component may imply scheduled data is live, mark an unverified document Ready, obscure unresolved sync state, or create travel facts that are absent from source data.
