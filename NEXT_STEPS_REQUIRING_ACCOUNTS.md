# External-account boundary

Everything before this file can be developed locally without external accounts.

## Cloudflare account becomes necessary when we want to:
1. Create the real D1 database.
2. Create the private R2 documents bucket.
3. Create/deploy the Worker and bind D1/R2.
4. Configure production secrets, custom domain, inbound email routing, and observability.

At that point expected commands include Wrangler resource creation/migration/deploy commands, but no credentials or resource IDs are stored in this repository.

## GitHub account/repository becomes useful when we want to:
1. Create a private remote repository.
2. Push this local codebase.
3. Enable branch protection/CI and retain durable project history.

## Not required yet
- OpenAI or other AI API.
- Live-flight provider account/key.
- Gmail OAuth credentials.
- Apple Developer account.
- Google Play account.
- Paid maps/navigation provider.
