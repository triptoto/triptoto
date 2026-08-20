# Copy Backend API v1.1 manually

From the extracted patch directory:

```bash
cp -R . ~/triptoto/
cd ~/triptoto
npm run typecheck
npx wrangler d1 migrations apply tripto-db --remote
git add .
git commit -m "Add travel backend API v1.1"
git push origin main
```

Wait for Cloudflare deployment, then:

```bash
bash scripts/smoke-api-v1.1.sh
```

Do not enable AI, live flights, Gmail Sync, or R2 as part of this patch.
