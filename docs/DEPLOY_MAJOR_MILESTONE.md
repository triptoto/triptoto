# Deploy Major Milestone 5–8

1. Back up the current repository or create a Git commit.
2. Copy the cumulative package over the repository.
3. Run `node scripts/apply-major-milestone.mjs`, then `npm install` and `npm run validate:major`.
4. Apply D1 migrations with `npx wrangler d1 migrations apply tripto-db --remote`.
5. Deploy with `npx wrangler deploy`.
6. Run `bash scripts/smoke-major-milestone.sh`.
7. Open `/api/v1/readiness` and the web app.

The new migrations are additive and do not drop existing tables.
