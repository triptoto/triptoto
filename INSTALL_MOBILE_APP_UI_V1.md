# Install tripto.to Mobile App UI v1

This overlay targets Beta Candidate 1 at commit `fc82f41` or later.

```bash
cd ~/triptoto
git switch -c mobile-app-ui-v1

unzip -o ~/Downloads/tripto-mobile-app-ui-v1.zip -d /tmp/tripto-mobile-app-ui-v1
cp -R /tmp/tripto-mobile-app-ui-v1/. ~/triptoto/

npm run check:ui
npm run validate:candidate
npx wrangler deploy
```

Open the mobile app:

```text
https://tripto-api.travelinkme.workers.dev/
```

The Product V2 mobile shell is the only shipped presentation layer. Old milestone themes and `/legacy.html` are intentionally absent.

After phone review:

```bash
git add .
git commit -m "Implement mobile-first tripto.to app UI v1"
git push -u origin mobile-app-ui-v1
```

No D1 migration or backend feature flag change is required.
