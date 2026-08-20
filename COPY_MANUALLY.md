# Manual copy instructions — Backend API v1

Copy the contents of this patch into the root of your local `triptoto` clone, preserving paths and overwriting files when asked.

Then run:

```bash
cd /path/to/triptoto
npm install
npm run typecheck
git add .
git commit -m "Add secure backend API v1"
git push origin main
```

## Configure the session signing secret

Do not commit this secret and do not paste it into ChatGPT.

```bash
cd /path/to/triptoto
SECRET=$(openssl rand -base64 48)
printf '%s' "$SECRET" | npx wrangler secret put SESSION_SECRET
unset SECRET
```

The GitHub push should trigger the normal Cloudflare deployment. Wait for it to finish, then run:

```bash
npm run smoke:api
```

Expected: health succeeds, a guest session is issued, a test trip is created, a timeline item and checklist are created, and Trip Brain returns a result.
