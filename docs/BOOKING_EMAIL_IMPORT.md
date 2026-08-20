# Deterministic booking-email import

Milestone 3 adds a rules-based booking-email import path without generative AI.

## Current beta path

The user pastes the plain text of a forwarded booking confirmation into the app. The Worker:

1. validates trip write access and beta import quota;
2. parses the text in memory using deterministic rules;
3. computes a SHA-256 fingerprint scoped to the trip;
4. stores only import metadata, sender/subject metadata, normalized hashes, candidate JSON, confidence and recovery state;
5. **does not persist the raw forwarded-email body**;
6. returns candidate previews that must be confirmed or rejected by the user;
7. materializes only explicitly confirmed candidates into the trip.

There is no automatic high-impact action from uncertain data. Ambiguous numeric locale dates are not guessed. Airport timezones must be explicitly confirmed before a flight is created.

## Supported candidates

- flight: airline/flight number, IATA route, local departure/arrival text, booking reference;
- stay: property name, address, check-in/check-out dates, confirmation number.

Unsupported or incomplete formats remain in recovery state and users can fall back to manual entry.

## Duplicate safety

The import fingerprint is derived from trip ID + sender + subject + normalized message text. Repeating the same import returns the existing import instead of duplicating trip entities.

## Quotas

- max forwarded-email text: 80,000 characters;
- max 20 booking-email previews per trip per rolling 24 hours.

## Future inbound forwarding

A real inbound forwarding address / Email Worker adapter can call the same deterministic parser later. No inbound mail provider is connected in this milestone and Gmail OAuth remains disabled.
