# tripto.to Screen Map V2

The V2 primary screen count is intentionally small. “Screen” means a navigable product state; sheets and focused details are classified separately.

## Primary

| Screen | Purpose | Primary action |
| --- | --- | --- |
| Welcome | Explain tripto.to and establish verified identity | Continue with Google |
| Trip Timeline | Current trip, chronological bookings, and what matters next | Contextual action or + |
| Account | Identity, trips, forwarding email, help, and account controls | Contextual row |

Primary navigation after authentication is **Trip / + / Account**. Welcome, Tour, and creation tasks do not show that navigation when it would distract from completion.

## Secondary full-screen tasks

| Screen | Entry | Exit |
| --- | --- | --- |
| Create Trip | First sign-in with no trips, + menu, trip selector | Success → Add Booking |
| Upload Booking | Add Booking | Success → Timeline |
| Forward Confirmation Email | Add Booking | Done → Timeline or recovery inbox |
| Manual Category Selection | Add Booking | Category → type form |
| Type-specific Manual Form | Category selection | Success → Timeline |
| Booking Detail | Timeline row | Back → same Timeline position |
| Edit Booking | Booking Detail | Save → Booking Detail/Timeline |
| Past Trips | Account → Trip History | Selected → Completed Timeline |
| Cancelled Trips | Account → Trip History | Selected → Read-only cancelled trip |
| Booking Email Settings | Account | Back → Account |
| Notification Settings | Account | Back → Account |
| Help | Account | Back → Account |
| Tickets & Documents | Current Trip header | Back → same Timeline position |

## Contextual Timeline states

## Contextual document states

| State | Entry | Exit |
| --- | --- | --- |
| Booking Documents | Booking Detail | Open document or Back → Booking Detail |
| Unlinked Document | Trip Tickets & Documents / Needs Attention | Link to Booking or Keep unlinked |
| Link to Booking | Unlinked Document | Save → Trip Tickets & Documents |

Documents are secondary/contextual. They are never primary navigation.

These are compositions of Trip Timeline, not separate destinations:

- Before Trip / Before you go
- Day Before
- During Trip / NEXT
- Needs Attention
- Booking Needs Review
- Offline cached Timeline
- Sync conflict recovery
- Completed Trip
- Timeline with one booking
- Populated Timeline
- Empty newly created trip awaiting first booking

## Sheets, menus, and dialogs

| Surface | Contents | Behavior |
| --- | --- | --- |
| Take a Tour | Four workflow steps + Start planning | Full-screen pager or native sheet; accessible again from Help |
| + menu | Add Booking; Create New Trip | Bottom sheet; destination-aware copy |
| Add Booking | Upload; Forward Email; Add Manually | Bottom sheet or focused screen depending on depth |
| Trip selector | Active/upcoming trips; Create New Trip | Bottom sheet |
| Date range picker | Start/end range in one calendar interaction | Native-feeling full-screen sheet |
| Which trip is this for? | Eligible trip choices | Required when email/import matching is uncertain |
| Import review | Candidate fields and uncertainty | Confirm, edit, or reject |
| Discard changes | Keep editing; Discard | Alert dialog |
| Delete trip/account | Explicit typed or strong confirmation | Destructive dialog |
| Unsynced sign-out warning | Keep local work; retry sync; sign out only when safe | Blocking recovery dialog |
| Offline/status detail | Human-readable availability/provenance | Small sheet only when explanation is needed |

## Advanced / legacy

These capabilities remain supported but leave the primary mental model:

- folder/file-manager navigation or a primary Documents tab;
- import history and diagnostics;
- sync conflict detail;
- traveler management;
- connection detail;
- checklist detail;
- support export;
- privacy export/deletion history;
- share/invite administration (disabled until separately approved);
- provider/ops/demo diagnostics (not traveler-facing and disabled);
- legacy UI fallback during staged migration.

## Route intent

V2 routes should remain state-addressable for Back/recovery without exposing implementation concepts:

```text
/                    → Welcome or authenticated routing decision
/trip/{tripId}       → Timeline
/trip/{tripId}/add   → Add Booking
/trip/{tripId}/item/{itemId} → Booking Detail
/trips/new           → Create Trip
/account             → Account
/account/history     → Past and Cancelled Trip History
/account/help        → Help
```

The exact SPA/hash implementation may remain during migration, but product semantics must match this map.

## Locked small-screen inventory for the first prototype

1. Welcome
2. Take a Tour
3. Authenticating (transient system state, never a decision screen)
4. Create Trip
5. Add Booking
6. Upload Booking
7. Forward Confirmation
8. Add Manually category selection
9. Representative manual Flight form
10. Timeline with one booking
11. Populated Timeline
12. Timeline — Before Trip
13. Timeline — During Trip / NEXT
14. Timeline — Needs Attention
15. Booking Detail
16. Trip selector
17. + menu
18. Create New Trip
19. Account
20. Past Trips
21. Booking Detail with Ticket/Document
22. Trip-level Tickets & Documents
23. Booking with multiple documents
24. Unlinked document / Needs Attention
25. Link Document to Booking
26. Document available offline
27. Document not available offline / device-local state

The contact sheet must show the complete core and document state inventory together and verify one consistent hierarchy, terminology, navigation model, and component language.
