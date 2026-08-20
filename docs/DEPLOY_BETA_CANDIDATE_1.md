# Deploy Beta Candidate 1

1. Review the `beta-candidate-1` branch and confirm a clean worktree.
2. Run `npm ci` and `npm run validate:candidate`.
3. Confirm all disabled feature flags remain `false` in `wrangler.jsonc`.
4. No new D1 migration is required. Confirm remote migration status before deploying.
5. Deploy the Worker and static assets.
6. Run the deployed candidate smoke test.

```bash
git switch beta-candidate-1
npm ci
npm run validate:candidate
npx wrangler d1 migrations list tripto-db --remote
npx wrangler deploy
bash scripts/smoke-beta-candidate.sh https://tripto-api.travelinkme.workers.dev
```

Do not merge to `main` until the branch has been reviewed and the deployed smoke test passes.
