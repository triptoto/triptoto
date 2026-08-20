# Trip Brain v1

Trip Brain is deterministic and may execute locally.

## Inputs
- Current time and device timezone.
- Active/context trip selection.
- Timeline items and event-local timezones.
- Traveler participation.
- Explicit connections and buffers.
- Last-known facts.
- Offline state and local asset registry.
- Checklist state.
- User overrides.

## Outputs
- Current trip phase/mode: preparing, tomorrow, travel-day, arrival, during-trip, last-day, completed.
- What's Next.
- Recommended next action.
- Time-to-leave when a reliable duration is known.
- Known timing conflicts.
- Trip Health issues (non-numeric; avoid false precision).
- Ready Offline issues.
- Smart Essentials.

## Safety
Trip Brain must not fabricate travel duration. If duration is unknown, output `UNAVAILABLE` and offer navigation/address. Recommendations are labeled ESTIMATED.
