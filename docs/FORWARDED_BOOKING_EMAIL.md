# Forwarded booking email

Travelers forward confirmations from the Google-verified email on their tripto.to account to `go@tripto.to`.

## What happens

1. Cloudflare Email Routing sends the original message to the `tripto-api` Email Worker.
2. The Worker accepts only the exact `go@tripto.to` envelope address and a sender in `verified_sender_emails`.
3. The deterministic parser reads the message in memory. Raw message content is not stored.
4. The Worker stores the subject, sender identity, fingerprint, normalized candidate fields, confidence, and warnings.
5. If exactly one active/upcoming/draft trip belongs to the account, the review is attached to it. If several or no eligible trips exist, the review stays unassigned.
6. Email Inbox asks the traveler to choose a trip when needed and always shows the extracted fields for confirmation.
7. A timeline item is created only after the traveler confirms a candidate.

The product does not guess the trip from subject text, destination, dates, or the device timezone.

## Privacy and safety

- Only Google-verified senders are accepted.
- Message fingerprints make repeated forwarding idempotent.
- Raw email bodies and attachments are not persisted by this flow.
- Inbox reads and trip assignment are scoped to the authenticated account.
- Assigning an email requires write access to the selected trip.
- AI, Gmail Sync, live flights, R2 documents, sharing, demo tools, and ops remain disabled.

## Operations

List the routing rules:

```sh
npx wrangler email routing rules list tripto.to
```

The production rule must be enabled and match the literal destination `go@tripto.to`, with action `worker` and value `tripto-api`.

Run the deployed smoke check:

```sh
bash scripts/smoke-booking-email.sh https://tripto.to "$TRIPTO_SESSION_TOKEN"
```

The optional token checks the authenticated Email Inbox. A real end-to-end ingress check requires forwarding a unique confirmation from a verified sender and confirming that it appears in Email Inbox before any timeline item is created.

## Known limitations

- Only deterministic airline, hotel, train, and supported confirmation formats produce candidates.
- Unsupported formats remain visible with a calm recovery path; they do not create travel data.
- Email attachments are not stored in R2 and are not treated as offline-ready documents.
- A user with no trip must create one before assigning a review.
