# Tripto UX Contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Authored picker or explicitly accepted native select | `public/mobile-app.js` shared picker functions | authored / native | browser keyboard, touch, collision, and scroll checks |
| Date | Shared date-range sheet and native date fields where OS ownership is accepted | `public/mobile-app.js` date-range functions | authored range / native single date | date-range and viewport contracts |
| Form | Shared mobile form renderer and focused task shell | `public/mobile-app.js` | create / edit / review | UI contracts and form browser matrix |
| Scrollbar | Global application stylesheet | `DESIGN.md` and `public/mobile-app.css` | document / sheet / horizontal forecast | computed styles and browser matrix |
| Toast | `showToast` | `public/mobile-app.js` | status / alert / undo action | interaction and accessibility checks |
| CRUD | Route handlers and API mutation helpers | Worker API contracts and `public/mobile-app.js` | return to list / remain on detail | scenario tests and browser flows |

## Shared behavior

- Headers show only actions that are useful in the current context.
- Save and Next appear in the form header and remain stable while busy.
- Bottom sheets trap focus, close with Escape, restore focus, lock background scrolling, and keep long content internally scrollable.
- Search clears immediately, ignores stale results, and remains IME-safe.
- Forms preserve entered values on errors and move focus to the first invalid field.
- Destructive actions name the object and consequence before completion.
- Offline and unavailable states remain deterministic and never fabricate data.

## Business sources

| Area | Source |
|---|---|
| Trip and booking data | Worker API and scenario contracts in `tests/scenarios/` |
| Sharing and permissions | Collaboration API and `tests/collaboration.contract.mjs` |
| Authentication | Google authentication contracts and Worker routes |
| Documents and privacy | Local document implementation, `public/privacy.html`, and related contracts |
