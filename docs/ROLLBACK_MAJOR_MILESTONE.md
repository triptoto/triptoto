# Rollback Major Milestone 5–8

Cloudflare Worker code can be rolled back to the previous deployment from the Cloudflare dashboard or Wrangler deployment history.

D1 migrations 0014 and 0015 are additive. Do not manually drop their tables during an incident. Leave the schema in place and roll back only application code. Older application versions ignore the new tables.

Before a rollback, capture the failed request ID and current deployment version. After rollback, verify `/health`, guest-session creation and the standard beta smoke test.
