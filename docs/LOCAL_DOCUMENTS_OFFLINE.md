# Local-only offline documents

Milestone 3 provides useful document storage while R2 remains disabled.

Files selected in the web/PWA UI are stored in browser IndexedDB and are never uploaded to the Worker. This keeps mandatory cloud document cost at $0 while validating the product.

## Beta limits

- 10 MB per local file;
- 20 local documents per trip per device.

Supported labels include boarding pass, ticket, hotel confirmation, reservation, voucher, QR code and other.

Documents may be assigned to one or more travelers. Ready Offline reads the actual IndexedDB registry and shows per-traveler local-document coverage.

## Important limitations

- files do not sync to another device;
- clearing browser/site data can delete local files;
- there is no cloud restore while R2 is disabled;
- this is intentionally not represented as server-side document storage.

When R2 is enabled later, the local IndexedDB model should remain as the offline cache while secure cloud objects become the sync source.
