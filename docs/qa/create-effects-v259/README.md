# Create trip button effects — v259

CSS-only effects scoped to final Create trip CTA: 320ms entrance, two 1200ms sheen passes, hover lift, press scale and theme-token shadow. No perpetual animation. prefers-reduced-motion removes animation and transforms. Existing submission logic and saving indicator unchanged.

check:ui and root deployment dry run passed. Browser measured 44px button, within viewport, no horizontal overflow at 320/390/430px. Computed entrance/sheen and two iterations confirmed. Screenshot visually inspected. Clicking without destination returns focus to validation; no production trip created.
