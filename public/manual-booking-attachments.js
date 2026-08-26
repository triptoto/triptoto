(function (root) {
  "use strict";

  const DB_NAME = "tripto-local-docs-v1";
  const DB_VERSION = 2;
  const DRAFT_STORE = "bookingDrafts";
  const DOC_STORE = "docs";
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_DOCUMENTS_PER_TRIP = 20;
  const VALID_STATUSES = new Set(["staged", "failed", "linked"]);
  const DOCUMENT_TYPES = new Set([
    "boarding_pass",
    "ticket",
    "hotel_confirmation",
    "reservation",
    "qr_code",
    "other",
  ]);
  const SUPPORTED_MIME_TYPES = new Map([
    ["application/pdf", "application/pdf"],
    ["image/jpeg", "image/jpeg"],
    ["image/jpg", "image/jpeg"],
    ["image/png", "image/png"],
    ["image/webp", "image/webp"],
    ["application/vnd.apple.pkpass", "application/vnd.apple.pkpass"],
    ["application/x-apple-pkpass", "application/vnd.apple.pkpass"],
  ]);
  const SUPPORTED_EXTENSION_TYPES = Object.freeze({
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pkpass: "application/vnd.apple.pkpass",
  });
  const GENERIC_MIME_TYPES = new Set([
    "",
    "application/octet-stream",
    "binary/octet-stream",
  ]);

  /**
   * UI adapter contract
   *
   * Scope:
   * - `stage` requires `{ draftId, tripId }`.
   * - `list` accepts `{ draftId }` or `{ tripId }` and always returns an array.
   * - `commit`, `remove`, `retype`, `retry`, and `clear` accept a draftId string or
   *   `{ draftId, tripId? }`.
   *
   * FileRecord returned inside `files`:
   * `{ id, name, mime, size, lastModified, type, checksum, blob, integrity,
   *    sizeLabel, accessibleLabel }`.
   *
   * DraftRecord returned by `stage` and `commit`, and inside the `list` array:
   * `{ schemaVersion, draftId, tripId, bookingId, kind, type, status,
   *    travelerIds, files, checksums, attempts, lastError, createdAt,
   *    updatedAt, linkedAt, documentIds?, fileCount, totalBytes, statusLabel,
   *    retryable, accessibleLabel }`.
   * `commit` always returns a DraftRecord whose status is `linked`.
   *
   * `remove` returns
   * `{ removed, draftId, fileId, remaining }`, where `remaining` is the updated
   * DraftRecord or null when the final file removed the draft.
   */

  function attachmentError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function requiredId(value, name) {
    const id = String(value || "").trim();
    if (!id || id.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(id))
      throw attachmentError(
        "INVALID_SCOPE",
        `${name} must be a stable local identifier.`,
      );
    return id;
  }

  function normalizeScope(scope, requireTrip = false) {
    const value = typeof scope === "string" ? { draftId: scope } : scope || {};
    const draftId = requiredId(value.draftId, "draftId");
    const tripId = value.tripId ? requiredId(value.tripId, "tripId") : "";
    if (requireTrip && !tripId)
      throw attachmentError("INVALID_SCOPE", "tripId is required to stage files.");
    return { draftId, tripId };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || attachmentError("STORAGE_FAILED", "Local attachment storage failed."));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error || attachmentError("STORAGE_FAILED", "Local attachment storage failed."));
    });
  }

  function openDatabase(indexedDb) {
    return new Promise((resolve, reject) => {
      if (!indexedDb?.open) {
        reject(
          attachmentError(
            "STORAGE_UNAVAILABLE",
            "Local attachment storage is unavailable on this device.",
          ),
        );
        return;
      }
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        // A fresh install still needs the v1 store. Existing `docs` stores are
        // intentionally left unchanged: no deletion, rewrite, or new index.
        if (!db.objectStoreNames.contains(DOC_STORE)) {
          const docs = db.createObjectStore(DOC_STORE, { keyPath: "id" });
          docs.createIndex("tripId", "tripId", { unique: false });
        }
        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          const drafts = db.createObjectStore(DRAFT_STORE, {
            keyPath: "draftId",
          });
          drafts.createIndex("tripId", "tripId", { unique: false });
          drafts.createIndex("status", "status", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ||
            attachmentError("STORAGE_FAILED", "Could not open local attachment storage."),
        );
      request.onblocked = () =>
        reject(
          attachmentError(
            "STORAGE_BLOCKED",
            "Close another tripto.to tab, then try attaching the files again.",
          ),
        );
    });
  }

  function rowsForTrip(store, tripId) {
    if (store.indexNames?.contains?.("tripId"))
      return requestResult(store.index("tripId").getAll(tripId));
    return requestResult(store.getAll()).then((rows) =>
      rows.filter((row) => String(row.tripId) === tripId),
    );
  }

  async function sha256(blob, cryptoLike) {
    if (!cryptoLike?.subtle?.digest)
      throw attachmentError(
        "INTEGRITY_UNAVAILABLE",
        "File integrity verification is unavailable on this device.",
      );
    const digest = await cryptoLike.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  function cleanText(value, fallback, max = 240) {
    const text = String(value || fallback || "").trim();
    return text.slice(0, max) || fallback;
  }

  function normalizeTravelerIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(String).map((id) => id.trim()).filter(Boolean))]
      .sort()
      .slice(0, 20);
  }

  function normalizedSupportedMime(file) {
    const supplied = String(file?.type || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const supported = SUPPORTED_MIME_TYPES.get(supplied);
    if (supported) return supported;
    // A filename is only a fallback when the platform did not provide a
    // meaningful MIME. It must never override a known unsupported MIME.
    if (!GENERIC_MIME_TYPES.has(supplied)) return "";
    const name = String(file?.name || "").trim().toLowerCase();
    const match = name.match(/\.([a-z0-9]+)$/);
    return match ? SUPPORTED_EXTENSION_TYPES[match[1]] || "" : "";
  }

  function fileSizeLabel(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} bytes`;
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function statusLabel(status) {
    return {
      staged: "Ready to attach",
      failed: "Attachment needs retry",
      linked: "Attached to booking",
    }[status] || "Attachment status unavailable";
  }

  function publicRecord(record, integrityByChecksum = null) {
    const files = (record.files || []).map((file) => {
      const integrity = integrityByChecksum?.get(file.checksum) || "verified";
      return {
        ...file,
        integrity,
        sizeLabel: fileSizeLabel(file.size),
        accessibleLabel: `${file.name}, ${fileSizeLabel(file.size)}, ${
          integrity === "verified" ? "integrity verified" : "integrity check failed"
        }`,
      };
    });
    return {
      ...record,
      files,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
      statusLabel: statusLabel(record.status),
      retryable: record.status === "failed",
      accessibleLabel: `${files.length} local attachment${files.length === 1 ? "" : "s"}. ${statusLabel(record.status)}.`,
    };
  }

  function sameManifest(record, files, type, travelerIds) {
    if (!record || record.type !== type) return false;
    if (JSON.stringify(record.travelerIds || []) !== JSON.stringify(travelerIds))
      return false;
    return (
      (record.files || []).length === files.length &&
      record.files.every((file, index) => file.checksum === files[index].checksum)
    );
  }

  function create(options = {}) {
    const indexedDb = options.indexedDB || root.indexedDB;
    const cryptoLike = options.crypto || root.crypto;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    let databasePromise;

    const database = () =>
      (databasePromise ||= openDatabase(indexedDb).catch((error) => {
        databasePromise = null;
        throw error;
      }));

    async function readDraft(scope) {
      const { draftId } = normalizeScope(scope);
      const db = await database();
      const tx = db.transaction(DRAFT_STORE, "readonly");
      const done = transactionDone(tx);
      const row = await requestResult(tx.objectStore(DRAFT_STORE).get(draftId));
      await done;
      return row || null;
    }

    async function writeDraft(record) {
      const db = await database();
      const tx = db.transaction(DRAFT_STORE, "readwrite");
      const done = transactionDone(tx);
      await requestResult(tx.objectStore(DRAFT_STORE).put(record));
      await done;
      return record;
    }

    async function verifyFiles(files) {
      const integrity = new Map();
      for (const file of files || []) {
        let result = "unverified";
        try {
          result = file.blob && (await sha256(file.blob, cryptoLike)) === file.checksum
            ? "verified"
            : "corrupt";
        } catch (_) {
          result = "unverified";
        }
        integrity.set(file.checksum, result);
      }
      return integrity;
    }

    async function stage(scope, selectedFiles, meta = {}) {
      const { draftId, tripId } = normalizeScope(scope, true);
      const input = Array.from(selectedFiles || []);
      if (!input.length)
        throw attachmentError("FILE_REQUIRED", "Choose at least one file to attach.");
      if (input.length > MAX_DOCUMENTS_PER_TRIP)
        throw attachmentError(
          "TOO_MANY_FILES",
          `Choose no more than ${MAX_DOCUMENTS_PER_TRIP} files.`,
        );

      const type = cleanText(meta.type || meta.kind, "other", 80);
      const travelerIds = normalizeTravelerIds(meta.travelerIds);
      const files = [];
      const selectionChecksums = new Set();
      for (const blob of input) {
        if (!blob || typeof blob.arrayBuffer !== "function")
          throw attachmentError("INVALID_FILE", "One selected attachment is not a readable file.");
        const name = cleanText(blob.name, "document");
        const nameForMessage = name === "document" ? "This file" : name;
        const size = Number(blob.size);
        if (!Number.isFinite(size) || size < 0)
          throw attachmentError("INVALID_FILE", `${nameForMessage} is not a readable file.`);
        const mime = normalizedSupportedMime(blob);
        if (!mime)
          throw attachmentError(
            "UNSUPPORTED_FILE",
            `${nameForMessage} is not supported. Choose a PDF, JPG, PNG, WEBP, or PKPASS file.`,
          );
        if (size > MAX_FILE_BYTES)
          throw attachmentError(
            "FILE_TOO_LARGE",
            `${nameForMessage} is larger than 10 MB.`,
          );
        let checksum;
        try {
          checksum = await sha256(blob, cryptoLike);
        } catch (error) {
          if (error?.code === "INTEGRITY_UNAVAILABLE") throw error;
          throw attachmentError(
            "INVALID_FILE",
            `${nameForMessage} could not be read. Choose the file again.`,
          );
        }
        if (selectionChecksums.has(checksum))
          throw attachmentError(
            "DUPLICATE_FILE",
            `${name} is selected more than once.`,
          );
        selectionChecksums.add(checksum);
        files.push({
          id: `local_${checksum}`,
          name,
          mime,
          size,
          lastModified: Number(blob.lastModified || 0) || null,
          type,
          checksum,
          blob,
        });
      }

      const db = await database();
      const tx = db.transaction([DOC_STORE, DRAFT_STORE], "readwrite");
      const done = transactionDone(tx);
      const docStore = tx.objectStore(DOC_STORE);
      const draftStore = tx.objectStore(DRAFT_STORE);
      try {
        const [documents, drafts] = await Promise.all([
          rowsForTrip(docStore, tripId),
          rowsForTrip(draftStore, tripId),
        ]);
        const existing = drafts.find((draft) => draft.draftId === draftId) || null;
        if (sameManifest(existing, files, type, travelerIds)) {
          await done;
          return publicRecord(existing, await verifyFiles(existing.files));
        }
        const otherDrafts = drafts.filter(
          (draft) => draft.draftId !== draftId && draft.status !== "linked",
        );
        const existingChecksums = new Set([
          ...documents.map((document) => document.checksum).filter(Boolean),
          ...otherDrafts.flatMap((draft) =>
            (draft.files || []).map((file) => file.checksum).filter(Boolean),
          ),
        ]);
        const duplicate = files.find((file) => existingChecksums.has(file.checksum));
        if (duplicate)
          throw attachmentError(
            "DUPLICATE_FILE",
            `${duplicate.name} is already saved for this trip.`,
          );
        const used = documents.length + otherDrafts.reduce(
          (count, draft) => count + (draft.files || []).length,
          0,
        );
        if (used + files.length > MAX_DOCUMENTS_PER_TRIP)
          throw attachmentError(
            "TRIP_DOCUMENT_LIMIT",
            `This trip can keep up to ${MAX_DOCUMENTS_PER_TRIP} local documents on this device.`,
          );
        const timestamp = now();
        const record = {
          schemaVersion: 1,
          draftId,
          tripId,
          bookingId: null,
          kind: cleanText(meta.kind, type, 80),
          type,
          status: "staged",
          travelerIds,
          files,
          checksums: files.map((file) => file.checksum),
          attempts: Number(existing?.attempts || 0),
          lastError: null,
          createdAt: Number(existing?.createdAt || timestamp),
          updatedAt: timestamp,
          linkedAt: null,
        };
        await requestResult(draftStore.put(record));
        await done;
        return publicRecord(record, new Map(files.map((file) => [file.checksum, "verified"])));
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        // Observe the abort rejection so validation errors do not create an
        // unhandled promise rejection in browsers.
        done.catch(() => {});
        throw error;
      }
    }

    async function list(scope) {
      const value = typeof scope === "string" ? { draftId: scope } : scope || {};
      const draftId = value.draftId ? requiredId(value.draftId, "draftId") : "";
      const tripId = value.tripId ? requiredId(value.tripId, "tripId") : "";
      if (!draftId && !tripId)
        throw attachmentError("INVALID_SCOPE", "draftId or tripId is required.");
      const db = await database();
      const tx = db.transaction(DRAFT_STORE, "readonly");
      const done = transactionDone(tx);
      const store = tx.objectStore(DRAFT_STORE);
      const rows = draftId
        ? [await requestResult(store.get(draftId))].filter(Boolean)
        : await rowsForTrip(store, tripId);
      await done;
      const output = [];
      for (const record of rows.sort(
        (a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0) ||
          String(a.draftId).localeCompare(String(b.draftId)),
      )) {
        output.push(publicRecord(record, await verifyFiles(record.files)));
      }
      return output;
    }

    async function commit(scope, details = {}) {
      const normalized = normalizeScope(scope);
      const record = await readDraft(normalized);
      if (!record)
        throw attachmentError("DRAFT_NOT_FOUND", "The local attachment draft is unavailable.");
      const tripId = requiredId(details.tripId || normalized.tripId || record.tripId, "tripId");
      if (tripId !== record.tripId)
        throw attachmentError("TRIP_MISMATCH", "The attachments belong to another trip.");
      const bookingId = requiredId(details.bookingId, "bookingId");
      if (record.status === "linked") {
        if (record.bookingId !== bookingId)
          throw attachmentError(
            "BOOKING_MISMATCH",
            "These attachments are already linked to another booking.",
          );
        return publicRecord(record, await verifyFiles(record.files));
      }
      const integrity = await verifyFiles(record.files);
      if ([...integrity.values()].some((value) => value !== "verified")) {
        const failed = {
          ...record,
          status: "failed",
          lastError: "File integrity could not be verified.",
          updatedAt: now(),
        };
        await writeDraft(failed);
        throw attachmentError(
          "INTEGRITY_FAILED",
          "A selected file changed or can no longer be read. Choose it again.",
        );
      }
      const documentIds = [];
      for (const file of record.files) {
        documentIds.push(
          `doc_${await sha256(new Blob([tripId, ":", file.checksum]), cryptoLike)}`,
        );
      }
      const linkedAt = now();
      const linked = {
        ...record,
        bookingId,
        kind: cleanText(details.kind, record.kind || record.type, 80),
        travelerIds: normalizeTravelerIds(details.travelerIds || record.travelerIds),
        status: "linked",
        lastError: null,
        documentIds,
        linkedAt,
        updatedAt: linkedAt,
      };
      const db = await database();
      const tx = db.transaction([DOC_STORE, DRAFT_STORE], "readwrite");
      const done = transactionDone(tx);
      const docs = tx.objectStore(DOC_STORE), drafts = tx.objectStore(DRAFT_STORE);
      try {
        const [savedDocs, allDrafts] = await Promise.all([
          rowsForTrip(docs, tripId),
          rowsForTrip(drafts, tripId),
        ]);
        const current = allDrafts.find((draft) => draft.draftId === record.draftId);
        if (!current)
          throw attachmentError("DRAFT_NOT_FOUND", "The local attachment draft is unavailable.");
        if (current.status === "linked") {
          if (current.bookingId !== bookingId)
            throw attachmentError(
              "BOOKING_MISMATCH",
              "These attachments are already linked to another booking.",
            );
          await done;
          return publicRecord(current, integrity);
        }
        const otherPendingCount = allDrafts
          .filter((draft) => draft.draftId !== current.draftId && draft.status !== "linked")
          .reduce((count, draft) => count + (draft.files || []).length, 0);
        if (savedDocs.length + otherPendingCount + current.files.length > MAX_DOCUMENTS_PER_TRIP)
          throw attachmentError(
            "TRIP_DOCUMENT_LIMIT",
            `This trip can keep up to ${MAX_DOCUMENTS_PER_TRIP} local documents on this device.`,
          );
        for (let index = 0; index < current.files.length; index += 1) {
          const file = current.files[index];
          await requestResult(docs.put({
            id: documentIds[index],
            tripId,
            name: file.name,
            mime: file.mime,
            size: file.size,
            type: file.type || linked.type || "other",
            travelerIds: linked.travelerIds,
            relatedBookingId: bookingId,
            savedAt: linkedAt,
            checksum: file.checksum,
            integrity: "verified",
            blob: file.blob,
          }));
        }
        await requestResult(drafts.put(linked));
        await done;
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        done.catch(() => {});
        throw error;
      }
      return publicRecord(linked, integrity);
    }

    async function fail(scope, error) {
      const record = await readDraft(scope);
      if (!record)
        throw attachmentError("DRAFT_NOT_FOUND", "The local attachment draft is unavailable.");
      if (record.status === "linked") return publicRecord(record);
      const failed = {
        ...record,
        status: "failed",
        lastError: cleanText(error?.message || error, "Attachment was not linked.", 240),
        updatedAt: now(),
      };
      await writeDraft(failed);
      return publicRecord(failed);
    }

    async function retry(scope, details = {}) {
      const record = await readDraft(scope);
      if (!record)
        throw attachmentError("DRAFT_NOT_FOUND", "The local attachment draft is unavailable.");
      if (record.status === "linked") return publicRecord(record, await verifyFiles(record.files));
      const integrity = await verifyFiles(record.files);
      if ([...integrity.values()].some((value) => value !== "verified"))
        throw attachmentError(
          "INTEGRITY_FAILED",
          "A selected file is no longer readable. Choose it again.",
        );
      const staged = {
        ...record,
        status: "staged",
        attempts: Number(record.attempts || 0) + 1,
        lastError: null,
        updatedAt: now(),
      };
      await writeDraft(staged);
      if (details.bookingId) return commit(scope, details);
      return publicRecord(staged, integrity);
    }

    async function remove(scope, selectedFileId) {
      const { draftId } = normalizeScope(scope);
      const fileId = requiredId(selectedFileId, "fileId");
      const db = await database();
      const tx = db.transaction(DRAFT_STORE, "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(DRAFT_STORE);
      try {
        const record = await requestResult(store.get(draftId));
        if (!record) {
          await done;
          return { removed: false, draftId, fileId, remaining: null };
        }
        if (record.status === "linked")
          throw attachmentError(
            "ATTACHMENTS_LINKED",
            "Attached booking documents cannot be removed from this draft.",
          );
        const files = (record.files || []).filter((file) => file.id !== fileId);
        if (files.length === (record.files || []).length) {
          await done;
          return {
            removed: false,
            draftId,
            fileId,
            remaining: publicRecord(record, await verifyFiles(record.files)),
          };
        }
        if (!files.length) {
          await requestResult(store.delete(draftId));
          await done;
          return { removed: true, draftId, fileId, remaining: null };
        }
        const updated = {
          ...record,
          files,
          checksums: files.map((file) => file.checksum),
          status: "staged",
          lastError: null,
          updatedAt: now(),
        };
        await requestResult(store.put(updated));
        await done;
        return {
          removed: true,
          draftId,
          fileId,
          remaining: publicRecord(updated, await verifyFiles(files)),
        };
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        done.catch(() => {});
        throw error;
      }
    }

    async function retype(scope, selectedFileId, documentType) {
      const { draftId } = normalizeScope(scope),
        fileId = requiredId(selectedFileId, "fileId"),
        type = cleanText(documentType, "other", 80);
      if (!DOCUMENT_TYPES.has(type))
        throw attachmentError("INVALID_DOCUMENT_TYPE", "Choose a supported document type.");
      const record = await readDraft({ draftId });
      if (!record)
        throw attachmentError("DRAFT_NOT_FOUND", "The local attachment draft is unavailable.");
      if (record.status === "linked")
        throw attachmentError("ATTACHMENTS_LINKED", "Linked documents must be edited from Booking Details.");
      const index = (record.files || []).findIndex((file) => file.id === fileId);
      if (index < 0) return publicRecord(record, await verifyFiles(record.files));
      const files = record.files.map((file, fileIndex) =>
        fileIndex === index ? { ...file, type } : file,
      );
      const updated = {
        ...record,
        type: files.every((file) => file.type === files[0]?.type)
          ? files[0]?.type || "other"
          : "other",
        files,
        status: "staged",
        lastError: null,
        updatedAt: now(),
      };
      await writeDraft(updated);
      return publicRecord(updated, await verifyFiles(files));
    }

    async function clear(scope) {
      const { draftId } = normalizeScope(scope);
      const db = await database();
      const tx = db.transaction(DRAFT_STORE, "readwrite");
      const done = transactionDone(tx);
      await requestResult(tx.objectStore(DRAFT_STORE).delete(draftId));
      await done;
      return { cleared: true, draftId };
    }

    return Object.freeze({
      stage,
      list,
      commit,
      link: commit,
      remove,
      retype,
      clear,
      retry,
      fail,
    });
  }

  const service = create();
  root.TriptoManualAttachments = Object.freeze({
    ...service,
    create,
    constants: Object.freeze({
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      draftStore: DRAFT_STORE,
      maxFileBytes: MAX_FILE_BYTES,
      maxDocumentsPerTrip: MAX_DOCUMENTS_PER_TRIP,
      supportedExtensions: Object.freeze(Object.keys(SUPPORTED_EXTENSION_TYPES)),
    }),
    validStatuses: Object.freeze([...VALID_STATUSES]),
    documentTypes: Object.freeze([...DOCUMENT_TYPES]),
  });
})(globalThis);
