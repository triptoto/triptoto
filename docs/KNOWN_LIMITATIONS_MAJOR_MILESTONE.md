# Known limitations

## Smart Import and Google account milestone

- HEIC/HEIF works only when the browser can decode the selected file.
- Local OCR currently ships English recognition data. Low-quality scans and handwriting may need manual entry.
- PDF/OCR support assets must have been loaded once before their fallback can work offline.
- Only QR has a bundled JavaScript barcode fallback; Aztec, PDF417 and Data Matrix depend on native `BarcodeDetector` support.
- Recognition is deterministic and intentionally conservative. Ambiguous dates, missing timezones and incomplete flight times require user input.
- Google sign-in is implemented but remains hidden while `ACCOUNT_AUTH_ENABLED=false` or `GOOGLE_CLIENT_ID` is absent. Gmail, Drive and Calendar are not connected.

- Generic sync operations are queued but intentionally not auto-applied.
- Cross-device account authentication remains disabled until a verified provider is connected.
- Sharing remains disabled by feature flag.
- Documents remain local-only while R2 is disabled.
- Live-flight status is not available; scheduled booking data must not be presented as live.
- Trip Health does not estimate security, immigration or drive time without a reliable source.
- The Major Trip workspace is a beta management surface, not a final native mobile design.
