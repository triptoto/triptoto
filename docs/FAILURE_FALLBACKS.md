# Failure / Fallback Rules

| Failure | Fallback |
|---|---|
| No internet | Local cached trip and documents |
| Email parser unsupported | Preserve source, manual entry |
| Document download fails | Retry + warning; never Ready Offline |
| Document checksum mismatch | Mark corrupt + re-download |
| Maps/navigation unavailable | Cached name/address/local address/coordinates |
| Travel duration unavailable | Explicitly unavailable; no invented ETA |
| Live flight disabled/unavailable | Confirmed scheduled booking data only |
| AI disabled | Rules-based Trip Brain continues |
| External noncritical provider fails | Home still renders |
| Sync conflict | Preserve both changes and resolve safely |
