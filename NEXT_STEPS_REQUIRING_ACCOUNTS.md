# External-account boundary — current beta state

Cloudflare Workers and D1 are already part of the deployed beta architecture. This repository still keeps external paid/provider integrations disabled by default.

## Already connected in the current beta

- Cloudflare Worker
- D1 database
- Worker static assets
- HMAC guest sessions via `SESSION_SECRET`

## Prepared but intentionally not connected

### Verified account authentication

The data model and guest → account migration contract are ready. To activate real accounts later we still need at least one verified adapter:

- Sign in with Apple, or
- Google Sign-In, or
- email code delivery/verification.

Do not enable `ACCOUNT_AUTH_ENABLED` until one of these adapters verifies identity before calling the migration contract.

### Shared trips

Owner/editor/viewer access, invite storage, hashed tokens and acceptance contracts are ready. `SHARING_ENABLED` stays false until verified account auth exists.

### R2 documents

Schema and offline UX are prepared, but R2 file storage remains disabled. Do not add an R2 subscription/bucket until the product decision changes.

### Live flights

Provider abstraction exists; `LIVE_FLIGHTS_ENABLED=false` remains mandatory until a provider, quota strategy and licensing decision are approved.

### Generative AI

`AI_ENABLED=false`. No generative AI provider or API key is required for the current product.

### Gmail Sync

`GMAIL_SYNC_ENABLED=false`. Forwarded-email import remains the preferred earlier-stage import path.

## Optional internal QA

Demo scenario generation is implemented but disabled. If it is ever enabled temporarily, store `DEMO_TOOLS_SECRET` as a Cloudflare secret and never commit it.
