# Mobile screen inventory

## Locked

- Home / What’s Next and its flight pass
- Flight Detail and its flight pass/disclosure
- Trip Timeline
- Hotel Detail, including the premium local fallback hero
- Show to Driver
- Bottom navigation, DM Serif title/Apple interface typography, and the tripto.to palette

## Native mobile traveler flows

- Trips list and trip switching
- Bookings list and filters
- Flight, Hotel, Train, and Plan details
- Documents and local verified-file handling
- Ready Offline and Trip Health
- Smart Essentials checklist
- Add to Trip sheet
- Create Trip; add Flight, Hotel, Train, Activity, Reservation, Document, and Traveler
- Account, Travelers, traveler detail
- Deterministic booking import input, review, and history
- Pending Changes / conflict recovery
- Shared loading, empty, offline, and error states

## Advanced or unavailable

- Manual checklist creation and optimistic-lock traveler editing are native Product V2 flows.
- Conflict recovery remains visible in Product V2. The mobile screen never overwrites a conflict silently.
- Existing booking editing is exposed only where the Product V2 detail flow has a safe version-aware action; unavailable edit actions are not redirected to an obsolete interface.
- Sharing, public authentication, AI, live flights, Gmail Sync, R2 documents, demo tools, and ops remain disabled.

## Not present

- Desktop-specific dashboard or desktop-only routes
- Generative assistant/chat
- Live flight claims
- Paid-service dependencies
