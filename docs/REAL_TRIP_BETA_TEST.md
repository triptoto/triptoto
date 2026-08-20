# Real Trip Beta Test Protocol

Use this protocol for one controlled real trip. Do not enter data that the traveler cannot verify from a booking or document. Live flights, AI, Gmail Sync, R2, public auth and sharing remain disabled.

## Result notation

- **PASS** — observed behavior matches the criterion and no data was invented, lost or silently overwritten.
- **FAIL** — behavior differs, a recovery path is missing, or traveler data is wrong/ambiguous.
- **NOT TESTED** — the condition did not occur or could not be safely exercised. Record why.

Record device/browser, app build, trip ID, test time, device timezone, network state and result for every section. Before departure run:

```bash
npm run diagnose:trip -- <trip-id> --remote
```

## 1. Preparing phase

1. Create the real trip with verified dates and destination.
2. Add actual transport, stay and travelers from confirmations.
3. Confirm every displayed timezone, local date and overnight/date-line transition.
4. Review low-confidence imports before confirming; reject ambiguous dates.
5. Open Trip Health and Ready Offline.

**PASS:** stored bookings match source confirmations; missing fields remain unavailable; diagnostic has no unexplained FAIL.  
**FAIL:** any guessed value, wrong ordering/timezone, silent import confirmation or unexplained critical health issue.  
**NOT TESTED:** booking type is absent from this trip.

## 2. Day before departure

1. Complete only checklist items actually completed.
2. Save required documents locally on the test device and verify they reopen.
3. Open Timeline, What's Next and Ready Offline while online.
4. Confirm scheduled information is labeled scheduled, not live.

**PASS:** requirements are traveler/itinerary-specific, cached datasets show a recent timestamp, and unavailable/live-disabled states are explicit.  
**FAIL:** Ready Offline claims coverage without the required traveler document or scheduled data appears live.  
**NOT TESTED:** no document applies.

## 3. Airport and departure

1. Compare What's Next with the verified booking and local airport clock.
2. Check departure terminal/gate only against an authoritative source outside tripto.to.
3. Exercise any protected, self-transfer, terminal-change, immigration, security, baggage-reclaim or airport-change connection that actually exists.

**PASS:** recommendations use stored facts and explicitly labeled estimates; connection semantics and buffers match the itinerary.  
**FAIL:** stale/unknown data drives a recommendation, or protected and self-transfer behavior is confused.  
**NOT TESTED:** no applicable connection.

## 4. Airplane mode / offline use

1. While online, open the trip, timeline, documents, What's Next, transport, stays and addresses.
2. Enable airplane mode and fully reload/reopen the PWA.
3. Read the timeline and each required local document.
4. Make one supported offline edit and keep the app open long enough to confirm it is queued.

**PASS:** cached facts and documents remain readable, timestamps/status remain visible, and the edit is visibly pending.  
**FAIL:** blank trip, missing previously cached document, invented freshness, or lost/hidden edit.  
**NOT TESTED:** platform prevents the offline action; record the limitation.

## 5. Arrival and timezone change

1. Land and allow the device timezone to change automatically; also record the old and new zones.
2. Reopen Home and Timeline before reconnecting if practical.
3. Verify stored UTC ordering and each event's local timezone.
4. Check hotel address, check-in time and saved confirmation.

**PASS:** event times remain tied to their event locations and the next item does not change incorrectly when the device timezone changes.  
**FAIL:** duplicated/skipped DST time, changed ordering, or device timezone substituted for event timezone.  
**NOT TESTED:** device timezone did not change.

## 6. Navigation and hotel

1. Open the hotel/transfer address from cached trip data.
2. If a route duration is user-entered, confirm it is labeled as such.
3. If cached routing has no timestamp or is stale, confirm no leave-time recommendation is produced.

**PASS:** navigation uses the saved address; estimates and stale/unavailable states are explicit.  
**FAIL:** an address/duration is invented or an untimestamped/stale route generates leave advice.  
**NOT TESTED:** no navigation-dependent item.

## 7. Reconnect and sync

1. Disable airplane mode and wait for connectivity.
2. Confirm the queued edit syncs exactly once.
3. If safe, create a stale-version edit on a second test context to force a conflict.
4. Confirm the conflict remains visible until explicitly resolved.

**PASS:** matching-version edits apply; conflicts are visible and never silently overwrite either side.  
**FAIL:** duplicate edit, silent last-write-wins behavior, hidden conflict or lost pending operation.  
**NOT TESTED:** conflict could not be safely induced.

## 8. Local-data removal / logout safety

1. With no pending changes, review the deletion/removal confirmation without completing it.
2. With a pending offline change, attempt the same flow but do not confirm destructive removal.

**PASS:** the app warns that unsynced changes would be lost and blocks silent removal.  
**FAIL:** logout, storage removal or deletion proceeds silently with pending work.  
**NOT TESTED:** public auth/logout remains disabled; test the available local-data flow only.

## 9. Trip completion

1. Mark the trip completed only after the final real itinerary item.
2. Open Home, Trip Health and What's Next.
3. Run the diagnostic command again.

**PASS:** no future What's Next item or preparation warning is invented; history remains readable.  
**FAIL:** completed trip still produces active travel recommendations or loses history.  
**NOT TESTED:** trip has not ended.

## Final record

Record overall **PASS / FAIL / NOT TESTED**, every failed step, screenshots without sensitive confirmation/document content, diagnostic output, unresolved conflicts, offline platform limitations and whether rollback is required. Never attach raw booking email bodies or document bytes to issue reports.
