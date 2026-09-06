# Free Trip Collaboration (V1)

Owner / editor / viewer trip sharing. **Collaboration is free for every signed-in
account** — there is no Pro tier, subscription, paywall, entitlement, or upgrade
check anywhere in this feature. `SHARING_ENABLED` is an operational kill-switch,
not a paid gate.

Status: implemented behind `SHARING_ENABLED` (currently `"false"`). The flag is
flipped to `"true"` only after acceptance QA (see Rollout below). Do not flip it
before then.

## Roles

| Role | Can do | Assignable? |
| --- | --- | --- |
| Owner | Everything, incl. delete/cancel trip, manage members, transfer ownership | No — set only by creating the trip or by an explicit ownership transfer |
| Editor ("Can edit") | Add and change bookings; view everything | Yes |
| Viewer ("View only") | See the trip; cannot change it | Yes |

Only `editor` and `viewer` are ever assignable via an invite or a role change.
`'owner'` can never be granted through either path.

## Endpoints (`apps/worker/src/routes/sharing.ts`)

| Method | Path | Handler | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/trips/{id}/sharing` | `sharingStatus` | Reports `enabled`, caller `role`, `canManage`, member counts |
| GET | `/api/v1/trips/{id}/members` | `listMembers` | |
| PATCH | `/api/v1/trips/{id}/members/{userId}` | `updateMemberRole` | Owner-only; role ∈ {editor, viewer} |
| DELETE | `/api/v1/trips/{id}/members/{userId}` | `removeMember` | Owner-only; owner cannot be removed |
| POST | `/api/v1/trips/{id}/leave` | `leaveTrip` | Owner cannot leave (transfer/delete instead) |
| POST | `/api/v1/trips/{id}/transfer-ownership` | `transferOwnership` | Never leaves a trip ownerless; old owner → editor |
| GET | `/api/v1/trips/{id}/invites` | `listInvites` | |
| POST | `/api/v1/trips/{id}/invites` | `createInvite` | Owner-only; gated on `SHARING_ENABLED` |
| DELETE | `/api/v1/trips/{id}/invites/{inviteId}` | `revokeInvite` | Only a pending invite can be revoked |
| POST | `/api/v1/invites/preview` | `previewInvite` | Read-only invite preview for the join screen |
| POST | `/api/v1/invites/accept` | `acceptInvite` | Gated on `SHARING_ENABLED`; one-time, atomic |
| DELETE | `/api/v1/trips/{id}` | `deleteTrip` (trips.ts) | Owner-only; editors/viewers get 403 |

The user-facing `/join/<token>` URL is a frontend deep link; the server accept
endpoint is `POST /api/v1/invites/accept` with `{token}` in the body.

## Security invariants (all enforced server-side)

- **Free for all signed-in users.** No entitlement/subscription/upgrade check
  gates any of the above. Access is authenticated (account required), not paid.
- **Invite tokens** are 32 bytes from `crypto.getRandomValues`, stored only as a
  SHA-256 hash (`trip_invites.token_hash`, UNIQUE). The plaintext token is never
  persisted, logged, or sent to analytics. Lookups hash the incoming token first.
- **Time-limited**: 1–30 day expiry (`expires_at`), enforced on preview, list,
  and accept.
- **Revocable**: owners can revoke a pending invite at any time.
- **One-time acceptance**: accept is an atomic guarded update
  (`WHERE id=? AND status='invited' AND expires_at>?`) followed by a re-read that
  confirms the current actor won the race; otherwise 409 `INVITE_UNAVAILABLE`.
- **Never trust the client role.** The caller's role is always re-derived from
  D1. An accepted member's role is copied from the stored invite row via SQL, not
  from the request body. `'owner'` is not in the assignable enum or the DB CHECK.
- **No account-existence disclosure.** Invite creation never probes whether an
  email has an account. An email-restricted invite is validated only against the
  accepting user's *own* verified identities (403 `INVITE_EMAIL_MISMATCH`).
- **Owner-only destructive ops.** Trip delete/cancel and sharing management
  require owner (403 `OWNER_REQUIRED`). Viewers are read-only (403 `FORBIDDEN`).
  The owner cannot leave or be removed without transferring ownership.
- **Attribution, not gating.** Change events carry `actor_user_id` /
  `actor_device_id` for every member equally (owner and editor); no paid gate is
  implied by attribution.

## Data model

- `trip_members` (migration `0002_trips.sql`): `(trip_id, user_id)` PK, `role`
  CHECK `('owner','editor','viewer')`, `status` CHECK `('invited','active','removed')`.
- `trip_invites` (migration `0012_accounts_sharing.sql`): `token_hash` NOT NULL
  UNIQUE, `role` CHECK `('editor','viewer')`, `status` CHECK
  `('invited','accepted','revoked','expired')`, `expires_at`, actor/timestamp columns.
- `change_events.actor_user_id / actor_device_id` (migration `0024_collaboration_actor.sql`, additive).

## Limits

- `PRODUCT_LIMITS.tripMembers = 10`, `pendingInvitesPerTrip = 10` (`config.ts`).
- Rate limits (`rate-limit.ts`): invite_preview 60/hr, invite_create 40/hr,
  invite_accept 30/hr.

## Frontend (`public/mobile-app.js`)

- Trip menu → **Plan together** (`open-collaboration`), shown only when
  `state.sharing.enabled`.
- `collaborationScreen()` (People + Pending invitations), `shareSheet()` ("Invite
  to this trip"), `joinScreen()` (accept an invite).
- `COLLAB_ROLES`: owner → "Owner", editor → "Can edit", viewer → "View only".
- `canEditCurrentTrip()` / `viewOnlyBlocked()` enforce viewer read-only affordances
  in the UI; the worker re-checks every mutation regardless.
- The frontend never sends `'owner'` as an assignable role and never logs or sends
  an invite token to analytics.
- Help → FAQ has a "Plan together" section, shown only when sharing is enabled.

## Tests

`tests/collaboration.contract.mjs` (also `npm run validate:collaboration`, and part
of `scripts/validate-v2.sh`) asserts the endpoints are wired, the token is
crypto-random + hashed, expiry/revoke/one-time acceptance, the owner-exclusion
role enum + CHECK constraints, server-derived accepted role, no account-existence
disclosure, owner-only delete / viewer read-only, the kill-switch gate, and the
free-for-all frontend copy + role labels. All disabled flags (incl.
`SHARING_ENABLED`) must remain `"false"` for the contract to pass.

## Rollout

1. Land collaboration behind `SHARING_ENABLED="false"` (done).
2. Acceptance QA against a preview environment with the flag enabled: invite
   create → accept → role change → remove → leave → transfer, plus expiry/revoke
   and viewer read-only enforcement.
3. Only after QA passes, flip `SHARING_ENABLED` to `"true"` and redeploy.
4. Do **not** merge to `main` or flip the flag without explicit approval.

## Planning collections

Collection and stop mutations follow the same rules as every other entity:
`requireTripAccess(env,auth,tripId,write=true)` gates create/edit/delete
server-side (owner/editor only; viewers read-only and cannot bypass via a
tampered client), optimistic `version` checks return 409 on conflict, and every
mutation calls `recordChangeEvent(..., auth)` with actor attribution. Deleting a
collection emits a `trip_item` tombstone. See TRIP_PLANNING_COLLECTIONS.md.
