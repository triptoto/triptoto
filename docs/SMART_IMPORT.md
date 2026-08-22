# Smart Import

Smart Import recognizes travel documents on the traveler’s device. It is deterministic and does not use generative AI.

## Supported inputs

- PDF, including embedded text with local OCR fallback;
- JPEG/JPG, PNG, WEBP and browser-decodable HEIC/HEIF;
- TXT and forwarded EML;
- DOCX;
- ICS calendar files;
- Apple Wallet PKPASS files.

The limit is 10 MiB per file. PDF.js, Tesseract, QR fallback code, OCR language data and PDF support files are shipped from this application’s own origin. Native `BarcodeDetector` is preferred where supported; the local QR decoder is the fallback.

## Data flow

1. The browser validates type and size and calculates SHA-256.
2. The original file is stored in the existing IndexedDB document store.
3. Local extractors read embedded text, calendar/wallet fields, barcodes or OCR.
4. The deterministic classifier proposes a booking type and per-field `value`, `confidence` and `source`.
5. The traveler reviews and may edit every proposed field or booking type.
6. Only after explicit confirmation is the structured booking materialized in D1.

The Worker never receives the original bytes, OCR text, barcode payload evidence or document archive contents. The upload-preview request contains only checksum, filename, format, structured field values, confidence/source metadata and warnings. Import analytics do not contain extracted content.

## Recognition types

Flight, hotel, train, rental car, transfer, ferry, activity, restaurant, reservation and generic ticket. A result that cannot be classified safely stays unsupported. Ambiguous numeric dates are not guessed.

## Duplicate and recovery behavior

SHA-256 identifies a prior upload. A duplicate is never silently imported: the user can review the existing result, update it, or intentionally create a separate review. Recognition and local document storage work offline where the required local assets have already been cached. A structured preview created offline is queued locally and submitted after reconnect; it remains unconfirmed until the traveler reviews it.

## Provider boundary

`DocumentRecognitionProvider` is the stable interface. `LocalDocumentRecognitionProvider` is the only active implementation. `AIDocumentRecognitionProvider` is a disabled declaration and throws if invoked. `AI_ENABLED=false` remains the production default.

## Validation

```bash
npm run build:smart-import
npm run validate:smart-import-auth
```
