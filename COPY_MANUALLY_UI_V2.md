# tripto.to Frontend Foundation v2

Copy this patch over the repository, then run:

```bash
node scripts/apply-ui-v2.mjs
npm install
npm run check:ui
npm run typecheck
npx wrangler deploy
```

Open:

- https://tripto-api.travelinkme.workers.dev/
- or https://tripto-api.travelinkme.workers.dev/app

The UI is served as Cloudflare Worker Static Assets. API and `/health` continue to execute the Worker first. The app shell has an offline service worker and caches last successful API reads in localStorage.
