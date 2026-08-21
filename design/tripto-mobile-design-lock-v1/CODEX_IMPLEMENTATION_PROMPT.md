Implement the locked tripto.to Mobile Design System v1 from this package.

This package is the visual source of truth. Do not reinterpret it.

Read in this order:

1. `docs/TRIPTO_MOBILE_DESIGN_SYSTEM_V1.md`
2. `docs/SCREEN_PIXEL_SPECS.md`
3. `reference/approved-flight-pass.png`
4. `reference/approved-home.png`
5. `src/tripto-mobile.css`
6. `src/tripto-mobile.js`

The runnable reference is:

```bash
cd src
python3 -m http.server 8080
```

Open:

- `http://localhost:8080/#home`
- `http://localhost:8080/#flight`

Implementation rules:

- preserve APIs, D1, routes, offline logic, document integrity, Trip Brain, and Impact Engine;
- replace existing visual markup where necessary;
- map real data into the supplied exact component structure;
- never use sample values during normal operation;
- never invent unavailable travel facts;
- use the Apple system font stack from the specification;
- do not add font files or external font requests;
- do not add a new framework;
- do not add external icon packages.

Locked measurements:

- 20px page margins;
- 30px flight-pass radius;
- 58px airport codes;
- 58px primary CTA;
- 64px bottom-sheet rows;
- 72px bottom navigation plus safe area;
- 44px minimum touch targets.

First implement only:

1. Home / What’s Next
2. Flight Detail

Use the supplied `flight-pass--home` and `flight-pass--detail` markup and CSS directly. Do not approximate the reference with the old layout.

Then run:

```bash
npm run check:ui
npm run validate:candidate
```

Render screenshots at 390 × 844 for Home and Flight Detail.

Do not commit, push, deploy, or merge before visual approval.
