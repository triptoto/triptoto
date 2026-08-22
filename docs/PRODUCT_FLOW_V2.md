# tripto.to Product Flow V2

Status: canonical product-flow plan for prototype review.

## Entry and authentication

```text
OPEN tripto.to
├─ Valid account session
│  ├─ Offline + cached eligible trip → Current Timeline · Offline
│  ├─ Has trips → Select relevant trip → Current Timeline
│  └─ No trips → Create Trip
└─ No valid account session
   ├─ Existing cached guest data → Welcome + protected recovery path
   └─ No recoverable data → Welcome
      ├─ Continue with Google → transient Authenticating state (not a decision screen)
      │  ├─ Success
      │  │  ├─ Guest data exists → Migrate guest ownership → Continue
      │  │  ├─ Has trips → Relevant Timeline
      │  │  └─ No trips → Create Trip
      │  ├─ Cancel → Welcome with no destructive change
      │  └─ Failure → Retryable auth recovery
      └─ Take a Tour
         ├─ Step 1 · Create your trip
         ├─ Step 2 · Add your bookings
         ├─ Step 3 · Everything becomes one Timeline
         ├─ Step 4 · Know what matters next
         └─ Start planning → Continue with Google on Welcome
```

## First successful journey

```text
WELCOME
└─ Continue with Google
   └─ AUTHENTICATED · NO TRIPS
      └─ Create Trip
         ├─ Destination
         ├─ Date range
         └─ Optional custom name
            └─ Save
               └─ ADD BOOKING
                  ├─ Upload Booking
                  ├─ Forward Confirmation Email
                  └─ Add Manually
                     └─ Booking accepted
                        └─ TIMELINE · first booking visible + compact “Flight added” confirmation
```

## Global authenticated navigation

```text
TRIP
├─ Current Timeline
├─ Trip selector
└─ Booking Detail

+
├─ Add Booking
│  ├─ Upload Booking
│  ├─ Forward Confirmation Email
│  └─ Add Manually
└─ Create New Trip

ACCOUNT
├─ Profile
├─ Trip history
├─ Booking Email
├─ Notifications
├─ Help
└─ Account controls
```

## Create Trip

```text
CREATE TRIP
├─ Enter destination
├─ Select one start/end range
├─ Optionally edit generated trip name
├─ Save
│  ├─ Invalid → Inline error; preserve all values
│  ├─ Network failure → Recovery; preserve all values
│  └─ Success → Select new trip → Add Booking
├─ Back with no meaningful edits → Previous screen
└─ Back with meaningful edits → Discard confirmation
```

## Plus menu

```text
TAP +
├─ Add Booking
│  └─ “Add something to {current trip}”
└─ Create New Trip
   └─ “Start planning another trip”
```

If there is no current trip, + is not the initial creation path; successful authentication opens Create Trip directly.

## Add Booking

```text
ADD BOOKING · {current trip}
├─ Upload Booking
│  ├─ Select file
│  ├─ Validate file/integrity/limits
│  ├─ Parse deterministic candidates
│  ├─ Review uncertain or missing fields
│  └─ Confirm → Timeline
├─ Forward Confirmation Email
│  ├─ Show bookings@tripto.to
│  ├─ Confirm verified sender requirement
│  ├─ Incoming email received
│  ├─ Match one eligible trip with high confidence → Review/Timeline
│  └─ Ambiguous match → Which trip is this for? → Review/Timeline
└─ Add Manually
   ├─ Select category
   ├─ Complete type-specific form
   ├─ Validate without inventing missing facts
   └─ Save → Timeline
```

## Manual category flow

```text
ADD MANUALLY
├─ Flight → Flight form
├─ Hotel / Stay → Stay form
├─ Train → Train form
├─ Car Rental → Car form
├─ Transfer → Transfer form
├─ Cruise → Cruise form
├─ Ferry → Ferry form
├─ Restaurant → Restaurant form
├─ Activity / Event
│  └─ Tour | Concert | Theatre | Museum | Attraction | Sports | Meeting | Show | Other
└─ Other → Minimal generic reservation form
```

## Timeline states

Only one primary contextual surface may appear above the chronological journey. The deterministic priority order is strict:

1. urgent or critical disruption;
2. NEXT or current during-trip action;
3. time-sensitive preparation;
4. general preparation;
5. informational context.

Lower-priority signals remain available behind the selected surface or in focused detail; they never compete as equal cards.

```text
CURRENT TIMELINE
├─ Before trip
│  ├─ Countdown
│  ├─ Highest-priority “Before you go” action
│  └─ Chronological bookings
├─ Day before
│  ├─ Tomorrow's first meaningful event
│  ├─ Ticket/confirmation state
│  └─ Chronological bookings
├─ During trip
│  ├─ NEXT event/action
│  ├─ Immediate ticket/directions action
│  └─ Remaining chronological bookings
└─ Completed
   ├─ Trip completed
   └─ Readable trip history
```

## Needs Attention

```text
DETERMINISTIC SIGNALS
├─ Trip Brain
├─ Impact Engine
├─ Checklist
├─ Offline readiness
├─ Import confidence
└─ Sync conflicts
   ↓ prioritize
TIMELINE RESULT
├─ Show one highest-priority issue
├─ Optional “N more things to check”
└─ Open focused resolution flow
```

## Booking detail

```text
TAP TIMELINE ROW
└─ TYPE-SPECIFIC DETAIL
   ├─ Essential booking facts only
   ├─ Scheduled/stale/estimated provenance where relevant
   ├─ Contextual document or ticket
   ├─ Primary action
   ├─ Secondary action(s)
   └─ Edit
      ├─ Save → Timeline updates
      ├─ Conflict → Explicit resolution
      └─ Offline → Queue safely and show pending state
```

## Tickets & Documents

```text
TIMELINE
├─ Booking
│  └─ Tickets & Documents
│     ├─ Traveler-specific documents
│     ├─ Shared booking documents
│     └─ Availability / device-local status
└─ Trip Tickets & Documents
   ├─ Linked documents
   │  └─ Grouped by booking in journey order
   └─ Needs Attention / Unlinked
      └─ Link to Booking
         ├─ Existing booking
         └─ Other / Keep unlinked

UPLOAD OR FORWARDED EMAIL
├─ Reliable association → Link document automatically
└─ Insufficient confidence → Keep original → Needs Attention

REMOVE DOCUMENT
├─ Explain exact consequence
├─ Confirm explicitly
└─ Preserve the booking

REMOVE OR CANCEL BOOKING
└─ Preserve document history unless an explicit confirmed lifecycle rule applies
```

## Trip selection and history

```text
TAP {TRIP NAME} ▾
├─ Active trip
├─ Upcoming trips
└─ + Create New Trip
```

## Account

```text
ACCOUNT
├─ Profile
│  └─ Name + Google identity
├─ Trip History
│  ├─ Past
│  └─ Cancelled
├─ Booking Email
│  ├─ bookings@tripto.to
│  └─ Verified sender emails
├─ Notifications
├─ Help
│  ├─ Take the Tour
│  ├─ Support
│  ├─ Privacy
│  └─ Terms
└─ Account
   ├─ Sign out
   │  └─ Unsynced work? → Warn and preserve
   └─ Delete account
      └─ Explicit destructive confirmation
```

## Authentication state transitions

```text
GOOGLE CREDENTIAL
├─ Browser obtains GIS credential with nonce
├─ Worker verifies signature / iss / aud / exp / nonce
├─ Resolve auth_identities(provider='google', provider_subject=sub)
├─ Existing identity → Update safe profile fields
└─ New identity → Create user + identity
   ↓
MIGRATE CURRENT GUEST DEVICE WHEN ELIGIBLE
├─ Preserve trip and booking IDs
├─ Create owner memberships
├─ Reassign import/sync ownership
├─ Link device
└─ Issue fresh account session
```

## Inbound email state transitions

```text
EMAIL TO bookings@tripto.to
├─ Validate inbound provider signature
├─ Enforce size/type/rate limits
├─ Resolve verified envelope sender
│  ├─ Unknown → Quarantine + sender verification/recovery
│  └─ Verified → Continue
├─ Normalize content/attachments
├─ Run deterministic parser + duplicate fingerprint
├─ Find eligible trip candidates
│  ├─ One safe match → Assign candidate
│  ├─ Ambiguous → Ask “Which trip is this for?”
│  └─ No match → Inbox recovery requiring trip choice
└─ Confirm uncertain candidate fields → Materialize → Timeline
```

## Recovery and browser Back

```text
BACK / CLOSE
├─ No unsaved work → Return to prior logical state
└─ Meaningful unsaved work → Keep editing | Discard

OFFLINE / REQUEST FAILURE
├─ Read cached eligible Timeline
├─ Preserve draft or queued change
├─ Label stale/unavailable data
└─ Reconnect → sync → expose unresolved conflicts
```
