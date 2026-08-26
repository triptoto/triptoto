import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/manual-booking-attachments.js", "utf8");
for (const contract of [
  'const DB_NAME = "tripto-local-docs-v1"',
  "const DB_VERSION = 2",
  'const DRAFT_STORE = "bookingDrafts"',
  "stage,",
  "list,",
  "commit,",
  "remove,",
  "clear,",
  "retry,",
  "root.TriptoManualAttachments",
]) assert.ok(source.includes(contract), `missing attachment contract: ${contract}`);
assert.ok(!source.includes("fetch("), "local attachment helper must not send file bytes");
assert.ok(!source.includes("XMLHttpRequest"), "local attachment helper must not add a network path");
assert.ok(!source.includes("deleteObjectStore"), "the existing docs store must never be replaced");
assert.ok(source.includes('"UNSUPPORTED_FILE"'), "unsupported file selections need a stable traveler-facing error");

class NameList {
  constructor(values) { this.values = values; }
  contains(name) { return this.values.has(name); }
}

class StoreData {
  constructor(keyPath) {
    this.keyPath = keyPath;
    this.rows = new Map();
    this.indexes = new Map();
  }
}

class FakeTransaction {
  constructor(db, names) {
    this.db = db;
    this.names = new Set(Array.isArray(names) ? names : [names]);
    this.pending = 0;
    this.aborted = false;
    this.completionScheduled = false;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
  }
  objectStore(name) {
    if (!this.names.has(name)) throw new Error(`Store ${name} is not in this transaction`);
    return new FakeStore(this.db.stores.get(name), this);
  }
  request(operation) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending += 1;
    queueMicrotask(() => {
      if (this.aborted) return;
      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        this.error = error;
        request.onerror?.({ target: request });
        this.onerror?.({ target: this });
      } finally {
        this.pending -= 1;
        this.scheduleCompletion();
      }
    });
    return request;
  }
  scheduleCompletion() {
    if (this.completionScheduled) return;
    this.completionScheduled = true;
    setTimeout(() => {
      this.completionScheduled = false;
      if (!this.aborted && this.pending === 0) this.oncomplete?.({ target: this });
      else if (!this.aborted) this.scheduleCompletion();
    }, 0);
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.onabort?.({ target: this }));
  }
}

class FakeIndex {
  constructor(data, keyPath, tx) { this.data = data; this.keyPath = keyPath; this.tx = tx; }
  getAll(value) {
    return this.tx.request(() => [...this.data.rows.values()].filter((row) => row[this.keyPath] === value));
  }
}

class FakeStore {
  constructor(data, tx = null) { this.data = data; this.tx = tx; }
  get indexNames() { return new NameList(this.data.indexes); }
  createIndex(name, keyPath) { this.data.indexes.set(name, keyPath); return this; }
  index(name) {
    if (!this.data.indexes.has(name)) throw new Error(`Missing index ${name}`);
    return new FakeIndex(this.data, this.data.indexes.get(name), this.tx);
  }
  getAll() { return this.tx.request(() => [...this.data.rows.values()]); }
  get(key) { return this.tx.request(() => this.data.rows.get(key)); }
  put(row) {
    return this.tx.request(() => {
      const key = row[this.data.keyPath];
      if (key == null) throw new Error(`Missing key ${this.data.keyPath}`);
      this.data.rows.set(key, row);
      return key;
    });
  }
  delete(key) { return this.tx.request(() => this.data.rows.delete(key)); }
}

class FakeDatabase {
  constructor(version = 0) { this.version = version; this.stores = new Map(); }
  get objectStoreNames() { return new NameList(this.stores); }
  createObjectStore(name, { keyPath }) {
    const data = new StoreData(keyPath);
    this.stores.set(name, data);
    return new FakeStore(data);
  }
  transaction(names) { return new FakeTransaction(this, names); }
}

class FakeIndexedDB {
  constructor() { this.databases = new Map(); }
  seedV1(name, row) {
    const db = new FakeDatabase(1), docs = db.createObjectStore("docs", { keyPath: "id" });
    docs.createIndex("tripId", "tripId", { unique: false });
    docs.data.rows.set(row.id, row);
    this.databases.set(name, db);
  }
  open(name, version) {
    const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
    queueMicrotask(() => {
      let db = this.databases.get(name);
      if (!db) { db = new FakeDatabase(); this.databases.set(name, db); }
      request.result = db;
      if (version < db.version) {
        request.error = new Error("VersionError");
        request.onerror?.({ target: request });
        return;
      }
      if (version > db.version) {
        const oldVersion = db.version;
        db.version = version;
        request.onupgradeneeded?.({ oldVersion, newVersion: version, target: request });
      }
      request.onsuccess?.({ target: request });
    });
    return request;
  }
  database(name) { return this.databases.get(name); }
}

const sandbox = {
  Blob,
  URL,
  console,
  crypto: webcrypto,
  queueMicrotask,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
runInNewContext(source, sandbox, { filename: "manual-booking-attachments.js" });
const factory = sandbox.TriptoManualAttachments?.create;
assert.equal(typeof factory, "function", "attachment factory unavailable");

const fake = new FakeIndexedDB();
const originalDoc = Object.freeze({
  id: "existing-doc",
  tripId: "trip-1",
  checksum: "f".repeat(64),
  name: "existing.pdf",
});
fake.seedV1("tripto-local-docs-v1", originalDoc);
let clock = 1_000;
const service = factory({ indexedDB: fake, crypto: webcrypto, now: () => ++clock });

function namedBlob(text, name, type = "application/pdf") {
  const blob = new Blob([text], { type });
  Object.defineProperties(blob, {
    name: { value: name, enumerable: true },
    lastModified: { value: 123, enumerable: true },
  });
  return blob;
}

const draftShape = [
  "schemaVersion", "draftId", "tripId", "bookingId", "kind", "type",
  "status", "travelerIds", "files", "checksums", "attempts", "lastError",
  "createdAt", "updatedAt", "linkedAt", "fileCount", "totalBytes",
  "statusLabel", "retryable", "accessibleLabel",
];
const fileShape = [
  "id", "name", "mime", "size", "lastModified", "type", "checksum",
  "blob", "integrity", "sizeLabel", "accessibleLabel",
];
function assertDraftShape(record, expectedStatus) {
  for (const key of draftShape)
    assert.equal(Object.hasOwn(record, key), true, `DraftRecord is missing ${key}`);
  for (const file of record.files)
    for (const key of fileShape)
      assert.equal(Object.hasOwn(file, key), true, `FileRecord is missing ${key}`);
  assert.equal(record.status, expectedStatus);
}

const first = namedBlob("boarding pass", "boarding-pass.pdf");
const second = namedBlob("hotel voucher", "hotel-voucher.pdf");
const staged = await service.stage(
  { draftId: "draft-1", tripId: "trip-1" },
  [first, second],
  { kind: "flight", type: "ticket", travelerIds: ["traveler-b", "traveler-a", "traveler-a"] },
);
assert.equal(fake.database("tripto-local-docs-v1").version, 2, "database did not upgrade to v2");
assert.ok(fake.database("tripto-local-docs-v1").stores.has("bookingDrafts"), "bookingDrafts store missing");
assert.deepEqual(fake.database("tripto-local-docs-v1").stores.get("docs").rows.get("existing-doc"), originalDoc, "v1 docs row changed during upgrade");
assert.equal(staged.fileCount, 2, "multi-file selection was not staged");
assertDraftShape(staged, "staged");
assert.deepEqual([...staged.travelerIds], ["traveler-a", "traveler-b"], "traveler IDs are not deterministic");
assert.match(staged.accessibleLabel, /2 local attachments\. Ready to attach\./);
for (const [index, file] of staged.files.entries()) {
  assert.equal(file.checksum, createHash("sha256").update(index ? "hotel voucher" : "boarding pass").digest("hex"));
  assert.equal(file.integrity, "verified");
  assert.ok(file.blob instanceof Blob, "local Blob was not retained");
  assert.match(file.accessibleLabel, /integrity verified/);
}

const replay = await service.stage(
  { draftId: "draft-1", tripId: "trip-1" },
  [first, second],
  { kind: "flight", type: "ticket", travelerIds: ["traveler-a", "traveler-b"] },
);
assert.equal(replay.createdAt, staged.createdAt, "same draft retry was not idempotent");

const listed = await service.list({ tripId: "trip-1" });
assert.equal(Array.isArray(listed), true, "list must always return a DraftRecord array");
assert.equal(listed.length, 1);
assertDraftShape(listed[0], "staged");
assert.equal(listed[0].files.every((file) => file.integrity === "verified"), true);

const retyped = await service.retype("draft-1", staged.files[0].id, "boarding_pass");
assertDraftShape(retyped, "staged");
assert.equal(retyped.files[0].type, "boarding_pass", "retype did not update the selected file");
assert.equal(retyped.files[1].type, "ticket", "retype changed a different staged file");
assert.equal(retyped.type, "other", "mixed per-file types must use the deterministic draft type");
assert.equal(retyped.files[0].checksum, staged.files[0].checksum, "retype changed verified bytes");
assert.ok(retyped.files[0].blob instanceof Blob, "retype did not preserve the local Blob");
const repeatedRetype = await service.retype("draft-1", staged.files[0].id, "boarding_pass");
assert.equal(repeatedRetype.files[0].type, "boarding_pass", "retype retry was not idempotent");
await assert.rejects(
  service.retype("draft-1", staged.files[0].id, "unsupported-document-type"),
  (error) => error.code === "INVALID_DOCUMENT_TYPE",
  "retype must reject unsupported document types",
);

const removable = await service.stage(
  { draftId: "draft-remove", tripId: "trip-remove" },
  [namedBlob("first removable", "first.pdf"), namedBlob("second removable", "second.pdf")],
  { kind: "hotel", type: "confirmation" },
);
const firstRemoval = await service.remove("draft-remove", removable.files[0].id);
assert.equal(firstRemoval.removed, true);
assert.equal(firstRemoval.draftId, "draft-remove");
assert.equal(firstRemoval.fileId, removable.files[0].id);
assertDraftShape(firstRemoval.remaining, "staged");
assert.equal(firstRemoval.remaining.fileCount, 1, "per-file removal removed the wrong number of files");
const repeatedRemoval = await service.remove("draft-remove", removable.files[0].id);
assert.equal(repeatedRemoval.removed, false, "repeated per-file removal must be idempotent");
assert.equal(repeatedRemoval.remaining.fileCount, 1);
const finalRemoval = await service.remove("draft-remove", removable.files[1].id);
assert.equal(finalRemoval.removed, true);
assert.equal(finalRemoval.remaining, null, "removing the final file must clear the empty draft");
assert.equal((await service.list({ draftId: "draft-remove" })).length, 0);
const absentRemoval = await service.remove("draft-remove", removable.files[1].id);
assert.equal(absentRemoval.removed, false, "removing from an already cleared draft must be idempotent");
assert.equal(absentRemoval.remaining, null);

const linked = await service.commit(
  { draftId: "draft-1", tripId: "trip-1" },
  { tripId: "trip-1", bookingId: "flight-1", kind: "flight", travelerIds: ["traveler-a"] },
);
assert.equal(linked.status, "linked");
assertDraftShape(linked, "linked");
assert.equal(linked.bookingId, "flight-1");
assert.equal(linked.documentIds.length, 2, "linked draft does not expose both local documents");
const committedDocs = [...fake.database("tripto-local-docs-v1").stores.get("docs").rows.values()]
  .filter((document) => document.relatedBookingId === "flight-1");
assert.equal(committedDocs.length, 2, "commit did not move both staged files into the existing docs store");
assert.deepEqual(
  committedDocs.map((document) => document.type).sort(),
  ["boarding_pass", "ticket"],
  "commit did not preserve each staged file's selected document type",
);
assert.deepEqual(
  committedDocs.map((document) => document.tripId),
  ["trip-1", "trip-1"],
  "committed documents were linked to the wrong trip",
);
assert.equal(
  committedDocs.every((document) =>
    document.integrity === "verified" &&
    document.blob instanceof Blob &&
    document.travelerIds.length === 1 &&
    document.travelerIds[0] === "traveler-a"),
  true,
  "committed local document metadata is incomplete",
);
assert.equal((await service.commit("draft-1", { tripId: "trip-1", bookingId: "flight-1" })).bookingId, "flight-1", "commit retry was not idempotent");
assert.equal(
  [...fake.database("tripto-local-docs-v1").stores.get("docs").rows.values()]
    .filter((document) => document.relatedBookingId === "flight-1").length,
  2,
  "idempotent commit duplicated local documents",
);
await assert.rejects(
  service.commit("draft-1", { tripId: "trip-1", bookingId: "flight-2" }),
  (error) => error.code === "BOOKING_MISMATCH",
);
await assert.rejects(
  service.remove("draft-1", linked.files[0].id),
  (error) => error.code === "ATTACHMENTS_LINKED",
  "linked booking documents must not be removable through the draft API",
);
await assert.rejects(
  service.retype("draft-1", linked.files[0].id, "ticket"),
  (error) => error.code === "ATTACHMENTS_LINKED",
  "linked booking documents must not be retyped through the draft API",
);

await service.stage(
  { draftId: "draft-2", tripId: "trip-2" },
  [namedBlob("rail ticket", "rail.pdf")],
  { kind: "train", type: "ticket" },
);
const failed = await service.fail("draft-2", new Error("Temporary booking failure"));
assert.equal(failed.status, "failed");
assert.equal(failed.retryable, true);
const retried = await service.retry("draft-2");
assert.equal(retried.status, "staged");
assert.equal(retried.attempts, 1);
const retryLinked = await service.retry("draft-2", { tripId: "trip-2", bookingId: "train-1", kind: "train" });
assert.equal(retryLinked.status, "linked");
assert.equal(retryLinked.bookingId, "train-1");

await assert.rejects(
  service.stage(
    { draftId: "duplicate-draft", tripId: "trip-1" },
    [first],
    { type: "ticket" },
  ),
  (error) => error.code === "DUPLICATE_FILE",
);

const supportedTypes = await service.stage(
  { draftId: "supported-types", tripId: "trip-supported-types" },
  [
    namedBlob("pdf", "document.pdf", "application/pdf"),
    namedBlob("jpeg", "photo.jpg", "image/jpeg"),
    namedBlob("png", "map.png", "image/png"),
    namedBlob("webp", "hotel.webp", "image/webp"),
    namedBlob("pkpass", "boarding.PKPASS", ""),
  ],
  { type: "travel-document" },
);
assert.deepEqual(
  [...supportedTypes.files].map((file) => file.mime),
  [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.apple.pkpass",
  ],
  "supported MIME types or safe extension fallback were not normalized",
);
await service.clear("supported-types");

await assert.rejects(
  service.stage(
    { draftId: "unsupported", tripId: "trip-unsupported" },
    [namedBlob("executable", "malware.exe", "application/x-msdownload")],
    {},
  ),
  (error) =>
    error.code === "UNSUPPORTED_FILE" &&
    /PDF, JPG, PNG, WEBP, or PKPASS/.test(error.message),
  "unsupported files need a stable, traveler-facing format message",
);
await assert.rejects(
  service.stage(
    { draftId: "mime-mismatch", tripId: "trip-unsupported" },
    [namedBlob("html", "looks-safe.pdf", "text/html")],
    {},
  ),
  (error) => error.code === "UNSUPPORTED_FILE",
  "a safe-looking extension must not override a known unsupported MIME",
);

const unreadableFile = {
  name: "broken.pdf",
  type: "application/pdf",
  size: 12,
  lastModified: 123,
  async arrayBuffer() { throw new Error("Simulated unreadable file"); },
};
await assert.rejects(
  service.stage(
    { draftId: "unreadable", tripId: "trip-unreadable" },
    [unreadableFile],
    {},
  ),
  (error) => error.code === "INVALID_FILE" && /could not be read/.test(error.message),
  "unreadable bytes need a traveler-facing error before local persistence",
);

await service.stage(
  { draftId: "corrupt-after-stage", tripId: "trip-corrupt" },
  [namedBlob("initially readable", "voucher.pdf")],
  {},
);
fake.database("tripto-local-docs-v1").stores
  .get("bookingDrafts").rows
  .get("corrupt-after-stage").files[0].blob = unreadableFile;
await assert.rejects(
  service.commit("corrupt-after-stage", {
    tripId: "trip-corrupt",
    bookingId: "corrupt-booking",
  }),
  (error) => error.code === "INTEGRITY_FAILED",
  "corrupt staged bytes must never be linked into the docs store",
);
const corruptDraft = (await service.list({ draftId: "corrupt-after-stage" }))[0];
assert.equal(corruptDraft.status, "failed");
assert.equal(corruptDraft.files[0].integrity, "unverified");
assert.equal(
  [...fake.database("tripto-local-docs-v1").stores.get("docs").rows.values()]
    .some((document) => document.relatedBookingId === "corrupt-booking"),
  false,
);
await service.clear("corrupt-after-stage");

const tooLarge = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]);
Object.defineProperty(tooLarge, "name", { value: "too-large.pdf" });
await assert.rejects(
  service.stage({ draftId: "large", tripId: "trip-large" }, [tooLarge], {}),
  (error) => error.code === "FILE_TOO_LARGE",
);

const twenty = Array.from({ length: 20 }, (_, index) => namedBlob(`file-${index}`, `file-${index}.pdf`));
await service.stage({ draftId: "limit-20", tripId: "trip-limit" }, twenty, { type: "other" });
await assert.rejects(
  service.stage(
    { draftId: "limit-21", tripId: "trip-limit" },
    [namedBlob("file-21", "file-21.pdf")],
    { type: "other" },
  ),
  (error) => error.code === "TRIP_DOCUMENT_LIMIT",
);

const cleared = await service.clear("draft-2");
assert.equal(cleared.cleared, true);
assert.equal(cleared.draftId, "draft-2");
assert.equal((await service.list({ draftId: "draft-2" })).length, 0);

console.log("Manual booking attachment contract passed: v2 upgrade, supported types, integrity, multi-file removal, limits, link and retry recovery.");
