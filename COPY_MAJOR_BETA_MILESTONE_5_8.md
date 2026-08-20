# Install tripto.to Major Beta Milestone 5–8

This is one cumulative package. It includes the prior beta foundation plus travel management, deterministic intelligence, sync foundations and production hardening.

```bash
cp -R ~/Downloads/tripto-major-beta-milestone-5-8/. ~/triptoto/
cd ~/triptoto

node scripts/apply-major-milestone.mjs
npm install
npm run validate:major

npx wrangler d1 migrations apply tripto-db --remote
npx wrangler deploy
bash scripts/smoke-major-milestone.sh
```

Expected final line:

```text
Major Beta Milestone 5–8 smoke test completed. Test trip remains in D1 for inspection.
```

Then commit:

```bash
git add .
git commit -m "Add major beta milestone travel intelligence sync and hardening"
git push origin main
```

Keep AI, live flights, Gmail Sync, R2 documents, account auth, sharing, demo tools and ops disabled unless they are deliberately configured later.
