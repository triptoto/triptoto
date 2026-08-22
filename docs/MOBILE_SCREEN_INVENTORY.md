# Mobile screen inventory

## Locked

- Home / What’s Next and its flight pass
- Flight Detail and its flight pass/disclosure
- Trip Timeline
- Hotel Detail, including the premium local fallback hero
- Show to Driver
- Bottom navigation, Apple system typography, and the tripto.to palette

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

- Manual creation of a brand-new checklist row remains in the legacy UI because the current API exposes checklist seeding and optimistic-lock updates, but no supported create-item endpoint.
- Conflict resolution choices remain in the legacy UI until the sync API exposes safe, explicit keep-local/use-server operations. The mobile screen never overwrites a conflict silently.
- Existing booking/traveler edits remain in legacy until the mobile forms can prefill and submit optimistic-lock versions without changing the locked detail screens.
- Sharing, public authentication, AI, live flights, Gmail Sync, R2 documents, demo tools, and ops remain disabled.

## Not present

- Desktop-specific dashboard or desktop-only routes
- Generative assistant/chat
- Live flight claims
- Paid-service dependencies
