# Release checklist

Prepared status: **READY WITH LIMITATIONS**. The P1 soft-404 issue is fixed locally and covered by tests. Production publication was explicitly excluded from this audit.

## Before deployment

- [x] Preserve and inventory the existing dirty worktree.
- [x] Run candidate validation and clean local D1 migration sequence.
- [x] Rebuild minified app shell assets.
- [x] Bump the service-worker cache to `tripto-shell-product-v339-noto-sans` and synchronize validator contracts.
- [x] Verify Worker configuration with an explicit dry run.
- [x] Confirm public domain metadata uses `https://tripto.to`.
- [x] Confirm disabled integrations remain disabled.
- [ ] Refresh Apple Artifactory/npm authentication and run `npm audit --omit=dev`.
- [ ] Review the complete dirty diff and decide which pre-existing Claude/Codex changes belong in the release commit.
- [ ] Confirm the Cloudflare account and target Worker are the intended production resources.

## Deployment commands

Run only after owner approval and from the canonical checkout:

```bash
npm ci
npm run validate:candidate
npm run typecheck
npx wrangler d1 migrations list tripto-db --remote --env=""
npx wrangler deploy --env=""
```

No new migration is required by this audit. Do not run a remote migration apply unless the preceding list shows a reviewed pending migration.

## Post-deploy smoke test

```bash
curl -fsS -A 'Mozilla/5.0' https://tripto.to/health
curl -fsSI -A 'Mozilla/5.0' https://tripto.to/
curl -fsSI -A 'Mozilla/5.0' https://tripto.to/privacy
curl -fsSI -A 'Mozilla/5.0' https://tripto.to/terms
curl -fsSI -A 'Mozilla/5.0' https://tripto.to/trips/example-private-route
curl -sSI -A 'Mozilla/5.0' https://tripto.to/does-not-exist
curl -fsS -A 'Mozilla/5.0' https://tripto.to/robots.txt
curl -fsS -A 'Mozilla/5.0' https://tripto.to/sitemap.xml
```

Expected:

- `/health` reports `ok: true` and `product-v2-production`.
- `/`, `/privacy`, `/terms` return 200.
- The private route returns 200 with `X-Robots-Tag: noindex, nofollow`.
- The random unknown route returns 404 with `X-Robots-Tag: noindex, nofollow`.
- Public HTML contains the prepared canonical and the approved Noto Sans stylesheet.
- `sw.js` begins with cache `v339-noto-sans` and the live JS/CSS contain the prepared changes.
- On a real iPhone: cold launch has no white flash, service-worker update replaces the old shell, short tap opens stop details, and long press opens its action sheet.

## Google Search actions

- [ ] Verify the apex-domain Search Console property.
- [ ] Submit `/sitemap.xml`.
- [ ] Request indexing for `/`, `/privacy`, and `/terms` only.
- [ ] Use URL Inspection to confirm a private path is excluded and a random missing path is a 404.

## Rollback

1. Record the new Worker version ID immediately after deployment.
2. If smoke checks fail, run `npx wrangler versions list` and `npx wrangler rollback <previous-version-id>`.
3. Do not roll D1 backward; this audit adds no schema change and existing migrations are additive.
4. Recheck `/health`, the three public URLs, one private deep link and the missing-path 404 after rollback.

## Owner-required items

- Cloudflare deployment approval and account targeting.
- npm registry token refresh.
- Search Console verification/submission.
- Staging-only email, notification and destructive-account flows.

---

## Update — 2026-09-10 audit pass

Revised status: **NOT READY** until REL-001/REL-002/REL-003 are resolved by their owners. The public SEO surface itself is healthy and the P1 SEO issues (soft-404, canonical, and the /privacy·/terms redirect loop) are fixed and live; the blocker is release **hygiene** — this worktree carries several sessions' unfinished work.

Current live SW cache token: `tripto-shell-product-v347-google-button-white`. Live edge smoke (`tripto-api.travelinkme.workers.dev`) passes for all public + private + 404 cases (see TEST_RESULTS.md).

### New release blockers (owner / other sessions)

- [ ] **REL-001** Review the full dirty diff and cut the release from a clean, reviewed commit. Do not deploy the raw shared worktree.
- [ ] **REL-002** Resolve the stay22 map-widget CSP loosening in `public/_headers` vs. the "no external map" product constraint and `trip-map.contract.mjs` (currently RED). Decide: keep the widget (and update the contract deliberately) or revert the CSP.
- [ ] **REL-003** Reconcile detail-recovery navigation (`planning`/`bookings` → `timeline`) with `detail-loading.contract.mjs` (currently RED).
- [ ] Rebuild + bump the SW cache token and both `?v=` asset tokens as part of the release (this pass rebuilt `mobile-app.min.*` for the currency fix but did **not** bump the cache token or deploy, per the audit's no-production-deploy rule).

### Already fixed + live this cycle (no action needed)

- Soft-404 → real 404 with noindex (SEO-001).
- Homepage static canonical + OG + JSON-LD (SEO-002).
- `/privacy` & `/terms` 307 redirect loop → 200 via `html_handling:"none"` (SEO-003), guarded by `seo-release.contract.mjs`.

### Fixed, pending the release deploy

- Currency locale pinned to `en-US` (I18N-001) — source + `mobile-app.min.js` rebuilt; ships with the next deploy.
