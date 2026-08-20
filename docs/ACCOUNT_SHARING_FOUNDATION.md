# Account and Sharing Foundation

## Security boundary

Guest sessions are device-bound HMAC sessions. A guest must never be converted into an account merely because they supplied an email address or arbitrary provider subject.

`migrateGuestDeviceToUser()` is therefore an internal contract only. A future auth adapter must first verify Apple, Google, or email-code ownership, create/find the stable `users.id`, and only then call the migration function.

## Guest migration invariants

A successful migration:

1. preserves existing trip IDs;
2. makes the verified user the owner of guest trips;
3. creates `trip_members` owner rows;
4. associates import/sync ownership with the user;
5. links the device to the user;
6. records an `identity_events` audit record;
7. invalidates old guest-only session identity semantics naturally because `requireAuth()` checks the token user ID against `devices.user_id`.

After migration, the auth adapter must issue a fresh account session token containing the verified `userId`.

## Sharing invariants

- Owner can invite editor/viewer.
- Owner role cannot be downgraded or removed.
- Editors can modify trip content through existing `requireTripAccess(..., true)` checks but cannot manage membership.
- Viewers are read-only.
- Raw invite tokens are returned only once; D1 stores only a SHA-256 hash.
- Invites expire.
- Sharing is gated by `SHARING_ENABLED` and verified account identity.
- Guest users receive `ACCOUNT_REQUIRED` instead of a fake sharing flow.
