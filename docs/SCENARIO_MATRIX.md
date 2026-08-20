# Scenario validation matrix

1. Normal TLV -> Rome -> TLV.
2. 3h schedule delay entered/imported.
3. Cancelled transport.
4. Suspicious cancellation flip (future live-provider hook).
5. Codeshare marketing/operating flight.
6. Self-transfer.
7. Protected connection.
8. Airport change LHR -> LGW.
9. Overnight flight.
10. International Date Line.
11. DST transition.
12. Family of four and per-traveler boarding passes.
13. Traveler returns separately.
14. Multi-city/open-jaw Europe.
15. Road trip without flights.
16. Ferry/cruise transport.
17. Draft trip without dates.
18. Multiple simultaneous trips.
19. Long-duration trip and bounded offline cache.
20. No internet after landing.
21. Internet returns after long offline window.
22. Two devices edit same reservation offline.
23. Offline deletion/tombstone.
24. Local boarding-pass file missing.
25. Corrupt cached file.
26. Password-protected PDF.
27. Forwarded email thread contains old + changed + cancelled booking.
28. Schedule change vs operational delay.
29. Same PNR reused by different issuers.
30. User override conflicts with newer observation.
31. Missing hotel/return leg should be suggestion, not assumed error.
32. Camping/road trip where stay entity is optional.
33. App/device timezone changes after landing.
34. User logs out with pending offline changes.
35. Owner deletes account from a shared trip.
