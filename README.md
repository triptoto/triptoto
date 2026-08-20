# tripto.to

Offline-first travel companion. The beta is deterministic/rules-based: no generative AI and no live-flight provider is connected.

## Current phase

Working Cloudflare Worker + D1 beta with a mobile-first web/PWA frontend. Current capabilities include trips, timeline, transport, stays, travelers, checklist/Smart Essentials, Trip Brain, Impact Engine, connection rules, Ready Offline caching, Show to Driver, JSON + calendar export, privacy-safe support bundles, guest sessions with proactive refresh, trip lifecycle/settings, limited offline checklist mutation queue, and account/sharing foundations that remain disabled until verified auth is connected.

The internal verified-auth bridge supports safe guest → account migration after a real Apple/Google/email-code adapter verifies identity. It is deliberately **not** exposed as a public browser endpoint.

## Product principles

- Your trip should never disappear because your internet did.
- Never invent travel data.
- Facts, live facts, estimates, and recommendations must be visually and structurally distinct.
- Scheduled flight data must never be presented as live.
- High-impact automation requires high confidence and a clear recovery path.
- Guest data must not be silently abandoned when a session needs recovery.
- $0 mandatory monthly infrastructure/API cost until demand is validated.

## Default-disabled integrations

```text
LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false
```

## Verification

```bash
npm run check:ui
npm run typecheck
npm run test:scenarios
npm run test:integration
```

After deployment:

```bash
bash scripts/smoke-beta-milestone.sh
```

See `docs/BETA_MILESTONE_2.md` for the current milestone and deployment sequence.
