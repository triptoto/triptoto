# Roll back Beta Candidate 1

Beta Candidate 1 adds no D1 migration. Rollback is therefore application-only.

1. Capture the failed request ID, deployment ID and failing scenario.
2. Roll back to the previous Major Beta Milestone 5–8 Worker deployment using Wrangler deployment history or the Cloudflare dashboard.
3. Do not remove or modify D1 tables.
4. Verify `/health`, `/api/v1/readiness`, guest-session creation, and `scripts/smoke-major-milestone.sh`.

Local documents saved by the candidate include checksums and remain compatible as IndexedDB records. A previous frontend may ignore the extra checksum field.
