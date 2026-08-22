# Mobile Motion Specification

The premium mobile layer keeps motion functional and brief. CSS tokens in `public/mobile-app.css` are the source of truth:

- `--motion-fast: 140ms` for press and active-state feedback.
- `--motion-standard: 200ms` for routes, toasts, disclosure, and dismissal.
- `--motion-slow: 280ms` for sheet entry and first presentation of major content.
- `--ease-standard`, `--ease-emphasized`, and `--ease-sheet` cover normal, confirmation, and sheet movement.

Forward detail routes enter slightly from the right, browser Back reverses direction, and tab changes crossfade. The app preserves list scroll positions when returning where practical. Sheets translate vertically over a fading backdrop and can be dismissed with Escape, close, backdrop tap, or a deliberate downward handle swipe. Press feedback uses only restrained scale, opacity, and color transitions.

`prefers-reduced-motion: reduce` removes sliding, scaling, shimmer, and rotating feedback. Content appears immediately with at most a 1ms opacity change. No animation delays travel information or runs decoratively.

Performance constraints: normal motion is no longer than 280ms, uses transform/opacity where practical, has no scroll listener, and introduces no animation library.
