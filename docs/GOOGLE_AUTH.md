# Google Sign-In

Google Identity Services is used only for verified identity and account continuity. It does not request or enable Gmail, Drive, Calendar or other Google data access.

## Runtime gates

The Account screen shows Google only when both are configured:

```text
ACCOUNT_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=<web OAuth client ID>
```

This branch leaves `ACCOUNT_AUTH_ENABLED=false` in `wrangler.jsonc`; Google is not enabled in production by this milestone. `GOOGLE_CLIENT_ID` is a public web client ID, not a secret. Never place a Google client secret in frontend code or Wrangler vars.

## Setup

1. Create a Web application OAuth client in Google Cloud Console.
2. Add the exact application origins for each enabled environment.
3. Set `GOOGLE_CLIENT_ID` as an environment-specific Worker variable.
4. Set `ACCOUNT_AUTH_ENABLED=true` only in the environment intentionally being tested.
5. Apply migration `0016_google_auth_smart_import.sql` before enabling the flag.

No redirect URI is required for the current GIS button callback flow. The browser obtains a one-time Worker challenge and initializes GIS with its nonce.

## Verification and sessions

`POST /api/v1/auth/google` verifies the RS256 signature with Google’s rotating JWK set and checks issuer, audience, expiry, subject, verified email and the one-time nonce. The nonce is device-bound, short-lived and consumed once. Errors are generic and credentials are not logged or persisted.

The stable account key is `(provider, provider_subject)` using Google `sub`; email is profile data, never the identity key. Guest trips, imports, sync operations and the current device move to the verified account in a D1 batch. Existing IDs are preserved. A returning Google identity links a new device to the same account.

Sign-out revokes the account session device and issues a fresh guest device session. It does not delete the account or local IndexedDB documents. The UI warns before sign-out when local or server sync work is pending.

## Endpoints

- `POST /api/v1/auth/google/challenge`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/signout`
- `GET /api/v1/account`

See Google’s official [GIS web guide](https://developers.google.com/identity/gsi/web/guides/overview) and [server-side ID-token verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
