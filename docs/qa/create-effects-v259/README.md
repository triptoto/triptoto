# Create trip button effects — v259

CSS-only effects scoped to final Create trip CTA: 320ms entrance, two 1200ms sheen passes, hover lift, press scale and theme-token shadow. No perpetual animation. prefers-reduced-motion removes animation and transforms. Existing submission logic and saving indicator unchanged.

check:ui and root deployment dry run passed. Browser measured 44px button, within viewport, no horizontal overflow at 320/390/430px. Computed entrance/sheen and two iterations confirmed. Screenshot visually inspected. Clicking without destination returns focus to validation; no production trip created.

Published commit 66c729e; Worker 68ed40f9-1b7f-47bf-b6e7-4f790100b8e3. Public CSS/index/service-worker hashes match local; /health healthy.
