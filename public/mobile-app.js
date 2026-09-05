(function () {
  "use strict";

  const API = "";
  const CACHE_PREFIX = "tripto_cache_v3:";
  const LOCAL_DOC_DB = "tripto-local-docs-v1";
  const PENDING_KEY = "tripto_pending_mutations_v1";
  const POST_AUTH_DESTINATION_KEY = "tripto_post_auth_destination_v1";
  const AVIASALES_AFFILIATE_URL = "https://tp.media/r?campaign_id=100&marker=465464&p=4114&trs=570553&u=https%3A%2F%2Faviasales.com";
  const STAY22_SCRIPT_URL = "https://scripts.stay22.com/letmeallez.js";
  const STAY22_LMA_ID = "6a9af4cdf80ccf1a0115f703";
  const PREVIEW_MODE =
    new URLSearchParams(location.search).get("preview") === "1";
  const LOCAL_QA_MODE =
    PREVIEW_MODE && ["127.0.0.1", "localhost"].includes(location.hostname);
  const QA_STATE = LOCAL_QA_MODE
    ? new URLSearchParams(location.search).get("qaState")
    : null;
  const tripRules = globalThis.TriptoTripRules;
  const routes = globalThis.TriptoRoutes;
  const googleAuth = globalThis.TriptoGoogleAuth;

  // Lazy-load heavy, flow-specific modules (smart-import ~374KB, airport
  // timezones ~120KB) instead of parsing them on every cold start. Each is
  // fetched once, on first use, then cached on its global for the session.
  const moduleLoaders = {};
  function loadModule(src, globalName) {
    if (globalName && globalThis[globalName]) {
      return Promise.resolve(globalThis[globalName]);
    }
    if (moduleLoaders[src]) return moduleLoaders[src];
    moduleLoaders[src] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      const releaseHandlers = () => {
        el.onload = null;
        el.onerror = null;
      };
      el.onload = () => {
        const loadedModule = globalName ? globalThis[globalName] : true;
        releaseHandlers();
        if (globalName && !loadedModule) {
          el.remove();
          delete moduleLoaders[src];
          reject(new Error(`Loaded ${src} without ${globalName}`));
          return;
        }
        resolve(loadedModule);
      };
      el.onerror = () => {
        releaseHandlers();
        el.remove();
        delete moduleLoaders[src];
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(el);
    });
    return moduleLoaders[src];
  }
  const ensureAirportTimezones = () =>
    loadModule(
      "/airport-timezones.js?v=airport-timezones-v1",
      "TriptoAirportTimezones",
    );
  const ensurePlacesProvider = () =>
    loadModule(
      "/places-provider.js?v=places-2026-08-26",
      "TriptoPlaces",
    );
  const ensureSmartImport = () =>
    loadModule("/smart-import.js?v=product-v2-conf6", "TriptoSmartImport");
  const ensureStay22 = () => {
    globalThis.Stay22 = globalThis.Stay22 || {};
    globalThis.Stay22.params = { lmaID: STAY22_LMA_ID };
    return loadModule(STAY22_SCRIPT_URL, null);
  };
  // Keep the airport-timezone table fully on demand. Loading and parsing it in
  // the first idle window can collide with a user's first Timeline scroll on
  // mobile Safari. The relevant forms call ensureAirportTimezones() when they
  // actually need the lookup.
  let googleRedirectMarker = googleAuth?.redirectMarker(location) || null;

  // Runtime aliases preserve the product vocabulary while the sprite owns the
  // actual Phosphor artwork.
  const ICON_ALIAS = Object.freeze({
    plane: "flight", qr: "qr-code", document: "documents", pin: "location",
    day: "sun", trash: "delete", bell: "notifications", external: "external-link",
    users: "travelers", "check-circle": "confirmed", chevron: "chevron-right",
    chevronDown: "chevron-down", chevronUp: "chevron-up", navigation: "directions",
    user: "traveler", star: "favorite", "dest-mountain": "mountain",
    "dest-beach": "beach", "dest-monument": "landmark",
  });
  // One locally bundled Phosphor sprite provides the same geometry and optical
  // weight everywhere. Regular is the default; Fill is reserved for the active
  // bottom-navigation state. No external icon request is made.
  // Same-document sprite: the <symbol> set is inlined into index.html so every
  // <use href="#id"> resolves in-document. External sprite refs
  // (<use href="/icons/…svg#id">) force iOS Safari to re-resolve the file per
  // instance on each full render — the cause of icon pop-in and scroll lag.
  const ICON_SPRITE = "";
  const FILLED_ICON_IDS = new Set(["flight", "map", "route", "notifications", "checklist", "traveler"]);
  const state = {
    token: localStorage.getItem("tripto_token") || "",
    loading: true,
    offline: !navigator.onLine,
    screen: parseRoute().screen,
    selectedId: parseRoute().id,
    sheet: null,
    tripSetupPreview: null,
    toast: "",
    toastKind: "status",
    toastAction: null,
    openFaq: new Set(),
    error: null,
    requestId: null,
    sessionRejected: false,
    routeMotion: "forward",
    refreshingOffline: false,
    flightDetailsOpen: false,
    trips: [],
    trip: null,
    timeline: [],
    timelineDayKey: null,
    checklist: [],
    editingChecklistId: null,
    focusChecklistEdit: false,
    brain: null,
    impacts: [],
    transport: [],
    liveFlights: { enabled: false, available: false, betaOnly: true, reason: "disabled" },
    stays: [],
    locations: [],
    weather: null,
    weatherRefreshing: false,
    currency: null,
    currencyPickerField: null,
    currencyLoading: false,
    currencyError: "",
    travelers: [],
    connections: [],
    health: null,
    bookingDetails: [],
    contacts: [],
    syncStatus: null,
    syncConflicts: [],
    localDocs: [],
    account: null,
    importLocalDocumentId: null,
    importUploadRequest: null,
    imports: [],
    changes: [],
    bookingEmails: [],
    bookingEmailSelectionId: null,
    importReview: null,
    bookingFilter: "all",
    importMode: "upload",
    manualLabel: null,
    editingEntity: null,
    editingNote: null,
    formDraft: null,
    dateRange: null,
    moveBooking: null,
    tripsLoaded: false,
    googleAuthHandoffStatus: null,
    googleAuthHandoffMessage: "",
    sharing: null,
    sharingTripId: null,
    members: [],
    invites: [],
    inviteLoadError: null,
    collabTripId: null,
    collabRequestId: 0,
    collabLoading: false,
    collabError: null,
    shareRole: "editor",
    shareInvite: null,
    shareBusy: false,
    joinToken: null,
    joinPreview: null,
    joinCheckedToken: null,
    joinRequestId: 0,
    joinLoading: false,
    joinError: null,
  };
  let flightDetailsCloseTimer = null;
  const app = document.getElementById("app");
  let toastTimer = null,
    sessionRefreshPromise = null,
    sheetReturnFocus = null,
    sheetPointer = null,
    routeTimer = null,
    formHasMeaningfulChanges = false,
    discardDialogOpen = false,
    formPrefill = null,
    discardReturnFocus = null;
  const scrollPositions = new Map();
  const DIRTY_TASK_SCREENS = new Set(["form", "import", "import-review"]);
  const MANUAL_BOOKING_TYPES = Object.freeze({
    flight: { label: "Flight", hint: "Air travel", group: "Getting there", tone: "flight", icon: "flight", base: "flight", cta: "Add Flight", documentType: "ticket" },
    train: { label: "Train", hint: "Rail journey", group: "Getting there", tone: "flight", icon: "train", base: "train", cta: "Add Train", documentType: "ticket" },
    ferry: { label: "Ferry", hint: "Boat or crossing", group: "Getting there", tone: "flight", icon: "ferry", base: "train", subtype: "ferry", cta: "Add Ferry", documentType: "ticket" },
    bus: { label: "Bus / Coach", shortLabel: "Bus", hint: "Intercity journey", group: "Getting there", tone: "flight", icon: "bus", base: "transport", subtype: "bus", cta: "Add Bus", documentType: "ticket" },
    cruise: { label: "Cruise", hint: "Sailing itinerary", group: "Getting there", tone: "flight", icon: "cruise", base: "activity", subtype: "cruise", cta: "Add Cruise", documentType: "ticket" },
    "car-rental": { label: "Car Rental", hint: "Pickup and return", group: "Getting around", tone: "transfer", icon: "car", base: "transport", subtype: "car", cta: "Add Car Rental", documentType: "reservation" },
    transfer: { label: "Transfer", hint: "Booked transport", group: "Getting around", tone: "transfer", icon: "taxi", base: "transport", subtype: "transfer", cta: "Add Transfer", documentType: "reservation" },
    taxi: { label: "Taxi / Ride", shortLabel: "Taxi", hint: "Pickup and drop-off", group: "Getting around", tone: "transfer", icon: "taxi", base: "transport", subtype: "taxi", cta: "Add Taxi", documentType: "reservation" },
    parking: { label: "Parking", hint: "Reserved parking", group: "Getting around", tone: "transfer", icon: "parking", base: "reservation", subtype: "parking", cta: "Add Parking", documentType: "reservation" },
    hotel: { label: "Hotel / Stay", shortLabel: "Stay", hint: "Hotel or apartment", group: "Stay & plans", tone: "stay", icon: "hotel", base: "hotel", cta: "Add Stay", documentType: "hotel_confirmation" },
    restaurant: { label: "Restaurant", hint: "Table reservation", group: "Stay & plans", tone: "food", icon: "restaurant", base: "reservation", subtype: "restaurant", cta: "Add Restaurant", documentType: "reservation" },
    tour: { label: "Tour / Excursion", shortLabel: "Tour", hint: "Guided experience", group: "Stay & plans", tone: "activity", icon: "tour", base: "activity", subtype: "tour", cta: "Add Tour", documentType: "ticket" },
    activity: { label: "Activity / Event", shortLabel: "Activity", hint: "Class or free-time plan", group: "Stay & plans", tone: "activity", icon: "activity", base: "activity", subtype: "activity", cta: "Add Activity", documentType: "ticket" },
    attraction: { label: "Museum / Attraction", shortLabel: "Attraction", hint: "Timed entry or visit", group: "Stay & plans", tone: "activity", icon: "landmark", base: "activity", subtype: "attraction", cta: "Add Attraction", documentType: "ticket" },
    event: { label: "Event / Show", shortLabel: "Event", hint: "Concert or performance", group: "Stay & plans", tone: "activity", icon: "event", base: "activity", subtype: "event", cta: "Add Event", documentType: "ticket" },
    insurance: { label: "Travel Insurance", shortLabel: "Insurance", hint: "Policy details", group: "Travel essentials", tone: "essential", icon: "shield", base: "reservation", subtype: "insurance", cta: "Add Insurance", documentType: "other" },
    other: { label: "Other", hint: "Any confirmed plan", group: "Travel essentials", tone: "essential", icon: "calendar", base: "reservation", subtype: "other", cta: "Add to Trip", documentType: "other" },
  });
  const QUICK_ADD_KINDS = new Set([
    ...Object.keys(MANUAL_BOOKING_TYPES),
    "reservation",
    "document",
  ]);
  const manualAttachmentMirror = new Map(), manualDraftIds = new Map();
  function manualBookingConfig(kind) {
    return MANUAL_BOOKING_TYPES[String(kind || "")] || null;
  }
  function bookingBaseKind(kind) {
    return manualBookingConfig(kind)?.base || String(kind || "");
  }
  const MANUAL_ATTACHMENT_RETRY_KEY = "tripto_manual_attachment_retry_v1";
  function manualAttachmentRetryMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MANUAL_ATTACHMENT_RETRY_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  function manualAttachmentRetryId(kind, bookingId) {
    if (!bookingId || !state.trip?.id) return "";
    return String(
      manualAttachmentRetryMap()[`${state.trip.id}:${kind}:${bookingId}`] || "",
    );
  }
  function rememberManualAttachmentRetry(kind, bookingId, draftId) {
    if (!bookingId || !draftId || !state.trip?.id) return;
    try {
      const rows = manualAttachmentRetryMap();
      rows[`${state.trip.id}:${kind}:${bookingId}`] = draftId;
      localStorage.setItem(MANUAL_ATTACHMENT_RETRY_KEY, JSON.stringify(rows));
    } catch (_) {}
  }
  function forgetManualAttachmentRetry(kind, bookingId) {
    if (!bookingId || !state.trip?.id) return;
    try {
      const rows = manualAttachmentRetryMap();
      delete rows[`${state.trip.id}:${kind}:${bookingId}`];
      localStorage.setItem(MANUAL_ATTACHMENT_RETRY_KEY, JSON.stringify(rows));
    } catch (_) {}
  }
  function manualAttachmentScope(kind, editId = "") {
    const tripId = String(state.trip?.id || "no-trip"),
      remembered = manualAttachmentRetryId(kind, editId),
      draftId =
        remembered ||
        `manual:${tripId}:${String(kind || "booking")}:${manualBookingDraftId(kind, editId)}`;
    return { draftId, tripId };
  }
  function normalizeManualAttachmentScope(scope) {
    if (scope && typeof scope === "object") {
      return {
        draftId: String(scope.draftId || ""),
        tripId: String(scope.tripId || state.trip?.id || ""),
      };
    }
    return { draftId: scope, tripId: state.trip?.id };
  }
  function manualAttachmentKey(scope) {
    return String(
      scope && typeof scope === "object" ? scope.draftId || "" : scope || "",
    );
  }
  function manualAttachmentsApi() {
    const api = globalThis.TriptoManualAttachments;
    return api && typeof api === "object" ? api : null;
  }
  function cachedManualAttachment(scope) {
    return manualAttachmentMirror.get(manualAttachmentKey(scope)) || null;
  }
  async function listManualAttachments(scope) {
    const normalized = normalizeManualAttachmentScope(scope),
      key = manualAttachmentKey(normalized),
      api = manualAttachmentsApi();
    if (!key) return null;
    if (!api?.list) return cachedManualAttachment(normalized);
    try {
      const rows = await api?.list(normalized);
      const record = Array.isArray(rows) ? rows[0] || null : rows || null;
      manualAttachmentMirror.set(key, record);
      return record;
    } catch (_) {}
    return cachedManualAttachment(normalized);
  }
  async function stageManualAttachments(scope, files, meta = {}) {
    const selected = Array.from(files || []);
    const normalized = normalizeManualAttachmentScope(scope),
      key = manualAttachmentKey(normalized),
      api = manualAttachmentsApi();
    if (!selected.length) return listManualAttachments(normalized);
    if (api?.stage) {
      const existing = await listManualAttachments(normalized),
        existingBlobs = (existing?.files || []).map((file) => file.blob).filter(Boolean),
        result = await api.stage(normalized, [...existingBlobs, ...selected], {
          kind: meta.kind,
          type: meta.documentType || meta.type || "other",
          travelerIds: meta.travelerIds || [],
        });
      manualAttachmentMirror.set(key, result || null);
      return result;
    }
    const existing = cachedManualAttachment(normalized),
      existingFiles = existing?.files || [];
    const added = selected.map((file) => ({
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      blob: file,
      name: file.name,
      size: file.size,
      type: meta.documentType || "other",
    }));
    const record = {
      draftId: normalized.draftId,
      tripId: normalized.tripId,
      status: "staged",
      type: meta.documentType || "other",
      files: [...existingFiles, ...added],
    };
    manualAttachmentMirror.set(key, record);
    return record;
  }
  async function clearManualAttachment(scope, id) {
    const normalized = normalizeManualAttachmentScope(scope),
      key = manualAttachmentKey(normalized),
      api = manualAttachmentsApi();
    if (id != null && api?.remove) {
      const result = await api.remove(normalized, id);
      manualAttachmentMirror.set(key, result?.remaining || null);
      return result?.remaining || null;
    }
    if (api?.clear) await api.clear(normalized);
    manualAttachmentMirror.set(key, null);
    return null;
  }
  async function failManualAttachments(scope, error) {
    const normalized = normalizeManualAttachmentScope(scope),
      api = manualAttachmentsApi();
    if (!api?.fail) return cachedManualAttachment(normalized);
    const record = await api.fail(normalized, error);
    manualAttachmentMirror.set(manualAttachmentKey(normalized), record || null);
    return record;
  }
  async function retryManualAttachment(scope, details = {}) {
    const normalized = normalizeManualAttachmentScope(scope),
      api = manualAttachmentsApi();
    if (!api?.retry) return listManualAttachments(normalized);
    const record = await api.retry(normalized, details);
    manualAttachmentMirror.set(manualAttachmentKey(normalized), record || null);
    return record;
  }
  async function retypeManualAttachment(scope, id, type) {
    const normalized = normalizeManualAttachmentScope(scope),
      api = manualAttachmentsApi();
    if (!api?.retype) throw new Error("Document type could not be updated on this device.");
    const record = await api.retype(normalized, id, type);
    manualAttachmentMirror.set(manualAttachmentKey(normalized), record || null);
    return record;
  }
  function closeDocumentViewer(fromHistory = false) {
    const el = document.getElementById("doc-viewer");
    if (!el) return;
    const url = el.dataset.blobUrl;
    el.remove();
    document.documentElement.classList.remove("doc-viewer-open");
    if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
    if (!fromHistory && history.state?.triptoDocumentViewer) history.back();
  }
  function openDocumentViewer(blob, name) {
    closeDocumentViewer();
    const url = URL.createObjectURL(blob),
      safeName = esc(name || "Travel document"),
      isImage =
        /^image\//i.test(blob.type || "") ||
        /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(name || "");
    if (!isImage) {
      // Our strict CSP forbids blob: inside <iframe>/<object> (frame-src /
      // object-src 'none'), and mobile Safari renders PDFs blank in a frame
      // regardless. So non-image files open in a top-level tab, where the
      // browser uses its own native viewer. Try it immediately (works while we
      // still hold the click gesture); if the browser blocks it, fall through
      // to a tap-to-open panel that reopens on a fresh gesture.
      let opened = null;
      try {
        opened = window.open(url, "_blank");
      } catch (_) {}
      if (opened) {
        setTimeout(() => {
          try { URL.revokeObjectURL(url); } catch (_) {}
        }, 60000);
        return;
      }
    }
    const media = isImage
        ? `<img class="doc-viewer__media" src="${url}" alt="${safeName}">`
        : `<div class="doc-viewer__fallback">${icon("document", 46)}<strong>${safeName}</strong><p>Tap to open this file in your browser's viewer.</p><button type="button" class="mobile-primary-action doc-viewer__open">Open file</button></div>`,
      overlay = document.createElement("div");
    overlay.id = "doc-viewer";
    overlay.className = "doc-viewer";
    overlay.dataset.blobUrl = url;
    overlay.innerHTML = `<header class="doc-viewer__bar"><button type="button" class="doc-viewer__back" data-action="close-doc-viewer">${icon("back", 20)}<span>Back to app</span></button><strong class="doc-viewer__title">${safeName}</strong><a class="doc-viewer__ext" href="${url}" download="${safeName}" target="_blank" rel="noopener" aria-label="Download ${safeName}">${icon("download", 20)}</a></header><div class="doc-viewer__body">${media}</div>`;
    document.body.appendChild(overlay);
    document.documentElement.classList.add("doc-viewer-open");
    history.pushState({ ...(history.state || {}), triptoDocumentViewer: true }, "", location.href);
    overlay
      .querySelector(".doc-viewer__back")
      ?.addEventListener("click", closeDocumentViewer);
    overlay
      .querySelector(".doc-viewer__open")
      ?.addEventListener("click", () => {
        try { window.open(url, "_blank"); } catch (_) {}
      });
  }
  async function openManualAttachment(scope, id) {
    const record = await listManualAttachments(scope),
      file = (record?.files || []).find((row) => String(row.id) === String(id));
    if (!file?.blob) throw new Error("This local file is unavailable. Choose it again.");
    openDocumentViewer(file.blob, file.name);
  }
  async function clearLocalDeviceData() {
    clearApiCache(sessionIdentity());
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem("tripto_selected_trip");
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX) || key.startsWith("tripto_quick_draft")) localStorage.removeItem(key);
    }
    try {
      const db = await openLocalDocDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(["docs", "bookingDrafts"], "readwrite");
        transaction.objectStore("docs").clear();
        transaction.objectStore("bookingDrafts").clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Local data could not be removed."));
        transaction.onabort = transaction.onerror;
      });
      db.close();
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
    }
    state.localDocs = [];
  }
  async function commitManualAttachments(scope, bookingId, kind, travelerIds) {
    const normalized = normalizeManualAttachmentScope(scope),
      record = await listManualAttachments(normalized);
    if (!record?.files?.length || !bookingId) return null;
    const api = manualAttachmentsApi();
    if (!api?.commit) throw new Error("Local document storage is unavailable.");
    try {
      const linked = await api.commit(normalized, {
        tripId: state.trip?.id || null,
        bookingId,
        kind,
        travelerIds,
      });
      manualAttachmentMirror.set(manualAttachmentKey(normalized), linked || null);
      return linked;
    } catch (error) {
      try { await failManualAttachments(normalized, error); } catch (_) {}
      throw error;
    }
  }
  function icon(name, size = 24, extra = "", weight = "regular") {
    const px = Number(size) || 24;
    const canonical = ICON_ALIAS[name] || String(name || "info");
    const symbol = weight === "fill" && FILLED_ICON_IDS.has(canonical)
      ? `${canonical}--fill`
      : canonical;
    return `<svg aria-hidden="true" focusable="false" class="app-icon ph-svg${extra ? ` ${extra}` : ""}" width="${px}" height="${px}" viewBox="0 0 256 256" fill="currentColor" style="--icon-size:${px}px"><use href="${ICON_SPRITE}#${symbol}"></use></svg>`;
  }
  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function val(object, ...keys) {
    for (const key of keys) {
      if (
        object &&
        object[key] !== undefined &&
        object[key] !== null &&
        object[key] !== ""
      )
        return object[key];
    }
    return null;
  }
  function itemId(item) {
    return String(val(item, "id", "trip_item_id") || "");
  }
  function isCancelled(item) {
    return ["cancelled", "skipped"].includes(
      String(val(item, "status", "booking_status") || ""),
    );
  }
  function parseRoute() {
    return routes?.parse(location) || { screen: "timeline", id: null };
  }
  function routeUrl(screen, id = null) {
    return routes?.urlFor(screen, id, location.search) || "/timeline";
  }
  function quickDraftKey(kind = state.selectedId) {
    const normalized = String(kind || "unknown");
    // Editing a trip and creating a trip must never share a draft slot, or an
    // abandoned "Create trip" draft (empty fields) gets restored over an edit
    // form and wipes the prefilled data. Scope edits per-trip by id.
    let scope;
    if (normalized === "trip")
      scope =
        state.editingEntity?.kind === "trip" && state.editingEntity.id
          ? `edit-${state.editingEntity.id}`
          : "new-trip";
    else if (
      state.screen === "form" &&
      String(state.selectedId || "") === normalized &&
      state.editingEntity?.id
    )
      scope = `${state.trip?.id || "no-trip"}:edit-${state.editingEntity.id}`;
    else scope = state.trip?.id || "no-trip";
    return `tripto_quick_add_draft:${scope}:${normalized}`;
  }
  function manualBookingDraftId(kind, editId = "") {
    if (editId) return `edit:${editId}`;
    const key = quickDraftKey(kind);
    if (manualDraftIds.has(key)) return manualDraftIds.get(key);
    let draft = {};
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "{}");
      if (saved && typeof saved === "object") draft = saved;
    } catch (_) {}
    let id = String(draft.__manualDraftId || "");
    if (!/^[a-f0-9-]{20,80}$/i.test(id)) {
      id = crypto.randomUUID();
      draft.__manualDraftId = id;
      try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch (_) {}
    }
    manualDraftIds.set(key, id);
    return id;
  }
  function clearQuickDraft(kind = state.selectedId) {
    if (!supportsFormDraft(kind)) return;
    const key = quickDraftKey(kind);
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
    manualDraftIds.delete(key);
  }
  function clearActiveFormDraft() {
    if (state.screen === "form") clearQuickDraft(state.selectedId);
  }
  function supportsFormDraft(kind) {
    const normalized = String(kind || "");
    return normalized === "trip" || QUICK_ADD_KINDS.has(normalized);
  }
  async function closeDiscardDialog(discard = false) {
    const backdrop = document.querySelector(".discard-dialog-backdrop"),
      continuation = discardDialogOpen;
    if (!backdrop) return;
    backdrop.remove();
    discardDialogOpen = false;
    if (discard) {
      const form = document.getElementById("native-form"), scope = form?.dataset.attachmentScope;
      if (scope) {
        try {
          await clearManualAttachment(scope);
        } catch (_) {
          const message = "The selected local files could not be discarded. Your booking details and files are still on this phone.";
          if (form) showFormSubmissionError(form, message);
          else showToast(message, "alert");
          discardReturnFocus?.focus?.();
          return;
        }
      }
      clearActiveFormDraft();
      formHasMeaningfulChanges = false;
      if (typeof continuation === "function") continuation();
      return;
    }
    discardReturnFocus?.focus?.();
  }
  function confirmDeleteTrip() {
    const trip = state.trip;
    if (!trip) return;
    const returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-trip-title" aria-describedby="delete-trip-copy"><h2 id="delete-trip-title">Delete this trip?</h2><p id="delete-trip-copy">“${esc(trip.title || "Untitled trip")}” and its bookings will be removed. This cannot be undone.</p><div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-delete-action="cancel">Keep trip</button><button type="button" class="mobile-danger-action" data-delete-action="confirm">Delete</button></div></section>`;
    const cancel = backdrop.querySelector('[data-delete-action="cancel"]'),
      confirmBtn = backdrop.querySelector('[data-delete-action="confirm"]');
    const close = () => { backdrop.remove(); returnFocus?.focus?.(); };
    cancel.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [cancel, confirmBtn], index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true; cancel.disabled = true;
      try {
        await deleteCurrentTrip(trip);
        backdrop.remove();
      } catch (error) {
        confirmBtn.disabled = false; cancel.disabled = false;
        showToast(error?.message || "The trip could not be deleted.", "alert");
      }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  async function deleteCurrentTrip(trip) {
    if (!PREVIEW_MODE) {
      await api(`/api/v1/trips/${encodeURIComponent(trip.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ version: Number(val(trip, "version")) || 1 }),
      });
    }
    state.trips = state.trips.filter((row) => String(row.id) !== String(trip.id));
    state.editingEntity = null;
    formHasMeaningfulChanges = false;
    if (state.screen === "form") clearQuickDraft("trip");
    const next = selectRelevantTrip(state.trips) || null;
    state.trip = next;
    if (next) {
      localStorage.setItem("tripto_selected_trip", next.id);
      state.loading = true;
      render();
      await loadTripDetails();
      state.loading = false;
      route("timeline", null, true);
    } else {
      localStorage.removeItem("tripto_selected_trip");
      await loadTripDetails();
      route("form", "trip", true);
    }
    showToast("Trip deleted.");
  }
  function findBookingRecord(kind, id) {
    const wanted = String(id || "");
    const baseKind = bookingBaseKind(kind);
    if (baseKind === "hotel") {
      const entity = state.stays.find((row) => itemId(row) === wanted);
      return entity ? { kind, entity, path: "stays" } : null;
    }
    if (["flight", "train", "transport"].includes(baseKind) || ["ferry", "car", "car-rental", "transfer"].includes(kind)) {
      const entity = state.transport.find((row) => itemId(row) === wanted);
      return entity ? { kind, entity, path: "transport" } : null;
    }
    const entity = state.timeline.find((row) => itemId(row) === wanted);
    return entity ? { kind, entity, path: "activities" } : null;
  }
  function bookingRecordTitle(record) {
    const item = record.entity;
    if (record.kind === "flight") return flightNumber(item);
    if (record.kind === "hotel") return val(item, "property_name", "title") || "this stay";
    return val(item, "title") || statusText(record.kind);
  }
  function bookingFormKind(kind, entity) {
    if (kind === "flight") return "flight";
    if (kind === "train") return "train";
    if (kind === "ferry") return "ferry";
    if (kind === "car") return "car-rental";
    if (kind === "transfer") return "transfer";
    if (kind === "bus") return "bus";
    if (kind === "taxi") return "taxi";
    if (kind === "hotel") return "hotel";
    const subtype = String(val(entity || {}, "reservation_type", "activity_type", "type") || "").toLowerCase();
    if (subtype === "restaurant") return "restaurant";
    if (subtype === "transfer") return "transfer";
    if (subtype === "bus") return "bus";
    if (subtype === "taxi") return "taxi";
    if (["car_rental", "car"].includes(subtype)) return "car-rental";
    if (subtype === "parking") return "parking";
    if (subtype === "insurance") return "insurance";
    if (subtype === "tour") return "tour";
    if (["attraction", "museum"].includes(subtype)) return "attraction";
    if (["event", "concert", "theatre", "show"].includes(subtype)) return "event";
    if (subtype === "other") return "other";
    if (subtype === "cruise") return "cruise";
    if (["reservation", "plan"].includes(subtype)) return "other";
    return "activity";
  }
  function confirmDeleteBooking(kind, id) {
    const record = findBookingRecord(kind, id);
    if (!record) return;
    const title = bookingRecordTitle(record), returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-booking-title" aria-describedby="delete-booking-copy"><h2 id="delete-booking-title">Delete this booking?</h2><p id="delete-booking-copy">“${esc(title)}” will be removed from this trip. This cannot be undone.</p><div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-delete-action="cancel">Keep booking</button><button type="button" class="mobile-danger-action" data-delete-action="confirm">Delete</button></div></section>`;
    const cancel = backdrop.querySelector('[data-delete-action="cancel"]'),
      confirmBtn = backdrop.querySelector('[data-delete-action="confirm"]');
    const close = () => { backdrop.remove(); returnFocus?.focus?.(); };
    cancel.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [cancel, confirmBtn], index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true; cancel.disabled = true;
      try {
        await deleteBookingRecord(record);
        backdrop.remove();
      } catch (error) {
        confirmBtn.disabled = false; cancel.disabled = false;
        showToast(error?.message || "The booking could not be deleted.", "alert");
      }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  function confirmDeleteDocument(id) {
    const doc = state.localDocs.find((row) => String(row.id) === String(id));
    if (!doc) return;
    const title = doc.name || docTypeLabel(doc.type) || "document",
      returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-doc-title" aria-describedby="delete-doc-copy"><h2 id="delete-doc-title">Delete this document?</h2><p id="delete-doc-copy">“${esc(title)}” will be removed from this phone. This cannot be undone.</p><div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-delete-action="cancel">Keep document</button><button type="button" class="mobile-danger-action" data-delete-action="confirm">Delete</button></div></section>`;
    const cancel = backdrop.querySelector('[data-delete-action="cancel"]'),
      confirmBtn = backdrop.querySelector('[data-delete-action="confirm"]');
    const close = () => { backdrop.remove(); returnFocus?.focus?.(); };
    cancel.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [cancel, confirmBtn], index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true; cancel.disabled = true;
      try {
        await removeLocalDocument(id);
        backdrop.remove();
        render();
      } catch (error) {
        confirmBtn.disabled = false; cancel.disabled = false;
        showToast(error?.message || "The document could not be deleted.", "alert");
      }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  async function removeImportEntry(id) {
    if (PREVIEW_MODE) {
      state.imports = (state.imports || []).filter((row) => String(row.id) !== String(id));
      return;
    }
    if (!state.trip) throw new Error("Select a trip first.");
    // Deletes the import row, its candidates/messages, and the matching inbound
    // booking-email record server-side, so the booking disappears from Import
    // History, the header notification, and the inbound feed all at once.
    await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.imports = (state.imports || []).filter((row) => String(row.id) !== String(id));
  }
  function confirmRemoveImport(id) {
    const entry = (state.imports || []).find((row) => String(row.id) === String(id));
    const title = entry ? (entry.subject || statusText(entry.candidate_type || "Booking")) : "this booking",
      returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-import-title" aria-describedby="delete-import-copy"><h2 id="delete-import-title">Delete this booking?</h2><p id="delete-import-copy">“${esc(title)}” will be removed from your import history and the inbound email feed everywhere. This cannot be undone.</p><div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-delete-action="cancel">Keep</button><button type="button" class="mobile-danger-action" data-delete-action="confirm">Delete</button></div></section>`;
    const cancel = backdrop.querySelector('[data-delete-action="cancel"]'),
      confirmBtn = backdrop.querySelector('[data-delete-action="confirm"]');
    const close = () => { backdrop.remove(); returnFocus?.focus?.(); };
    cancel.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [cancel, confirmBtn], index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true; cancel.disabled = true;
      try {
        await removeImportEntry(id);
        backdrop.remove();
        render();
        showToast("Booking deleted.");
      } catch (error) {
        confirmBtn.disabled = false; cancel.disabled = false;
        showToast(error?.message || "The booking could not be deleted.", "alert");
      }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  async function deleteBookingRecord(record) {
    const version = Number(val(record.entity, "version")) || 1;
    if (!PREVIEW_MODE) {
      await api(`/api/v1/trips/${encodeURIComponent(state.trip?.id || "")}/${record.path}/${encodeURIComponent(itemId(record.entity))}`, {
        method: "DELETE",
        body: JSON.stringify({ version }),
      });
      await loadTripDetails();
    } else {
      state.transport = state.transport.filter((row) => row !== record.entity);
      state.stays = state.stays.filter((row) => row !== record.entity);
      state.timeline = state.timeline.filter((row) => row !== record.entity);
    }
    state.editingEntity = null;
    showToast(`${statusText(record.kind)} deleted.`);
    route("timeline", null, true);
  }
  function bookingMenuButton(kind, id) {
    return `<button class="icon-button" data-action="manage-booking" data-kind="${esc(kind)}" data-id="${esc(id)}" aria-label="Edit or delete">${icon("edit", 18)}</button>`;
  }
  function bookingHeaderActions(kind, id) {
    return `<button class="icon-button" data-action="share-booking" data-kind="${esc(kind)}" data-id="${esc(id)}" aria-label="Share">${icon("share", 18)}</button>${bookingMenuButton(kind, id)}`;
  }
  function linkedBookingDocuments(item) {
    const id = itemId(item || {});
    if (!id) return [];
    return state.localDocs.filter(
      (document) => String(document.relatedBookingId || "") === id,
    );
  }
  function linkedBookingDocumentRows(item) {
    const documents = linkedBookingDocuments(item);
    if (!documents.length) return "";
    return `<section class="booking-documents" aria-labelledby="booking-documents-title"><h2 id="booking-documents-title">Tickets &amp; Documents</h2><div class="booking-documents__list">${documents
      .map((document) => {
        const ready = document.integrity === "verified";
        return `<div class="booking-document-row"><button type="button" class="booking-document-row__open" data-action="open-document" data-id="${esc(document.id)}"><span class="booking-document-row__icon">${icon(document.type === "boarding_pass" ? "qr" : "document", 20)}</span><span><strong>${esc(document.name || docTypeLabel(document.type))}</strong><small>${ready ? "Ready offline" : statusText(document.integrity || "checking")}</small></span></button><button type="button" class="booking-document-row__remove" data-action="remove-document" data-id="${esc(document.id)}" aria-label="Remove ${esc(document.name || "document")}">${icon("trash", 18)}</button></div>`;
      })
      .join("")}</div></section>`;
  }
  function bookingShareText(record) {
    const e = record.entity;
    if (record.kind === "flight") {
      const r = flightRoute(e);
      return `${flightNumber(e)} · ${r.fromCode} → ${r.toCode} · ${formatDateTime(flightDeparture(e), val(e, "departure_timezone"))}`;
    }
    if (record.kind === "hotel") {
      const parts = [val(e, "property_name", "title") || "Stay"];
      const ci = formatTripBoundDate(val(e, "check_in_date"), state.trip), co = formatTripBoundDate(val(e, "check_out_date"), state.trip);
      if (ci || co) parts.push(`${ci || "?"} → ${co || "?"}`);
      const addr = val(e, "address", "formatted_address");
      if (addr) parts.push(addr);
      return parts.join(" · ");
    }
    if (record.path === "transport") {
      const from = locationById(val(e, "departure_location_id", "start_location_id")), to = locationById(val(e, "arrival_location_id", "end_location_id"));
      const dep = Number(val(e, "scheduled_departure_utc", "starts_at_utc")) || null;
      const parts = [val(e, "title") || val(e, "carrier_name") || statusText(record.kind)];
      const fromName = val(from, "display_name", "station_code", "iata_code"), toName = val(to, "display_name", "station_code", "iata_code");
      if (fromName || toName) parts.push(`${fromName || "?"} → ${toName || "?"}`);
      if (dep) parts.push(formatDateTime(dep, val(e, "departure_timezone")));
      return parts.join(" · ");
    }
    const parts = [val(e, "title") || statusText(record.kind)];
    const when = Number(val(e, "starts_at_utc")) || null;
    if (when) parts.push(formatDateTime(when, val(e, "start_timezone", "timezone")));
    const loc = locationById(val(e, "location_id"));
    const locName = val(loc, "display_name", "formatted_address");
    if (locName) parts.push(locName);
    return parts.join(" · ");
  }
  function manageBookingSheet() {
    const menu = state.manageBooking;
    if (!menu) return "";
    return bottomSheet("manage-booking", "Manage booking", `<div class="sheet-options-group sheet-options-group--v2"><button class="sheet-option" data-action="edit-booking" data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"><span class="info-icon">${icon("edit", 22)}</span><span><strong>Edit</strong><small>Update the details of this booking</small></span>${icon("chevron", 22)}</button><button class="sheet-option" data-action="move-booking" data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"><span class="info-icon">${icon("calendar", 22)}</span><span><strong>Move to another day</strong><small>Keep the times, change the day</small></span>${icon("chevron", 22)}</button><button class="sheet-option sheet-option--danger" data-action="delete-booking" data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"><span class="info-icon">${icon("trash", 22)}</span><span><strong>Delete</strong><small>Remove this booking from the trip</small></span>${icon("chevron", 22)}</button></div>`);
  }
  function bookingAnchorDate(record) {
    const e = record.entity;
    if (record.path === "stays") return String(val(e, "check_in_date") || "");
    if (record.path === "transport") {
      const ms = Number(val(e, "scheduled_departure_utc", "starts_at_utc")) || null;
      return ms ? zonedDateTimeParts(ms, val(e, "departure_timezone", "start_timezone")).date : "";
    }
    const ms = Number(val(e, "starts_at_utc", "startsAtUtc")) || null;
    return ms ? zonedDateTimeParts(ms, val(e, "timezone", "start_timezone")).date : "";
  }
  function tripDayOptions() {
    const start = String(val(state.trip, "starts_on", "startsOn") || ""),
      end = String(val(state.trip, "ends_on", "endsOn") || "");
    const keys = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      let cursor = start;
      for (let guard = 0; cursor <= end && guard < 400; guard++) {
        keys.push(cursor);
        cursor = addCalendarDays(cursor, 1);
      }
    }
    // Fall back to (or extend with) the days that already hold items so a booking
    // sitting outside the trip range is still selectable.
    for (const item of state.timeline) {
      const ms = Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
        key = ms ? zonedDateTimeParts(ms, val(item, "start_timezone", "startTimezone")).date : "";
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys.sort();
  }
  function addCalendarDays(dateStr, delta) {
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateStr;
    const base = Date.UTC(+match[1], +match[2] - 1, +match[3]) + delta * 86400000,
      d = new Date(base);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  function moveDayLabel(dateStr) {
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return { weekday: "", date: dateStr };
    return timelineDay(Date.UTC(+match[1], +match[2] - 1, +match[3], 12), "UTC");
  }
  function moveBookingSheet() {
    const menu = state.moveBooking;
    if (!menu) return "";
    const record = findBookingRecord(menu.kind, menu.id);
    if (!record) return bottomSheet("move-booking", "Move to another day", `<p class="sheet-note">This booking is no longer available.</p>`);
    const current = bookingAnchorDate(record),
      days = tripDayOptions();
    const options = days.length
      ? days.map((key, index) => {
          const label = moveDayLabel(key),
            isCurrent = key === current;
          return `<button type="button" class="sheet-option move-day-option${isCurrent ? " move-day-option--current" : ""}" data-action="apply-move" data-key="${esc(key)}"${isCurrent ? " disabled aria-current=\"true\"" : ""}><span class="move-day-option__index">${index + 1}</span><span class="move-day-option__body"><strong>Day ${index + 1}</strong><small>${esc(label.weekday)} · ${esc(label.date)}</small></span>${isCurrent ? `<span class="move-day-option__here">Current</span>` : icon("chevron", 22)}</button>`;
        }).join("")
      : `<p class="sheet-note">Add trip dates first to move this booking between days.</p>`;
    return bottomSheet("move-booking", "Move to another day", `<div class="sheet-options-group sheet-options-group--v2 move-day-list">${options}</div>`);
  }
  function shiftMsToDay(ms, timeZone, dayDelta) {
    const value = Number(ms) || null;
    if (!value) return null;
    const parts = zonedDateTimeParts(value, timeZone);
    if (!parts.date || !parts.time) return value + dayDelta * 86400000;
    try {
      return resolveEventLocalDateTime(`${addCalendarDays(parts.date, dayDelta)}T${parts.time}`, timeZone || "UTC");
    } catch (_) {
      // DST-ambiguous wall time on the target day: fall back to a raw shift.
      return value + dayDelta * 86400000;
    }
  }
  async function moveBookingToDay(kind, id, targetDate) {
    const record = findBookingRecord(kind, id);
    if (!record) { showToast("This booking is no longer available.", "alert"); return; }
    const current = bookingAnchorDate(record);
    if (!current || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate === current) { closeSheet(); return; }
    const dayDelta = Math.round((Date.UTC(+targetDate.slice(0, 4), +targetDate.slice(5, 7) - 1, +targetDate.slice(8, 10)) - Date.UTC(+current.slice(0, 4), +current.slice(5, 7) - 1, +current.slice(8, 10))) / 86400000);
    if (!dayDelta) { closeSheet(); return; }
    const e = record.entity, tripId = encodeURIComponent(state.trip?.id || ""), version = Number(val(e, "version")) || 1;
    try {
      if (record.path === "stays") {
        const ci = String(val(e, "check_in_date") || ""), co = String(val(e, "check_out_date") || "");
        const body = { version };
        if (ci) body.checkInDate = addCalendarDays(ci, dayDelta);
        if (co) body.checkOutDate = addCalendarDays(co, dayDelta);
        await api(`/api/v1/trips/${tripId}/stays/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      } else if (record.path === "transport") {
        const depTz = val(e, "departure_timezone", "start_timezone"), arrTz = val(e, "arrival_timezone", "end_timezone") || depTz,
          dep = Number(val(e, "scheduled_departure_utc", "starts_at_utc")) || null,
          arr = Number(val(e, "scheduled_arrival_utc", "ends_at_utc")) || null,
          boarding = Number(val(e, "boarding_time_utc")) || null,
          gateClose = Number(val(e, "gate_close_time_utc")) || null;
        const body = { version };
        if (dep) body.scheduledDepartureUtc = shiftMsToDay(dep, depTz, dayDelta);
        if (arr) body.scheduledArrivalUtc = shiftMsToDay(arr, arrTz, dayDelta);
        if (boarding) body.boardingTimeUtc = shiftMsToDay(boarding, depTz, dayDelta);
        if (gateClose) body.gateCloseTimeUtc = shiftMsToDay(gateClose, depTz, dayDelta);
        await api(`/api/v1/trips/${tripId}/transport/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const tz = val(e, "timezone", "start_timezone"),
          start = Number(val(e, "starts_at_utc", "startsAtUtc")) || null,
          end = Number(val(e, "ends_at_utc", "endsAtUtc")) || null;
        const body = { version };
        if (start) body.startsAtUtc = shiftMsToDay(start, tz, dayDelta);
        if (end) body.endsAtUtc = shiftMsToDay(end, tz, dayDelta);
        await api(`/api/v1/trips/${tripId}/activities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      await loadTripDetails();
      state.timelineDayKey = moveDayLabel(targetDate).key;
      state.moveBooking = null;
      closeSheet();
      route("timeline", null, true);
      showToast("Booking moved.");
    } catch (error) {
      const message = error?.status === 409
        ? "A newer saved version exists. Reopen the booking before moving it."
        : error?.message || "The booking could not be moved.";
      showToast(message, "alert");
    }
  }
  function requestDiscardChanges(continuation) {
    if (!formHasMeaningfulChanges) return false;
    if (discardDialogOpen) return true;
    discardReturnFocus = document.activeElement;
    discardDialogOpen = continuation;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title" aria-describedby="discard-dialog-copy"><h2 id="discard-dialog-title">Discard changes?</h2><p id="discard-dialog-copy">Your entered details will be lost.</p><div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-discard-action="keep">Keep editing</button><button type="button" class="mobile-primary-action" data-discard-action="discard">Discard</button></div></section>`;
    const dialog = backdrop.querySelector(".discard-dialog"),
      keep = backdrop.querySelector('[data-discard-action="keep"]'),
      discard = backdrop.querySelector('[data-discard-action="discard"]');
    keep.addEventListener("click", () => closeDiscardDialog(false));
    discard.addEventListener("click", () => closeDiscardDialog(true));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeDiscardDialog(false);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDiscardDialog(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [keep, discard],
        index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => keep.focus());
    return true;
  }
  function route(screen, id, replace = false, kind = "forward") {
    if (
      formHasMeaningfulChanges &&
      DIRTY_TASK_SCREENS.has(state.screen) &&
      screen !== state.screen
    ) {
      requestDiscardChanges(() => route(screen, id, replace, kind));
      return;
    }
    const previousScreen = state.screen;
    scrollPositions.set(previousScreen, window.scrollY);
    if (
      screen !== "flight" ||
      String(id || "") !== String(state.selectedId || "")
    )
      state.flightDetailsOpen = false;
    const nextUrl = routeUrl(screen, id);
    state.routeMotion =
      kind === "tab" ? "tab" : kind === "back" ? "back" : "forward";
    if (replace) history.replaceState(null, "", nextUrl);
    else if (`${location.pathname}${location.search}` !== nextUrl)
      history.pushState(null, "", nextUrl);
    state.screen = screen;
    state.selectedId = id || null;
    if (screen !== "checklist") state.editingChecklistId = null;
    if (screen !== "trips") state.tripFilter = null;
    state.sheet = null;
    if (
      DIRTY_TASK_SCREENS.has(screen) &&
      screen !== previousScreen
    )
      formHasMeaningfulChanges = false;
    transitionRender();
    const restore =
      kind === "back" &&
      ["home", "trips", "bookings", "documents", "ready", "account"].includes(
        screen,
      )
        ? scrollPositions.get(screen) || 0
        : 0;
    requestAnimationFrame(() =>
      window.scrollTo({ top: restore, behavior: "instant" }),
    );
  }
  function sessionIdentity(token = state.token) {
    try {
      const body = String(token || "").split(".")[0];
      if (!body) return "anonymous";
      const padded = body.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - body.length % 4) % 4);
      const payload = JSON.parse(decodeURIComponent(Array.from(atob(padded), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
      return String(payload.userId || payload.deviceId || "anonymous").replace(/[^A-Za-z0-9._:-]/g, "_");
    } catch (_) { return "anonymous"; }
  }
  function cacheKey(path) {
    return `${CACHE_PREFIX}${sessionIdentity()}:${path}`;
  }
  function clearApiCache(identity = sessionIdentity()) {
    const prefix = `${CACHE_PREFIX}${identity}:`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  }
  function cacheWrite(path, data) {
    try {
      localStorage.setItem(
        cacheKey(path),
        JSON.stringify({ at: Date.now(), data }),
      );
    } catch (_) {}
  }
  function cacheRead(path) {
    try {
      const raw = localStorage.getItem(cacheKey(path));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function cacheStatus(path) {
    const row = cacheRead(path);
    return row
      ? { ok: true, at: Number(row.at) || null }
      : { ok: false, at: null };
  }
  function pendingMutations() {
    try {
      const rows = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }
  function queuePendingMutation(row) {
    const rows=pendingMutations();rows.push({id:`pending_${crypto.randomUUID()}`,createdAt:Date.now(),status:"pending",...row});localStorage.setItem(PENDING_KEY,JSON.stringify(rows));
  }
  async function flushSmartImportQueue(){if(PREVIEW_MODE||!navigator.onLine||!state.token)return;const rows=pendingMutations(),keep=[];for(const row of rows){if(row.kind!=="smart-import-preview"||row.status==="done"){keep.push(row);continue;}try{await api(row.path,{method:"POST",body:JSON.stringify(row.body)});}catch{keep.push({...row,status:"retry"});}}localStorage.setItem(PENDING_KEY,JSON.stringify(keep));}
  function ageLabel(timestamp) {
    if (!timestamp) return "Not cached";
    const age = Math.max(0, Date.now() - Number(timestamp));
    if (age < 60000) return "Updated now";
    if (age < 3600000) return `Updated ${Math.floor(age / 60000)}m ago`;
    if (age < 86400000) return `Updated ${Math.floor(age / 3600000)}h ago`;
    return `Updated ${Math.floor(age / 86400000)}d ago`;
  }
  function showToast(message, kind = "status") {
    state.toast = String(message || "");
    state.toastKind = kind;
    state.toastAction = null;
    toastActionFn = null;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      state.toastAction = null;
      toastActionFn = null;
      render();
    }, 3600);
  }
  let toastActionFn = null;
  function showUndoToast(message, onUndo, ms = 5000) {
    state.toast = String(message || "");
    state.toastKind = "status";
    state.toastAction = { label: "Undo" };
    toastActionFn = typeof onUndo === "function" ? onUndo : null;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      state.toastAction = null;
      toastActionFn = null;
      render();
    }, ms);
  }
  function statusText(value) {
    const s = String(value || "unavailable").replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function healthRank(severity) {
    return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[severity] ?? 4;
  }
  function docTypeLabel(type) {
    return (
      {
        boarding_pass: "Boarding pass",
        ticket: "Ticket",
        hotel_confirmation: "Hotel confirmation",
        reservation: "Reservation",
        voucher: "Voucher",
        qr_code: "QR code",
        other: "Document",
      }[type] || "Document"
    );
  }
  function transportIcon(type) {
    // Single canonical icon map so every surface shows the right glyph.
    return timelineIcon(type);
  }
  function timelineType(item) {
    const transport = transportForItem(itemId(item));
    if (transport)
      return String(val(transport, "transport_type") || "transport");
    if (item.type === "stay") return "hotel";
    return item.type || "document";
  }
  function locationById(id) {
    return state.locations.find((x) => String(x.id) === String(id)) || null;
  }
  // Pick the most representative destination for trip weather: prefer the place
  // you actually stay/visit over transit hubs like airports. Returns either
  // stored coordinates or a place-name query for the server to geocode.
  function tripWeatherLocation() {
    const rank = { city: 0, hotel: 1, attraction: 2, restaurant: 3, port: 4, station: 5, address: 6, airport: 7, other: 8 };
    const locs = (state.locations || []).slice().sort(
      (a, b) => (rank[val(a, "type")] ?? 9) - (rank[val(b, "type")] ?? 9),
    );
    const withCoords = locs.find(
      (l) => val(l, "latitude") != null && val(l, "longitude") != null,
    );
    if (withCoords)
      return {
        lat: Number(val(withCoords, "latitude")),
        lon: Number(val(withCoords, "longitude")),
        place: val(withCoords, "city") || val(withCoords, "display_name") || "Destination",
      };
    // No stored coordinates (e.g. demo trips) — fall back to a place name and
    // let the server geocode it.
    const named = locs.find((l) => val(l, "city") || val(l, "display_name"));
    if (named) {
      const query = val(named, "city") || val(named, "display_name");
      return { query, place: query };
    }
    return null;
  }

  // Currency conversion is calculated entirely on-device. The Worker only
  // receives the selected ISO currency codes; entered amounts never leave the
  // phone. Last successful rates are retained for offline trips.
  const TRAVEL_CURRENCIES = Object.freeze([
    ["AUD", "Australian dollar"], ["CAD", "Canadian dollar"], ["CHF", "Swiss franc"],
    ["CNY", "Chinese yuan"], ["CZK", "Czech koruna"], ["DKK", "Danish krone"],
    ["EUR", "Euro"], ["GBP", "British pound"], ["HKD", "Hong Kong dollar"],
    ["HUF", "Hungarian forint"], ["ILS", "Israeli new shekel"], ["INR", "Indian rupee"],
    ["ISK", "Icelandic króna"], ["JPY", "Japanese yen"], ["KRW", "South Korean won"],
    ["MXN", "Mexican peso"], ["NOK", "Norwegian krone"], ["NZD", "New Zealand dollar"],
    ["PLN", "Polish złoty"], ["RON", "Romanian leu"], ["SEK", "Swedish krona"],
    ["SGD", "Singapore dollar"], ["THB", "Thai baht"], ["TRY", "Turkish lira"],
    ["USD", "US dollar"], ["ZAR", "South African rand"],
  ]);
  const COUNTRY_CURRENCY = Object.freeze({
    AT:"EUR",BE:"EUR",BG:"EUR",HR:"EUR",CY:"EUR",EE:"EUR",FI:"EUR",FR:"EUR",DE:"EUR",GR:"EUR",IE:"EUR",IT:"EUR",LV:"EUR",LT:"EUR",LU:"EUR",MT:"EUR",NL:"EUR",PT:"EUR",SK:"EUR",SI:"EUR",ES:"EUR",
    AU:"AUD",CA:"CAD",CH:"CHF",CN:"CNY",CZ:"CZK",DK:"DKK",GB:"GBP",HK:"HKD",HU:"HUF",IL:"ILS",IN:"INR",IS:"ISK",JP:"JPY",KR:"KRW",MX:"MXN",NO:"NOK",NZ:"NZD",PL:"PLN",RO:"RON",SE:"SEK",SG:"SGD",TH:"THB",TR:"TRY",US:"USD",ZA:"ZAR",
  });
  function localeCurrency() {
    const locale = String(navigator.language || "en-US"), region = locale.match(/[-_]([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
    return COUNTRY_CURRENCY[region] || "USD";
  }
  function destinationCurrency() {
    const locations = state.locations || [];
    for (const location of locations) {
      const code = String(val(location, "country_code", "countryCode") || "").toUpperCase();
      if (COUNTRY_CURRENCY[code]) return COUNTRY_CURRENCY[code];
    }
    const context = `${state.trip?.title || ""} ${locations.map((location) => `${val(location,"city") || ""} ${val(location,"display_name") || ""} ${val(location,"timezone") || ""}`).join(" ")}`.toLowerCase();
    const hints = [["rome","EUR"],["italy","EUR"],["europe/rome","EUR"],["paris","EUR"],["france","EUR"],["london","GBP"],["tokyo","JPY"],["japan","JPY"],["tel aviv","ILS"],["jerusalem","ILS"],["israel","ILS"],["new york","USD"],["united states","USD"],["sydney","AUD"],["australia","AUD"],["singapore","SGD"],["bangkok","THB"],["istanbul","TRY"]];
    return hints.find(([hint]) => context.includes(hint))?.[1] || "EUR";
  }
  function initCurrency() {
    if (state.currency) return state.currency;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("tripto_currency_preferences_v1") || "null"); } catch (_) {}
    const from = TRAVEL_CURRENCIES.some(([code]) => code === saved?.from) ? saved.from : destinationCurrency();
    let to = TRAVEL_CURRENCIES.some(([code]) => code === saved?.to) ? saved.to : localeCurrency();
    if (to === from) to = from === "USD" ? "EUR" : "USD";
    state.currency = { from, to, amount: Number(saved?.amount) > 0 ? Number(saved.amount) : 100, rate: null, date: null, fetchedAt: null, source: "", cached: false };
    return state.currency;
  }
  function currencyCacheKey(from, to) { return `tripto_currency_rate_v1:${from}:${to}`; }
  function saveCurrencyPreferences() {
    const currency = initCurrency();
    try { localStorage.setItem("tripto_currency_preferences_v1", JSON.stringify({ from:currency.from, to:currency.to, amount:currency.amount })); } catch (_) {}
  }
  function readCurrencyCache(from, to) {
    try { return JSON.parse(localStorage.getItem(currencyCacheKey(from, to)) || "null"); } catch (_) { return null; }
  }
  async function ensureCurrencyRates(force = false) {
    const currency = initCurrency();
    if (state.currencyLoading) return;
    const cached = readCurrencyCache(currency.from, currency.to);
    if (cached?.rate && (!currency.rate || !force)) Object.assign(currency, cached, { cached:true });
    if (PREVIEW_MODE) {
      const previewRates = { "EUR:ILS":3.5118, "EUR:USD":1.1591, "ILS:EUR":0.28475, "USD:EUR":0.86274 };
      currency.rate = previewRates[`${currency.from}:${currency.to}`] || (currency.from === currency.to ? 1 : 1.25);
      currency.date = new Date().toISOString().slice(0,10);
      currency.fetchedAt = Date.now();
      currency.source = "Preview reference rate";
      currency.cached = false;
      state.currencyError = "";
      if (state.screen === "currency") render();
      return;
    }
    if (!navigator.onLine) {
      state.currencyError = cached?.rate ? "" : "Connect once to save this currency pair for offline use.";
      if (state.screen === "currency") render();
      return;
    }
    state.currencyLoading = true;
    state.currencyError = "";
    if (state.screen === "currency") render();
    try {
      const response = await fetchWithTimeout(`${API}/api/v1/currency?base=${encodeURIComponent(currency.from)}&quotes=${encodeURIComponent(currency.to)}`, { headers:{ accept:"application/json" } });
      if (!response.ok) throw new Error("Rates could not be updated.");
      const payload = await response.json(), data = payload?.currency, rate = Number(data?.rates?.[currency.to]);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("This currency pair is unavailable.");
      Object.assign(currency, { rate, date:data.date || null, fetchedAt:Number(data.fetchedAt) || Date.now(), source:data.source || "Reference rate", cached:false });
      try { localStorage.setItem(currencyCacheKey(currency.from, currency.to), JSON.stringify({ rate:currency.rate, date:currency.date, fetchedAt:currency.fetchedAt, source:currency.source })); } catch (_) {}
    } catch (error) {
      state.currencyError = cached?.rate ? "" : (error?.message || "Rates could not be updated.");
      if (cached?.rate) Object.assign(currency, cached, { cached:true });
    } finally {
      state.currencyLoading = false;
      if (state.screen === "currency") render();
    }
  }

  // ==================== Trip Map (contextual) ====================
  // Canonical eligibility + distinct-location model. UI never re-derives this
  // rule: the only question a component asks is canShowTripMap().
  function mapLocationGeo(loc) {
    if (!loc) return { hasCoords: false, lat: null, lon: null, address: null };
    const rawLat = val(loc, "latitude"),
      rawLon = val(loc, "longitude"),
      lat = Number(rawLat),
      lon = Number(rawLon),
      hasCoords =
        rawLat != null &&
        rawLon != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180 &&
        !(lat === 0 && lon === 0);
    return {
      hasCoords,
      lat: hasCoords ? lat : null,
      lon: hasCoords ? lon : null,
      address: val(loc, "local_address", "formatted_address") || null,
    };
  }
  // A place is mappable when it has reliable coordinates OR a street-level
  // address the geocoder can resolve. A city-only label (no address, no
  // coordinates) is deliberately excluded — it is not a specific map point.
  function locationIsMappable(loc) {
    const geo = mapLocationGeo(loc);
    return Boolean(geo.hasCoords || geo.address);
  }
  // Two references collapse to one physical place when they share coordinates
  // (rounded) or a normalized address, so the same hotel used as stay + return
  // point counts once.
  function mapPlaceKey(loc) {
    const geo = mapLocationGeo(loc);
    if (geo.hasCoords) return `c:${geo.lat.toFixed(4)},${geo.lon.toFixed(4)}`;
    if (geo.address)
      return `a:${geo.address.replace(/\s+/g, " ").trim().toLowerCase()}`;
    const name = val(loc, "display_name", "local_name");
    return name ? `n:${String(name).trim().toLowerCase()}` : `id:${loc?.id ?? ""}`;
  }
  function mapMarkerIcon(kind) {
    const k = String(kind || "").toLowerCase();
    if (["flight", "plane", "air"].includes(k)) return "plane";
    if (["hotel", "stay", "lodging", "accommodation"].includes(k)) return "hotel";
    if (["train", "rail"].includes(k)) return "train";
    if (["ferry", "cruise", "boat", "port"].includes(k)) return "navigation";
    if (["car", "car_rental", "transfer", "taxi", "shuttle"].includes(k)) return "car";
    if (["restaurant", "dining", "food"].includes(k)) return "restaurant";
    if (["activity", "tour", "attraction", "museum", "sightseeing"].includes(k)) return "star";
    if (["event", "concert", "theatre", "theater", "show"].includes(k)) return "ticket";
    return "pin";
  }
  // Enumerate active (non-cancelled) bookings that reference a location. Each
  // reference carries the booking it belongs to so a marker can open it.
  function mappableBookingRefs() {
    const refs = [];
    (state.transport || [])
      .filter((t) => !isCancelled(t))
      .forEach((t) => {
        const kind = String(val(t, "transport_type") || "transport"),
          dep = val(t, "departure_location_id", "start_location_id"),
          arr = val(t, "arrival_location_id", "end_location_id"),
          depWhen = Number(val(t, "scheduled_departure_utc", "starts_at_utc")) || null,
          arrWhen = Number(val(t, "scheduled_arrival_utc", "ends_at_utc")) || depWhen;
        if (dep) refs.push({ kind, item: t, entityKind: kind, locId: dep, when: depWhen, role: "from" });
        if (arr) refs.push({ kind, item: t, entityKind: kind, locId: arr, when: arrWhen, role: "to" });
      });
    (state.stays || [])
      .filter((s) => !isCancelled(s))
      .forEach((s) => {
        const loc = val(s, "property_location_id", "start_location_id"),
          when = Date.parse(`${val(s, "check_in_date") || ""}T12:00:00Z`) || null;
        if (loc) refs.push({ kind: "hotel", item: s, entityKind: "hotel", locId: loc, when, role: "stay" });
      });
    (state.timeline || [])
      .filter((it) => !isCancelled(it))
      .forEach((it) => {
        if (transportForItem(itemId(it))) return; // transport counted above
        if (it.type === "stay") return; // stays counted above
        const loc = val(it, "start_location_id", "location_id");
        if (!loc) return;
        const kind = timelineType(it);
        refs.push({
          kind,
          item: it,
          entityKind: String(val(it, "type") || kind || "plan"),
          locId: loc,
          when: Number(val(it, "starts_at_utc")) || null,
          role: "plan",
        });
      });
    return refs;
  }
  // THE canonical list. Distinct usable places for the current trip, each with
  // resolved geo (stored coordinates or a cached geocode), booking associations
  // and the soonest associated time.
  function getMappableTripLocations() {
    const byKey = new Map();
    mappableBookingRefs().forEach((ref) => {
      const loc = locationById(ref.locId);
      if (!locationIsMappable(loc)) return;
      const key = mapPlaceKey(loc);
      let place = byKey.get(key);
      if (!place) {
        const geo = mapLocationGeo(loc);
        const cached = !geo.hasCoords ? geocodeLookup(geocodeQueryFor(loc)) : null;
        place = {
          key,
          location: loc,
          name:
            val(loc, "display_name", "local_name", "station_code", "iata_code") ||
            val(loc, "city") ||
            "Place",
          type: String(val(loc, "type") || ""),
          address: geo.address,
          lat: geo.hasCoords ? geo.lat : cached ? cached.lat : null,
          lon: geo.hasCoords ? geo.lon : cached ? cached.lon : null,
          hasCoords: geo.hasCoords,
          geocoded: !geo.hasCoords && Boolean(cached),
          bookings: [],
          when: null,
        };
        byKey.set(key, place);
      }
      place.bookings.push(ref);
      if (ref.when && (place.when == null || ref.when < place.when)) place.when = ref.when;
      // A place's primary marker icon follows its most specific booking type.
      if (!place.markerKind || place.markerKind === "transport") place.markerKind = ref.entityKind || ref.kind;
    });
    return Array.from(byKey.values());
  }
  // Canonical rule: 2+ distinct usable places → Trip Map is available.
  function canShowTripMap() {
    return getMappableTripLocations().length >= 2;
  }
  function geocodeQueryFor(loc) {
    return (
      val(loc, "formatted_address", "local_address") ||
      [val(loc, "display_name", "local_name"), val(loc, "city")]
        .filter(Boolean)
        .join(", ") ||
      ""
    );
  }
  // --- keyless geocode cache (server proxies Open-Meteo; same-origin, CSP-safe)
  const geocodeCache = new Map();
  let geocodeCacheLoaded = false;
  function loadGeocodeCache() {
    if (geocodeCacheLoaded) return;
    geocodeCacheLoaded = true;
    try {
      const raw = JSON.parse(localStorage.getItem("tripto_geocode_cache") || "{}");
      Object.entries(raw).forEach(([k, v]) => {
        if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) geocodeCache.set(k, v);
      });
    } catch (_) {}
  }
  function geocodeLookup(query) {
    if (!query) return null;
    loadGeocodeCache();
    return geocodeCache.get(query.trim().toLowerCase()) || null;
  }
  function persistGeocodeCache() {
    try {
      const obj = {};
      geocodeCache.forEach((v, k) => (obj[k] = v));
      localStorage.setItem("tripto_geocode_cache", JSON.stringify(obj));
    } catch (_) {}
  }
  async function geocodeMissingTripPlaces() {
    if (state.offline) return false;
    loadGeocodeCache();
    const pending = getMappableTripLocations().filter(
      (p) => p.lat == null && geocodeQueryFor(p.location),
    );
    let changed = false;
    // Resolve sequentially (respect the free geocoder) and cap per open.
    for (const place of pending.slice(0, 8)) {
      const query = geocodeQueryFor(place.location),
        key = query.trim().toLowerCase();
      if (geocodeCache.has(key)) continue;
      try {
        const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(query)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          geocodeCache.set(key, { lat: NaN, lon: NaN, failed: true });
          continue;
        }
        const payload = await res.json(),
          hit = payload?.location;
        if (hit && Number.isFinite(Number(hit.latitude)) && Number.isFinite(Number(hit.longitude))) {
          geocodeCache.set(key, { lat: Number(hit.latitude), lon: Number(hit.longitude) });
          changed = true;
        } else {
          geocodeCache.set(key, { lat: NaN, lon: NaN, failed: true });
        }
      } catch (_) {
        return changed; // network died — stop; Timeline/list still work
      }
    }
    if (changed) persistGeocodeCache();
    return changed;
  }
  function tripMapDayKey(when) {
    return when ? new Date(when).toISOString().slice(0, 10) : null;
  }
  function tripMapDayLabel(dayKey) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${dayKey}T12:00:00Z`));
    } catch (_) {
      return dayKey;
    }
  }
  function tripMapNextKey(places) {
    const now = Date.now();
    let best = null;
    places.forEach((p) => {
      p.bookings.forEach((b) => {
        if (b.when && b.when >= now && (!best || b.when < best.when))
          best = { when: b.when, key: p.key };
      });
    });
    return best?.key || null;
  }
  function tripMapNavQuery(place) {
    if (place.lat != null && place.lon != null) return `${place.lat},${place.lon}`;
    return place.address || place.name || "";
  }
  // The trip's mappable places for a given day (or the whole trip), ordered by
  // time. Falls back to the whole trip when a stale/empty day filter is passed.
  function orderedTripMapPlaces(dayKey) {
    const all = getMappableTripLocations();
    const filtered = dayKey
      ? all.filter((p) => p.bookings.some((b) => tripMapDayKey(b.when) === dayKey))
      : all;
    const use = filtered.length ? filtered : all;
    return use
      .slice()
      .sort((a, b) => (a.when || Infinity) - (b.when || Infinity));
  }
  function tripMapScreen() {
    if (!state.trip)
      return missingDetailScreen("Trip Map", "Select a trip to see its map.");
    const places = getMappableTripLocations();
    if (places.length < 2)
      return missingDetailScreen(
        "Trip Map",
        "This trip does not have enough places to map yet. Add another booking with a location and the map will appear.",
      );
    const nextKey = tripMapNextKey(places),
      dayKeys = Array.from(
        new Set(
          places
            .flatMap((p) => p.bookings.map((b) => tripMapDayKey(b.when)))
            .filter(Boolean),
        ),
      ).sort(),
      activeDay = dayKeys.includes(state.tripMapDay) ? state.tripMapDay : null,
      ordered = orderedTripMapPlaces(activeDay),
      tripDates = esc(formatTripDates(state.trip) || "");
    const chips = dayKeys.length
      ? `<div class="trip-map__days" role="group" aria-label="Filter map by day"><button type="button" class="trip-map__day ${activeDay ? "" : "is-active"}" data-action="trip-map-day" data-day="" aria-pressed="${!activeDay}">All Trip</button>${dayKeys
          .map(
            (d) =>
              `<button type="button" class="trip-map__day ${activeDay === d ? "is-active" : ""}" data-action="trip-map-day" data-day="${esc(d)}" aria-pressed="${activeDay === d}">${esc(tripMapDayLabel(d))}</button>`,
          )
          .join("")}</div>`
      : "";
    const rows = ordered
      .map((p) => {
        const isNext = p.key === nextKey,
          markerClass = String(p.markerKind || p.type || "place").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          when = p.when ? esc(formatDateTime(p.when)) : "",
          addr = esc(p.address || (p.hasCoords ? "Saved location" : "Address on file")),
          meta = [when, addr].filter(Boolean).join(" · ");
        return `<div class="trip-map__row ${isNext ? "is-next" : ""}"><button type="button" class="trip-map__row-main" data-action="trip-map-navigate" data-query="${esc(tripMapNavQuery(p))}" aria-label="Get directions to ${esc(p.name)}"><span class="trip-map__row-icon trip-map__row-icon--${esc(markerClass)}">${icon(mapMarkerIcon(p.markerKind || p.type), 20)}</span><span class="trip-map__row-copy"><strong>${esc(p.name)}${isNext ? `<span class="trip-map__next">NEXT</span>` : ""}</strong><small>${meta}</small></span><span class="trip-map__row-nav">${icon("navigation", 18)}<small>Directions</small></span></button></div>`;
      })
      .join("");
    const offlineNote = state.offline
      ? `<div class="trip-map__offline" role="status">${icon("info", 18)}<span>Your places are saved on this phone. Connect for directions.</span></div>`
      : "";
    const listTitle = activeDay ? tripMapDayLabel(activeDay) : "All trip places";
    return `<div class="phone-app"><section class="screen trip-map-screen">${appBar("Trip Map", tripDates ? `${state.trip.title || "Trip"} · ${formatTripDates(state.trip)}` : state.trip.title || "Trip", true)}<main class="trip-map"><header class="trip-map__hero"><span class="trip-map__hero-icon">${icon("map", 26)}</span><div><span>YOUR ROUTE</span><h1>Places in trip order</h1><p>Everything from your bookings, organized by day.</p></div><strong aria-label="${ordered.length} places">${ordered.length}</strong></header>${chips}${offlineNote}<div class="trip-map__list-head"><div><span>TRIP PLACES</span><h2>${esc(listTitle)}</h2></div><small>Tap for directions</small></div><section class="trip-map__list" aria-label="Trip places">${rows}</section><p class="trip-map__note">Directions open one destination at a time. tripto.to never requests your location or shares your complete itinerary with Google.</p></main></section></div>`;
  }
  // Short localized weekday for a "YYYY-MM-DD" date (noon avoids TZ edge cases).
  function weekdayLabel(date) {
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
        new Date(`${date}T12:00:00`),
      );
    } catch (_error) {
      return "";
    }
  }
  // Is a destination-local hour ("...THH:MM") daytime? Rough sunrise/sunset split
  // just to pick a sun vs moon glyph — no location, no precision needed.
  function isHourDay(iso) {
    const hh = typeof iso === "string" ? Number(iso.slice(11, 13)) : NaN;
    if (!Number.isFinite(hh)) return true;
    return hh >= 6 && hh < 19;
  }
  // "HH:MM" straight from the destination-local ISO string (no TZ conversion).
  function hourLabel(iso) {
    return typeof iso === "string" && iso.length >= 16 ? iso.slice(11, 16) : "";
  }
  // "Wed, May 26, 22:00" from a destination-local ISO string, shown literally so
  // the time matches the destination clock rather than the phone's timezone.
  function formatWeatherMoment(iso) {
    if (typeof iso !== "string" || iso.length < 16) return "";
    const datePart = iso.slice(0, 10), time = iso.slice(11, 16);
    try {
      const d = new Date(`${datePart}T12:00:00`),
        wd = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d),
        md = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
      return `${wd}, ${md}, ${time}`;
    } catch (_error) {
      return time;
    }
  }
  // Map WMO weather codes (what Open-Meteo returns) to a short label + icon.
  function weatherFromCode(code, isDay) {
    const c = Number(code);
    if (!Number.isFinite(c)) return { label: "Weather", iconName: "wx-cloud" };
    if (c === 0) return { label: isDay ? "Clear sky" : "Clear night", iconName: isDay ? "wx-sun" : "wx-moon" };
    if (c === 1) return { label: "Mostly clear", iconName: isDay ? "wx-sun" : "wx-moon" };
    if (c === 2) return { label: "Partly cloudy", iconName: "wx-cloud-sun" };
    if (c === 3) return { label: "Overcast", iconName: "wx-cloud" };
    if (c === 45 || c === 48) return { label: "Fog", iconName: "wx-fog" };
    if (c >= 51 && c <= 57) return { label: "Drizzle", iconName: "wx-cloud-rain" };
    if (c >= 61 && c <= 67) return { label: "Rain", iconName: "wx-cloud-rain" };
    if (c >= 71 && c <= 77) return { label: "Snow", iconName: "wx-cloud-snow" };
    if (c >= 80 && c <= 82) return { label: "Rain showers", iconName: "wx-cloud-rain" };
    if (c === 85 || c === 86) return { label: "Snow showers", iconName: "wx-cloud-snow" };
    if (c >= 95) return { label: "Thunderstorm", iconName: "wx-storm" };
    return { label: "Weather", iconName: "wx-cloud" };
  }
  // Stable cache key for a weather target (rounded coords, or place query).
  function weatherKeyFor(target) {
    return target.query
      ? `q:${String(target.query).trim().toLowerCase()}`
      : `c:${Number(target.lat).toFixed(4)},${Number(target.lon).toFixed(4)}`;
  }
  // Distinct weather-worthy places for this trip so a multi-stop trip can show a
  // per-place forecast. Deduped by city (falling back to the fetch key), each
  // entry carries a display label, country, fetch target and soonest time.
  function weatherPlaces() {
    const out = [];
    const seenCity = new Set();
    const seenKey = new Set();
    getMappableTripLocations().forEach((p) => {
      // Weather is city-accurate, so coordinates are ideal; when a place has
      // none, prefer a city/place NAME the keyless geocoder can resolve. A full
      // street address (geocodeQueryFor's first choice) would 404 there, so it
      // is only the last resort before the raw place name.
      const target =
        p.lat != null && p.lon != null
          ? { lat: p.lat, lon: p.lon }
          : {
              query:
                val(p.location, "city") ||
                [val(p.location, "display_name", "local_name"), val(p.location, "country")]
                  .filter(Boolean)
                  .join(", ") ||
                geocodeQueryFor(p.location) ||
                p.name,
            };
      if (target.query == null && target.lat == null) return;
      const key = weatherKeyFor(target);
      const city = val(p.location, "city");
      const cityKey = city ? String(city).trim().toLowerCase() : "";
      if (cityKey && seenCity.has(cityKey)) return;
      if (seenKey.has(key)) return;
      if (cityKey) seenCity.add(cityKey);
      seenKey.add(key);
      out.push({
        key,
        label: city || p.name,
        country: val(p.location, "country") || null,
        target,
        when: p.when || null,
      });
    });
    out.sort((a, b) => (a.when || Infinity) - (b.when || Infinity));
    if (!out.length) {
      const t = tripWeatherLocation();
      if (t) {
        const target = t.query ? { query: t.query } : { lat: t.lat, lon: t.lon };
        out.push({ key: weatherKeyFor(target), label: t.place || "Destination", country: null, target, when: null });
      }
    }
    return out;
  }
  // The place whose forecast the Weather screen currently shows: the user's
  // selection when it still matches a place, otherwise the primary (first) one.
  function currentWeatherPlace() {
    const places = weatherPlaces();
    if (!places.length) return null;
    return places.find((p) => p.key === state.weatherSel) || places[0];
  }
  let weatherInFlight = null;
  // Fetch a place's weather in the background and re-render when it lands.
  // apiGet already caches per-path in localStorage, so it degrades gracefully
  // offline. Skips the network when we already have fresh data for this place.
  async function ensureWeather(force) {
    if (PREVIEW_MODE) return;
    const place = currentWeatherPlace();
    if (!place) {
      if (state.weatherByPlace && Object.keys(state.weatherByPlace).length) {
        state.weatherByPlace = {};
        render();
      }
      return;
    }
    if (!state.weatherByPlace) state.weatherByPlace = {};
    const key = place.key;
    const target = place.target;
    const existing = state.weatherByPlace[key];
    const fresh =
      !force &&
      existing &&
      Date.now() - Number(existing.fetchedAt || 0) < 30 * 60 * 1000;
    if (fresh) return;
    if (weatherInFlight === key) return;
    weatherInFlight = key;
    // Surface a "Loading forecast…" state whenever we have nothing to show yet,
    // so a first-time fetch never looks like a dead "No forecast yet" screen.
    if (!existing) {
      state.weatherRefreshing = true;
      if (state.screen === "weather") render();
    }
    const path = target.query
      ? `/api/v1/weather?q=${encodeURIComponent(target.query)}`
      : `/api/v1/weather?lat=${Number(target.lat).toFixed(4)}&lon=${Number(target.lon).toFixed(4)}`;
    try {
      const data = await apiGet(path);
      const wx = data?.weather;
      if (!wx || wx.temperatureC == null) return;
      const view = weatherFromCode(wx.weatherCode, wx.isDay);
      const daily = Array.isArray(wx.daily)
        ? wx.daily
            .filter((day) => day && day.tempMaxC != null)
            .map((day) => {
              const dayView = weatherFromCode(day.weatherCode, true);
              return {
                date: day.date,
                weekday: weekdayLabel(day.date),
                iconName: dayView.iconName,
                hi: Math.round(day.tempMaxC),
                lo: day.tempMinC != null ? Math.round(day.tempMinC) : null,
                precip: day.precipProb != null ? Math.round(day.precipProb) : null,
                wind: day.windMs != null ? Math.round(day.windMs) : null,
              };
            })
        : [];
      const hourly = Array.isArray(wx.hourly)
        ? wx.hourly
            .filter((h) => h && h.tempC != null)
            .map((h) => {
              const hView = weatherFromCode(h.weatherCode, isHourDay(h.time));
              return {
                time: h.time,
                iconName: hView.iconName,
                temp: Math.round(h.tempC),
                precip: h.precipProb != null ? Math.round(h.precipProb) : null,
                wind: h.windMs != null ? Math.round(h.windMs) : null,
              };
            })
        : [];
      state.weatherByPlace[key] = {
        key,
        place: wx.place || place.label,
        tempC: Number(wx.temperatureC),
        label: view.label,
        iconName: view.iconName,
        observedAt: wx.observedAt || null,
        timezone: wx.timezone || null,
        hi: daily[0]?.hi ?? null,
        lo: daily[0]?.lo ?? null,
        daily,
        hourly,
        fetchedAt: Number(wx.fetchedAt) || Date.now(),
      };
      if (state.screen === "timeline" || state.screen === "weather") render();
    } catch (_error) {
      // Weather is non-essential; leave any previous value in place.
    } finally {
      weatherInFlight = null;
      if (state.weatherRefreshing) {
        state.weatherRefreshing = false;
        if (state.screen === "weather") render();
      }
    }
  }
  function locationLabel(id) {
    const loc = locationById(id);
    return loc
      ? String(
          val(
            loc,
            "iata_code",
            "station_code",
            "display_name",
            "local_name",
            "formatted_address",
          ) || "Location",
        )
      : "Location unavailable";
  }
  function locationName(id) {
    const loc = locationById(id);
    return loc
      ? String(
          val(loc, "display_name", "local_name", "formatted_address") ||
            locationLabel(id),
        )
      : "Location unavailable";
  }
  function transportForItem(id) {
    return state.transport.find((x) => itemId(x) === String(id)) || null;
  }
  function stayForItem(id) {
    return state.stays.find((x) => itemId(x) === String(id)) || null;
  }
  function selectedFlight() {
    const flights = state.transport.filter(
      (x) => String(val(x, "transport_type")) === "flight" && !isCancelled(x),
    );
    return (
      flights.find((x) => itemId(x) === state.selectedId) ||
      flights.find(
        (x) =>
          state.brain?.nextItem &&
          itemId(x) === String(state.brain.nextItem.id),
      ) ||
      flights[0] ||
      null
    );
  }
  function selectedStay() {
    const selected = state.stays.find(
      (x) => itemId(x) === String(state.selectedId || ""),
    );
    if (selected) return selected;
    const stays = state.stays.filter((x) => !isCancelled(x));
    return stays[0] || state.stays[0] || null;
  }
  function detailFor(item) {
    const id = itemId(item);
    return (
      state.bookingDetails.find((x) => String(x.trip_item_id) === id) || null
    );
  }
  function contactFor(item, type) {
    const id = item ? itemId(item) : null;
    const direct = id
      ? state.contacts.find(
          (contact) =>
            String(contact.trip_item_id || "") === id &&
            (!type || contact.contact_type === type),
        )
      : null;
    if (direct || !type) return direct || null;
    const typed = state.contacts.filter(
      (contact) => contact.contact_type === type,
    );
    return typed.length === 1 ? typed[0] : null;
  }
  function formatDateOnly(date) {
    if (!date) return "Date unavailable";
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${date}T12:00:00Z`));
    } catch (_) {
      return String(date);
    }
  }
  function formatTripBoundDate(date, trip) {
    if (!date) return "Date unavailable";
    const starts = val(trip, "starts_on"),
      ends = val(trip, "ends_on"),
      inside =
        starts &&
        ends &&
        String(date) >= String(starts) &&
        String(date) <= String(ends);
    if (!inside) return formatDateOnly(date);
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(`${date}T12:00:00Z`));
    } catch (_) {
      return String(date);
    }
  }
  function formatTripDates(trip) {
    if (!trip) return "";
    const start = val(trip, "starts_on"),
      end = val(trip, "ends_on");
    if (!start && !end) return "Dates not set";
    if (!start || !end) return formatDateOnly(start || end);
    if (start === end) return formatDateOnly(start);
    return formatDateRange(start, end);
  }
  function formatDateRange(start, end) {
    const parse = (date) => {
      const parts = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).formatToParts(new Date(`${date}T12:00:00Z`));
      const get = (type) => parts.find((p) => p.type === type)?.value || "";
      return { mon: get("month"), day: get("day"), year: get("year") };
    };
    try {
      const a = parse(start),
        b = parse(end);
      if (a.year === b.year && a.mon === b.mon)
        return `${a.mon} ${a.day}–${b.day}, ${b.year}`;
      if (a.year === b.year)
        return `${a.mon} ${a.day} – ${b.mon} ${b.day}, ${b.year}`;
      return `${a.mon} ${a.day}, ${a.year} – ${b.mon} ${b.day}, ${b.year}`;
    } catch (_) {
      return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
    }
  }
  function formatTime(ms, timeZone) {
    if (ms == null) return "—";
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timeZone || undefined,
      }).format(new Date(Number(ms)));
    } catch (_) {
      return "—";
    }
  }
  function formatDateTime(ms, timeZone) {
    if (ms == null) return "Unavailable";
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: timeZone || undefined,
      }).format(new Date(Number(ms)));
    } catch (_) {
      return "Unavailable";
    }
  }
  function formatDay(ms, timeZone) {
    if (ms == null) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: timeZone || undefined,
      }).format(new Date(Number(ms)));
    } catch (_) {
      return "";
    }
  }
  function nights(stay) {
    const a = val(stay, "check_in_date"),
      b = val(stay, "check_out_date");
    if (!a || !b) return "—";
    const count = Math.round(
      (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
    );
    return Number.isFinite(count) && count >= 0 ? String(count) : "—";
  }
  function tripDayCount(trip) {
    if (!trip) return 0;
    const start = val(trip, "starts_on"),
      end = val(trip, "ends_on");
    if (!start || !end) return 0;
    const days =
      Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
          86400000,
      ) + 1;
    return Number.isFinite(days) && days > 0 ? days : 0;
  }
  function tripDurationLabel(trip) {
    const days = tripDayCount(trip);
    return days ? `${days} day${days === 1 ? "" : "s"}` : "";
  }
  function localImageUrl(value) {
    const source = String(value || "");
    return source.startsWith("/") || source.startsWith("data:image/")
      ? source
      : "";
  }
  function checkDot(extra = "") {
    return `<span class="status-dot-check${extra ? ` ${extra}` : ""}">${icon("check", 14)}</span>`;
  }
  function primaryCta(label, action, iconName = "chevron", attrs = "") {
    return `<button class="primary-cta" data-action="${action}" ${attrs}><span class="cta-left">${icon(iconName, 24)}<span>${esc(label)}</span></span>${icon("chevron", 24)}</button>`;
  }
  function detailAction(label, action, iconName = "chevron", attrs = "") {
    return `<button class="mobile-secondary-action detail-action" data-action="${action}" ${attrs}>${icon(iconName, 18)} ${esc(label)}</button>`;
  }
  function addDocumentButton(id = "") {
    return detailAction("Add document", "add-document", "plus", id ? `data-id="${esc(id)}"` : "");
  }
  // Shared "fd" design system used across every booking detail screen: a hero
  // card (.fd-card) followed by one grouped list card (.fd-list) of consistent
  // rows, so hotel/train/plan match the flight detail layout exactly.
  function fdRowIcon(name, warn = false) {
    return `<span class="fd-row__icon${warn ? " fd-row__icon--warn" : ""}">${icon(name, 20)}</span>`;
  }
  function fdRowText(title, sub = "") {
    return `<span class="fd-row__text"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
  }
  function fdStaticRow(iconName, title, sub = "", warn = false) {
    return `<div class="fd-row fd-row--static">${fdRowIcon(iconName, warn)}${fdRowText(title, sub)}</div>`;
  }
  function fdButtonRow(iconName, title, action, attrs = "", sub = "", trail = "chevron") {
    return `<button type="button" class="fd-row fd-row--button" data-action="${action}" ${attrs}>${fdRowIcon(iconName)}${fdRowText(title, sub)}${trail ? `<span class="fd-row__chev">${icon(trail, 18)}</span>` : ""}</button>`;
  }
  function fdLinkRow(iconName, title, href, ariaLabel = "", sub = "") {
    return `<a class="fd-row fd-row--button" href="${esc(href)}"${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ""}>${fdRowIcon(iconName)}${fdRowText(title, sub)}<span class="fd-row__chev">${icon("chevron", 18)}</span></a>`;
  }
  function fdDocRows(item) {
    return linkedBookingDocuments(item)
      .map((document) => {
        const ready = document.integrity === "verified";
        return `<div class="fd-row fd-row--doc"><button type="button" class="fd-row__main" data-action="open-document" data-id="${esc(document.id)}">${fdRowIcon(document.type === "boarding_pass" ? "qr" : "document")}${fdRowText(document.name || docTypeLabel(document.type), ready ? "Ready offline" : statusText(document.integrity || "checking"))}</button><button type="button" class="fd-row__trail fd-row__trail--remove" data-action="remove-document" data-id="${esc(document.id)}" aria-label="Remove ${esc(document.name || "document")}">${icon("trash", 18)}</button></div>`;
      })
      .join("");
  }
  function fdAddRow(id = "") {
    return `<button type="button" class="fd-row fd-row--button" data-action="add-document"${id ? ` data-id="${esc(id)}"` : ""}>${fdRowIcon("plus")}${fdRowText("Add document")}<span class="fd-row__chev">${icon("chevron", 18)}</span></button>`;
  }
  function fdList(rows, label = "Booking details and documents") {
    const body = rows.filter(Boolean).join("");
    return body ? `<section class="fd-list" aria-label="${esc(label)}">${body}</section>` : "";
  }
  // Editable notes, shared by every booking detail screen. Notes are stored
  // either on a scoped contact (flight/hotel/train/car/transfer) or inline on
  // the activity/reservation entity; noteStorage() resolves which, so the same
  // inline editor and preservation of structured detail entries works anywhere.
  function noteStorage(item, kind) {
    const base = bookingBaseKind(kind),
      tt = String(val(item, "transport_type") || "").toLowerCase(),
      k = String(kind || "").toLowerCase();
    if (base === "flight" || tt === "flight") return { mode: "contact", type: "airline", structured: [], keep: [] };
    if (base === "hotel") return { mode: "contact", type: "hotel", structured: [], keep: ["phone", "email"] };
    if (k === "ferry" || tt === "ferry") return { mode: "contact", type: "other", structured: [["Platform", "platform"], ["Coach", "coach"], ["Vehicle", "vehicle"]], keep: [] };
    if (base === "train" || tt === "train") return { mode: "contact", type: "other", structured: [["Platform", "platform"], ["Coach", "coach"]], keep: [] };
    if (k === "car-rental" || tt === "car") return { mode: "contact", type: "rental_car", structured: [["Driver", "driver"]], keep: ["phone"] };
    if (k === "transfer" || tt === "transfer") return { mode: "contact", type: "driver", structured: [["Driver", "driver"], ["Vehicle", "vehicle"]], keep: ["phone"] };
    return { mode: "entity" };
  }
  function bookingNoteText(item, kind) {
    const store = noteStorage(item, kind),
      raw = store.mode === "contact"
        ? val(directItemContact(item, store.type), "notes")
        : val(item, "activity_notes", "reservation_notes", "notes");
    return parseManualDetailNotes(raw).notes;
  }
  async function saveBookingNote(item, kind, text) {
    const tripId = encodeURIComponent(state.trip?.id || ""), id = itemId(item),
      clean = String(text || "").trim(), store = noteStorage(item, kind);
    if (store.mode === "contact") {
      const existing = directItemContact(item, store.type) || {},
        parsed = parseManualDetailNotes(val(existing, "notes")),
        notes = store.structured.length
          ? buildManualDetailNotes(store.structured.map(([label, key]) => [label, parsed[key]]), clean)
          : (clean || null),
        details = { notes };
      (store.keep || []).forEach((key) => { details[key] = val(existing, key); });
      await saveManualContact(tripId, id, store.type, String(val(existing, "display_name") || statusText(store.type)), details, item);
    } else {
      const parsed = parseManualDetailNotes(val(item, "activity_notes", "reservation_notes", "notes")),
        notes = buildManualDetailNotes([
          ["Date", parsed.date], ["To", parsed.endLocation], ["Return / end date", parsed.endDate],
          ["Guests", parsed.guests], ["Vehicle", parsed.vehicle], ["Driver", parsed.driver],
          ["Ship", parsed.ship], ["Cabin", parsed.cabin], ["Deck", parsed.deck],
          ["Embarkation", parsed.embarkation], ["Seat / section", parsed.seatSection],
          ["Address", parsed.streetAddress], ["Contact", parsed.contact],
          ["Reservation window", parsed.reservationWindow],
        ], clean),
        entityKind = String(val(item, "kind") || "").toLowerCase(),
        isActivity = entityKind === "activity" || (!!val(item, "activity_type") && !val(item, "reservation_type")),
        body = {
          kind: isActivity ? "activity" : "reservation",
          status: val(item, "status") || "confirmed",
          title: val(item, "title") || statusText(kind),
          startsAtUtc: Number(val(item, "starts_at_utc")) || null,
          endsAtUtc: Number(val(item, "ends_at_utc")) || null,
          timezone: val(item, "timezone", "start_timezone") || null,
          locationId: val(item, "start_location_id", "venue_location_id") || null,
          reference: val(item, "reference", "confirmation_number", "reservation_reference") || null,
          notes,
          confidence: val(item, "confidence") || "confirmed",
          version: Number(val(item, "version")) || 1,
        };
      if (isActivity) body.activityType = val(item, "activity_type") || null;
      else body.reservationType = val(item, "reservation_type") || "reservation";
      await api(`/api/v1/trips/${tripId}/activities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
    }
    await loadTripDetails();
  }
  function fdNoteRow(item, kind) {
    const id = itemId(item), note = bookingNoteText(item, kind),
      editing = String(state.editingNote || "") === String(id);
    if (editing) {
      return `<form class="fd-note-edit" data-note-form data-id="${esc(id)}" data-kind="${esc(kind)}"><div class="fd-note-edit__head">${fdRowIcon("info")}<span class="fd-note-edit__title">Notes</span></div><textarea name="note" class="fd-note-edit__field" rows="3" maxlength="2000" placeholder="Add a note for this booking" aria-label="Booking note">${esc(note)}</textarea><div class="fd-note-edit__actions"><button type="button" class="fd-note-btn fd-note-btn--ghost" data-action="cancel-note">Cancel</button><button type="button" class="fd-note-btn fd-note-btn--save" data-action="save-note" data-id="${esc(id)}" data-kind="${esc(kind)}">Save note</button></div></form>`;
    }
    if (note) {
      return `<button type="button" class="fd-row fd-row--note fd-row--note-btn" data-action="edit-note" data-id="${esc(id)}" data-kind="${esc(kind)}"><span class="fd-row__icon">${icon("info", 20)}</span><span class="fd-row__text"><strong>Notes</strong><small class="fd-note">${esc(note)}</small></span><span class="fd-row__chev">${icon("edit", 18)}</span></button>`;
    }
    return `<button type="button" class="fd-row fd-row--button fd-row--note-add" data-action="edit-note" data-id="${esc(id)}" data-kind="${esc(kind)}"><span class="fd-row__icon">${icon("plus", 20)}</span><span class="fd-row__text"><strong>Add note</strong></span><span class="fd-row__chev">${icon("chevron", 18)}</span></button>`;
  }

  function sessionExpiry(token) {
    try {
      const body = String(token || "").split(".")[0];
      if (!body) return 0;
      let padded = body.replace(/-/g, "+").replace(/_/g, "/");
      padded += "=".repeat((4 - (padded.length % 4)) % 4);
      const payload = JSON.parse(
        decodeURIComponent(
          Array.from(
            atob(padded),
            (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
          ).join(""),
        ),
      );
      return Number(payload.exp) || 0;
    } catch (_) {
      return 0;
    }
  }
  // Every network call gets a hard deadline. Without one, a stalled request
  // (cold worker, flaky mobile radio) leaves loadApp() awaiting forever and the
  // loading skeleton stuck on screen with no way out. On timeout we abort so the
  // caller's catch/finally runs — falling back to cached data or the
  // recoverable "Try Again" error screen instead of a permanent skeleton.
  const REQUEST_TIMEOUT_MS = 15000;
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === "AbortError")
        throw new Error(
          "The network took too long to respond. Check your connection and try again.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function refreshSessionIfNeeded() {
    if (!state.token || !navigator.onLine || PREVIEW_MODE) return;
    const exp = sessionExpiry(state.token);
    if (!exp || exp - Date.now() > 14 * 86400000) return;
    if (exp <= Date.now()) {
      throw Object.assign(new Error("Your session expired. Sign in again; cached trip data remains on this phone."), { status: 401, code: "SESSION_EXPIRED" });
    }
    if (sessionRefreshPromise) return sessionRefreshPromise;
    sessionRefreshPromise = (async () => {
      const response = await fetchWithTimeout(`${API}/api/v1/session/refresh`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${state.token}`,
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (!response.ok)
        throw new Error(
          "Your saved session could not be refreshed. Keep browser data and retry while online.",
        );
      const data = await response.json();
      state.token = data.token;
      localStorage.setItem("tripto_token", state.token);
    })();
    try {
      await sessionRefreshPromise;
    } finally {
      sessionRefreshPromise = null;
    }
  }
  async function ensureSession() {
    if (PREVIEW_MODE) return "preview";
    if (state.token) {
      await refreshSessionIfNeeded();
      return state.token;
    }
    if (!navigator.onLine)
      throw new Error(
        "No saved session is available offline. Open tripto.to online once before relying on offline mode.",
      );
    const response = await fetchWithTimeout(`${API}/api/v1/session/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "web",
        appVersion: "mobile-ui-v1",
        apiVersion: "v1",
      }),
    });
    if (!response.ok) throw new Error("Could not start the guest session.");
    const data = await response.json();
    state.token = data.token;
    localStorage.setItem("tripto_token", state.token);
    return state.token;
  }
  async function api(path, options = {}) {
    if (PREVIEW_MODE) throw new Error("Preview mode does not call the API.");
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET" && !navigator.onLine)
      throw new Error(
        "This change needs internet. Cached trip information is still available.",
      );
    await ensureSession();
    const response = await fetchWithTimeout(`${API}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${state.token}`,
          ...(options.headers || {}),
        },
      }),
      requestId =
        response.headers.get("x-request-id") || response.headers.get("cf-ray");
    if (response.status === 401)
      throw Object.assign(
        new Error(
          "This device session is no longer accepted. Do not clear browser data; cached trip information remains on this device.",
        ),
        { requestId, status: 401, code: "AUTH_REQUIRED" },
      );
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      let code, details;
      try {
        const payload = await response.json();
        message = payload.error?.message || message;
        code = payload.error?.code;
        details = payload.error?.details;
      } catch (_) {}
      throw Object.assign(new Error(message), {
        requestId,
        status: response.status,
        code,
        details,
      });
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async function apiGet(path) {
    if (PREVIEW_MODE) return null;
    if (navigator.onLine) {
      try {
        const data = await api(path);
        cacheWrite(path, data);
        state.offline = false;
        return data;
      } catch (error) {
        if (error?.status === 401 || error?.code === "AUTH_REQUIRED" || error?.code === "SESSION_EXPIRED") throw error;
        const cached = cacheRead(path);
        if (cached) {
          state.offline = true;
          return cached.data;
        }
        throw error;
      }
    }
    const cached = cacheRead(path);
    if (cached) return cached.data;
    throw new Error(
      "This part of the trip has not been cached on this phone yet.",
    );
  }
  async function apiDownload(path, fallbackName) {
    if (PREVIEW_MODE) throw new Error("Downloads are available outside preview mode.");
    if (!navigator.onLine) throw new Error("This download needs internet.");
    await ensureSession();
    const response = await fetchWithTimeout(`${API}${path}`, {
      headers: { authorization: `Bearer ${state.token}` },
    });
    if (response.status === 401)
      throw Object.assign(new Error("This device session is no longer accepted."), { status: 401, code: "AUTH_REQUIRED" });
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try { const payload = await response.json(); message = payload.error?.message || message; } catch (_) {}
      throw Object.assign(new Error(message), { status: response.status });
    }
    const disposition = response.headers.get("content-disposition") || "",
      match = disposition.match(/filename="?([^"]+)"?/),
      name = match ? match[1] : fallbackName,
      blob = await response.blob(),
      url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function openLocalDocDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(
          new Error("Local document storage is unavailable on this device."),
        );
        return;
      }
      const request = indexedDB.open(LOCAL_DOC_DB, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("docs")) {
          const store = db.createObjectStore("docs", { keyPath: "id" });
          store.createIndex("tripId", "tripId", { unique: false });
        }
        if (!db.objectStoreNames.contains("bookingDrafts")) {
          const drafts = db.createObjectStore("bookingDrafts", {
            keyPath: "draftId",
          });
          drafts.createIndex("tripId", "tripId", { unique: false });
          drafts.createIndex("status", "status", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error || new Error("Could not open local document storage."),
        );
    });
  }
  async function sha256Blob(blob) {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
  }
  async function listLocalDocs(tripId) {
    if (PREVIEW_MODE)
      return previewData().documents.map((document, index) => ({
        ...document,
        tripId,
        id: document.id || `preview-doc-${index}`,
        name: document.title,
        size: 240000,
        savedAt: Date.now() - index * 3600000,
        travelerIds: document.travelerIds || [],
        integrity: "verified",
        blob: null,
      }));
    try {
      const db = await openLocalDocDb();
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction("docs", "readonly");
        const request = tx.objectStore("docs").index("tripId").getAll(tripId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      return Promise.all(
        rows.map(async (row) => {
          if (!row.blob || !row.checksum)
            return { ...row, integrity: "unverified" };
          try {
            return {
              ...row,
              integrity:
                (await sha256Blob(row.blob)) === row.checksum
                  ? "verified"
                  : "corrupt",
            };
          } catch (_) {
            return { ...row, integrity: "unverified" };
          }
        }),
      );
    } catch (_) {
      return [];
    }
  }
  async function saveLocalDocument(file, type, travelerIds, relatedBookingId = null) {
    if (!state.trip) throw new Error("Open a trip first.");
    if (!file) throw new Error("Choose a file.");
    if (file.size > 10 * 1024 * 1024)
      throw new Error("The beta limit is 10 MB per local document.");
    const existing = await listLocalDocs(state.trip.id);
    const checksum = await sha256Blob(file),
      duplicate = existing.find(
        (document) =>
          document.checksum === checksum && document.integrity === "verified",
      );
    if (duplicate) {
      showToast("This document is already saved on this phone.");
      return duplicate;
    }
    if (existing.length >= 20)
      throw new Error(
        "The beta limit is 20 local documents per trip on this phone.",
      );
    const row = {
      id: `doc_${crypto.randomUUID()}`,
      tripId: state.trip.id,
      name: file.name || "document",
      mime: file.type || "application/octet-stream",
      size: file.size,
      type: type || "other",
      travelerIds: Array.isArray(travelerIds) ? travelerIds : [],
      relatedBookingId: relatedBookingId || null,
      savedAt: Date.now(),
      checksum,
      integrity: "verified",
      blob: file,
    };
    const db = await openLocalDocDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("docs", "readwrite");
      tx.objectStore("docs").put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    state.localDocs = await listLocalDocs(state.trip.id);
    showToast("Document saved offline on this phone.");
    render();
    return row;
  }
  async function linkLocalDocument(documentId, relatedBookingId) {
    if (!documentId || !relatedBookingId || PREVIEW_MODE) return;
    const row = state.localDocs.find(
      (document) => String(document.id) === String(documentId),
    );
    if (!row) return;
    const db = await openLocalDocDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("docs", "readwrite");
      tx.objectStore("docs").put({ ...row, relatedBookingId });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    state.localDocs = await listLocalDocs(state.trip.id);
  }
  async function removeLocalDocument(id) {
    const db = await openLocalDocDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("docs", "readwrite");
      tx.objectStore("docs").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    state.localDocs = await listLocalDocs(state.trip.id);
    showToast("Document removed from this phone.");
  }
  async function openLocalDocument(id) {
    const row = state.localDocs.find(
      (document) => String(document.id) === String(id),
    );
    if (!row || !row.blob) {
      showToast(
        PREVIEW_MODE
          ? "Preview document selected."
          : "The document is not available on this phone.",
      );
      return;
    }
    if (row.integrity !== "verified") {
      showToast(
        "Document integrity could not be verified. Save a fresh copy before relying on it offline.",
      );
      return;
    }
    openDocumentViewer(row.blob, row.name);
  }
  // Populate trips/account/selected-trip from the local cache so relaunching
  // paints the last-known screen instantly instead of the loading skeleton.
  function hydrateAppFromCache() {
    const tripsRow = cacheRead("/api/v1/trips");
    if (!tripsRow) return false;
    const accountRow = cacheRead("/api/v1/account");
    state.trips = tripsRow.data?.trips || [];
    if (accountRow) state.account = accountRow.data?.account || state.account || null;
    const selected = localStorage.getItem("tripto_selected_trip");
    state.trip =
      state.trips.find((trip) => String(trip.id) === selected) ||
      selectRelevantTrip(state.trips) ||
      null;
    if (state.trip) hydrateTripDetailsFromCache();
    return true;
  }
  async function loadApp() {
    state.tripsLoaded = false;
    state.error = null;
    state.requestId = null;
    state.sessionRejected = false;
    if (PREVIEW_MODE) {
      state.loading = true;
      render();
      if (QA_STATE === "loading") return;
      applyPreviewData();
      if (["offline", "empty-offline"].includes(QA_STATE)) state.offline = true;
      if (QA_STATE === "timeline-empty") {
        state.timeline = [];
        state.brain = { ...state.brain, nextItem: null };
      }
      if (QA_STATE === "trip-empty") {
        state.timeline = [];
        state.transport = [];
        state.stays = [];
        state.health = {
          highestSeverity: "high",
          issueCount: 1,
          calculatedAt: Date.now(),
          issues: [
            {
              severity: "high",
              title: "No travelers added",
              explanation: "The trip has no traveler records.",
            },
          ],
        };
        state.brain = { ...state.brain, nextItem: null };
      }
      if (QA_STATE === "timeline-warning" && state.timeline[1]) {
        state.timeline[1] = {
          ...state.timeline[1],
          status: "cancelled",
        };
      }
      if (QA_STATE === "timeline-now" && state.timeline[0]) {
        const previewNow = Date.now();
        state.timeline[0] = {
          ...state.timeline[0],
          starts_at_utc: previewNow - 30 * 60 * 1000,
          ends_at_utc: previewNow + 2 * 60 * 60 * 1000,
        };
      }
      if (QA_STATE === "hotel-missing-image" && state.stays[0]) {
        state.stays[0] = {
          ...state.stays[0],
          property_image_url: null,
          image_url: null,
        };
      }
      if (QA_STATE === "hotel-missing-location") {
        state.locations = state.locations.map((location) =>
          location.id === "hotel"
            ? {
                ...location,
                local_address: null,
                formatted_address: null,
                latitude: null,
                longitude: null,
              }
            : location,
        );
      }
      if (QA_STATE === "hotel-cancelled" && state.stays[0]) {
        state.stays[0] = {
          ...state.stays[0],
          status: "cancelled",
          booking_status: "cancelled",
        };
      }
      if (QA_STATE === "ready-missing") {
        state.localDocs = [];
      }
      if (QA_STATE === "health-issues") {
        state.health = {
          highestSeverity: "high",
          issueCount: 2,
          calculatedAt: Date.now(),
          issues: [
            { severity: "high", title: "Connection needs attention", explanation: "The saved connection leaves less time than recommended.", suggestedAction: "Review connection" },
            { severity: "medium", title: "Boarding pass missing offline", explanation: "Arthur’s boarding pass is not saved on this phone.", suggestedAction: "Add document" },
          ],
        };
      }
      if (QA_STATE === "sync-conflict") {
        state.syncStatus = { pendingOperations: 2, openConflicts: 1, lastSuccessfulSyncAt: Date.now() - 7200000 };
      }
      if (QA_STATE === "legacy-no-dates") {
        state.trip = { ...state.trip, title: "Legacy trip", starts_on: null, ends_on: null };
        state.trips = [state.trip];
      }
      if (QA_STATE === "active-no-upcoming") {
        const past = Date.now() - 7 * 24 * 60 * 60 * 1000;
        state.trip = { ...state.trip, lifecycle_state: "active" };
        state.trips = [state.trip];
        state.timeline = state.timeline.map((item, index) => ({
          ...item,
          starts_at_utc: past - index * 60 * 60 * 1000,
          ends_at_utc: past - index * 30 * 60 * 1000,
        }));
        state.brain = { ...state.brain, nextItem: null };
      }
      if (["empty", "empty-offline", "empty-reduced-motion"].includes(QA_STATE)) {
        state.trip = null;
        state.trips = [];
        await loadTripDetails();
      }
      if (QA_STATE === "error") {
        state.trip = null;
        state.trips = [];
        state.error =
          "Trip data could not be reached. Your saved trip data remains safe.";
        state.requestId = "local-preview";
      }
      state.tripsLoaded = !state.error;
      state.loading = false;
      render();
      maybeLoadScreenData();
      return;
    }
    const hydrated = hydrateAppFromCache();
    state.loading = !hydrated;
    if (hydrated) state.tripsLoaded = true;
    render();
    try {
      const [tripsResult, accountResult] = await Promise.all([
        apiGet("/api/v1/trips"),
        apiGet("/api/v1/account"),
      ]);
      state.trips = tripsResult?.trips || [];
      state.account = accountResult?.account || null;
      if (state.account?.mode === "account") {
        try {
          const inboxResult = await apiGet("/api/v1/booking-emails");
          state.bookingEmails = inboxResult?.bookingEmails || [];
        } catch (_error) {
          state.bookingEmails = [];
        }
      } else state.bookingEmails = [];
      const selected = localStorage.getItem("tripto_selected_trip");
      state.trip =
        state.trips.find((trip) => String(trip.id) === selected) ||
        selectRelevantTrip(state.trips) ||
        null;
      if (state.trip)
        localStorage.setItem("tripto_selected_trip", state.trip.id);
      await loadTripDetails();
      state.tripsLoaded = true;
      // Keep the requested screen even when there are no trips. The Trips
      // empty state offers creation without redirecting into a form.
    } catch (error) {
      const authFailed = error?.status === 401 || error?.code === "AUTH_REQUIRED";
      // If we already painted cached data, keep it on screen for transient
      // network errors — only surface the error screen when we have nothing, or
      // when the session was rejected and must be re-authenticated.
      if (!hydrated || authFailed) {
        state.tripsLoaded = false;
        state.error = error instanceof Error ? error.message : String(error);
        state.requestId = error?.requestId || null;
        state.sessionRejected = authFailed;
      } else {
        state.offline = true;
      }
    } finally {
      state.loading = false;
      render();
      maybeLoadScreenData();
    }
  }
  function selectRelevantTrip(trips) {
    const now = new Date().toISOString().slice(0, 10);
    const active = trips.find((trip) => String(val(trip, "lifecycle_state", "lifecycleState")) === "active");
    if (active) return active;
    const upcoming = trips
      .filter((trip) => {
        const lifecycle = String(val(trip, "lifecycle_state", "lifecycleState") || "upcoming");
        const start = String(val(trip, "starts_on", "startsOn") || "");
        return lifecycle === "upcoming" && (!start || start >= now);
      })
      .sort((a, b) => String(val(a, "starts_on", "startsOn") || "9999").localeCompare(String(val(b, "starts_on", "startsOn") || "9999")))[0];
    if (upcoming) return upcoming;
    return [...trips].sort((a, b) => String(val(b, "ends_on", "endsOn", "updated_at") || "").localeCompare(String(val(a, "ends_on", "endsOn", "updated_at") || "")))[0] || null;
  }
  function tripDetailPaths() {
    const id = encodeURIComponent(state.trip.id);
    return [
      `/api/v1/trips/${id}/timeline`,
      `/api/v1/trips/${id}/checklist`,
      `/api/v1/trips/${id}/brain`,
      `/api/v1/trips/${id}/impacts`,
      `/api/v1/trips/${id}/transport`,
      `/api/v1/trips/${id}/stays`,
      `/api/v1/trips/${id}/locations`,
      `/api/v1/trips/${id}/travelers`,
      `/api/v1/trips/${id}/connections`,
      `/api/v1/trips/${id}/health/expanded`,
      `/api/v1/trips/${id}/booking-details`,
      `/api/v1/trips/${id}/contacts`,
      `/api/v1/trips/${id}/sync/status`,
      `/api/v1/trips/${id}/activities`,
      `/api/v1/trips/${id}/imports`,
      `/api/v1/trips/${id}/changes`,
    ];
  }
  function applyTripDetails(results) {
    const take = (index, key, fallback) =>
      results[index] && results[index].status === "fulfilled"
        ? (results[index].value?.[key] ?? fallback)
        : fallback;
    state.timeline = take(0, "items", []);
    state.timelineDayKey = null;
    state.checklist = normalizeChecklist(take(1, "items", []));
    state.brain = take(2, "brain", null);
    state.impacts = take(3, "impacts", []);
    state.transport = take(4, "transport", []);
    state.liveFlights =
      results[4] && results[4].status === "fulfilled"
        ? results[4].value?.liveFlights || {
            enabled: false,
            available: false,
            betaOnly: true,
            reason: "disabled",
          }
        : { enabled: false, available: false, betaOnly: true, reason: "unavailable" };
    state.stays = take(5, "stays", []);
    state.locations = take(6, "locations", []);
    state.travelers = take(7, "travelers", []);
    state.connections = take(8, "connections", []);
    state.health = take(9, "health", null);
    state.bookingDetails = take(10, "bookingDetails", []);
    state.contacts = take(11, "contacts", []);
    state.syncStatus = take(
      12,
      "sync",
      results[12] && results[12].status === "fulfilled" ? results[12].value : null,
    );
    const activityDetails = take(13, "activities", []),
      activityById = new Map(activityDetails.map((item) => [String(item.id), item]));
    state.timeline = state.timeline.map((item) => activityById.has(String(item.id)) ? { ...item, ...activityById.get(String(item.id)) } : item);
    state.imports = take(14, "imports", []);
    state.changes = take(15, "changes", []);
  }
  // Imports that still need the traveler to review/confirm them (the unread set).
  function pendingImportCount() {
    return (state.imports || []).filter((row) =>
      ["needs_confirmation", "pending", "changed"].includes(String(row.status || "").toLowerCase()),
    ).length;
  }
  // Synchronously populate trip detail state from the local cache so a returning
  // user sees the timeline instantly instead of the loading skeleton. Returns
  // true only when the core timeline was cached (enough to render meaningfully).
  function hydrateTripDetailsFromCache() {
    if (!state.trip) return false;
    const results = tripDetailPaths().map((path) => {
      const row = cacheRead(path);
      return row ? { status: "fulfilled", value: row.data } : { status: "rejected" };
    });
    if (results[0].status !== "fulfilled") return false;
    applyTripDetails(results);
    return true;
  }
  async function loadTripDetails() {
    if (!state.trip) {
      state.timeline = [];
      state.checklist = [];
      state.brain = null;
      state.impacts = [];
      state.changes = [];
      state.transport = [];
      state.liveFlights = { enabled: false, available: false, betaOnly: true, reason: "disabled" };
      state.stays = [];
      state.locations = [];
      state.travelers = [];
      state.connections = [];
      state.health = null;
      state.bookingDetails = [];
      state.contacts = [];
      state.syncStatus = null;
      state.localDocs = [];
      resetCollaborationState();
      return;
    }
    const tripId = state.trip.id;
    if (
      (state.sharingTripId && String(state.sharingTripId) !== String(tripId)) ||
      (state.collabTripId && String(state.collabTripId) !== String(tripId))
    )
      resetCollaborationState();
    const results = await Promise.allSettled(tripDetailPaths().map(apiGet));
    // Drop the response if the user switched trips while it was in flight, so a
    // slow request can never overwrite the newly-opened trip's data.
    if (state.trip?.id !== tripId) return;
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      const first = failed[0].reason;
      throw Object.assign(new Error(`Some trip details could not be loaded (${failed.length} section${failed.length === 1 ? "" : "s"}). Existing information has been kept.`), { cause: first, status: first?.status, code: first?.code });
    }
    applyTripDetails(results);
    state.localDocs = await listLocalDocs(tripId);
    if (state.trip?.id !== tripId) return;
    void ensureWeather();
    // Soft, non-fatal: lets the trip menu reveal "Plan together" only when the
    // server kill-switch (SHARING_ENABLED) is on. Never blocks trip loading.
    void loadSharingStatus(tripId);
  }
  async function refreshBookingEmailInbox() {
    if (PREVIEW_MODE || state.account?.mode !== "account") return;
    const result = await apiGet("/api/v1/booking-emails");
    state.bookingEmails = result?.bookingEmails || [];
  }
  // Optimistic trip entry: if cached detail exists, navigate immediately and
  // revalidate in the background; otherwise fall back to the loading skeleton.
  async function enterTripWithDetails(routeAfter) {
    if (PREVIEW_MODE) {
      routeAfter();
      return;
    }
    if (hydrateTripDetailsFromCache()) {
      routeAfter();
      try {
        await loadTripDetails();
        render();
      } catch (_error) {}
      return;
    }
    // No cache: route to the destination immediately so the shell (header, trip
    // name, bottom nav) stays on screen, then show a contained in-place loader
    // instead of replacing the whole app with the full-screen grey skeleton.
    // Clear the previous trip's detail arrays first so nothing stale flashes.
    Object.assign(state, { timeline: [], transport: [], stays: [], locations: [], travelers: [], checklist: [], brain: null, impacts: [], changes: [], health: null, bookingDetails: [], contacts: [] });
    state.tripDetailsLoading = true;
    routeAfter();
    try {
      await loadTripDetails();
    } finally {
      state.tripDetailsLoading = false;
    }
    render();
  }

  function previewData() {
    const today = new Date(),
      departure = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 7),
      arrival = departure + 3.5 * 3600000,
      romeDayMorning = departure + 23.5 * 3600000,
      florenceTrainOut = departure + 3 * 86400000 + 0.5 * 3600000,
      florenceTrainBack = departure + 3 * 86400000 + 10 * 3600000;
    return {
      account: { mode: "guest" },
      sharing: {
        enabled: true,
        role: "owner",
        canManage: true,
        activeMembers: 1,
      },
      trips: [
        {
          id: "preview-trip",
          title: "Rome 2026",
          lifecycle_state: "upcoming",
          starts_on: new Date(departure).toISOString().slice(0, 10),
          ends_on: new Date(departure + 6 * 86400000)
            .toISOString()
            .slice(0, 10),
        },
        {
          id: "preview-trip-next",
          title: "Athens Weekend",
          lifecycle_state: "upcoming",
          starts_on: new Date(departure + 28 * 86400000).toISOString().slice(0, 10),
          ends_on: new Date(departure + 31 * 86400000).toISOString().slice(0, 10),
        },
        {
          id: "preview-trip-past",
          title: "Paris Spring",
          lifecycle_state: "completed",
          starts_on: "2026-04-03",
          ends_on: "2026-04-08",
        },
      ],
      trip: {
        id: "preview-trip",
        title: "Rome 2026",
        lifecycle_state: "upcoming",
        starts_on: new Date(departure).toISOString().slice(0, 10),
        ends_on: new Date(departure + 6 * 86400000).toISOString().slice(0, 10),
      },
      locations: [
        {
          id: "tlv",
          type: "airport",
          display_name: "Ben Gurion Airport",
          iata_code: "TLV",
          timezone: "Asia/Jerusalem",
        },
        {
          id: "fco",
          type: "airport",
          display_name: "Rome Fiumicino",
          iata_code: "FCO",
          timezone: "Europe/Rome",
        },
        {
          id: "hotel",
          type: "hotel",
          display_name: "Hotel Artemide",
          local_name: "Hotel Artemide",
          formatted_address: "Via Nazionale 22, 00184 Roma RM, Italy",
          local_address: "Via Nazionale 22, Roma",
          timezone: "Europe/Rome",
        },
        { id: "rome", type: "city", display_name: "Rome", city: "Rome", country: "Italy", timezone: "Europe/Rome" },
        { id: "termini", type: "station", display_name: "Roma Termini", city: "Rome", station_code: "ROM", formatted_address: "Piazza dei Cinquecento, Rome", timezone: "Europe/Rome" },
        { id: "florence", type: "station", display_name: "Firenze S. M. Novella", city: "Florence", station_code: "FIR", timezone: "Europe/Rome" },
        { id: "vatican", type: "venue", display_name: "Vatican Museums", city: "Rome", formatted_address: "Viale Vaticano, Rome", timezone: "Europe/Rome" },
      ],
      travelers: [{ id: "traveler", display_name: "Arthur", traveler_type: "adult", version: 1 }, { id: "traveler-2", display_name: "Maya", traveler_type: "adult", version: 1 }],
      transport: [
        {
          id: "flight",
          trip_item_id: "flight",
          type: "transport",
          transport_type: "flight",
          title: "LY 383",
          status: "confirmed",
          carrier_name: "EL AL",
          service_number: "383",
          marketing_airline_code: "LY",
          marketing_flight_number: "383",
          departure_location_id: "tlv",
          arrival_location_id: "fco",
          scheduled_departure_utc: departure,
          scheduled_arrival_utc: arrival,
          departure_timezone: "Asia/Jerusalem",
          arrival_timezone: "Europe/Rome",
          departure_terminal: "3",
          arrival_terminal: "1",
          booking_reference: "ABC123",
          booking_status: "confirmed",
          traveler_ids: "traveler",
        },
        {
          id: "train", trip_item_id: "train", type: "transport", transport_type: "train", title: "Frecciarossa 9512", status: "confirmed", booking_status: "confirmed", carrier_name: "Trenitalia", service_number: "9512", departure_location_id: "termini", arrival_location_id: "florence", scheduled_departure_utc: florenceTrainOut, scheduled_arrival_utc: florenceTrainOut + 5700000, departure_timezone: "Europe/Rome", arrival_timezone: "Europe/Rome", departure_platform: "8", booking_reference: "TRN48291", traveler_ids: "traveler,traveler-2",
        },
        {
          id: "train-return", trip_item_id: "train-return", type: "transport", transport_type: "train", title: "Frecciarossa 9551", status: "confirmed", booking_status: "confirmed", carrier_name: "Trenitalia", service_number: "9551", departure_location_id: "florence", arrival_location_id: "termini", scheduled_departure_utc: florenceTrainBack, scheduled_arrival_utc: florenceTrainBack + 5700000, departure_timezone: "Europe/Rome", arrival_timezone: "Europe/Rome", booking_reference: "TRN48291", traveler_ids: "traveler,traveler-2",
        },
      ],
      stays: [
        {
          id: "stay",
          trip_item_id: "stay",
          type: "stay",
          status: "confirmed",
          title: "Hotel Artemide",
          property_name: "Hotel Artemide",
          property_location_id: "hotel",
          check_in_date: new Date(departure).toISOString().slice(0, 10),
          check_in_from: "15:00",
          check_out_date: new Date(departure + 6 * 86400000)
            .toISOString()
            .slice(0, 10),
          check_out_by: "11:00",
          confirmation_number: "HTL-48291",
          booking_status: "confirmed",
        },
      ],
      timeline: [
        {
          id: "flight",
          type: "transport",
          status: "confirmed",
          title: "Flight to Rome",
          subtitle: "LY 383 · TLV → FCO",
          starts_at_utc: departure,
          ends_at_utc: arrival,
          start_timezone: "Asia/Jerusalem",
          end_timezone: "Europe/Rome",
          confidence: "confirmed",
        },
        {
          id: "transfer",
          type: "transfer",
          status: "confirmed",
          title: "Airport to hotel",
          subtitle: "Private transfer",
          starts_at_utc: arrival + 45 * 60000,
          start_timezone: "Europe/Rome",
          confidence: "confirmed",
        },
        {
          id: "stay",
          type: "stay",
          status: "confirmed",
          title: "Hotel Artemide",
          subtitle: "Check-in",
          starts_at_utc: arrival + 2 * 3600000,
          start_timezone: "Europe/Rome",
          confidence: "confirmed",
        },
        {
          id: "breakfast",
          type: "activity",
          status: "confirmed",
          title: "Breakfast reservation",
          subtitle: "Restaurant",
          starts_at_utc: romeDayMorning,
          ends_at_utc: romeDayMorning + 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        {
          id: "photo-walk",
          type: "activity",
          status: "confirmed",
          title: "Photography walk",
          subtitle: "Historic centre",
          starts_at_utc: romeDayMorning + 1.5 * 3600000,
          ends_at_utc: romeDayMorning + 3 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        {
          id: "coffee",
          type: "activity",
          status: "confirmed",
          title: "Coffee & pastry",
          subtitle: "Café stop",
          starts_at_utc: romeDayMorning + 3.5 * 3600000,
          ends_at_utc: romeDayMorning + 4 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        {
          id: "lunch",
          type: "activity",
          status: "confirmed",
          title: "Lunch in Rome",
          subtitle: "Restaurant",
          starts_at_utc: romeDayMorning + 4.5 * 3600000,
          ends_at_utc: romeDayMorning + 6 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        {
          id: "activity",
          type: "activity",
          status: "confirmed",
          title: "Vatican Museums",
          subtitle: "Entrance reservation",
          starts_at_utc: romeDayMorning + 7 * 3600000,
          ends_at_utc: romeDayMorning + 9 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          confidence: "confirmed",
          start_location_id: "vatican",
          confirmation_number: "VAT-29184",
        },
        {
          id: "shopping",
          type: "activity",
          status: "confirmed",
          title: "Souvenir shopping",
          subtitle: "Historic centre",
          starts_at_utc: romeDayMorning + 10 * 3600000,
          ends_at_utc: romeDayMorning + 10.5 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        {
          id: "wine",
          type: "activity",
          status: "confirmed",
          title: "Wine tasting",
          subtitle: "Enoteca",
          starts_at_utc: romeDayMorning + 11 * 3600000,
          ends_at_utc: romeDayMorning + 12.5 * 3600000,
          start_timezone: "Europe/Rome",
          end_timezone: "Europe/Rome",
          start_location_id: "rome",
          confidence: "confirmed",
        },
        { id: "train", type: "transport", status: "confirmed", title: "Train to Florence", subtitle: "Frecciarossa 9512", starts_at_utc: florenceTrainOut, ends_at_utc: florenceTrainOut + 5700000, start_timezone: "Europe/Rome", end_timezone: "Europe/Rome", confidence: "confirmed" },
        { id: "train-return", type: "transport", status: "confirmed", title: "Train to Rome", subtitle: "Frecciarossa 9551", starts_at_utc: florenceTrainBack, ends_at_utc: florenceTrainBack + 5700000, start_timezone: "Europe/Rome", end_timezone: "Europe/Rome", confidence: "confirmed" },
      ],
      brain: {
        nextItem: {
          id: "flight",
          type: "transport",
          status: "confirmed",
          title: "Flight to Rome",
          startsAtUtc: departure,
          endsAtUtc: arrival,
          startTimezone: "Asia/Jerusalem",
          endTimezone: "Europe/Rome",
        },
        recommendationConfidence: "unavailable",
        issues: [],
        smartEssentials: [],
        alerts: [],
      },
      health: {
        highestSeverity: "info",
        issueCount: 0,
        issues: [],
        calculatedAt: Date.now(),
      },
      bookingDetails: [
        {
          trip_item_id: "flight",
          traveler_id: "traveler",
          display_name: "Arthur",
          seat: "12A",
          cabin_class: "Economy",
          checked_bags: 1,
          cabin_bags: 1,
          ticket_number: "114-1234567890",
        },
      ],
      contacts: [
        {
          id: "airline",
          contact_type: "airline",
          display_name: "EL AL",
          phone: "+972 3 9771111",
          trip_item_id: "flight",
        },
        {
          id: "hotel-contact",
          contact_type: "hotel",
          display_name: "Hotel Artemide",
          phone: "+39 06 489911",
          email: "info@hotelartemide.it",
          trip_item_id: "stay",
        },
      ],
      syncStatus: { pendingOperations: 0, openConflicts: 0 },
      checklist: [
        { id: "check-passport", title: "Passport", category: "documents", priority: "critical", completed: true, completion_source: "user", traveler_id: "traveler", version: 1 },
        { id: "check-pass", title: "Save boarding pass offline", category: "documents", priority: "high", completed: true, completion_source: "system", traveler_id: "traveler", version: 1 },
        { id: "check-adapter", title: "Pack power adapter", category: "packing", priority: "medium", completed: false, version: 1 },
        { id: "check-med", title: "Pack medication", category: "packing", priority: "high", completed: false, traveler_id: "traveler", version: 1 },
      ],
      imports: [
        { id: "import-1", created_at: Date.now() - 86400000, source_type: "forwarded_email", candidate_type: "flight", status: "needs_confirmation", subject: "Your flight to Rome" },
        { id: "import-2", created_at: Date.now() - 3 * 86400000, source_type: "forwarded_email", candidate_type: "hotel", status: "imported", subject: "Hotel Artemide confirmation" },
      ],
      documents: [
        {
          id: "boarding",
          title: "LY 383 Boarding Pass",
          type: "boarding_pass",
          subtitle: "Arthur · TLV → FCO",
          status: "Ready",
          date: "Saved offline",
          travelerIds: ["traveler"],
        },
        {
          id: "hotel-doc",
          title: "Hotel Artemide Confirmation",
          type: "hotel_confirmation",
          subtitle: "Rome stay",
          status: "Ready",
          date: "Saved offline",
          travelerIds: [],
        },
        {
          id: "train-ticket",
          title: "Frecciarossa 9512 Tickets",
          type: "ticket",
          subtitle: "Arthur and Maya · Rome → Florence",
          status: "Ready",
          date: "Saved offline",
          travelerIds: ["traveler", "traveler-2"],
        },
      ],
    };
  }
  function applyPreviewData() {
    const data = previewData();
    Object.assign(state, data);
    state.localDocs = data.documents.map((document) => ({
      ...document,
      name: document.title,
      size: 260000,
      savedAt: Date.now(),
      integrity: "verified",
      blob: null,
    }));
    state.offline = false;
  }
  function topbar() {
    return `<header class="app-header"><button class="brand" data-screen="home" aria-label="tripto.to Home">tripto<span class="brand-dot">.</span>to</button><div class="connection-state">${state.offline ? `<span class="offline-state" role="status">${icon("info", 16)} Offline</span>` : ""}<button class="header-icon" data-screen="account" aria-label="Account">${icon("user", 30)}</button></div></header>`;
  }
  function appBar(title, subtitle = "", dark = false, right = "") {
    return `<header class="app-bar ${dark ? "app-bar--dark" : ""}"><button class="icon-button" data-action="back" aria-label="Back">${icon("back", 24)}</button><div class="app-bar-title"><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div><div class="app-bar-actions">${right || ""}</div></header>`;
  }
  // Header notification bell. Opens the Notifications sheet, which merges the
  // trip's /changes feed (imports, added stops, time markers, documents…) with
  // any forwarded bookings still awaiting review. The badge counts unread
  // changes plus pending booking reviews.
  function totalNotificationCount() {
    const pending = (state.bookingEmails || []).filter((row) =>
      ["needs_trip", "needs_confirmation"].includes(String(row.status || "")),
    ).length;
    return unreadNotificationCount() + pending;
  }
  function notifyAction() {
    if (!state.trip) return "";
    const unread = totalNotificationCount();
    const label = unread
      ? `Notifications, ${unread} unread`
      : "Notifications";
    const badge = unread
      ? `<span class="unread-badge" aria-hidden="true">${unread > 9 ? "9+" : unread}</span>`
      : "";
    return `<button class="icon-button notify-button" data-action="open-notifications" aria-label="${esc(label)}">${icon("bell", 24)}${badge}</button>`;
  }
  function bottomNav(active) {
    const norm = active === "account"
        ? "account"
        : active === "checklist"
          ? "checklist"
          : active === "trip-options"
            ? "trip-options"
          : "trips";
    const navBtn = (screen, ic, label) =>
      `<button class="nav-item ${norm === screen ? "active" : ""}" data-screen="${screen}" ${norm === screen ? 'aria-current="page"' : ""}><span class="nav-item__icon">${icon(ic, 23, "", norm === screen ? "fill" : "regular")}</span><span>${label}</span></button>`;
    const addBtn = canEditCurrentTrip()
      ? `<button class="nav-item nav-add" data-action="open-add" aria-label="Add"><span>${icon("plus", 30)}</span></button>`
      : `<button class="nav-item nav-add nav-add--view-only" data-action="view-only-hint" aria-label="View only — you can't add to this trip"><span>${icon("viewer", 26)}</span></button>`;
    return `<nav class="bottom-nav bottom-nav--v2" aria-label="Primary navigation">${navBtn("trips", "plane", "Trip")}${navBtn("trip-options", "route", "Trip options")}${addBtn}${navBtn("checklist", "checklist", "To-do")}${navBtn("account", "user", "Account")}</nav>`;
  }
  function mobileAlert() {
    if (state.offline)
      return `<div class="mobile-alert mobile-alert--offline">${icon("info", 18)}<span>Offline. Showing the last trip data saved on this phone.</span></div>`;
    const conflicts = Number(
      val(state.syncStatus, "openConflicts", "open_conflicts") || 0,
    );
    if (conflicts)
      return `<div class="mobile-alert">${icon("warning", 18)}<span>${conflicts} change${conflicts === 1 ? "" : "s"} need review before sync can finish.</span></div>`;
    return "";
  }
  function tripContext() {
    if (!state.trip) return "";
    return `<div class="trip-context"><div class="trip-context-copy"><strong>${esc(state.trip.title || "Current trip")}</strong><span>${esc(formatTripDates(state.trip))}</span></div><span class="context-chip ${state.offline ? "warning" : ""}">${state.offline ? "Offline" : "Current trip"}</span></div>`;
  }
  function sectionHead(title, action = "", label = "View all") {
    return `<div class="section-head"><div class="section-label">${esc(title)}</div>${action ? `<button class="text-action" data-action="${action}">${esc(label)}</button>` : ""}</div>`;
  }
  function activeHealthIssues() {
    const rows = state.health?.issues || [];
    return [...rows].sort(
      (a, b) =>
        healthRank(a.severity) - healthRank(b.severity) ||
        (Number(a.priority) || 99) - (Number(b.priority) || 99),
    );
  }
  function healthSummary() {
    if (isEmptyTripSetup())
      return {
        title: "Finish setting up your trip",
        subtitle: "Add your first booking to build the itinerary.",
        kind: "setup",
        icon: "plus",
      };
    const issues = activeHealthIssues();
    if (!state.health)
      return {
        title: "Trip Health not available yet",
        subtitle: "Add itinerary details to assess this trip.",
        kind: "info",
        icon: "info",
      };
    if (!issues.length)
      return {
        title: "Everything looks good",
        subtitle: "No known trip issues.",
        kind: "good",
        icon: "check",
      };
    const first = issues[0];
    return {
      title: `${issues.length} thing${issues.length === 1 ? "" : "s"} need attention`,
      subtitle:
        first.title || first.explanation || "Open Trip Health to review.",
      kind: ["critical", "high"].includes(first.severity) ? "warning" : "info",
      icon: "warning",
    };
  }
  function meaningfulBookingCount() {
    const ids = new Set();
    for (const item of [...state.timeline, ...state.transport, ...state.stays]) {
      if (!item || isCancelled(item)) continue;
      const id = itemId(item);
      if (id) ids.add(String(id));
    }
    return ids.size;
  }
  function isEmptyTripSetup() {
    return Boolean(state.trip) && meaningfulBookingCount() === 0;
  }
  function tripLifecycleState() {
    return String(val(state.trip, "lifecycle_state", "lifecycleState") || "upcoming").toLowerCase();
  }
  function noUpcomingTripState() {
    const lifecycle = tripLifecycleState();
    if (isEmptyTripSetup())
      return {
        label: "Start building",
        title: "No plans yet",
        copy: "Add your first flight, stay, train, or activity.",
        icon: "plus",
        setup: true,
      };
    if (["completed", "archived"].includes(lifecycle))
      return {
        label: "Completed",
        title: "Trip completed",
        copy: "Preserve the itinerary and documents for reference.",
        icon: "check",
      };
    return {
      label: "What’s next",
      title: "No upcoming plan",
      copy: "Add the next booking or complete the trip when travel is finished.",
      icon: "clock",
    };
  }
  function noUpcomingCard() {
    const view = noUpcomingTripState();
    return `<section class="next-action-card ${view.setup ? "next-action-card--setup" : ""}"><span class="ticket-chip ${view.setup ? "ticket-chip--setup" : ""}">${icon(view.icon, 18)} ${esc(view.label)}</span><h2>${esc(view.title)}</h2><p>${esc(view.copy)}</p><div class="next-action-actions"><button class="secondary-cta ${view.setup ? "next-action-primary" : ""}" data-action="open-add">${icon("plus", 20)} Add booking</button><button class="secondary-cta" data-screen="trips">${icon("trips", 20)} Timeline</button></div></section>`;
  }
  function nextItem() {
    return (
      state.brain?.nextItem ||
      state.timeline
        .filter(
          (item) =>
            !isCancelled(item) &&
            Number(val(item, "starts_at_utc", "startsAtUtc")) >= Date.now(),
        )
        .sort(
          (a, b) =>
            Number(val(a, "starts_at_utc", "startsAtUtc")) -
            Number(val(b, "starts_at_utc", "startsAtUtc")),
        )[0] ||
      null
    );
  }
  function nextFlight() {
    const next = nextItem();
    if (!next) return null;
    const transport = transportForItem(itemId(next));
    return transport && String(val(transport, "transport_type")) === "flight"
      ? transport
      : null;
  }
  function flightRoute(flight) {
    return {
      fromCode: locationLabel(
        val(flight, "departure_location_id", "start_location_id"),
      ),
      fromName: locationName(
        val(flight, "departure_location_id", "start_location_id"),
      ),
      toCode: locationLabel(
        val(flight, "arrival_location_id", "end_location_id"),
      ),
      toName: locationName(
        val(flight, "arrival_location_id", "end_location_id"),
      ),
    };
  }
  function flightLocationCode(id) {
    const loc = locationById(id);
    const raw = loc ? val(loc, "iata_code", "station_code") : null;
    const code = String(raw || "").trim().toUpperCase();
    return /^[A-Z0-9]{2,5}$/.test(code) ? code : "—";
  }
  function flightNumber(flight) {
    const carrier =
        val(flight, "marketing_airline_code", "carrier_name") || "Flight",
      number = val(flight, "marketing_flight_number", "service_number") || "";
    return `${carrier}${number ? " " + number : ""}`;
  }
  function compactFlightNumber(flight) {
    const carrier = val(flight, "marketing_airline_code"),
      number = val(flight, "marketing_flight_number"),
      service = val(flight, "service_number");
    if (carrier && number) return `${carrier} ${number}`;
    return String(service || carrier || "Unavailable");
  }
  function flightDeparture(flight) {
    return (
      Number(val(flight, "scheduled_departure_utc", "starts_at_utc")) || null
    );
  }
  function flightArrival(flight) {
    return Number(val(flight, "scheduled_arrival_utc", "ends_at_utc")) || null;
  }
  function boardingDocumentFor(flight) {
    const travelerIds = String(val(flight, "traveler_ids") || "")
      .split(",")
      .filter(Boolean);
    return (
      state.localDocs.find(
        (document) =>
          document.integrity === "verified" &&
          ["boarding_pass", "ticket"].includes(document.type) &&
          (travelerIds.length === 0 ||
            document.travelerIds?.some((id) => travelerIds.includes(id))),
      ) || null
    );
  }
  function primaryFlightDetail(flight) {
    return detailFor(flight) || {};
  }

  function liveFlightPresentation(flight) {
    const enabled = Number(val(flight, "live_data_enabled")) === 1,
      matched = val(flight, "live_match_status") === "matched",
      updatedAt = Number(val(flight, "live_last_success_at", "live_fetched_at")) || null,
      freshUntil = Number(val(flight, "freshness_expires_at")) || null,
      fresh = enabled && matched && updatedAt != null && freshUntil != null && freshUntil > Date.now() && !state.offline,
      stale = enabled && matched && updatedAt != null && !fresh,
      phase = String(val(flight, "operational_phase") || "scheduled").toLowerCase(),
      disruption = String(val(flight, "disruption_state") || "none").toLowerCase(),
      delay = Number(val(flight, "delay_minutes")) || 0,
      cancellationConfirmed = Boolean(val(flight, "cancellation_confirmed_at")),
      cancellationReported = Boolean(val(flight, "cancellation_first_reported_at")) && !cancellationConfirmed;
    let label = "Scheduled data", tone = "neutral";
    if (fresh) {
      if (cancellationConfirmed) { label = "Cancelled"; tone = "danger"; }
      else if (cancellationReported) { label = "Cancellation reported"; tone = "warning"; }
      else if (disruption === "diverted") { label = "Diverted"; tone = "danger"; }
      else if (disruption === "delayed" || delay > 0) { label = delay > 0 ? `Delayed ${delay} min` : "Delayed"; tone = "warning"; }
      else if (phase === "boarding") { label = "Boarding"; tone = "active"; }
      else if (["departed", "en_route"].includes(phase)) { label = phase === "departed" ? "Departed" : "En route"; tone = "active"; }
      else if (phase === "landed") { label = "Landed"; tone = "active"; }
      else if (String(val(flight, "provider_status") || "").toLowerCase() === "expected") { label = "On time"; tone = "good"; }
      else label = "Live update";
    } else if (stale) {
      const lastKnown = cancellationConfirmed ? "Cancelled"
        : cancellationReported ? "Cancellation reported"
          : disruption === "diverted" ? "Diverted"
            : disruption === "delayed" || delay > 0 ? (delay > 0 ? `Delayed ${delay} min` : "Delayed")
              : phase === "landed" ? "Landed"
                : phase === "departed" ? "Departed"
                  : phase === "en_route" ? "En route"
                    : phase === "boarding" ? "Boarding" : "Scheduled";
      label = state.offline ? `Last status: ${lastKnown}` : "Saved update · may be out of date";
    }
    return {
      enabled, matched, fresh, stale, label, tone, updatedAt,
      provenance: fresh ? `Live update · ${ageLabel(updatedAt)}` : stale ? `Updated ${ageLabel(updatedAt)}${state.offline ? " · Offline" : ""}` : "Scheduled data",
      departure: fresh ? Number(val(flight, "actual_departure_utc", "estimated_departure_utc")) || flightDeparture(flight) : flightDeparture(flight),
      arrival: fresh ? Number(val(flight, "actual_arrival_utc", "estimated_arrival_utc")) || flightArrival(flight) : flightArrival(flight),
      departureLabel: fresh && val(flight, "actual_departure_utc") ? "Actual" : fresh && val(flight, "estimated_departure_utc") ? "Estimated" : "Departs",
      arrivalLabel: fresh && val(flight, "actual_arrival_utc") ? "Actual" : fresh && val(flight, "estimated_arrival_utc") ? "Estimated" : "Arrives",
      terminal: fresh ? val(flight, "live_departure_terminal") || val(flight, "departure_terminal") : val(flight, "departure_terminal"),
      gate: fresh ? val(flight, "live_departure_gate") || val(flight, "departure_gate", "gate") : val(flight, "departure_gate", "gate"),
    };
  }

  function flightPass(flight, detailVariant = false) {
    const route = flightRoute(flight),
      detail = primaryFlightDetail(flight),
      live = liveFlightPresentation(flight),
      departure = live.departure,
      arrival = live.arrival,
      departureZone = val(flight, "departure_timezone", "start_timezone"),
      arrivalZone = val(flight, "arrival_timezone", "end_timezone"),
      terminal = live.terminal,
      gate = live.gate,
      seat = val(detail, "seat"),
      cabin = val(detail, "cabin_class"),
      status = statusText(
        val(flight, "booking_status", "status") || "scheduled",
      ),
      confirmed = status === "Confirmed",
      document = boardingDocumentFor(flight),
      duration =
        departure && arrival ? durationLabel(arrival - departure) : "",
      action = document ? "boarding-pass" : "add-document",
      actionLabel = document ? "Open Boarding Pass" : "Add document",
      actionId = document?.id || itemId(flight),
      departureDay = formatDay(departure, departureZone),
      arrivalDay = formatDay(arrival, arrivalZone),
      fromCode = detailVariant
        ? flightLocationCode(
            val(flight, "departure_location_id", "start_location_id"),
          )
        : route.fromCode,
      toCode = detailVariant
        ? flightLocationCode(
            val(flight, "arrival_location_id", "end_location_id"),
          )
        : route.toCode,
      displayedFlightNumber = detailVariant
        ? compactFlightNumber(flight)
        : flightNumber(flight);

    const live_ = live.fresh || live.stale,
      statusSmall = live_ ? esc(live.label) : "Scheduled data",
      liveStrip = live_
        ? `<div class="live-flight-strip live-flight-strip--${esc(live.tone)}" role="status"><strong>${esc(live.label)}</strong><span>${esc(live.provenance)}</span></div>`
        : "";
    const routeMarkup = `<div class="flight-pass__route"><div class="flight-pass__airport"><div class="flight-pass__airport-code">${esc(fromCode)}</div><span class="flight-pass__airport-name">${esc(route.fromName)}</span></div><div class="flight-pass__route-center"><div class="flight-pass__route-line">${icon("plane", 22)}</div>${duration ? `<span class="flight-pass__duration">${icon("clock", 14)} ${esc(duration)}</span>` : ""}</div><div class="flight-pass__airport flight-pass__airport--right"><div class="flight-pass__airport-code">${esc(toCode)}</div><span class="flight-pass__airport-name">${esc(route.toName)}</span></div></div>`;
    const header = `<div class="flight-pass__header"><span class="flight-pass__pill">${icon("plane", 22)} ${esc(displayedFlightNumber)}</span><div class="flight-pass__status ${confirmed ? "is-confirmed" : ""}"><strong>${confirmed ? checkDot() : ""}${esc(status)}</strong><small>${statusSmall}</small></div></div>`;
    const primaryAction = primaryCta(
      actionLabel,
      action,
      document ? "qr" : "plus",
      `data-id="${esc(actionId)}"`,
    );

    if (!detailVariant) {
      return `<section class="flight-pass flight-pass--home" aria-label="Next flight"><i class="flight-pass__notch flight-pass__notch--left" aria-hidden="true"></i><i class="flight-pass__notch flight-pass__notch--right" aria-hidden="true"></i><div class="flight-pass__inner">${header}${liveStrip}${routeMarkup}<div class="flight-pass__divider"></div><div class="flight-pass__facts"><div class="flight-pass__fact"><span>${esc(live.departureLabel)}</span><strong>${esc(formatTime(departure, departureZone))}</strong>${departureDay ? `<small>${esc(departureDay)}</small>` : ""}</div><div class="flight-pass__fact"><span>Terminal</span><strong>${esc(terminal || "—")}</strong>${terminal ? `<small>${live.fresh ? "Live update" : "Departure"}</small>` : ""}</div><div class="flight-pass__fact"><span>Seat</span><strong>${esc(seat || "—")}</strong>${cabin ? `<small>${esc(cabin)}</small>` : ""}</div></div><div class="flight-pass__actions flight-pass__actions--single">${primaryAction}</div></div></section>`;
    }

    return `<section class="fd-card" aria-label="Flight details">${liveStrip}<div class="fd-card__head"><span class="fd-flight">${icon("plane", 16)} ${esc(displayedFlightNumber)}</span><span class="fd-status-wrap" role="status" aria-label="Booking ${esc(status)}. ${esc(live.label)}. ${esc(live.provenance)}. Scheduled booking data is never presented as live."><span class="fd-status ${confirmed ? "is-confirmed" : ""}">${confirmed ? checkDot() : ""}${esc(status)}</span><small>${statusSmall}</small></span></div><div class="fd-route"><div class="fd-route__end"><span class="fd-route__code">${esc(fromCode)}</span><span class="fd-route__name">${esc(route.fromName)}</span></div><div class="fd-route__mid"><span class="fd-route__track">${icon("plane", 24)}</span></div><div class="fd-route__end fd-route__end--right"><span class="fd-route__code">${esc(toCode)}</span><span class="fd-route__name">${esc(route.toName)}</span></div></div><div class="fd-times"><div class="fd-times__col"><span class="fd-label">${esc(live.departureLabel)}</span><strong>${esc(formatTime(departure, departureZone))}</strong><small>${departureDay ? esc(departureDay) : "—"}</small></div><div class="fd-times__mid"><span class="fd-times__track" aria-hidden="true">${icon("plane", 16)}</span>${duration ? `<span class="fd-times__dur">${esc(duration)}</span>` : ""}</div><div class="fd-times__col fd-times__col--right"><span class="fd-label">${esc(live.arrivalLabel)}</span><strong>${arrival ? esc(formatTime(arrival, arrivalZone)) : "—"}</strong><small>${arrivalDay ? esc(arrivalDay) : ""}</small></div></div><div class="fd-meta"><div class="fd-meta__item"><span class="fd-label">Terminal</span>${terminal ? `<strong>${esc(terminal)}</strong>` : `<span class="fd-meta__none">Not assigned</span>`}</div><div class="fd-meta__item"><span class="fd-label">Gate</span>${gate ? `<strong>${esc(gate)}</strong>` : `<span class="fd-meta__none">Not assigned</span>`}</div><div class="fd-meta__item"><span class="fd-label">Seat</span>${seat ? `<strong>${esc(seat)}</strong>${cabin ? `<small>${esc(cabin)}</small>` : ""}` : `<span class="fd-meta__none">Not assigned</span>`}</div></div></section>`;
  }

  function flightTicket(flight) {
    return flightPass(flight, false);
  }
  function genericNextCard(item) {
    const type = timelineType(item),
      starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
      zone = val(item, "start_timezone", "startTimezone");
    return `<section class="next-action-card"><span class="ticket-chip">${icon(timelineIcon(type), 18)} What’s next</span><h2>${esc(item.title || "Next plan")}</h2><p>${esc(item.subtitle || statusText(item.status))}</p><div class="next-action-time">${esc(formatTime(starts, zone))}</div><p>${esc(formatDateTime(starts, zone))}</p><div class="next-action-actions"><button class="secondary-cta" data-action="timeline-detail" data-id="${esc(itemId(item))}">${icon("info", 20)} Details</button><button class="secondary-cta" data-action="directions-item" data-id="${esc(itemId(item))}">${icon("navigation", 20)} Directions</button></div></section>`;
  }
  function upcomingRows() {
    const next = nextItem(),
      startIndex = next
        ? state.timeline.findIndex((item) => itemId(item) === itemId(next))
        : -1,
      rows = state.timeline
        .filter((item) => !isCancelled(item))
        .slice(Math.max(0, startIndex + 1), Math.max(0, startIndex + 1) + 1);
    if (!rows.length)
      return `<div class="flight-list-empty">No later plans are saved yet.</div>`;
    return rows
      .map((item) => {
        const type = timelineType(item),
          starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
          zone = val(item, "start_timezone", "startTimezone"),
          transport = transportForItem(itemId(item)),
          routeText = transport
            ? `${locationLabel(val(transport, "departure_location_id"))} → ${locationLabel(val(transport, "arrival_location_id"))}`
            : item.subtitle || statusText(item.status);
        return `<button class="simple-row" data-action="timeline-detail" data-id="${esc(itemId(item))}"><span class="row-icon">${icon(timelineIcon(type), 22)}</span><span class="row-copy"><strong>${esc(item.title || "Plan")}</strong><span>${esc(routeText)}</span></span><span class="row-date">${esc(formatTime(starts, zone))}<br>${esc(formatDay(starts, zone))}</span></button>`;
      })
      .join("");
  }
  function homeScreen() {
    const next = nextItem(),
      flight = nextFlight(),
      health = healthSummary(),
      nextCard = state.trip
        ? flight
          ? flightTicket(flight)
          : next
            ? genericNextCard(next)
            : noUpcomingCard()
        : emptyTripCard(),
      summaries = state.trip
        ? `<section class="home-summary-module">${sectionHead("Upcoming journey", "open-timeline")}<div>${upcomingRows()}</div></section><section class="home-summary-module home-health-module ${health.kind === "setup" ? "home-health-module--setup" : ""}">${sectionHead("Trip health", "open-health", "Review")}<button class="simple-row" ${health.kind === "setup" ? 'data-action="open-add"' : 'data-screen="health"'}><span class="row-icon ${health.kind === "warning" ? "health-warning" : health.kind === "good" ? "health-good" : "health-info"}">${icon(health.icon, 22)}</span><span class="row-copy"><strong>${esc(health.title)}</strong><span>${esc(health.subtitle)}</span></span>${icon("chevron", 22, "chevron")}</button></section>`
        : "";
    return `<div class="phone-app"><section class="screen home-screen">${topbar()}${mobileAlert()}<main class="content">${tripContext()}${nextCard}${summaries}</main>${bottomNav("home")}</section></div>`;
  }
  function timeGreeting() {
    const hour = new Date().getHours();
    return hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";
  }
  function emptyTripCard() {
    return `<div class="empty-mobile"><div class="empty-mobile-icon">${icon("trips", 30)}</div><h1>Your first trip starts here</h1><p>Create a trip, then add transport, stays and documents.</p>${primaryCta("Create a Trip", "create-trip", "plus")}</div>`;
  }
  function shouldShowFirstRun() {
    const previewFirstRun =
      PREVIEW_MODE &&
      ["empty", "empty-offline", "empty-reduced-motion"].includes(QA_STATE);
    return Boolean(
      state.tripsLoaded &&
        !state.loading &&
        !state.error &&
        (!PREVIEW_MODE || previewFirstRun) &&
        (state.account?.mode || "guest") !== "account" &&
        !state.trip &&
        state.trips.length === 0 &&
        // A direct invitation link is an intentional entry flow. It must take
        // priority over the generic first-run welcome for a brand-new guest.
        !["tour", "join"].includes(state.screen),
    );
  }
  function syncFirstRunPresentation(active) {
    document.documentElement.classList.toggle("first-run-open", active);
    document.documentElement.classList.toggle(
      "first-run-reduced-motion",
      active && LOCAL_QA_MODE && QA_STATE === "empty-reduced-motion",
    );
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", "#fbf8f7");
  }
  function firstRunProductPreview() {
    return `<div class="welcome-pattern" aria-hidden="true"><i class="welcome-arc welcome-arc--one"></i><i class="welcome-arc welcome-arc--two"></i><i class="welcome-arc welcome-arc--three"></i><i class="welcome-arc welcome-arc--four"></i><i class="welcome-arc welcome-arc--five"></i><i class="welcome-orbit-dot"></i></div>`;
  }
  function firstRunScreen() {
    const offline = state.offline
      ? `<span class="first-run-offline" role="status">${icon("info", 14)} Offline</span>`
      : "";
    const googleAction = PREVIEW_MODE
      ? `<button class="first-run-google-preview" data-action="preview-google" aria-label="Continue with Google"><img src="/assets/google-g.svg" alt=""><span>Continue with Google</span></button>`
      : `<div id="google-signin-button" data-post-auth-screen="trips" aria-label="Continue with Google"></div>`;
    const entryAction = state.account?.mode === "account"
      ? `<button class="first-run-google-preview" data-action="enter-app" aria-label="Continue to your trips"><span>Continue to your trips</span>${icon("chevron", 20)}</button>`
      : googleAction;
    return `<div class="phone-app"><section class="first-run-screen welcome-thread screen--navless" aria-labelledby="first-run-title"><header class="first-run-brand-row"><div class="first-run-brand" role="img" aria-label="tripto.to"><span class="first-run-brand__name">tripto</span><span class="first-run-brand__dot">.</span><span class="first-run-brand__to">to</span></div><span class="welcome-brand-caption">Your travel companion</span>${offline}</header><main class="first-run-main">${firstRunProductPreview()}<section class="first-run-hero"><p class="first-run-eyebrow">A little less to think about</p><h1 id="first-run-title" aria-label="Your trip. In good order."><span class="first-run-title__line">Your trip.</span><span class="first-run-title__line">In good order.</span></h1><p class="first-run-lede">Flights, stays, and everything between.<br>Together, wherever you go.</p></section><div class="first-run-actions"><div class="first-run-google">${entryAction}</div><p class="signin-error" role="alert" hidden></p><button class="first-run-secondary" data-action="open-first-run-how"><span>Take a tour</span></button></div></main><footer class="welcome-v2__footer"><span class="welcome-private-note">Your plans stay private.</span><nav aria-label="Legal"><a href="/privacy">Privacy</a><span aria-hidden="true">·</span><a href="/terms">Terms</a></nav></footer></section></div>`;
  }
  // --- Trip change notifications (header bell) ---------------------------
  // Sourced from the existing /changes feed (change_events), so booking
  // imports, added stops, time markers and every other trip edit surface in
  // one inbox alongside the forwarded-booking review prompts.
  const NOTIF_META = Object.freeze({
    import_confirmed: { label: "Booking imported", icon: "download", tone: "neutral" },
    location_added: { label: "Stop added", icon: "pin", tone: "neutral" },
    journey_created: { label: "Journey planned", icon: "map", tone: "neutral" },
    time_marker_created: { label: "Time marker added", icon: "clock", tone: "neutral" },
    time_marker_updated: { label: "Time marker updated", icon: "clock", tone: "neutral" },
    time_marker_deleted: { label: "Time marker removed", icon: "clock", tone: "neutral" },
    upload: { label: "Document added", icon: "document", tone: "neutral" },
  });
  const NOTIF_ENTITY_ICON = Object.freeze({
    trip_item: "calendar", transport: "plane", stay: "hotel", traveler: "user",
    contact: "phone", location: "pin", connection: "navigation", time_marker: "clock",
    trip_time_marker: "clock", booking_detail: "document", upload: "document",
    journey: "map", activity: "star",
  });
  // Human sentence per change event, so the inbox explains what actually
  // happened rather than only naming it.
  const NOTIF_DETAIL = Object.freeze({
    import_confirmed: "Booking details from a forwarded email were added to your timeline.",
    location_added: "A new stop is now part of your itinerary.",
    journey_created: "A route between your stops was planned.",
    time_marker_created: "A time marker was pinned to your timeline.",
    time_marker_updated: "A time marker on your timeline was updated.",
    time_marker_deleted: "A time marker was removed from your timeline.",
    upload: "A document was saved to this trip.",
  });
  const ENTITY_NOUN = Object.freeze({
    trip_item: "timeline item", transport: "transport booking", stay: "stay",
    traveler: "traveler", contact: "contact", location: "stop",
    connection: "connection", time_marker: "time marker", trip_time_marker: "time marker",
    booking_detail: "booking detail", upload: "document", journey: "journey", activity: "activity",
  });
  function humanizeEvent(eventType) {
    return String(eventType || "Updated").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  function notificationMeta(row) {
    const eventType = String(val(row, "event_type") || ""),
      entityType = String(val(row, "entity_type") || "");
    return (
      NOTIF_META[eventType] || {
        label: humanizeEvent(eventType),
        icon: NOTIF_ENTITY_ICON[entityType] || "info",
        tone: "neutral",
      }
    );
  }
  function notifAge(timestamp) {
    if (!timestamp) return "";
    const age = Math.max(0, Date.now() - Number(timestamp));
    if (age < 60000) return "Just now";
    if (age < 3600000) return `${Math.floor(age / 60000)}m ago`;
    if (age < 86400000) return `${Math.floor(age / 3600000)}h ago`;
    return `${Math.floor(age / 86400000)}d ago`;
  }
  function notifWhen(timestamp) {
    if (!timestamp) return "";
    const d = new Date(Number(timestamp));
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  function notifDescription(n) {
    if (NOTIF_DETAIL[n.eventType]) return NOTIF_DETAIL[n.eventType];
    const noun = ENTITY_NOUN[n.entityType] || "item",
      e = String(n.eventType || "");
    const verb = /delete|remove/.test(e)
      ? "was removed from"
      : /updat|chang|edit/.test(e)
        ? "was updated on"
        : /creat|add|import/.test(e)
          ? "was added to"
          : "changed on";
    return `A ${noun} ${verb} this trip.`;
  }
  function notificationSeenKey() {
    return `tripto_notif_seen:${state.trip?.id || "none"}`;
  }
  function lastSeenNotificationAt() {
    return Number(localStorage.getItem(notificationSeenKey())) || 0;
  }
  function notifications() {
    return (state.changes || [])
      .map((row) => {
        const createdAt = Number(val(row, "created_at")) || 0;
        return {
          id: String(val(row, "id") || `${val(row, "event_type")}:${createdAt}`),
          entityType: String(val(row, "entity_type") || ""),
          entityId: String(val(row, "entity_id") || ""),
          eventType: String(val(row, "event_type") || ""),
          sourceType: String(val(row, "source_type") || ""),
          createdAt,
          ...notificationMeta(row),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function unreadNotificationCount() {
    const seen = lastSeenNotificationAt();
    return notifications().filter((n) => n.createdAt > seen).length;
  }
  function markNotificationsSeen() {
    const newest = notifications().reduce((max, n) => Math.max(max, n.createdAt), 0);
    if (newest) localStorage.setItem(notificationSeenKey(), String(newest));
  }
  function notificationsSheet() {
    const rows = notifications(),
      seen = state.notifSeenSnapshot != null ? state.notifSeenSnapshot : lastSeenNotificationAt(),
      pending = (state.bookingEmails || []).filter((row) =>
        ["needs_trip", "needs_confirmation"].includes(String(row.status || "")),
      ).length,
      pendingRow = pending
        ? `<button class="notif-item notif-item--neutral is-unread" data-screen="booking-email-inbox"><span class="notif-item__icon">${icon("download", 22)}</span><span class="notif-item__copy"><strong>${pending} forwarded booking${pending === 1 ? "" : "s"} to review<span class="notif-item__dot" aria-hidden="true"></span></strong><span class="notif-item__desc">New ${pending === 1 ? "email is" : "emails are"} waiting to be matched to a trip and confirmed.</span><small>Tap to open Import History</small></span><span class="notif-item__chevron" aria-hidden="true">${icon("chevron", 18)}</span></button>`
        : "",
      changeRows = rows
        .map((n) => {
          const isNew = n.createdAt > seen,
            tappable = n.entityType === "trip_item",
            tag = tappable ? "button" : "div",
            attrs = tappable ? ` data-action="notification-open" data-id="${esc(n.entityId)}"` : "";
          return `<${tag} class="notif-item notif-item--${esc(n.tone)}${isNew ? " is-unread" : ""}"${attrs}><span class="notif-item__icon">${icon(n.icon, 22)}</span><span class="notif-item__copy"><strong>${esc(n.label)}${isNew ? `<span class="notif-item__dot" aria-hidden="true"></span>` : ""}</strong><span class="notif-item__desc">${esc(notifDescription(n))}</span><small>${esc(notifAge(n.createdAt))} · ${esc(notifWhen(n.createdAt))}</small></span>${tappable ? `<span class="notif-item__chevron" aria-hidden="true">${icon("chevron", 18)}</span>` : ""}</${tag}>`;
        })
        .join(""),
      body = pendingRow || rows.length
        ? `<div class="notif-list">${pendingRow}${changeRows}</div>`
        : `<div class="notif-empty">${icon("bell", 30)}<h3>You're all caught up</h3><p>Booking imports, added stops, and other trip updates will show up here.</p></div>`;
    return bottomSheet("notifications", "Notifications", body);
  }

  function timelineScreen() {
    if (!state.trip)
      return `<div class="phone-app"><section class="screen timeline-screen">${appBar("Trip")}<main class="timeline-page timeline-page--empty"><div class="timeline-empty"><span class="timeline-empty__icon">${icon("calendar", 28)}</span><h1>No trip selected</h1><p>Create or select a trip first.</p>${primaryCta("Create a Trip", "create-trip", "plus")}</div></main>${bottomNav("trips")}</section></div>`;
    const now = Date.now(),
      emptySetup = isEmptyTripSetup(),
      highlightedNextId =
        QA_STATE === "timeline-normal" ? "" : itemId(nextItem() || {}),
      groups = [];
    for (const item of state.timeline) {
      const starts =
          Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
        zone = val(item, "start_timezone", "startTimezone"),
        day = timelineDay(starts, zone),
        key = day.key;
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, day, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    let activeDayIdx = 0;
    if (groups.length > 1) {
      const savedIdx = state.timelineDayKey
        ? groups.findIndex((g) => g.key === state.timelineDayKey)
        : -1;
      if (savedIdx >= 0) activeDayIdx = savedIdx;
      else if (highlightedNextId) {
        const nextIdx = groups.findIndex((g) =>
          g.items.some((it) => itemId(it) === highlightedNextId),
        );
        if (nextIdx >= 0) activeDayIdx = nextIdx;
      }
    }
    const dayTabs =
      groups.length > 1
        ? `<nav class="timeline-days" aria-label="Trip days">${groups
            .map(
              (group, index) =>
                `<button type="button" class="timeline-day-tab${index === activeDayIdx ? " timeline-day-tab--active" : ""}" data-action="select-timeline-day" data-key="${esc(group.key)}"${index === activeDayIdx ? ' aria-current="true"' : ""}><span class="timeline-day-tab__label">${esc(group.day.weekday)} ${esc(group.day.dayOfMonth || group.day.date.split(" ").pop())}</span></button>`,
            )
            .join("")}${icon("chevron", 18, "timeline-days__more")}</nav>`
        : "";
    const pagedGroups = groups.length > 1 ? [groups[activeDayIdx]] : groups;
    const content = state.tripDetailsLoading && !groups.length
      ? `<div class="loading-skeleton loading-skeleton--timeline timeline-inline-loading" role="status" aria-label="Loading trip">${skeletonRows(4)}<span class="sr-only">Opening your trip…</span></div>`
      : groups.length
      ? `${dayTabs}<div class="timeline-ribbon${groups.length > 1 ? " timeline-ribbon--paged" : ""}">${pagedGroups
          .map(
            (group) =>
              `<section class="timeline-day" aria-labelledby="timeline-day-${esc(group.key)}"><header class="timeline-day__header"><time id="timeline-day-${esc(group.key)}"><span>${esc(group.day.weekday)}</span><strong>${esc(group.day.date)}</strong></time><span class="timeline-day__rail" aria-hidden="true"></span><span class="timeline-day__separator" aria-hidden="true"></span></header><div class="timeline-journey">${group.items
                .map((item) => {
                  const starts =
                      Number(val(item, "starts_at_utc", "startsAtUtc")) ||
                      null,
                    ends =
                      Number(val(item, "ends_at_utc", "endsAtUtc")) || null,
                    zone = val(item, "start_timezone", "startTimezone"),
                    type = timelineType(item),
                    transport = transportForItem(itemId(item)),
                    glyph = timelineGlyph(item, type, transport),
                    markerClass = String(glyph || "calendar").replace(/[^a-z0-9-]/g, ""),
                    subtitle = timelineSecondary(item, type, transport, glyph),
                    exception = timelineException(item),
                    active =
                      !isCancelled(item) &&
                      starts != null &&
                      ends != null &&
                      starts <= now &&
                      ends > now,
                    isStay = type === "hotel" || type === "stay",
                    staying = active && isStay,
                    happeningNow = active && !isStay,
                    next = !active && itemId(item) === highlightedNextId,
                    past = !active && !next && starts != null && starts < now,
                    phase = happeningNow
                      ? "active"
                      : staying
                        ? "staying"
                        : next
                          ? "next"
                          : past
                            ? "past"
                            : "future",
                    eventTime = starts != null
                      ? formatTime(starts, zone)
                      : "Time unavailable",
                    flags = `${happeningNow ? '<span class="timeline-flag timeline-flag--now">Now</span>' : ""}${staying ? '<span class="timeline-flag timeline-flag--staying">Staying</span>' : ""}${next ? '<span class="timeline-flag timeline-flag--next">Next</span>' : ""}${exception ? `<span class="timeline-flag timeline-flag--${esc(exception.tone)}">${esc(exception.label)}</span>` : ""}`,
                    title = item.title || "Trip item",
                    durationMs =
                      starts != null && ends != null && ends > starts
                        ? ends - starts
                        : null,
                    itemStatus = statusText(item.status),
                    statusKey = String(val(item, "status", "booking_status") || "")
                      .toLowerCase()
                      .replace(/[_\s]+/g, "-"),
                    showTimelineStatus = !["confirmed", "booked", "complete", "completed"].includes(statusKey),
                    metaBits = [],
                    // Optional third line: location/duration/status when available.
                    meta = (() => {
                      if (isStay && durationMs) {
                        const nights = Math.round(durationMs / 86400000);
                        metaBits.push(`${nights} night${nights === 1 ? "" : "s"}`);
                      } else if (durationMs) {
                        metaBits.push(durationLabel(durationMs));
                      }
                      if (showTimelineStatus && itemStatus && itemStatus !== subtitle)
                        metaBits.push(itemStatus);
                      return metaBits.join(" · ");
                    })(),
                    aria = [eventTime, title, subtitle, meta, exception?.label]
                      .filter(Boolean)
                      .join(". ");
                  return `<button type="button" class="journey-event journey-event--${phase}${exception ? ` journey-event--${esc(exception.tone)}` : ""}" data-action="timeline-detail" data-id="${esc(itemId(item))}" aria-label="${esc(aria)}"${active || next ? ' aria-current="step"' : ""}><span class="journey-time">${esc(eventTime)}</span><span class="journey-track" aria-hidden="true"><span class="journey-marker journey-marker--${esc(markerClass)}">${icon(glyph, 24)}</span></span><span class="journey-content"><span class="journey-copy">${flags ? `<span class="timeline-flags">${flags}</span>` : ""}<strong>${esc(title)}</strong><small>${esc(subtitle)}</small>${meta ? `<small class="journey-meta">${esc(meta)}</small>` : ""}</span><span class="journey-chevron" aria-hidden="true">${icon("chevron", 20)}</span></span></button>`;
                })
                .join("")}</div></section>`,
          )
          .join("")}</div>`
      : `<div class="timeline-empty">${emptySetup ? '<span class="timeline-empty__eyebrow">Start building</span>' : ""}<span class="timeline-empty__icon">${icon(emptySetup ? "plus" : "calendar", 30)}</span><h1>No plans yet</h1><p>Add your first flight, stay, train, or activity.</p>${emptySetup ? `<div class="timeline-empty__actions"><button class="primary-cta timeline-empty__add" data-action="open-add-booking"><span>Add booking</span>${icon("plus",18)}</button><button class="text-action timeline-empty__skip" data-screen="trips">Skip for now</button></div>` : primaryCta("Add booking", "open-add", "plus")}</div>`;
    const headerAction = `<div class="trip-v2-actions">${notifyAction()}</div>`;
    const header = `<header class="trip-v2-header"><button class="trip-v2-selector" data-action="switch-trip" aria-label="Switch trip"><strong>${esc(state.trip.title || "Trip")}</strong>${icon("chevronDown",15)}<small>${esc(formatTripDates(state.trip))}</small></button>${headerAction}</header>`;
    return `<div class="phone-app"><section class="screen timeline-screen timeline-screen--ribbon">${header}${mobileAlert()}<main class="timeline-page ${groups.length ? "timeline-page--journey" : "timeline-page--empty"}">${emptySetup ? "" : timelineContextCard()}${content}</main>${bottomNav("timeline")}</section></div>`;
  }

  // Fast path for Day-tab taps: regenerate the timeline screen markup and swap
  // ONLY the day tabs + event ribbon, instead of tearing down and reparsing the
  // whole app DOM (header, context card, bottom-nav SVGs) and rebinding. Reuses
  // timelineScreen() so output can't diverge from a full render. Returns false
  // (→ caller falls back to render()) when the DOM isn't the expected shape.
  function patchTimelineDayDOM() {
    const screen = app.querySelector(".timeline-screen--ribbon");
    if (!screen) return false;
    const tmp = document.createElement("div");
    tmp.innerHTML = timelineScreen();
    const freshRibbon = tmp.querySelector(".timeline-ribbon"),
      freshTabs = tmp.querySelector(".timeline-days"),
      curRibbon = screen.querySelector(".timeline-ribbon"),
      curTabs = screen.querySelector(".timeline-days");
    if (!freshRibbon || !curRibbon) return false;
    // Update the active day IN PLACE instead of swapping the whole strip, so the
    // horizontal scroll position is preserved — tapping a day must not make the
    // dates jump back to the start. Only fall back to a full swap if the set of
    // days actually changed.
    if (curTabs) {
      const tabs = curTabs.querySelectorAll(".timeline-day-tab"),
        freshCount = freshTabs ? freshTabs.querySelectorAll(".timeline-day-tab").length : tabs.length;
      if (freshTabs && tabs.length !== freshCount) {
        curTabs.replaceWith(freshTabs);
      } else {
        tabs.forEach((tab) => {
          const on = tab.dataset.key === state.timelineDayKey;
          tab.classList.toggle("timeline-day-tab--active", on);
          if (on) tab.setAttribute("aria-current", "true");
          else tab.removeAttribute("aria-current");
        });
      }
    }
    curRibbon.replaceWith(freshRibbon);
    return true;
  }

  // Fast-path for checklist mutations (toggle/edit/cancel/delete): replace only
  // the .cl-screen subtree instead of rebuilding the whole app DOM, so tapping
  // items on a long list doesn't jank. bindDynamic() re-runs the same focus and
  // form binding a full render would, so behaviour is unchanged.
  function patchChecklistDOM() {
    if (state.screen !== "checklist" || state.sheet) return false;
    const cur = app.querySelector(".cl-screen");
    if (!cur) return false;
    const tmp = document.createElement("div");
    tmp.innerHTML = checklistScreen();
    const fresh = tmp.querySelector(".cl-screen");
    if (!fresh) return false;
    cur.replaceWith(fresh);
    bindDynamic();
    return true;
  }
  function renderChecklist() {
    let patched = false;
    try {
      patched = patchChecklistDOM();
    } catch (_e) {
      patched = false;
    }
    if (!patched) render();
  }

  function timelineContextCard() {
    if (isEmptyTripSetup()) return "";
    const next = nextItem();
    if (next) {
      const starts = Number(val(next,"starts_at_utc","startsAtUtc")) || null,
        zone = val(next,"start_timezone","startTimezone"),
        active = starts != null && starts <= Date.now() && Number(val(next,"ends_at_utc","endsAtUtc") || starts) > Date.now();
      if (active || (starts != null && starts - Date.now() <= 6 * 60 * 60 * 1000))
        return `<section class="timeline-context timeline-context--next"><span>${active ? "Now" : "Next"}</span><h2>${esc(next.title || "Next plan")}</h2><p>${esc(starts ? `${formatTime(starts,zone)} · ${next.subtitle || statusText(next.status)}` : next.subtitle || "Time unavailable")}</p><button data-action="timeline-detail" data-id="${esc(itemId(next))}">Open${icon("chevron",16)}</button></section>`;
    }
    const start = val(state.trip,"starts_on","startsOn");
    if (start) {
      const days = Math.ceil((new Date(`${start}T00:00:00`).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 14) {
        const cl = state.checklist || [];
        const clDone = cl.filter((r) => r.completed).length;
        const clLine = cl.length
          ? (clDone === cl.length ? `Packing list ready${icon("check", 15)}` : `${cl.length - clDone} item${cl.length - clDone === 1 ? "" : "s"} left to pack`)
          : "Start your packing list";
        return `<section class="timeline-context timeline-context--prepare"><span>${days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} to go`}</span><h2>Before you go</h2><p>Keep tickets and confirmations available on this device.</p><div class="timeline-context__actions"><button data-screen="checklist">${clLine}${icon("chevron",16)}</button><button data-screen="documents">Review documents${icon("chevron",16)}</button></div></section>`;
      }
    }
    return "";
  }

  function timelineDay(ms, timeZone) {
    if (ms == null)
      return { key: "unavailable", weekday: "Date", date: "Unavailable" };
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "2-digit",
          year: "numeric",
          timeZone: timeZone || undefined,
        }).formatToParts(new Date(Number(ms))),
        get = (type) => parts.find((part) => part.type === type)?.value || "";
      return {
        key: `${get("year")}-${get("month")}-${get("day")}`,
        weekday: get("weekday").toUpperCase(),
        date: `${get("month")} ${get("day")}`.toUpperCase(),
        dayOfMonth: get("day"),
      };
    } catch (_) {
      return { key: "unavailable", weekday: "Date", date: "Unavailable" };
    }
  }

  function timelineException(item) {
    if (state.liveFlights?.available) {
      const type = String(val(item, "type", "kind") || "").toLowerCase();
      if (["flight", "plane", "air"].includes(type)) {
        const live = liveFlightPresentation(item);
        if (live.fresh || live.stale) return { label: live.label, tone: live.tone };
      }
    }
    const status = String(val(item, "status", "booking_status") || "")
        .toLowerCase()
        .replace(/_/g, " "),
      confidence = String(val(item, "confidence", "import_confidence") || "")
        .toLowerCase()
        .replace(/_/g, " ");
    if (["cancelled", "skipped"].includes(status))
      return { label: "Cancelled", tone: "danger" };
    if (status.includes("delayed"))
      return { label: "Delayed", tone: "warning" };
    if (status.includes("tight connection"))
      return { label: "Tight connection", tone: "warning" };
    if (status.includes("missing document"))
      return { label: "Missing document", tone: "warning" };
    if (status.includes("pending sync"))
      return { label: "Pending sync", tone: "neutral" };
    if (status.includes("needs confirmation"))
      return { label: "Needs confirmation", tone: "warning" };
    if (status === "unavailable")
      return { label: "Unavailable", tone: "neutral" };
    if (["low", "uncertain", "ambiguous"].includes(confidence))
      return { label: "Needs confirmation", tone: "warning" };
    return null;
  }

  function timelineIcon(type) {
    return (
      {
        flight: "flight",
        plane: "flight",
        air: "flight",
        train: "train",
        rail: "train",
        ferry: "ferry",
        boat: "ferry",
        ship: "cruise",
        cruise: "cruise",
        bus: "bus",
        coach: "bus",
        shuttle: "bus",
        car: "car",
        car_rental: "car",
        taxi: "taxi",
        transfer: "taxi",
        transport: "car",
        hotel: "hotel",
        stay: "hotel",
        lodging: "hotel",
        accommodation: "hotel",
        activity: "activity",
        attraction: "landmark",
        museum: "museum",
        gallery: "museum",
        tour: "tour",
        event: "event",
        concert: "event",
        show: "event",
        theatre: "event",
        theater: "event",
        reservation: "reservation",
        restaurant: "restaurant",
        dining: "restaurant",
        coffee: "coffee",
        cafe: "coffee",
        cooking: "cooking",
        bar: "bar",
        shopping: "shopping",
        camera: "camera",
        ticket: "ticket",
        generic_ticket: "ticket",
        document: "documents",
      }[String(type || "").toLowerCase()] || "calendar"
    );
  }

  // Human category label for a resolved timeline glyph (used in the secondary
  // line so a row reads "Restaurant · Rome", never a bare "Tasting menu").
  const TIMELINE_GLYPH_LABEL = {
    flight: "Flight", train: "Train", ferry: "Ferry", cruise: "Cruise",
    bus: "Bus", car: "Car", taxi: "Taxi", hotel: "Stay", city: "Stay", bar: "Bar",
    coffee: "Coffee", camera: "Photography", shopping: "Shopping",
    restaurant: "Restaurant", reservation: "Reservation", activity: "Activity",
    cooking: "Cooking",
    landmark: "Landmark", museum: "Museum", tour: "Tour", event: "Event", ticket: "Ticket",
  };
  // Pick the most specific approved glyph for an item. Transport uses its
  // transport_type; everything else is classified from the subtype + title so
  // wine tasting → bar, cooking class → cooking, restaurant → restaurant —
  // never a generic walking/calendar glyph for a specific traveler activity.
  function timelineGlyph(item, type, transport) {
    if (transport) return timelineIcon(type);
    if (type === "hotel" || type === "stay") return "city";
    const hay = `${val(item, "activity_type", "reservation_type", "subtype") || ""} ${item.title || ""} ${item.subtitle || ""}`.toLowerCase();
    const has = (...ws) => ws.some((w) => hay.includes(w));
    if (has("gondola", "boat ride", "boat cruise", "water taxi")) return "ferry";
    if (has("souvenir", "shopping", "shop ", "market visit")) return "shopping";
    if (has("photography", "photo walk", "photo tour", "camera walk")) return "camera";
    if (has("city transfer", "private transfer", "airport transfer", "taxi ride")) return "taxi";
    if (has("coffee", "espresso", "cappuccino")) return "coffee";
    if (has("wine", "cocktail", "brewery", "distillery", "pub", "aperitivo", "bar ", " bar")) return "bar";
    if (has("cooking", "cook ", "culinary", "kitchen class", "food workshop")) return "cooking";
    if (has("restaurant", "dining", "dinner", "lunch", "brunch", "breakfast", "tasting menu", "osteria", "trattoria", "bistro", "cafe", "café", "eatery", "supper")) return "restaurant";
    if (has("museum", "gallery")) return "museum";
    if (has("monument", "cathedral", "palace", "castle", "ruins", "basilica", "landmark", "sightseeing")) return "landmark";
    if (has("tour", "excursion", "guided", "hike", "trek", "safari", "cruise ", "boat trip")) return "tour";
    if (has("concert", "show", "theatre", "theater", "opera", "festival", "match", "game", "gig")) return "event";
    if (has("ticket", "admission", "entry", "pass ")) return "ticket";
    if (has("reservation", "booking")) return "reservation";
    return timelineIcon(type);
  }
  // Build the descriptive secondary line: what + where. Prefers a route for
  // transport, a city for stays, and category + place for activities so the
  // traveler understands the booking immediately.
  function timelineSecondary(item, type, transport, glyph) {
    if (transport) {
      const from = locationLabel(val(transport, "departure_location_id", "start_location_id")),
        to = locationLabel(val(transport, "arrival_location_id", "end_location_id")),
        route = from && to ? `${from} → ${to}` : from || to || "",
        num = type === "flight" ? flightNumber(item) : val(transport, "service_number", "carrier_name") || "";
      return [num, route].filter(Boolean).join(" · ") || item.subtitle || statusText(item.status);
    }
    const loc = locationById(val(item, "property_location_id", "location_id", "start_location_id", "venue_location_id")),
      place = val(loc, "city") || val(loc, "display_name") || "";
    if (type === "hotel" || type === "stay")
      return place || item.subtitle || "Stay";
    const cat = TIMELINE_GLYPH_LABEL[glyph] || "",
      detail =
        item.subtitle &&
        String(item.subtitle).toLowerCase() !== String(item.title || "").toLowerCase()
          ? item.subtitle
          : "";
    return [cat, place || detail].filter(Boolean).join(" · ") || detail || statusText(item.status);
  }

  function flightScreen() {
    const flight = selectedFlight();
    if (!flight)
      return missingDetailScreen(
        "Flight unavailable",
        "No active flight booking is available.",
      );
    const detail = detailFor(flight) || {},
      contact = contactFor(flight, "airline"),
      departureZone = val(flight, "departure_timezone", "start_timezone"),
      boarding =
        Number(val(flight, "boarding_time_utc", "boarding_at_utc")) || null,
      doc = boardingDocumentFor(flight),
      bags = [];
    if (val(detail, "checked_bags") != null)
      bags.push(`${detail.checked_bags} checked`);
    if (val(detail, "cabin_bags") != null)
      bags.push(`${detail.cabin_bags} cabin`);
    const operatingCode = val(flight, "operating_airline_code"),
      operatingNumber = val(flight, "operating_flight_number"),
      disclosureRows = [
        boarding
          ? ["Boarding", formatTime(boarding, departureZone)]
          : null,
        bags.length ? ["Baggage", bags.join(" · ")] : null,
        val(flight, "booking_reference")
          ? ["PNR", val(flight, "booking_reference")]
          : null,
        val(detail, "ticket_number")
          ? ["Ticket", val(detail, "ticket_number")]
          : null,
        val(contact, "display_name") ||
        val(flight, "carrier_name", "marketing_airline_code")
          ? [
              "Airline",
              val(contact, "display_name") ||
                val(flight, "carrier_name", "marketing_airline_code"),
            ]
          : null,
        operatingCode
          ? [
              "Operating carrier",
              `${operatingCode}${operatingNumber ? ` ${operatingNumber}` : ""}`,
            ]
          : null,
      ].filter(Boolean),
      disclosureId = "flight-details-panel",
      disclosureButtonId = "flight-details-toggle",
      disclosure = disclosureRows.length
        ? `<button type="button" class="fd-row fd-row--button" id="${disclosureButtonId}" data-action="toggle-flight-details" aria-expanded="${state.flightDetailsOpen}" aria-controls="${disclosureId}"><span class="fd-row__icon">${icon("info", 20)}</span><span class="fd-row__text"><strong>Flight details</strong></span><span class="fd-row__chev flight-more__chevron" aria-hidden="true">${icon(state.flightDetailsOpen ? "chevronUp" : "chevronDown", 18)}</span></button><div class="fd-panel${state.flightDetailsOpen ? " is-open" : ""}" id="${disclosureId}" role="region" aria-labelledby="${disclosureButtonId}"${state.flightDetailsOpen ? "" : " hidden"}><dl>${disclosureRows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></div>`
        : "";
    const bpStored = Boolean(doc),
      linkedDocs = linkedBookingDocuments(flight),
      docRows = linkedDocs
        .map((document) => {
          const ready = document.integrity === "verified";
          return `<div class="fd-row fd-row--doc"><button type="button" class="fd-row__main" data-action="open-document" data-id="${esc(document.id)}"><span class="fd-row__icon">${icon(document.type === "boarding_pass" ? "qr" : "document", 20)}</span><span class="fd-row__text"><strong>${esc(document.name || docTypeLabel(document.type))}</strong><small>${ready ? "Ready offline" : statusText(document.integrity || "checking")}</small></span></button><button type="button" class="fd-row__trail fd-row__trail--remove" data-action="remove-document" data-id="${esc(document.id)}" aria-label="Remove ${esc(document.name || "document")}">${icon("trash", 18)}</button></div>`;
        })
        .join(""),
      boardingRow = `<div class="fd-row fd-row--static"><span class="fd-row__icon${bpStored ? "" : " fd-row__icon--warn"}">${icon(bpStored ? "qr" : "warning", 20)}</span><span class="fd-row__text"><strong>Boarding pass</strong><small>${bpStored ? "Stored and verified on this phone" : "No verified boarding pass on this phone yet"}</small></span></div>`,
      directionsRow = fdButtonRow("navigation", "Directions", "directions-flight", `data-id="${esc(itemId(flight))}"`),
      addRow = `<button type="button" class="fd-row fd-row--button" data-action="add-document"><span class="fd-row__icon">${icon("plus", 20)}</span><span class="fd-row__text"><strong>Add document</strong></span><span class="fd-row__chev">${icon("chevron", 18)}</span></button>`,
      liveEnabled = Number(val(flight, "live_data_enabled")) === 1,
      liveControls = state.liveFlights?.available
        ? `<section class="live-flight-controls" aria-label="Live flight updates"><button type="button" class="fd-row fd-row--button" data-action="toggle-live-flight" data-id="${esc(itemId(flight))}" aria-pressed="${liveEnabled}"><span class="fd-row__icon">${icon("plane", 20)}</span><span class="fd-row__text"><strong>Live flight status</strong><small>${liveEnabled ? "On · beta" : "Off"}</small></span><span class="fd-row__chev">${icon(liveEnabled ? "chevronUp" : "chevron", 18)}</span></button>${liveEnabled ? fdButtonRow("refresh", "Refresh now", "refresh-live-flight", `data-id="${esc(itemId(flight))}"`) : ""}</section>`
        : "",
      fdList = `<section class="fd-list" aria-label="Documents and flight details">${directionsRow}${liveControls}${boardingRow}${disclosure}${docRows}${addRow}${fdNoteRow(flight, "flight")}</section>`;
    return `<div class="phone-app"><section class="screen dark-detail flight-detail-screen">${appBar("Flight Detail", "", true, bookingHeaderActions("flight", itemId(flight)))}<main class="detail-content ${state.flightDetailsOpen ? "detail-content--expanded" : ""}"><div class="flight-detail-stack ${state.flightDetailsOpen ? "is-expanded" : ""}">${flightPass(flight, true)}${fdList}</div></main>${bottomNav("bookings")}</section></div>`;
  }
  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000)),
      hours = Math.floor(minutes / 60),
      rest = minutes % 60;
    return hours ? `${hours}h ${rest ? `${rest}m` : ""}`.trim() : `${rest}m`;
  }
  function missingDetailScreen(title, body) {
    return `<div class="phone-app"><section class="screen">${appBar(title)}<div class="empty-mobile"><div class="empty-mobile-icon">${icon("info", 30)}</div><h1>${esc(title)}</h1><p>${esc(body)}</p></div>${bottomNav("bookings")}</section></div>`;
  }
  function hotelScreen() {
    const stay = selectedStay();
    if (!stay)
      return missingDetailScreen(
        "Stay unavailable",
        "No active hotel or stay is available.",
      );
    const location = locationById(
        val(stay, "property_location_id", "start_location_id"),
      ),
      contact = contactFor(stay, "hotel"),
      imageUrl = localImageUrl(val(stay, "property_image_url", "image_url")),
      address = val(location, "local_address", "formatted_address"),
      latitude = val(location, "latitude"),
      longitude = val(location, "longitude"),
      hasCoordinates = latitude != null && longitude != null,
      mapQuery = hasCoordinates ? `${latitude},${longitude}` : address || "",
      roomName = val(stay, "room_name", "room_type"),
      rawStatus = String(
        val(stay, "booking_status", "status") || "unavailable",
      ).toLowerCase(),
      statusLabel = statusText(rawStatus),
      statusTone =
        rawStatus === "confirmed"
          ? "confirmed"
          : ["cancelled", "skipped"].includes(rawStatus)
            ? "cancelled"
            : ["needs_confirmation", "pending", "changed"].includes(rawStatus)
              ? "attention"
              : "neutral",
      directionsDisabled = !mapQuery,
      driverDisabled = !address,
      confirmation = val(stay, "confirmation_number");
    return `<div class="phone-app"><section class="screen dark-detail hotel-detail-screen">${appBar("Hotel", "", false, bookingHeaderActions("hotel", itemId(stay)))}<main class="detail-content">${imageUrl ? `<div class="fd-hero-image" role="img" aria-label="Hotel property image"><img src="${esc(imageUrl)}" alt="" loading="lazy" decoding="async">${state.offline ? `<span class="hotel-offline-badge" role="status">${icon("info", 16)} Offline · saved details</span>` : ""}</div>` : ""}<section class="fd-card${imageUrl ? " fd-card--attached" : ""}" aria-label="Stay details"><div class="fd-card__head"><span class="fd-flight">${icon("hotel", 16)} ${esc(val(stay, "property_name", "title") || "Stay")}</span><span class="fd-status-wrap" role="status" aria-label="${esc(statusLabel)}. Scheduled booking data is never presented as live."><span class="fd-status ${statusTone === "confirmed" ? "is-confirmed" : ""}">${statusTone === "confirmed" ? checkDot() : ""}${esc(statusLabel)}</span><small>Scheduled data</small></span></div>${roomName ? `<p class="fd-sub">${esc(roomName)}</p>` : ""}<div class="fd-stay"><div class="fd-stay__col"><span class="fd-label">Check-in</span><strong>${esc(formatTripBoundDate(val(stay, "check_in_date"), state.trip))}</strong><small>${esc(val(stay, "check_in_from") || "Time not set")}</small></div><div class="fd-stay__mid"><span class="fd-stay__track" aria-hidden="true">${icon("night", 16)}</span><span class="fd-stay__nights">${esc(nights(stay))} ${nights(stay) === 1 ? "night" : "nights"}</span></div><div class="fd-stay__col fd-stay__col--right"><span class="fd-label">Check-out</span><strong>${esc(formatTripBoundDate(val(stay, "check_out_date"), state.trip))}</strong><small>${esc(val(stay, "check_out_by") || "Time not set")}</small></div></div></section>${fdList([
      !driverDisabled ? fdButtonRow("car", "Show to Driver", "show-driver", `data-id="${esc(itemId(stay))}"`) : "",
      address
        ? fdButtonRow("pin", address, "directions-hotel", `data-id="${esc(itemId(stay))}"${directionsDisabled ? " disabled" : ""}`, hasCoordinates ? "Open in Maps" : "Saved address")
        : fdStaticRow("pin", "Location unavailable"),
      val(contact, "phone") ? fdLinkRow("phone", contact.phone, `tel:${esc(contact.phone)}`, `Call hotel at ${esc(contact.phone)}`, "Call hotel") : "",
      val(contact, "email") ? fdLinkRow("mail", contact.email, `mailto:${encodeURIComponent(contact.email)}`, `Email hotel at ${esc(contact.email)}`, "Email hotel") : "",
      confirmation ? fdButtonRow("copy", confirmation, "copy", `data-value="${esc(confirmation)}"`, "Confirmation · tap to copy", "copy") : "",
      fdDocRows(stay),
      fdAddRow(),
      fdNoteRow(stay, "hotel"),
    ], "Hotel details and documents")}</main>${bottomNav("bookings")}</section></div>`;
  }
  function bookingsScreen() {
    const rows = [];
    state.transport
      .filter((item) => !isCancelled(item))
      .forEach((item) => {
        const type = String(val(item, "transport_type") || "transport"),
          routeText = ["flight", "train"].includes(type)
            ? `${locationLabel(val(item, "departure_location_id"))} → ${locationLabel(val(item, "arrival_location_id"))}`
            : String(val(item, "title") || "Transport"),
          starts =
            Number(val(item, "scheduled_departure_utc", "starts_at_utc")) ||
            null;
        rows.push(
          `<button class="booking-card" data-action="booking-detail" data-kind="${esc(type)}" data-id="${esc(itemId(item))}"><span class="info-icon">${icon(transportIcon(type), 22)}</span><span><strong>${esc(type === "flight" ? `${flightNumber(item)} · ${routeText}` : val(item, "title", "service_number") || routeText)}</strong><span>${esc(formatDateTime(starts, val(item, "departure_timezone", "start_timezone")))}</span></span>${icon("chevron", 22, "chevron")}</button>`,
        );
      });
    state.stays
      .filter((item) => !isCancelled(item))
      .forEach((item) =>
        rows.push(
          `<button class="booking-card" data-action="booking-detail" data-kind="hotel" data-id="${esc(itemId(item))}"><span class="info-icon purple">${icon("hotel", 22)}</span><span><strong>${esc(val(item, "property_name", "title") || "Stay")}</strong><span>${esc(formatDateOnly(val(item, "check_in_date")))} – ${esc(formatDateOnly(val(item, "check_out_date")))}</span></span>${icon("chevron", 22, "chevron")}</button>`,
        ),
      );
    return `<div class="phone-app"><section class="screen">${appBar("Bookings")}${mobileAlert()}<div class="intro-block"><h1>Your bookings</h1><p>Only the details you need while travelling.</p></div><main class="bookings-list">${rows.length ? rows.join("") : `<div class="empty-mobile"><h2>No bookings yet</h2><p>Add transport, a stay or an activity.</p>${primaryCta("Add Booking", "open-add", "plus")}</div>`}<button class="booking-card" data-screen="documents"><span class="info-icon green">${icon("document", 22)}</span><span><strong>Documents</strong><span>${state.localDocs.filter((doc) => doc.integrity === "verified").length} verified offline files</span></span>${icon("chevron", 22, "chevron")}</button><button class="booking-card" data-screen="ready"><span class="info-icon">${icon("download", 22)}</span><span><strong>Ready Offline</strong><span>Check what is saved on this phone</span></span>${icon("chevron", 22, "chevron")}</button></main>${bottomNav("bookings")}</section></div>`;
  }
  function documentsScreen() {
    const rows = state.localDocs
      .map((document) => {
        const integrity = document.integrity || "unverified";
        const travelerNames = (document.travelerIds || []).map((id) => state.travelers.find((traveler) => String(traveler.id) === String(id))?.display_name).filter(Boolean).join(", "), status = integrity === "verified" ? "Ready offline" : statusText(integrity);
        return `<div class="document-row-wrap"><button class="document-row" data-action="open-document" data-id="${esc(document.id)}"><span class="document-row__icon ${document.type === "hotel_confirmation" ? "purple" : document.type === "boarding_pass" ? "green" : ""}">${icon(document.type === "boarding_pass" ? "qr" : document.type === "hotel_confirmation" ? "hotel" : "document", 24)}</span><span class="document-row__copy"><strong>${esc(document.name || docTypeLabel(document.type))}</strong><small>${esc(travelerNames || document.subtitle || docTypeLabel(document.type))}</small><span class="document-row__status ${integrity === "verified" ? "is-ready" : "is-warning"}">${integrity === "verified" ? icon("check", 14) : icon("warning", 14)} ${esc(status)}</span></span>${icon("chevron", 20, "chevron")}</button><button type="button" class="document-row__remove" data-action="remove-document" data-id="${esc(document.id)}" aria-label="Delete ${esc(document.name || "document")}">${icon("trash", 18)}</button></div>`;
      })
      .join("");
    const verified = state.localDocs.filter((document) => document.integrity === "verified").length;
    return mobilePage("Documents", `<header class="screen-intro"><span class="screen-intro__icon">${icon("document", 26)}</span><div><h1>Your travel documents</h1><p>${verified} of ${state.localDocs.length} ready offline on this phone</p></div></header><section class="mobile-group"><h2>Saved documents</h2><div class="document-list">${rows || `<div class="mobile-empty mobile-empty--compact"><span class="mobile-empty__icon">${icon("document", 30)}</span><h1>No offline documents</h1><p>Add a ticket, boarding pass, or confirmation.</p></div>`}</div></section><button class="mobile-primary-action" data-action="document-sheet">${icon("plus", 20)} Add Document</button>`, "bookings");
  }

  function mobilePage(title, body, active = "trips", right = "", extraClass = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen ${esc(extraClass)}">${appBar(title, "", false, right)}${mobileAlert()}<main class="mobile-page">${body}</main>${bottomNav(active)}</section></div>`;
  }
  function focusedTaskPage(title, body, className = "", right = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen focused-task ${esc(className)}">${appBar(title, "", false, right)}${mobileAlert()}<main class="focused-page">${body}</main></section></div>`;
  }
  function formHeaderSave(formId, label) {
    return `<button type="submit" form="${esc(formId)}" class="app-bar-save mobile-primary-action">${esc(label)}</button>`;
  }
  function lifecycleLabel(value) {
    const key = String(value || "upcoming").toLowerCase();
    return ({ upcoming: "Upcoming", active: "Current", during: "Current", completed: "Past", past: "Past", cancelled: "Cancelled", draft: "Draft" })[key] || statusText(key);
  }
  // Pick a destination-flavored icon from the trip name so each trip in the list
  // reads differently. Keyword rules first, then a stable hash fallback so two
  // different cities never collide on the same generic suitcase.
  function tripMarkIcon(trip) {
    const text = String(val(trip, "title") || "").toLowerCase();
    const rules = [
      [/mountain|alps?|ski\b|snow|peak|everest|nepal|andes|aspen|tahoe|whistler|dolomit|kilimanjaro|patagon|hike|trek|safari|jungle|forest|national park/, "dest-mountain"],
      [/beach|island|bali|hawaii|maldiv|caribbean|phuket|ibiza|cancun|\bgoa\b|tropic|fiji|seychelle|bahama|maui|coast|riviera|cruise/, "dest-beach"],
      [/rome|roma|egypt|cairo|athens|greece|greek|machu|temple|pyramid|ruin|ancient|petra|angkor|acropolis|colosse|jerusalem/, "dest-monument"],
      [/tokyo|york|nyc|london|paris|dubai|singapore|kong|shanghai|chicago|berlin|madrid|barcelona|amsterdam|\bcity\b|urban|metropol/, "hotel"],
      [/road ?trip|route ?66|self ?drive|\bdrive\b/, "car"],
      [/rail|interrail|eurail|\btrain\b/, "train"],
      [/summer|\bsun\b|desert|sahara/, "day"],
      [/flight|\bfly\b|layover|airport/, "plane"],
      [/food|culinary|wine|gourmet|tasting/, "restaurant"],
    ];
    for (const [re, name] of rules) if (re.test(text)) return name;
    const pool = ["dest-mountain", "dest-beach", "dest-monument", "hotel", "day", "map", "plane"];
    if (!text) return "trips";
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  }
  // Place a trip in exactly one bucket. Dates are the source of truth (a trip
  // that has ended is Past even if it's the one you last opened); lifecycle is
  // only a fallback when dates are missing. This prevents a trip appearing in
  // both "Current" and "Past" at once.
  // Each bucket gets its own mark so Current / Upcoming / Past read differently
  // at a glance: a navigation arrow for the trip you're on now, a calendar for
  // what's coming, a clock for what's done.
  function bucketMarkIcon(label) {
    return ({ Current: "directions", Upcoming: "flight", Past: "location", Cancelled: "close" })[label] || "trips";
  }
  function tripBucket(trip) {
    const now = new Date().toISOString().slice(0, 10);
    const lc = String(val(trip, "lifecycle_state", "lifecycleState") || "").toLowerCase();
    if (lc === "cancelled") return "Cancelled";
    const start = String(val(trip, "starts_on", "startsOn") || ""),
      end = String(val(trip, "ends_on", "endsOn") || "");
    if (end && end < now) return "Past";
    if (start && start > now) return "Upcoming";
    if (start && end && start <= now && now <= end) return "Current";
    if (["completed", "past"].includes(lc)) return "Past";
    if (lc === "active") return "Current";
    return "Upcoming";
  }
  function tripCountdownLabel(trip) {
    const start = String(val(trip, "starts_on", "startsOn") || "");
    if (!start) return "";
    const parts = start.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
    const now = new Date(),
      today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      startDate = new Date(parts[0], parts[1] - 1, parts[2]),
      days = Math.round((startDate.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "";
    if (days === 0) return "Starts today";
    if (days === 1) return "Starts tomorrow";
    return `Starts in ${days} days`;
  }
  function tripListScreen() {
    // Filters use the same exclusive date/status buckets as the trip list.
    const filters = [["all","All"],["current","Current"],["upcoming","Upcoming"],["past","Past"]];
    const filter = filters.some(([key]) => key === state.tripFilter) ? state.tripFilter : "all";
    const filterBar = `<div class="trip-filters" role="group" aria-label="Filter trips">${filters.map(([key,label]) => `<button type="button" data-action="filter-trips" data-filter="${key}" aria-pressed="${filter === key}" class="trip-filter${filter === key ? " is-active" : ""}">${label}</button>`).join("")}</div>`;
    const headerActions = `<button class="icon-button" data-screen="account" aria-label="Account">${icon("user", 24)}</button>`;
    const page = (title, body) => `<div class="phone-app"><section class="screen mobile-v1-screen trips-bg-screen trips-bg-screen--nonav">${appBar(title, "", false, headerActions)}${mobileAlert()}<main class="mobile-page">${filterBar}<div class="trip-filter-results" aria-live="polite">${body}</div></main><button class="trips-fab" data-action="open-add" aria-label="Create trip">${icon("plus", 40)}</button></section></div>`;
    if (!state.trips.length) return page("Trips", `<section class="mobile-empty"><span class="mobile-empty__icon">${icon("luggage", 30)}</span><h1>No trips yet</h1><p>Create your first trip and keep everything in one place.</p>${primaryCta("Create trip", "create-trip", "plus")}</section>`);
    const visibleGroups = filter === "all" ? null : [filters.find(([key]) => key === filter)[1]];
    const order = ["Current", "Upcoming", "Past", "Cancelled"];
    const content = order.filter((label) => !visibleGroups || visibleGroups.includes(label)).map((label) => {
      const trips = state.trips
        .filter((t) => tripBucket(t) === label)
        .sort((a, b) => {
          const sa = String(val(a, "starts_on", "startsOn") || ""),
            sb = String(val(b, "starts_on", "startsOn") || "");
          return label === "Past" ? sb.localeCompare(sa) : sa.localeCompare(sb);
        });
      if (!trips.length) return "";
      return `<section class="mobile-group trip-group"><h2>${label}</h2><div class="trip-card-list">${trips.map((trip) => { const countdown = label === "Upcoming" ? tripCountdownLabel(trip) : ""; return `<button class="trip-card trip-card--${label.toLowerCase()} ${label === "Current" ? "is-current" : ""}" data-action="open-trip" data-id="${esc(trip.id)}"><span class="trip-card__mark">${icon(bucketMarkIcon(label), 22)}</span><span class="trip-card__copy"><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(countdown || formatTripDates(trip))}</small>${tripSharedBadge(trip)}</span>${icon("chevron", 18, "chevron")}</button>`; }).join("")}</div></section>`;
    }).join("");
    const emptyCopy = {current:"Trips happening now will appear here.",upcoming:"Your next adventures will appear here.",past:"Completed trips will appear here.",all:"Create your first trip and keep everything in one place."};
    const body = content || `<section class="mobile-empty mobile-empty--compact"><span class="mobile-empty__icon">${icon(filter === "past" ? "clock" : "trips", 30)}</span><h1>No ${filter === "all" ? "" : filter + " "}trips</h1><p>${emptyCopy[filter]}</p></section>`;
    return page("Trips", body);
  }
  function meaningfulBookingStatus(item) {
    const raw = String(val(item, "booking_status", "status") || "").toLowerCase();
    if (["confirmed", "scheduled", "active"].includes(raw)) return "";
    if (!raw) return "Time unavailable";
    return statusText(raw);
  }
  function bookingRows() {
    const rows = [];
    state.transport.forEach((item) => rows.push({ kind: String(val(item, "transport_type") || "transport"), item, at: Number(val(item, "scheduled_departure_utc", "starts_at_utc")) || 0 }));
    state.stays.forEach((item) => rows.push({ kind: "hotel", item, at: Date.parse(`${val(item, "check_in_date") || ""}T00:00:00Z`) || 0 }));
    state.timeline.filter((item) => ["activity", "reservation", "plan", "tour", "restaurant"].includes(String(val(item, "type")))).forEach((item) => rows.push({ kind: String(val(item, "type")), item, at: Number(val(item, "starts_at_utc")) || 0 }));
    return rows.sort((a, b) => a.at - b.at);
  }
  function premiumBookingsScreen() {
    const filters = [["all", "All"], ["transport", "Transport"], ["stays", "Stays"], ["plans", "Plans"]],
      rows = bookingRows().filter((row) => state.bookingFilter === "all" || (state.bookingFilter === "transport" && ["flight", "train", "ferry", "car", "transfer"].includes(row.kind)) || (state.bookingFilter === "stays" && row.kind === "hotel") || (state.bookingFilter === "plans" && !["flight", "train", "ferry", "car", "transfer", "hotel"].includes(row.kind)));
    const list = rows.map(({ kind, item, at }) => {
      const transport = ["flight", "train", "ferry", "car", "transfer"].includes(kind),
        zone = val(item, "departure_timezone", "start_timezone"),
        title = kind === "flight" ? `${flightNumber(item)} · ${flightRoute(item).fromCode} → ${flightRoute(item).toCode}` : ["train", "ferry"].includes(kind) ? val(item, "title", "service_number") || statusText(kind) : kind === "hotel" ? val(item, "property_name", "title") || "Stay" : val(item, "title", "carrier_name") || statusText(kind),
        subtitle = kind === "hotel" ? `${formatDateOnly(val(item, "check_in_date"))} – ${formatDateOnly(val(item, "check_out_date"))}` : transport ? formatDateTime(at, zone) : `${formatDateTime(at, zone)}${val(item, "subtitle") ? ` · ${val(item, "subtitle")}` : ""}`,
        status = meaningfulBookingStatus(item);
      return `<button class="travel-row" data-action="booking-detail" data-kind="${esc(kind)}" data-id="${esc(itemId(item))}"><span class="travel-row__icon">${icon(transportIcon(kind), 22)}</span><span class="travel-row__body"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small>${status ? `<em class="travel-state travel-state--attention">${esc(status)}</em>` : ""}</span>${icon("chevron", 20, "chevron")}</button>`;
    }).join("");
    return mobilePage("Bookings", `<div class="segmented-control" role="group" aria-label="Filter bookings">${filters.map(([key,label]) => `<button data-action="filter-bookings" data-filter="${key}" class="${state.bookingFilter === key ? "is-active" : ""}" aria-pressed="${state.bookingFilter === key}">${label}</button>`).join("")}</div><section class="mobile-group booking-trip-group"><h2>${esc(state.trip?.title || "Current trip")}</h2><div class="travel-list">${list || `<section class="mobile-empty mobile-empty--compact"><h1>No bookings here</h1><p>Add transport, a stay, or a plan.</p></section>`}</div></section><button class="mobile-secondary-action" data-action="open-add">${icon("plus", 20)} Add booking</button>`, "bookings", `<button class="icon-button" data-action="open-add" aria-label="Add booking">${icon("plus", 24)}</button>`);
  }
  function selectedTrain() {
    const supported = new Set(["train", "ferry"]),
      selected = state.transport.find(
        (row) =>
          itemId(row) === String(state.selectedId) &&
          supported.has(String(val(row, "transport_type"))),
      );
    return (
      selected ||
      state.transport.find((row) =>
        supported.has(String(val(row, "transport_type"))),
      )
    );
  }
  function trainScreen() {
    const train = selectedTrain();
    if (!train)
      return missingDetailScreen(
        "Journey unavailable",
        "No train or ferry booking is available.",
      );
    const kind = String(val(train, "transport_type") || "train"),
      ferry = kind === "ferry",
      from = locationById(
        val(train, "departure_location_id", "start_location_id"),
      ),
      to = locationById(
        val(train, "arrival_location_id", "end_location_id"),
      ),
      dep = Number(
        val(train, "scheduled_departure_utc", "starts_at_utc"),
      ) || null,
      arr = Number(
        val(train, "scheduled_arrival_utc", "ends_at_utc"),
      ) || null,
      detail = detailFor(train) || {},
      linkedDocuments = linkedBookingDocuments(train),
      doc = linkedDocuments.find(
        (document) =>
          document.integrity === "verified" &&
          ["ticket", "qr_code"].includes(document.type),
      ),
      transportIconName = ferry ? "navigation" : "train";
    const stationCode = (loc) => val(loc, "station_code", "iata_code"),
      fromCode = stationCode(from),
      toCode = stationCode(to),
      duration = dep && arr ? durationLabel(arr - dep) : "",
      status = statusText(val(train, "booking_status", "status") || "confirmed"),
      confirmed = status === "Confirmed",
      metaFacts = [
        [ferry ? "Pier / berth" : "Platform", val(train, "departure_platform", "platform")],
        [ferry ? "Cabin" : "Coach", val(detail, "coach")],
        ["Seat", val(detail, "seat")],
      ].filter(([, value]) => value),
      metaBand = metaFacts.length
        ? `<div class="fd-meta">${metaFacts
            .map(([label, value]) => `<div class="fd-meta__item"><span class="fd-label">${esc(label)}</span><strong>${esc(value)}</strong></div>`)
            .join("")}</div>`
        : "",
      bookingRef = val(train, "booking_reference"),
      hero = `<section class="fd-card" aria-label="Scheduled journey details"><div class="fd-card__head"><span class="fd-flight">${icon(transportIconName, 17)} ${esc(val(train, "carrier_name") || (ferry ? "Ferry" : "Train"))}</span><span class="fd-status-wrap" role="status" aria-label="${esc(status)}. Scheduled booking data is never presented as live."><span class="fd-status ${confirmed ? "is-confirmed" : ""}">${confirmed ? checkDot() : ""}${esc(status)}</span><small>Scheduled data</small></span></div><div class="fd-route"><div class="fd-route__end"><span class="fd-route__code">${esc(fromCode || "—")}</span><span class="fd-route__name">${esc(val(from, "display_name") || "Origin unavailable")}</span></div><div class="fd-route__mid"><span class="fd-route__track">${icon(transportIconName, 24)}</span></div><div class="fd-route__end fd-route__end--right"><span class="fd-route__code">${esc(toCode || "—")}</span><span class="fd-route__name">${esc(val(to, "display_name") || "Destination unavailable")}</span></div></div><div class="fd-times"><div class="fd-times__col"><span class="fd-label">Departs</span><strong>${esc(formatTime(dep, val(train, "departure_timezone")))}</strong><small>${esc(formatDay(dep, val(train, "departure_timezone")) || "—")}</small></div><div class="fd-times__mid"><span class="fd-times__track" aria-hidden="true">${icon(transportIconName, 15)}</span>${duration ? `<span class="fd-times__dur">${esc(duration)}</span>` : ""}</div><div class="fd-times__col fd-times__col--right"><span class="fd-label">Arrives</span><strong>${esc(formatTime(arr, val(train, "arrival_timezone")))}</strong><small>${esc(formatDay(arr, val(train, "arrival_timezone")) || "")}</small></div></div>${metaBand}</section>`;
    return `<div class="phone-app"><section class="screen dark-detail train-detail-screen">${appBar(ferry ? "Ferry Detail" : "Train Detail", "", true, bookingHeaderActions(kind, itemId(train)))}<main class="detail-content">${hero}${fdList([
      fdButtonRow("navigation", `Directions to ${ferry ? "port" : "station"}`, "directions-item", `data-id="${esc(itemId(train))}"`),
      doc ? fdButtonRow("ticket", "Open ticket", "open-document", `data-id="${esc(doc.id)}"`) : "",
      bookingRef ? fdButtonRow("copy", bookingRef, "copy", `data-value="${esc(bookingRef)}"`, "Booking reference · tap to copy", "copy") : "",
      fdDocRows(train),
      fdAddRow(),
      fdNoteRow(train, kind),
    ], "Journey details and documents")}</main>${bottomNav("bookings")}</section></div>`;
  }
  function selectedPlan() {
    const wanted = String(state.selectedId || "");
    return (
      state.timeline.find((row) => itemId(row) === wanted) ||
      state.transport.find((row) => itemId(row) === wanted) ||
      null
    );
  }
  function bookingUsesTicket(item) {
    // A "Ticket" row only makes sense where you actually carry a ticket: any
    // transport segment (train/ferry/bus), or a ticketed-admission activity.
    // Dining reservations, classes and generic plans use a Confirmation instead.
    if (String(val(item, "transport_type") || "")) return true;
    const kind = String(val(item, "activity_type", "reservation_type", "type") || "").toLowerCase();
    return [
      "event", "show", "concert", "performance", "theater", "theatre",
      "tour", "attraction", "museum", "sightseeing", "sports", "match",
      "game", "experience", "excursion", "cruise", "transport",
    ].includes(kind);
  }
  function planScreen() {
    const item = selectedPlan();
    if (!item)
      return missingDetailScreen("Plan unavailable", "This plan is not available.");
    const transportKind = String(val(item, "transport_type") || ""),
      isTransport = Boolean(transportKind),
      location = locationById(
        isTransport
          ? val(item, "departure_location_id", "start_location_id")
          : val(item, "start_location_id", "location_id"),
      ),
      endLocation = isTransport
        ? locationById(val(item, "arrival_location_id", "end_location_id"))
        : null,
      contact = contactFor(item),
      linkedDocuments = linkedBookingDocuments(item),
      doc = linkedDocuments.find(
        (document) =>
          document.integrity === "verified" &&
          ["reservation", "voucher", "ticket", "qr_code"].includes(
            document.type,
          ),
      ),
      startsAt = Number(
        val(item, "scheduled_departure_utc", "starts_at_utc"),
      ) || null,
      timezone = val(item, "departure_timezone", "start_timezone", "timezone");
    const confirmation = val(item, "booking_reference", "confirmation_number", "reservation_reference", "reference"),
      notes = val(item, "activity_notes", "reservation_notes", "notes"),
      kind = transportKind || val(item, "activity_type", "reservation_type", "type") || "Plan",
      title = val(item, "carrier_name", "title") || statusText(kind),
      locationName = val(location, "display_name", "formatted_address"),
      endLocationName = val(endLocation, "display_name", "formatted_address"),
      whenLabel = startsAt ? formatDateTime(startsAt, timezone) : "Time not scheduled",
      hero = `<section class="fd-card" aria-label="Scheduled plan details"><div class="fd-card__head"><span class="fd-flight">${icon(timelineIcon(timelineType(item)), 17)} ${esc(statusText(kind))}</span><span class="fd-status-wrap" role="status" aria-label="Scheduled booking data is never presented as live."><span class="fd-status"><small>Scheduled data</small></span></span></div><h1 class="fd-title">${esc(title)}</h1><p class="fd-when">${icon("calendar", 16)} ${esc(whenLabel)}</p></section>`;
    return `<div class="phone-app"><section class="screen dark-detail plan-detail-screen">${appBar(`${statusText(kind)} Detail`, "", true, bookingHeaderActions(transportKind || String(val(item, "type") || "plan"), itemId(item)))}<main class="detail-content">${hero}${fdList([
      doc ? fdButtonRow("ticket", "Open ticket", "open-document", `data-id="${esc(doc.id)}"`) : "",
      locationName ? fdButtonRow("pin", locationName, "directions-item", `data-id="${esc(itemId(item))}"`, endLocationName ? "From" : "Location", "map") : "",
      endLocationName ? fdStaticRow("navigation", endLocationName, "To") : "",
      confirmation ? fdButtonRow("copy", confirmation, "copy", `data-value="${esc(confirmation)}"`, "Confirmation · tap to copy", "copy") : "",
      val(contact, "phone") ? fdButtonRow("phone", val(contact, "display_name") || contact.phone, "call", `data-value="${esc(contact.phone)}"`, "Call contact") : "",
      fdDocRows(item),
      fdAddRow(),
      fdNoteRow(item, kind),
    ], "Plan details and documents")}</main>${bottomNav("bookings")}</section></div>`;
  }

  function documentRequirements() {
    const requirements = [],
      known = new Set(state.travelers.map((t) => String(t.id)));
    state.transport
      .filter(
        (item) =>
          !isCancelled(item) &&
          ["flight", "train"].includes(String(val(item, "transport_type"))),
      )
      .forEach((item) => {
        const kind = String(item.transport_type),
          ids = String(val(item, "traveler_ids") || "")
            .split(",")
            .map((x) => x.trim())
            .filter((x) => known.has(x));
        ids.forEach((travelerId) => {
          if (
            !requirements.some(
              (row) =>
                row.scope === "traveler" &&
                row.travelerId === travelerId &&
                row.kind === kind,
            )
          )
            requirements.push({
              scope: "traveler",
              travelerId,
              kind,
              types:
                kind === "flight" ? ["boarding_pass", "ticket"] : ["ticket"],
            });
        });
      });
    if (state.stays.some((item) => !isCancelled(item)))
      requirements.push({
        scope: "trip",
        kind: "stay",
        types: ["hotel_confirmation"],
      });
    return requirements;
  }
  function documentRequirementRows() {
    const verified = state.localDocs.filter(
        (doc) => doc.integrity === "verified",
      ),
      requirements = documentRequirements();
    return requirements.map((requirement) => {
      const ready = verified.some(
          (doc) =>
            requirement.types.includes(doc.type) &&
            (requirement.scope === "trip" ||
              doc.travelerIds?.includes(requirement.travelerId)),
        ),
        traveler = state.travelers.find(
          (row) => String(row.id) === requirement.travelerId,
        ),
        title =
          requirement.scope === "trip"
            ? "Hotel confirmation"
            : `${traveler?.display_name || "Traveler"} · ${requirement.kind === "flight" ? "Flight ticket / boarding pass" : "Train ticket"}`;
      return {
        icon:
          requirement.kind === "stay"
            ? "hotel"
            : requirement.kind === "flight"
              ? "plane"
              : "train",
        title,
        subtitle: ready
          ? "Checksum verified on this phone"
          : "Required by the saved itinerary",
        status: ready ? "Ready" : "Missing",
        ready,
      };
    });
  }
  function readyOfflineRows() {
    if (!state.trip) return [];
    const id = encodeURIComponent(state.trip.id);
    const base = [
      ["trips", "Trip timeline", `/api/v1/trips/${id}/timeline`],
      ["ticket", "Transport bookings", `/api/v1/trips/${id}/transport`],
      ["hotel", "Stays and addresses", `/api/v1/trips/${id}/stays`],
      ["pin", "Locations", `/api/v1/trips/${id}/locations`],
    ].map(([iconName, title, path]) => {
      const status = PREVIEW_MODE
        ? { ok: true, at: Date.now() }
        : cacheStatus(path);
      return {
        icon: iconName,
        title,
        subtitle: status.ok ? ageLabel(status.at) : "Open online once to save",
        status: status.ok ? "Ready" : "Missing",
        ready: status.ok,
      };
    });
    const pending =
      pendingMutations().filter((row) => row.status !== "done").length +
      Number(
        val(state.syncStatus, "pendingOperations", "pending_operations") || 0,
      );
    base.push({
      icon: "refresh",
      title: "Pending changes",
      subtitle: pending
        ? "Reconnect or review conflicts"
        : "No unsynced local changes",
      status: pending ? "Needs update" : "Ready",
      ready: pending === 0,
    });
    return [...base, ...documentRequirementRows()];
  }
  function readyScreen() {
    const rows = readyOfflineRows(),
      ready = rows.filter((row) => row.ready).length,
      allReady = rows.length > 0 && ready === rows.length;
    return `<div class="phone-app"><section class="screen ready-screen">${appBar("Ready Offline", "", false, `<button class="icon-button" data-action="offline-info" aria-label="Offline information">${icon("info", 24)}</button>`)}<section class="offline-summary ${allReady ? "offline-summary--ready" : "offline-summary--attention"}"><span class="offline-summary-icon">${icon(allReady ? "check" : "warning", 27)}</span><span class="offline-summary-copy"><strong>${ready} of ${rows.length} ready</strong><span>${allReady ? "Your essentials are saved on this phone." : `${rows.length - ready} item${rows.length - ready === 1 ? "" : "s"} need attention before offline use.`}</span></span></section><main class="list-stack ready-list">${rows.map((row) => `<div class="info-card ${row.ready ? "" : "needs-attention"}"><span class="info-icon">${icon(row.icon, 22)}</span><span class="info-copy"><strong>${esc(row.title)}</strong><span>${esc(row.subtitle)}</span></span><span class="info-status ${row.ready ? "" : "warning"}" aria-label="${row.ready ? "Ready" : esc(row.status)}">${row.ready ? checkDot() : `${esc(row.status)} ${icon("warning", 16)}`}</span></div>`).join("")}</main><div class="download-action">${allReady ? `<button class="secondary-cta offline-refresh ${state.refreshingOffline ? "is-loading" : ""}" data-action="refresh-data" ${state.refreshingOffline ? "disabled aria-busy=\"true\"" : ""}>${icon("refresh", 20)} ${state.refreshingOffline ? "Refreshing…" : "Refresh Offline Data"}</button>` : primaryCta("Download Missing Items", "fix-offline", "download")}</div>${bottomNav("trips")}</section></div>`;
  }
  function issueKind(issue) {
    return ["critical", "high"].includes(issue.severity)
      ? "warn"
      : issue.severity === "info"
        ? "info"
        : "good";
  }
  function healthScreen() {
    const issues = activeHealthIssues(),
      top = healthSummary(),
      setup = top.kind === "setup",
      shieldClass = issues.some((i) => i.severity === "critical")
        ? "critical"
        : issues.length
          ? "warning"
          : "",
      rows = issues.length
        ? issues
            .map(
              (issue) =>
                `<div class="health-card ${issueKind(issue)}"><span>${icon(["critical", "high"].includes(issue.severity) ? "warning" : "info", 26)}</span><span><strong>${esc(issue.title || statusText(issue.code))}</strong><p>${esc(issue.explanation || issue.message || "Review this item.")}${issue.suggestedAction ? ` ${esc(issue.suggestedAction)}` : ""}</p></span></div>`,
            )
            .join("")
        : setup
          ? `<div class="health-card info"><span>${icon("plus", 26)}</span><span><strong>Trip setup</strong><p>Add your first booking to build the itinerary.</p><button class="text-action" data-action="open-add">Add booking</button></span></div>`
          : `<div class="health-card ${top.kind === "good" ? "good" : "info"}"><span>${icon(top.kind === "good" ? "check" : "info", 26)}</span><span><strong>${top.kind === "good" ? "No known issues" : "Not enough information"}</strong><p>${esc(top.subtitle)}</p></span></div>`;
    return `<div class="phone-app"><section class="screen">${appBar("Trip Health", "", false, `<button class="icon-button" data-action="health-info" aria-label="Trip Health information">${icon("info", 24)}</button>`)}<div class="health-summary"><div class="health-shield ${shieldClass} ${setup ? "setup" : ""}">${icon(issues.length ? "warning" : setup ? "plus" : top.kind === "good" ? "check" : "info", 34)}</div><h1>${esc(top.title)}</h1><p>${esc(top.subtitle)}</p></div><main class="list-stack">${rows}${setup ? "" : `<button class="secondary-cta" data-action="recalculate-health">${icon("refresh", 20)} Recalculate Trip Health</button>`}</main>${bottomNav("home")}</section></div>`;
  }
  const CHECKLIST_SUGGESTIONS = ["Passport", "Wallet", "Phone charger", "Medication", "Tickets", "Headphones"];
  function checklistScreen() {
    if (!state.trip)
      return mobilePage("Checklist", `<div class="cl-screen"><section class="mobile-empty"><h1>No trip open</h1><p>Open or create a trip to start a packing list.</p><button class="mobile-secondary-action" data-screen="trips">${icon("trips", 20)} My trips</button></section></div>`, "checklist");
    const rows = state.checklist || [];
    const total = rows.length;
    const done = rows.filter((r) => r.completed).length;
    const toPack = rows.filter((r) => !r.completed);
    const packed = rows.filter((r) => r.completed);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const summary = total === 0
      ? `<section class="cl-progress"><strong>Nothing on your list yet</strong><small>Add anything you don't want to forget.</small></section>`
      : done === total
        ? `<section class="cl-progress cl-progress--done"><strong>All done ${icon("check", 20)}</strong><small>${total} item${total === 1 ? "" : "s"} ready</small></section>`
        : `<section class="cl-progress"><strong>${done} of ${total} ready</strong><small>${total - done} still to pack</small><span class="cl-bar" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}"><span class="cl-bar__fill" style="width:${pct}%"></span></span></section>`;
    const addForm = `<form class="cl-add" id="checklist-add-form" novalidate><input type="text" name="title" class="cl-add__input" placeholder="Add an item, e.g. Passport" maxlength="160" autocomplete="off" enterkeyhint="done" aria-label="Add a checklist item"><button type="submit" class="cl-add__btn" aria-label="Add item">${icon("plus", 22)}</button></form>`;
    const rowHtml = (item) => state.editingChecklistId === item.id
      ? `<li class="cl-row cl-row--editing"><form class="cl-edit" data-checklist-edit data-id="${esc(item.id)}" novalidate><input type="text" name="title" class="cl-edit__input" value="${esc(item.title)}" maxlength="160" autocomplete="off" enterkeyhint="done" aria-label="Rename item"><button type="submit" class="cl-edit__act cl-edit__save" aria-label="Save name">${icon("check", 18)}</button><button type="button" class="cl-edit__act cl-edit__cancel" data-action="cancel-edit-checklist" aria-label="Cancel">${icon("close", 18)}</button></form></li>`
      : `<li class="cl-row ${item.completed ? "is-complete" : ""}"><button type="button" class="cl-row__toggle" data-action="toggle-checklist" data-id="${esc(item.id)}" aria-pressed="${item.completed}"><span class="cl-check" aria-hidden="true">${item.completed ? icon("check", 16) : ""}</span><span class="cl-row__title">${esc(item.title)}</span></button><button type="button" class="cl-row__act" data-action="edit-checklist" data-id="${esc(item.id)}" aria-label="Rename ${esc(item.title)}">${icon("edit", 18)}</button><button type="button" class="cl-row__act cl-row__del" data-action="delete-checklist" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.title)}">${icon("trash", 18)}</button></li>`;
    let body = `<div class="cl-screen">${summary}${addForm}`;
    if (total === 0) {
      body += `<section class="cl-suggest"><p class="cl-suggest__label">Suggestions</p><div class="cl-chips">${CHECKLIST_SUGGESTIONS.map((s) => `<button type="button" class="cl-chip" data-action="add-checklist-suggested" data-title="${esc(s)}">${icon("plus", 14)} ${esc(s)}</button>`).join("")}</div></section>`;
    } else {
      if (toPack.length) body += `<section class="cl-section"><h2>To pack</h2><ul class="cl-list">${toPack.map(rowHtml).join("")}</ul></section>`;
      if (packed.length) body += `<section class="cl-section cl-section--packed"><h2>Packed</h2><ul class="cl-list">${packed.map(rowHtml).join("")}</ul></section>`;
    }
    body += `</div>`;
    return mobilePage("Checklist", body, "checklist");
  }
  // Help & FAQ content. Kept as data so copy stays maintainable and testable.
  // Product names below mirror the current UI (see MANUAL_BOOKING_TYPES, the add
  // and trip menus). Forward-by-email is intentionally omitted while that option
  // is hidden from the add screen (2026-08-30).
  const FAQ_SECTIONS = [
    { title: "Getting started", questions: [
      { id: "create-trip", q: "How do I create a trip?", a: "Open Account and tap Create trip, or tap + on the Trips screen. Add a name, destination and dates. Your trip opens in the Timeline.", keywords: "new trip start plan create destination dates", action: { label: "Create trip", action: "create-trip" } },
      { id: "edit-trip", q: "How do I edit my trip?", a: "Open the trip and tap the menu button in the top right, then choose Edit trip to change its name, dates or details.", keywords: "edit change trip name dates rename" },
      { id: "switch-trip", q: "How do I switch between trips?", a: "Open Account and tap Switch trip to pick another one. Your upcoming and past trips are listed there too.", keywords: "switch change multiple trips select", action: { label: "My trips", screen: "trips" } },
    ] },
    { title: "Bookings", questions: [
      { id: "add-booking", q: "How do I add a booking?", a: "Tap + at the bottom, then choose how to add it: Upload Booking or ADD NEW BOOKING. Everything you add appears in the Timeline.", keywords: "add booking flight hotel reservation upload manual" },
      { id: "upload-booking", q: "How does Upload Booking work?", a: "Tap + then Upload Booking and choose a ticket or confirmation file. tripto.to reads it on this device and fills in what it can. Check the details before saving, because recognition is not always perfect.", keywords: "upload file pdf ticket confirmation ocr read extract" },
      { id: "manual-booking", q: "How do I add a booking manually?", a: "Tap + then ADD NEW BOOKING and pick a type: Flight, Hotel / Stay, Train, Car Rental, Transfer, Cruise, Ferry, Restaurant, Activity / Event or Other. Only the essential fields are required.", keywords: "manual enter flight hotel stay train car rental transfer cruise ferry restaurant activity other" },
      { id: "edit-booking", q: "How do I edit a booking?", a: "Open the booking from your Timeline, then choose Edit to update its details.", keywords: "edit change booking details update" },
      { id: "remove-booking", q: "How do I remove a booking?", a: "Open the booking from your Timeline and choose Delete. Delete only when a booking was added by mistake.", keywords: "delete remove cancel booking mistake" },
    ] },
    { title: "Your trip", questions: [
      { id: "timeline", q: "What is the Timeline?", a: "The Timeline is the main view of your trip. Flights, stays, restaurants, activities and other bookings are shown in travel order so you can see what is coming next.", keywords: "timeline schedule order plans main view" },
      { id: "checklist", q: "How does the checklist work?", a: "Use the To-do tab in the bottom bar for things you do not want to forget, such as your passport, wallet or charger. Add your own items and tap one when it is packed. Tap it again to undo.", keywords: "checklist packing list passport wallet charger pack", action: { label: "Open checklist", screen: "checklist" } },
      { id: "documents", q: "Where are my tickets and documents?", a: "Documents attached to a booking open from that booking. You can also open the trip menu and choose Documents to see your trip files. Some files are stored only on this device.", keywords: "tickets documents files pdf storage device" },
      { id: "trip-map", q: "When can I use Trip Map?", a: "Open the trip menu and choose Trip Map. It becomes available once your trip has at least two places to map, and it uses the places already in your itinerary.", keywords: "map trip map places locations itinerary" },
      { id: "offline", q: "What works offline?", a: "Your cached Timeline, checklist and saved documents stay available without internet. Live details such as weather, new booking imports and opening directions need a connection.", keywords: "offline internet connection cached without wifi directions" },
    ] },
    { title: "Plan together", flag: "sharing", questions: [
      { id: "collab-what", q: "Can I plan a trip with other people?", a: "Yes. Open the trip menu and choose Plan together to invite people. Everyone signs in with their own free account — planning together never costs anything.", keywords: "collaborate share invite together people group family plan", action: { label: "Plan together", action: "open-collaboration" } },
      { id: "collab-roles", q: "What can invited people do?", a: "You choose a role for each person. Can edit lets them add and change bookings. View only lets them see the trip without changing it. As the owner you can change roles or remove people at any time.", keywords: "role owner editor viewer permissions can edit view only access" },
      { id: "collab-invite", q: "How do invitation links work?", a: "Each invitation link works once and you can revoke it at any time. The person opens it, signs in with their own free account, and joins the trip.", keywords: "invite link join revoke expire one time accept" },
      { id: "collab-leave", q: "How do I stop sharing or leave a trip?", a: "Owners can remove people or revoke pending invites from Plan together. If you were invited to someone else's trip, open Plan together and choose Leave this trip.", keywords: "leave remove revoke stop sharing unshare" },
    ] },
    { title: "Account", questions: [
      { id: "sign-out", q: "How do I sign out?", a: "Open Account and tap Sign out at the top of the page.", keywords: "sign out log out account", action: { label: "Account", screen: "account" } },
    ] },
  ];
  function helpScreen() {
    const visibleSections = FAQ_SECTIONS.filter((s) => !s.flag || (s.flag === "sharing" && state.sharing?.enabled));
    const totalAnswers = visibleSections.reduce((total, section) => total + section.questions.length, 0);
    const faqRow = (item) => {
      const open = state.openFaq.has(item.id);
      const panelId = `faq-panel-${item.id}`;
      const searchText = `${item.q} ${item.a} ${item.keywords || ""}`.toLocaleLowerCase();
      const safe = !item.action ? false : item.action.screen ? true : state.trip ? true : false;
      const actionBtn = item.action && safe
        ? `<div class="faq-actions">${item.action.screen ? `<button type="button" class="faq-action" data-screen="${esc(item.action.screen)}">${esc(item.action.label)}</button>` : `<button type="button" class="faq-action" data-action="${esc(item.action.action)}">${esc(item.action.label)}</button>`}</div>`
        : "";
      return `<div class="faq-row ${open ? "is-open" : ""}" data-faq-row data-search="${esc(searchText)}"><button type="button" class="faq-q" id="faq-question-${esc(item.id)}" data-action="faq-toggle" data-id="${esc(item.id)}" aria-expanded="${open}" aria-controls="${panelId}"><span>${esc(item.q)}</span><span class="faq-q__toggle" aria-hidden="true">${icon(open ? "minus" : "plus", 18, "faq-chev")}</span></button><div class="faq-a" id="${panelId}" role="region" aria-labelledby="faq-question-${esc(item.id)}"${open ? "" : " hidden"}><p>${esc(item.a)}</p>${actionBtn}</div></div>`;
    };
    const sectionIcons = ["plane", "ticket", "map", "users", "user"];
    const sections = visibleSections.map((s, i) => `<section class="faq-section faq-section--c${i % 5}" data-faq-section><header class="faq-section__head"><span class="faq-section__icon">${icon(sectionIcons[i] || "info", 20)}</span><div><h2 class="faq-section__label">${esc(s.title)}</h2><small>${s.questions.length} answer${s.questions.length === 1 ? "" : "s"}</small></div></header><div class="faq-list">${s.questions.map(faqRow).join("")}</div></section>`).join("");
    const quickStart = `<section class="help-quickstart" aria-labelledby="help-quick-title"><div class="help-quickstart__head"><span>${icon("navigation", 20)}</span><div><h2 id="help-quick-title">Your trip in three steps</h2><p>Start simple. Add details whenever you have them.</p></div></div><ol class="help-steps"><li><span>1</span><strong>Create a trip</strong></li><li><span>2</span><strong>Add bookings</strong></li><li><span>3</span><strong>Follow the Timeline</strong></li></ol></section>`;
    const intro = `<section class="help-intro"><div class="help-intro__icon">${icon("info", 28)}</div><span>TRAVEL HELP</span><h1>How can we help?</h1><p>Find a clear answer without leaving your trip.</p><label class="help-search"><span class="sr-only">Search help</span>${icon("search", 20)}<input type="search" data-faq-search placeholder="Search bookings, maps, offline…" autocomplete="off" enterkeyhint="search" aria-controls="faq-results"><small data-faq-count aria-live="polite">${totalAnswers} answer${totalAnswers === 1 ? "" : "s"}</small></label></section>`;
    const empty = `<section class="faq-empty" data-faq-empty hidden>${icon("search", 24)}<h2>No answer found</h2><p>Try a shorter word such as “booking”, “map”, or “offline”.</p></section>`;
    const links = `<section class="help-support"><div class="help-support__copy"><span class="help-support__icon">${icon("shield", 21)}</span><div><h2>Helpful links</h2><p>Learn the basics or review how your data is handled.</p></div></div><div class="help-support__actions"><button type="button" class="help-link" data-action="open-first-run-how">${icon("navigation", 19)}<span>Take the tour</span>${icon("chevron", 17)}</button><a class="help-link" href="/privacy">${icon("shield", 19)}<span>Privacy</span>${icon("chevron", 17)}</a><a class="help-link" href="/terms">${icon("document", 19)}<span>Terms</span>${icon("chevron", 17)}</a></div></section>`;
    return mobilePage("Help & FAQ", `<div class="help-screen">${intro}${quickStart}<div class="faq-results" id="faq-results">${sections}</div>${empty}${links}</div>`, "trip-options", "", "help-page");
  }
  function travelerDocumentSummary(traveler) {
    const docs = state.localDocs.filter((d)=>d.integrity==="verified" && d.travelerIds?.includes(String(traveler.id))).length;
    return docs ? `${docs} verified document${docs===1?"":"s"}` : "No verified documents";
  }
  function travelersScreen() {
    const rows = state.travelers.map((traveler)=>{ const assigned = bookingRows().filter(({item})=>String(val(item,"traveler_ids")||"").split(",").includes(String(traveler.id))).length; return `<button class="travel-row traveler-row" data-screen="traveler" data-id="${esc(traveler.id)}"><span class="traveler-avatar">${esc(String(val(traveler,"display_name")||"T").slice(0,1).toUpperCase())}</span><span class="travel-row__body"><strong>${esc(val(traveler,"display_name") || "Traveler")}</strong><small>${esc(statusText(val(traveler,"traveler_type") || "Traveler"))} · ${assigned} booking${assigned===1?"":"s"}</small><em>${esc(travelerDocumentSummary(traveler))}</em></span>${icon("chevron",20)}</button>`; }).join("");
    return mobilePage("Travelers", `<div class="travel-list">${rows || `<section class="mobile-empty"><h1>No travelers yet</h1><p>Add a traveler to assign bookings and documents correctly.</p></section>`}</div><button class="mobile-secondary-action" data-action="open-form" data-form="traveler">${icon("plus",20)} Add traveler</button>`, "account");
  }
  function travelerScreen() {
    const traveler = state.travelers.find((t)=>String(t.id)===String(state.selectedId));
    if (!traveler) return missingDetailScreen("Traveler unavailable", "This traveler is not available.");
    const details = state.bookingDetails.filter((d)=>String(val(d,"traveler_id"))===String(traveler.id)), docs = state.localDocs.filter((d)=>d.travelerIds?.includes(String(traveler.id))), assigned = bookingRows().filter(({item})=>String(val(item,"traveler_ids")||"").split(",").includes(String(traveler.id))), checklist = state.checklist.filter((item)=>String(val(item,"traveler_id"))===String(traveler.id));
    return mobilePage("Traveler", `<section class="traveler-profile"><span class="traveler-avatar traveler-avatar--large">${esc(String(val(traveler,"display_name")||"T").slice(0,1).toUpperCase())}</span><h1>${esc(val(traveler,"display_name")||"Traveler")}</h1><p>${esc(statusText(val(traveler,"traveler_type")||"Traveler"))}</p><button class="text-action" data-action="open-form" data-form="traveler" data-id="${esc(traveler.id)}">Edit traveler</button></section><section class="mobile-group"><h2>Assignments</h2><div class="detail-list">${assigned.map(({kind,item})=>`<div class="detail-row"><span>${icon(timelineIcon(kind),20)}</span><span><small>${esc(statusText(kind))}</small><strong>${esc(val(item,"title","property_name")||"Booking")}</strong></span></div>`).join("") || `<p class="muted-copy">No assigned bookings.</p>`}</div></section><section class="mobile-group"><h2>Travel details</h2><div class="fact-grid">${details.flatMap((d)=>[["Seat",val(d,"seat")],["Cabin",val(d,"cabin_class")],["Baggage",val(d,"checked_bags") != null ? `${d.checked_bags} checked` : null],["Ticket",val(d,"ticket_number")]]).filter(([,v])=>v).map(([k,v])=>`<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join("") || `<p class="muted-copy">No traveler-specific booking facts saved.</p>`}</div></section><section class="mobile-group"><h2>Documents</h2><div class="travel-list">${docs.map((d)=>`<button class="travel-row" data-action="open-document" data-id="${esc(d.id)}"><span class="travel-row__icon">${icon("document",20)}</span><span class="travel-row__body"><strong>${esc(d.name)}</strong><small>${d.integrity==="verified"?"Ready offline":statusText(d.integrity)}</small></span>${icon("chevron",18)}</button>`).join("") || `<p class="muted-copy">No traveler-specific documents.</p>`}</div></section><section class="mobile-group"><h2>Checklist</h2><div class="traveler-checklist">${checklist.map((item)=>`<div class="traveler-checklist__row ${val(item,"completed")?"is-complete":""}">${icon(val(item,"completed")?"check":"clock",18)}<span><strong>${esc(val(item,"title")||"Travel essential")}</strong><small>${esc(statusText(val(item,"category")||"packing"))}</small></span></div>`).join("") || `<p class="muted-copy">No traveler-specific essentials.</p>`}</div></section>`, "account");
  }
  function importScreen() {
    // No AI guessing. You review every field before it is added.
    const forward = state.importMode === "forward";
    const control = forward
      ? `<section class="forward-booking-address"><span>${icon("mail",24)}</span><div><strong>go@tripto.to</strong><small>Forward any booking confirmation from your verified Google email. Choose the trip if needed, review every extracted detail, then add it to your Timeline.</small></div></section><label><span>Paste confirmation for immediate review</span><textarea name="body" rows="7" placeholder="Paste the forwarded confirmation email"></textarea></label>`
      : `<label class="smart-import-file"><span>Booking document</span><input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.eml,.docx,.ics,.pkpass,application/pdf,image/*,text/plain,message/rfc822,text/calendar"><small>Best accuracy: the original PDF, .eml, .ics, or .pkpass. Photos and screenshots are read with OCR and may need corrections. · 10 MB max</small></label>`;
    return focusedTaskPage(forward ? "Forward Confirmation" : "Upload Booking", `<section class="form-intro smart-import-intro"><span>${icon(forward ? "mail" : "document",28)}</span><h1>${forward ? "Forward a confirmation" : "Upload a booking"}</h1><p>${forward ? "Forward to go@tripto.to from your verified Google email. Choose the trip and confirm the extracted details before anything is added." : "Recognition stays on this phone. Review every field before saving."}</p></section><form class="mobile-form import-form" id="import-form" novalidate>${control}<p class="form-error" hidden></p></form><button class="mobile-secondary-action import-history-action" data-screen="${forward ? "booking-email-inbox" : "import-history"}">${icon(forward ? "mail" : "clock",20)} ${forward ? "Open Email Inbox" : "Import History"}</button>`, "import-task", formHeaderSave("import-form", "Review"));
  }
  function importReviewScreen() {
    const candidates = state.importReview?.candidates || [];
    const duplicate=Boolean(state.importReview?.duplicate);
    const emptyWarnings=(!candidates.length&&Array.isArray(state.importReview?.warnings))?state.importReview.warnings:[];
    const emptyBlock=`<section class="mobile-empty"><h1>No booking candidates</h1><p>This format could not be imported safely. Add the booking manually instead.</p>${emptyWarnings.length?`<div class="review-warnings">${emptyWarnings.map((w)=>`<p>${icon("warning",16)} ${esc(w)}</p>`).join("")}</div>`:""}</section>`;
    return focusedTaskPage("Import Review", `<form id="import-review-form" class="import-review-form"><section class="review-summary ${duplicate?"review-summary--duplicate":""}"><span>${icon(duplicate?"warning":"check",25)}</span><div><strong>${duplicate?"Possible duplicate":"Review before adding"}</strong><small>${duplicate?"This document was imported before. Review the existing import or add another copy intentionally.":"Nothing is added until you confirm."}</small></div></section>${candidates.map((c)=>reviewCandidate(c,duplicate)).join("") || emptyBlock}</form>`, "import-review-task");
  }

  const IMPORT_FIELD_LABELS={airlineCode:"Airline",flightNumber:"Flight number",departureIata:"From (airport)",arrivalIata:"To (airport)",departureLocalDatetime:"Departs",arrivalLocalDatetime:"Arrives",departureTimezone:"Departure time zone",arrivalTimezone:"Arrival time zone",confirmationNumber:"Confirmation number",serviceNumber:"Service",title:"Name",terminal:"Terminal",gate:"Gate",seat:"Seat",cabinClass:"Cabin",propertyName:"Hotel",checkInDate:"Check-in",checkOutDate:"Check-out",address:"Address",fromLocation:"From",toLocation:"To"};
  const IMPORT_FIELD_ORDER={flight:["airlineCode","flightNumber","departureIata","arrivalIata","departureLocalDatetime","arrivalLocalDatetime","departureTimezone","arrivalTimezone","terminal","gate","seat","cabinClass","confirmationNumber","serviceNumber","title"],hotel:["propertyName","checkInDate","checkOutDate","address","confirmationNumber","title"],train:["fromLocation","toLocation","departureLocalDatetime","arrivalLocalDatetime","departureTimezone","arrivalTimezone","seat","confirmationNumber","title"]};
  function reviewCandidate(c,duplicate){
    const payload=c.payload||{},type=val(c,"candidate_type","type")||"reservation",warnings=payload.warnings||c.warnings||[],confidence=Number(c.confidence||0),ignored=new Set(["warnings","fieldMeta","documentKind","filename","checksum"]),fields=new Map(Object.entries(payload).filter(([key,value])=>!ignored.has(key)&&(typeof value==="string"||typeof value==="number")));
    for(const key of reviewRequiredFields(type))if(!fields.has(key))fields.set(key,"");
    // Drop the standalone flight "Service"/"Name" rows when they just repeat the
    // airline + flight number the summary already shows — keeps the card focused.
    if(type==="flight"){const svc=`${fields.get("airlineCode")||""} ${fields.get("flightNumber")||""}`.trim();for(const key of ["serviceNumber","title"])if(String(fields.get(key)||"").trim()===svc)fields.delete(key);}
    const order=IMPORT_FIELD_ORDER[type];
    const entries=[...fields].sort((a,b)=>{const rank=(k)=>{const i=order?order.indexOf(k):-1;return i<0?900:i;};return rank(a[0])-rank(b[0]);});
    const control=([key,value])=>{const date=key.endsWith("LocalDatetime"),tz=key.toLowerCase().includes("timezone"),label=IMPORT_FIELD_LABELS[key]||statusText(key.replace(/([A-Z])/g," $1"));if(tz&&value)return `<input type="hidden" name="field-${esc(c.id)}-${esc(key)}" value="${esc(value)}" data-field-name="${esc(key)}">`;return `<label class="${tz?"review-field--muted":""}"><span>${esc(tz?"Time zone could not be determined":label)}</span><input type="${date?"datetime-local":"text"}" name="field-${esc(c.id)}-${esc(key)}" value="${esc(value)}" data-field-name="${esc(key)}"${tz?' placeholder="e.g. Europe/Rome" autocapitalize="off" autocorrect="off"':""}>${tz?'<small class="review-hint">Only needed when the airport cannot be recognized.</small>':""}</label>`;};
    const dep=String(fields.get("departureIata")||"").toUpperCase(),arr=String(fields.get("arrivalIata")||"").toUpperCase(),flightLabel=`${fields.get("airlineCode")||""} ${fields.get("flightNumber")||""}`.trim();
    const hero=type==="flight"&&(dep||arr)?`<div class="review-hero"><div class="review-hero__route"><span>${esc(dep||"—")}</span>${icon(transportIcon(type),20)}<span>${esc(arr||"—")}</span></div>${flightLabel?`<div class="review-hero__meta">${esc(flightLabel)}</div>`:""}</div>`:"";
    return `<section class="review-card"><header><span class="review-type">${icon(transportIcon(type),19)} ${esc(statusText(type))}</span><span class="travel-state ${confidence<.7?"travel-state--attention":""}">${confidence<.7?"Check carefully":"Recognized"}</span></header>${warnings.length?`<div class="review-warnings">${warnings.map((w)=>`<p>${icon("warning",16)} ${esc(w)}</p>`).join("")}</div>`:""}${hero}<label><span>Booking type</span><select name="field-${esc(c.id)}-candidateType">${["flight","hotel","train","car","transfer","ferry","cruise","activity","restaurant","reservation","generic_ticket"].map(x=>`<option value="${x}" ${x===type?"selected":""}>${esc(statusText(x))}</option>`).join("")}</select></label><div class="review-fields">${entries.map(control).join("")}</div><div class="review-actions">${duplicate?`<button type="button" class="mobile-secondary-action" data-action="add-duplicate-import" data-id="${esc(c.id)}">Add anyway</button>`:`<button type="button" class="mobile-primary-action" data-action="confirm-import" data-id="${esc(c.id)}">${icon("check",18)} Add to Timeline</button>`}<button type="button" class="review-reject" data-action="reject-import" data-id="${esc(c.id)}">Discard this booking</button></div></section>`;
  }
  // Fills empty departure/arrival time-zone inputs from the airport IATA code so the
  // server can compute scheduled UTC times. Async: waits for the airport catalog.
  async function prefillImportTimezones(form){
    try{await ensureAirportTimezones();}catch{return;}
    const tzFor=(code)=>{const c=String(code||"").trim().toUpperCase();return c?String(globalThis.TriptoAirportTimezones?.timezoneForAirport?.(c)||""):"";};
    for(const card of form.querySelectorAll(".review-card")){
      for(const [tzKey,iataKey] of [["departureTimezone","departureIata"],["arrivalTimezone","arrivalIata"]]){
        const tzInput=card.querySelector(`input[data-field-name="${tzKey}"]`),iataInput=card.querySelector(`input[data-field-name="${iataKey}"]`);
        if(!tzInput||tzInput.value.trim())continue;
        const tz=tzFor(iataInput?.value);
        if(tz){tzInput.value=tz;tzInput.defaultValue=tz;}
      }
    }
  }
  function reviewRequiredFields(type){if(type==="flight")return["airlineCode","flightNumber","departureIata","arrivalIata","departureLocalDatetime","departureTimezone","arrivalLocalDatetime","arrivalTimezone"];if(type==="hotel")return["propertyName","checkInDate","checkOutDate"];return["title"];}
  // Maps a pipeline status to a user-facing label + whether it needs the traveler's attention.
  // Covers the full inbound-email vocabulary: Received, Processing, Added, Needs review, Needs trip, Couldn't read.
  function importDisplayState(row){
    const s=String(row.display_status||row.status||"").toLowerCase();
    const map={
      added:["Added",false],imported:["Added",false],completed:["Added",false],
      processing:["Processing",false],received:["Received",false],
      needs_review:["Needs review",true],needs_confirmation:["Needs review",true],pending:["Needs review",true],changed:["Needs review",true],
      needs_trip:["Needs trip",true],
      couldnt_read:["Couldn't read",true],unsupported:["Couldn't read",true],
    };
    return map[s]||["Needs review",true];
  }
  function importHistoryScreen() {
    const render=(row)=>{const[label,attention]=importDisplayState(row);const title=row.subject || statusText(row.candidate_type || "Booking");return `<div class="import-history-item"><button class="travel-row" data-action="review-import" data-id="${esc(row.id)}"><span class="travel-row__icon">${icon(timelineIcon(row.candidate_type),20)}</span><span class="travel-row__body"><strong>${esc(title)}</strong><small>${esc(row.created_at ? formatDateTime(Number(row.created_at)) : "Date unavailable")}</small><em class="travel-state ${attention?"travel-state--attention":""}">${esc(label)}</em></span>${icon("chevron",18)}</button><button class="import-remove" data-action="remove-import" data-id="${esc(row.id)}" aria-label="Delete ${esc(title)} everywhere">${icon("trash",18)}</button></div>`;};
    const rows = (state.imports || []).map(render).join("");
    return mobilePage("Import History", `<div class="travel-list">${rows || `<section class="mobile-empty"><h1>No imports yet</h1><p>Forwarded bookings you review will appear here.</p></section>`}</div><button class="mobile-secondary-action" data-screen="import">${icon("plus",20)} Import booking</button>`, "account");
  }
  function bookingEmailDisplayStatus(row) {
    if (row.status === "needs_trip" && !row.import_id) return "Forward again";
    if (row.status === "needs_trip") return "Choose a trip";
    if (row.status === "needs_confirmation" || row.import_status === "needs_confirmation") return "Review details";
    if (["completed", "partial"].includes(String(row.import_status))) return "Added";
    if (row.status === "rejected") return "Dismissed";
    return "Couldn’t read";
  }
  function bookingEmailInboxScreen() {
    const signedIn=state.account?.mode === "account";
    const rows=(state.bookingEmails||[]).map((row)=>{
      const legacyNeedsRefwd=row.status === "needs_trip" && !row.import_id;
      const canChoose=row.status === "needs_trip" && Boolean(row.import_id) && Number(row.candidate_count||0)>0;
      const canReview=row.status === "needs_confirmation" && Boolean(row.import_id) && Boolean(row.trip_id);
      const done=["completed","partial"].includes(String(row.import_status));
      const action=canChoose?"choose-booking-email-trip":canReview?"review-booking-email":!done&&row.status!=="rejected"?"dismiss-booking-email":"";
      const actionLabel=canChoose?"Choose trip":canReview?"Review":"Dismiss";
      return `<article class="booking-email-row"><span class="booking-email-row__icon">${icon(timelineIcon(row.candidate_type||"reservation"),20)}</span><div class="booking-email-row__body"><strong>${esc(row.subject||"Booking confirmation")}</strong><small>${esc(row.trip_title?`${row.trip_title} · ${row.received_at?formatDateTime(Number(row.received_at)):"Date unavailable"}`:(row.received_at?formatDateTime(Number(row.received_at)):"Date unavailable"))}</small><em class="travel-state ${done?"":"travel-state--attention"}">${esc(bookingEmailDisplayStatus(row))}</em>${legacyNeedsRefwd?`<span class="booking-email-row__note">Forward this confirmation again. Older messages were not stored.</span>`:""}</div>${action?`<button type="button" class="booking-email-row__action" data-action="${action}" data-id="${esc(row.id)}">${esc(actionLabel)} ${action==="dismiss-booking-email"?"":icon("chevron",17)}</button>`:""}</article>`;
    }).join("");
    const content=!signedIn?`<section class="mobile-empty booking-email-empty"><span>${icon("mail",30)}</span><h1>Sign in to use booking email</h1><p>Google verifies which email address may send confirmations.</p><button class="mobile-primary-action" data-screen="account">Sign in with Google</button></section>`:rows||`<section class="mobile-empty booking-email-empty"><span>${icon("mail",30)}</span><h1>No forwarded confirmations</h1><p>Forward a booking email from your verified Google address. It will appear here for review.</p></section>`;
    return mobilePage("Email Inbox", `<section class="booking-email-address"><small>Forward confirmations to</small><strong>go@tripto.to</strong><p>Choose the trip and confirm the extracted details before anything is added.</p></section><div class="booking-email-list">${content}</div>${signedIn?`<button class="mobile-secondary-action" data-action="refresh-booking-email-inbox">${icon("refresh",18)} Refresh inbox</button>`:""}`, "account");
  }
  async function openBookingEmailReview(email) {
    if (!email?.import_id || !email?.trip_id) throw new Error("Choose a trip before reviewing this confirmation.");
    const trip=state.trips.find((row)=>String(row.id)===String(email.trip_id));
    if (!trip) throw new Error("The assigned trip is unavailable.");
    state.trip=trip;
    localStorage.setItem("tripto_selected_trip",trip.id);
    await loadTripDetails();
    state.importReview=await api(`/api/v1/trips/${encodeURIComponent(trip.id)}/imports/${encodeURIComponent(email.import_id)}`);
    route("import-review",email.import_id);
  }
  function syncScreen() {
    const pending = Number(val(state.syncStatus,"pendingOperations","pending_operations")||0) + pendingMutations().filter((x)=>x.status!=="done").length, conflicts = Number(val(state.syncStatus,"openConflicts","open_conflicts")||0), last = val(state.syncStatus,"lastSuccessfulSyncAt","last_successful_sync_at");
    const details=(state.syncConflicts||[]).map((conflict)=>`<article class="sync-conflict-detail"><strong>${esc(statusText(val(conflict,"entity_type","entityType")||"Saved change"))}</strong><span>${esc(val(conflict,"conflict_type","conflictType")||"A newer server version is available")}</span><small>Nothing was overwritten. This conflict remains preserved for safe review.</small></article>`).join("");
    return focusedTaskPage("Pending Changes", `<section class="sync-summary ${conflicts?"has-conflict":""}"><span>${icon(conflicts?"warning":"refresh",27)}</span><div><strong>${conflicts ? `${conflicts} change${conflicts===1?"":"s"} need review` : pending ? `${pending} change${pending===1?"":"s"} waiting` : "Everything is synced"}</strong><small>${last ? `Last synced ${ageLabel(Number(last))}` : "Last sync time unavailable"}</small></div></section>${conflicts ? `<section class="recovery-card"><h2>Changes requiring review</h2><p>A newer saved version exists. Nothing was overwritten.</p><button class="mobile-primary-action" data-action="sync-review">${details?"Refresh conflict details":"View conflict details"}</button>${details?`<div class="sync-conflict-list">${details}</div>`:""}</section>` : ""}${pending ? `<section class="recovery-card"><h2>Pending local changes</h2><p>Your changes remain safely on this phone until sync succeeds.</p><button class="mobile-secondary-action" data-action="sync-retry">${icon("refresh",20)} Retry</button></section>` : ""}`, "sync-task");
  }
  function accountScreen() {
    const partnerRow = (ic, title, sub, href, sponsored = false) => `<a class="simple-row account-partner-row" href="${esc(href)}" target="_blank" rel="${sponsored ? "sponsored " : ""}noopener noreferrer"><span class="row-icon">${icon(ic,22)}</span><span class="row-copy"><strong>${esc(title)}</strong><span>${esc(sub)}</span></span>${icon("external",18,"chevron")}</a>`;
    const travelServices = `<div class="section-label">Travel essentials</div><div class="account-list account-partners">${partnerRow("flight","Find a flight","Compare routes on Aviasales",AVIASALES_AFFILIATE_URL,true)}${partnerRow("bed","Find a place to stay","Browse stays on Booking.com","https://www.booking.com/",true)}${partnerRow("sim","Travel eSIM","Get connected before you land",routeUrl("esim"))}</div><p class="account-partner-disclosure">Partner links may earn Tripto a commission at no extra cost.</p>`;
    const mode = state.account?.mode || "guest",
      name =
        state.account?.user?.display_name ||
        state.account?.user?.displayName ||
        "Guest traveler",
      initials =
        name
          .split(/\s+/)
          .map((x) => x[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "GT";
    const bytes = state.localDocs.reduce((sum,d)=>sum+Number(d.size||0),0), pending = pendingMutations().filter((x)=>x.status!=="done").length + Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
    const row = (ic,title,sub,screen,action="") => `<button class="simple-row" ${screen?`data-screen="${screen}"`:`data-action="${action}"`}><span class="row-icon">${icon(ic,22)}</span><span class="row-copy"><strong>${title}</strong><span>${esc(sub)}</span></span>${icon("chevron",22,"chevron")}</button>`;
    const google=state.account?.providers?.find((provider)=>provider.provider==="google"&&provider.enabled),identity=state.account?.identities?.find((item)=>item.provider==="google");
    const authBlock=mode==="guest"&&google?`<section class="account-signin"><h2>Keep your trips across devices</h2><p>Continue with Google to attach this phone's trips to your verified account.</p><div id="google-signin-button" data-client-id="${esc(google.clientId)}"></div><p class="signin-error" role="alert" hidden></p></section>`:"";
    const identityEmail = state.account?.user?.primary_email || identity?.email || "Google identity";
    const pendingEmails=(state.bookingEmails||[]).filter((item)=>["needs_trip","needs_confirmation"].includes(String(item.status))).length;
    return `<div class="phone-app"><section class="screen mobile-v1-screen account-v2">${appBar("Account")}<main class="account-section mobile-page"><div class="account-card"><div class="account-profile"><div class="avatar">${esc(initials)}</div><div class="account-profile__id"><strong>${esc(name)}</strong><div class="account-meta">${mode === "account" ? esc(identityEmail) : "Sign in to keep your trips"}</div></div>${mode === "account" ? `<button class="account-signout-btn" data-action="sign-out">Sign out</button>` : ""}</div></div>${authBlock}<div class="section-label">My trips</div><div class="account-list">${row("plus","Create trip","Start planning a new trip","","create-trip")}${row("trips","All trips",`${state.trips.length} trip${state.trips.length===1?"":"s"}`,"trips")}${row("trips","Switch trip",`${state.trips.length} available`,"","switch-trip")}</div>${travelServices}<div class="section-label">Booking email</div><div class="account-list">${row("mail","Email Inbox",mode === "account" ? pendingEmails?`${pendingEmails} waiting for review`:"Forward to go@tripto.to" : "Sign in to verify a sender","booking-email-inbox")}</div><div class="section-label">Preferences</div><div class="account-list">${pending?row("refresh","Pending changes",`${pending} waiting for review or sync`,"sync"):""}${row("info","Take the tour","How tripto.to works","","open-first-run-how")}${row("info","Help, privacy & terms","Support and legal information","","open-help")}</div><div class="section-label">Privacy & data</div><div class="account-list">${row("trash","Remove local data","Clears files and cached trips from this phone only","","remove-local-data")}${mode==="account"?row("warning","Delete my account","Permanently removes your server account and trips","","delete-account"):""}</div><div class="account-footer-brand"><button class="account-brand" data-screen="home" aria-label="Open welcome screen">tripto<span>.</span>to</button><p class="app-version">Product V2</p></div></main>${bottomNav("account")}</section></div>`;
  }

  function rememberPostAuthDestination(screen, tripId = null) {
    try {
      sessionStorage.setItem(
        POST_AUTH_DESTINATION_KEY,
        JSON.stringify({ screen, tripId, savedAt: Date.now() }),
      );
    } catch (_) {}
  }
  async function resumePostAuthDestination() {
    if (!isSignedIn()) return false;
    let destination = null;
    try {
      destination = JSON.parse(
        sessionStorage.getItem(POST_AUTH_DESTINATION_KEY) || "null",
      );
    } catch (_) {}
    const valid =
      ["trips", "collaboration"].includes(destination?.screen) &&
      Number.isFinite(Number(destination.savedAt)) &&
      Date.now() - Number(destination.savedAt) <= 30 * 60 * 1000;
    if (!valid) {
      try { sessionStorage.removeItem(POST_AUTH_DESTINATION_KEY); } catch (_) {}
      return false;
    }
    try { sessionStorage.removeItem(POST_AUTH_DESTINATION_KEY); } catch (_) {}
    if (destination.screen === "trips") {
      route("trips", null, true);
      return true;
    }
    const intendedTrip = destination.tripId
      ? state.trips.find(
          (trip) => String(trip.id) === String(destination.tripId),
        )
      : state.trip;
    if (!intendedTrip) return false;
    if (String(state.trip?.id || "") !== String(intendedTrip.id)) {
      state.trip = intendedTrip;
      localStorage.setItem("tripto_selected_trip", intendedTrip.id);
      await loadTripDetails();
    }
    route("collaboration", null, true);
    await loadCollaboration();
    return true;
  }
  function rememberGoogleSignInDestination(container) {
    if (container.dataset.postAuthScreen === "trips") {
      rememberPostAuthDestination("trips");
      try { sessionStorage.removeItem("tripto_join_token"); } catch (_) {}
      return;
    }
    // A new sign-in elsewhere supersedes an abandoned welcome sign-in.
    try {
      const destination = JSON.parse(sessionStorage.getItem(POST_AUTH_DESTINATION_KEY) || "null");
      if (destination?.screen === "trips") sessionStorage.removeItem(POST_AUTH_DESTINATION_KEY);
    } catch (_) {}
  }
  let googleScriptPromise=null,googleRedirectExchangePromise=null,googleSignInChallenge=null,googleInitializedChallengeId="";
  function loadGoogleIdentityScript(){if(globalThis.google?.accounts?.id)return Promise.resolve();if(googleScriptPromise)return googleScriptPromise;googleScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client?hl=en";script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error("Google sign-in could not load."));document.head.appendChild(script);});return googleScriptPromise;}
  async function setupGoogleSignIn(){const container=document.getElementById("google-signin-button");if(!container||container.dataset.ready)return;container.dataset.ready="1";try{if(!googleAuth)throw new Error("Google sign-in could not load.");const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||"";if(!googleSignInChallenge||Number(googleSignInChallenge.expiresAt||0)<Date.now()+60000)googleSignInChallenge=await api("/api/v1/auth/google/challenge",{method:"POST",body:"{}"});const challenge=googleSignInChallenge;await loadGoogleIdentityScript();if(googleInitializedChallengeId!==challenge.challengeId){const initializeOptions=googleAuth.buildInitializeOptions(challenge,navigator,location.origin);if(initializeOptions.ux_mode==="popup")initializeOptions.callback=async response=>{try{const result=await api("/api/v1/auth/google",{method:"POST",body:JSON.stringify({credential:response.credential,challengeId:challenge.challengeId,nonce:challenge.nonce,timezone:timezone||null})});googleSignInChallenge=null;googleInitializedChallengeId="";state.token=result.session.token;localStorage.setItem("tripto_token",state.token);await loadApp();if(!await resumePostAuthDestination()&&state.screen==="home")route("trips",null,true);showToast("Signed in with Google.");}catch(error){const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error.message;}}};globalThis.google.accounts.id.initialize(initializeOptions);googleInitializedChallengeId=challenge.challengeId;}const buttonOptions=googleAuth.buildButtonOptions(challenge,navigator,location.origin),availableWidth=Math.floor(container.getBoundingClientRect().width||Number(buttonOptions.width)||320);buttonOptions.width=String(Math.max(200,Math.min(Number(buttonOptions.width)||320,availableWidth)));buttonOptions.click_listener=()=>rememberGoogleSignInDestination(container);globalThis.google.accounts.id.renderButton(container,buttonOptions);container.dataset.rendered="1";}catch(error){container.dataset.ready="";const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error?.status>=500?"Google sign-in is not configured for this environment yet.":error.message;}}}
  function clearGoogleRedirectMarker(){googleAuth?.clearRedirectMarker(location,history);googleRedirectMarker=null;}
  async function acknowledgeGoogleRedirectSession(token){
    try{
      const response=await fetch("/api/v1/auth/google/exchange/ack",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:"{}"});
      return response.ok;
    }catch(_){return false;}
  }
  async function exchangeGoogleRedirectSession(){
    if(!googleRedirectMarker)return null;
    if(googleRedirectMarker==="error"){
      clearGoogleRedirectMarker();
      return{ok:false,callbackError:true,error:"Google sign-in could not be completed. Please try again."};
    }
    if(!navigator.onLine)return{ok:false,pending:true,error:"Reconnect to finish signing in. Your saved trip data remains safe."};
    try{
      const response=await fetch("/api/v1/auth/google/exchange",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:"{}"});
      let result=null;
      try{result=await response.json();}catch(_){
        if(response.ok)return{ok:false,pending:true,error:"Google sign-in was interrupted. Try again now."};
      }
      if(!response.ok){
        const failure=googleAuth?.classifyExchangeFailure(response.status,result)||{terminal:false};
        if(failure.terminal){
          clearGoogleRedirectMarker();
          return{ok:false,terminal:true,error:"The secure sign-in handoff expired. Please sign in again."};
        }
        return{ok:false,pending:true,error:result?.error?.message||"Google sign-in was interrupted. Try again now."};
      }
      const token=result?.session?.token;
      if(!token||typeof token!=="string"||token.length>8192||/\s/.test(token))return{ok:false,pending:true,error:"Google sign-in was interrupted. Try again now."};
      const previousToken=state.token;
      state.token=token;
      try{localStorage.setItem("tripto_token",token);}catch(_){
        state.token=previousToken;
        return{ok:false,pending:true,error:"Google sign-in could not be saved on this phone. Check browser storage and try again."};
      }
      clearGoogleRedirectMarker();
      const acknowledged=await acknowledgeGoogleRedirectSession(token);
      return{ok:true,acknowledged};
    }catch(_){
      return{ok:false,pending:true,error:"Google sign-in was interrupted. Check your connection and try again now."};
    }
  }
  async function resumeGoogleRedirectSession(){
    if(googleRedirectExchangePromise)return googleRedirectExchangePromise;
    googleRedirectExchangePromise=(async()=>{
      state.googleAuthHandoffStatus=null;
      state.googleAuthHandoffMessage="";
      state.loading=true;
      render();
      const result=await exchangeGoogleRedirectSession();
      if(result?.pending||result?.terminal){
        state.loading=false;
        state.googleAuthHandoffStatus=result.pending?"pending":"terminal";
        state.googleAuthHandoffMessage=result.error;
        render();
        return result;
      }
      await loadApp();
      if(result?.ok){
        // If sign-in began from an invitation link, a redirect flow can land us
        // back on the app root — restore the pending /join screen so the user can
        // finish accepting. The token was stashed before the redirect.
        let pendingJoin=null;
        try{pendingJoin=sessionStorage.getItem("tripto_join_token");}catch(_){}
        if(pendingJoin&&state.account?.mode==="account"&&state.screen!=="join"){
          state.joinToken=pendingJoin;
          state.joinPreview=null;
          route("join",pendingJoin,true);
          void loadJoinPreview(pendingJoin);
        } else if(!await resumePostAuthDestination()&&state.screen==="home") {
          route("trips",null,true);
        }
        showToast("Signed in with Google.");
      }
      else if(result?.error)showToast(result.error,"alert");
      return result;
    })();
    try{return await googleRedirectExchangePromise;}finally{googleRedirectExchangePromise=null;}
  }
  function quickField(name, label, options = {}) {
    const {
        type = "text",
        required = false,
        wide = true,
        placeholder = "",
        attrs = "",
        choices = "",
        helper = "",
        value = "",
        optional = false,
        autocap = "off",
      } = options,
      resolvedValue = value !== "" ? value : (formPrefill && formPrefill[name] != null ? String(formPrefill[name]) : ""),
      base = `name="${name}" id="form-${name}" ${required ? "required" : ""} ${attrs}`,
      textGuards = `autocapitalize="${autocap}" autocorrect="off" spellcheck="false"`;
    let control;
    if (type === "textarea")
      control = `<textarea ${base} rows="4" placeholder="${esc(placeholder)}" autocapitalize="sentences" autocorrect="on" spellcheck="true">${esc(resolvedValue)}</textarea>`;
    else if (type === "select") {
      const optionValue = String(resolvedValue || ""), selectedChoices = optionValue
        ? choices.replace(
            new RegExp(`(<option\\s+value=["']${optionValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'])(?![^>]*\\sselected)([^>]*>)`),
            "$1 selected$2",
          )
        : choices;
      control = `<select ${base}>${selectedChoices}</select>`;
    }
    else
      control = `<input type="${type}" ${base} autocomplete="off" ${textGuards} placeholder="${esc(placeholder)}" value="${esc(resolvedValue)}">`;
    return `<label class="form-field form-field--${name} ${wide ? "form-field--wide" : ""}" for="form-${name}"><span>${esc(label)}${required ? " <b aria-hidden=\"true\">*</b>" : optional ? " <em class=\"field-optional\">Optional</em>" : ""}</span>${control}${helper ? `<small class="field-helper">${esc(helper)}</small>` : ""}</label>`;
  }
  function selectedPlaceForInput(input) {
    const control = input?.form?.elements?.[`${input.name}Place`];
    if (!control?.value) return null;
    try { return JSON.parse(control.value); } catch (_) { return null; }
  }
  function placeInputValue(place) {
    if (place.type === "airport" && place.iata) return `${place.iata} — ${place.name}`;
    return place.displayName || place.name;
  }
  function samePlaceResult(left, right) {
    if (!left || !right || left.type !== right.type) return false;
    if (String(left.id || "") === String(right.id || "")) return true;
    if (left.type === "airport") {
      const leftCode = String(left.iata || left.icao || "").toUpperCase(),
        rightCode = String(right.iata || right.icao || "").toUpperCase();
      return Boolean(leftCode && rightCode && leftCode === rightCode);
    }
    const leftName = normalizedLocationInput(left.name || left.displayName),
      rightName = normalizedLocationInput(right.name || right.displayName);
    if (!leftName || leftName !== rightName) return false;
    const leftCountry = normalizedLocationInput(left.countryCode || left.countryName),
      rightCountry = normalizedLocationInput(right.countryCode || right.countryName),
      leftRegion = normalizedLocationInput(left.region),
      rightRegion = normalizedLocationInput(right.region);
    if (leftCountry && rightCountry && leftCountry !== rightCountry) return false;
    if (leftRegion && rightRegion && leftRegion !== rightRegion) return false;
    return true;
  }
  function savedPlaceResults(query, types) {
    const wanted = normalizedLocationInput(query);
    if (!wanted) return [];
    return state.locations.filter((location) => {
      const type = String(val(location, "type") || "");
      if (!types.includes(type)) return false;
      const text = [val(location,"display_name","local_name"),val(location,"city"),val(location,"country_name"),val(location,"iata_code"),val(location,"icao_code")].filter(Boolean).join(" ");
      return normalizedLocationInput(text).includes(wanted);
    }).slice(0, 4).map((location) => ({
      id:String(val(location,"place_id") || `saved:${location.id}`),
      type:String(val(location,"type")),
      name:String(val(location,"display_name","local_name") || "Saved place"),
      displayName:String(val(location,"display_name","local_name") || "Saved place"),
      ...(val(location,"local_name") ? {localName:String(location.local_name)} : {}),
      ...(val(location,"country_name") ? {countryName:String(location.country_name)} : {}),
      ...(val(location,"country_code") ? {countryCode:String(location.country_code)} : {}),
      ...(val(location,"region") ? {region:String(location.region)} : {}),
      ...(val(location,"city") ? {cityName:String(location.city)} : {}),
      ...(val(location,"iata_code") ? {iata:String(location.iata_code)} : {}),
      ...(val(location,"icao_code") ? {icao:String(location.icao_code)} : {}),
      ...(val(location,"latitude") != null ? {latitude:Number(location.latitude)} : {}),
      ...(val(location,"longitude") != null ? {longitude:Number(location.longitude)} : {}),
      ...(val(location,"timezone") ? {timezone:String(location.timezone)} : {}),
      savedLocationId:String(location.id),
    }));
  }
  function setManualTimezoneFallback(form, input, visible) {
    const role = input.dataset.locationRole;
    if (!role) return;
    const fallback = form.querySelector(`[data-timezone-fallback-for="${CSS.escape(role)}"]`);
    if (fallback) {
      fallback.hidden = !visible;
      const manual = fallback.querySelector("[data-timezone-manual-for]");
      if (manual) manual.required = visible;
    }
  }
  function bindPlaceAutocomplete(form, input) {
    if (input.dataset.placesBound === "1") return;
    input.dataset.placesBound = "1";
    const types = String(input.dataset.placeTypes || "city,airport").split(",").filter(Boolean),
      preferredType = input.dataset.placePreferred || undefined,
      listId = `${input.id}-place-list`,
      popup = document.createElement("div"),
      fullScreenPanel = input.closest(".trip-create-destination"),
      closeSearchButton = fullScreenPanel?.querySelector("[data-place-search-close]");
    popup.className = "place-suggestions";
    popup.id = listId;
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", input.dataset.placeLabel || "Places");
    popup.hidden = true;
    input.insertAdjacentElement("afterend", popup);
    if (fullScreenPanel)
      input.insertAdjacentHTML("afterend", `<span class="trip-create-destination__search-icon" aria-hidden="true">${icon("search",19)}</span><button type="button" class="trip-create-destination__clear" data-place-search-clear aria-label="Clear destination search" hidden>${icon("close",18)}</button>`);
    const clearSearchButton = fullScreenPanel?.querySelector("[data-place-search-clear]");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");
    let results = [], active = -1, request = 0, timer = 0;
    const snapshot = selectedPlaceForInput(input);
    if (snapshot) input.dataset.selectedValue = input.value;
    const syncClearButton = () => {
      if (clearSearchButton) clearSearchButton.hidden = !input.value;
    };
    syncClearButton();
    const setFullScreen = (open, restoreFocus = false) => {
      if (!fullScreenPanel) return;
      fullScreenPanel.classList.toggle("is-fullscreen", open);
      document.documentElement.classList.toggle("place-search-open", open);
      if (open) {
        fullScreenPanel.setAttribute("role", "dialog");
        fullScreenPanel.setAttribute("aria-modal", "true");
        fullScreenPanel.setAttribute("aria-label", "Search destination");
        closeSearchButton?.removeAttribute("aria-hidden");
        closeSearchButton?.removeAttribute("tabindex");
      } else {
        fullScreenPanel.removeAttribute("role");
        fullScreenPanel.removeAttribute("aria-modal");
        fullScreenPanel.setAttribute("aria-label", "Destination search");
        closeSearchButton?.setAttribute("aria-hidden", "true");
        closeSearchButton?.setAttribute("tabindex", "-1");
      }
      [...(form.closest(".focused-task") || form).querySelectorAll(".app-bar,.mobile-alert,.trip-create-head,.trip-create-fields>*")]
        .filter((element) => element !== fullScreenPanel && !element.contains(fullScreenPanel))
        .forEach((element) => {
          if (open) {
            element.setAttribute("inert", "");
            element.setAttribute("aria-hidden", "true");
            element.dataset.placeSearchHidden = "true";
          } else if (element.dataset.placeSearchHidden === "true") {
            element.removeAttribute("inert");
            element.removeAttribute("aria-hidden");
            delete element.dataset.placeSearchHidden;
          }
        });
      if (restoreFocus) {
        requestAnimationFrame(() => {
          fullScreenPanel.setAttribute("tabindex", "-1");
          fullScreenPanel.focus({ preventScroll:true });
        });
      }
    };
    const close = () => {
      popup.hidden = true;
      fullScreenPanel?.classList.remove("has-results");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const open = () => {
      popup.hidden = false;
      fullScreenPanel?.classList.add("has-results");
      input.setAttribute("aria-expanded", "true");
    };
    const closeFullScreen = (restoreFocus = true) => {
      request += 1;
      window.clearTimeout(timer);
      close();
      setFullScreen(false, restoreFocus);
      saveQuickDraft(form);
    };
    const setActive = (next) => {
      const options = [...popup.querySelectorAll('[role="option"]')];
      if (!options.length) return;
      active = (next + options.length) % options.length;
      options.forEach((option, index) => {
        option.classList.toggle("is-active", index === active);
        option.setAttribute("aria-selected", String(index === active));
      });
      input.setAttribute("aria-activedescendant", options[active].id);
      options[active].scrollIntoView({ block:"nearest" });
    };
    const choose = (place) => {
      const hidden = form.elements[`${input.name}Place`];
      if (!hidden) return;
      const value = placeInputValue(place);
      input.value = value;
      syncClearButton();
      input.dataset.selectedValue = value;
      input.dataset.placeId = place.id;
      const serializedPlace = JSON.stringify(place);
      hidden.value = serializedPlace;
      hidden.setAttribute("value", serializedPlace);
      setManualTimezoneFallback(form, input, false);
      syncQuickTimezone(form, input);
      input.dispatchEvent(new Event("change", { bubbles:true }));
      close();
      if (fullScreenPanel) {
        setFullScreen(false);
        input.blur();
        saveQuickDraft(form);
      } else input.focus({ preventScroll:true });
    };
    const renderResults = (rows) => {
      results = rows;
      active = -1;
      if (!rows.length) {
        popup.innerHTML = `<div class="place-empty" role="status"><strong>No results found</strong><span>Check the spelling or enter this place yourself.</span><button type="button" data-place-manual>Enter manually</button></div>`;
        open();
        return;
      }
      popup.innerHTML = rows.map((place, index) => {
        let secondary = place.type === "airport"
          ? [place.cityName, place.countryName].filter(Boolean).join(" · ")
          : [place.region, place.countryName].filter(Boolean).join(" · ");
        const normalizeLabel = (value) => String(value || "").trim().toLocaleLowerCase();
        if (normalizeLabel(secondary) === normalizeLabel(place.name) || normalizeLabel(secondary) === normalizeLabel(place.displayName)) {
          secondary = place.countryName || place.cityName || "Airport";
        }
        return `<button type="button" class="place-option" id="${listId}-${index}" role="option" aria-selected="false" data-place-index="${index}"><span class="place-option__kind" aria-hidden="true">${icon(place.type === "airport" ? "plane" : "pin", 19)}</span><span class="place-option__copy"><strong>${esc(place.name)}</strong><small>${esc(secondary || place.displayName)}</small></span>${place.iata ? `<b class="place-option__code">${esc(place.iata)}</b>` : `<em class="place-option__type">City</em>`}</button>`;
      }).join("");
      open();
    };
    const search = async (ownRequest = ++request) => {
      const query = input.value.trim();
      if (query.length < 2) { close(); return; }
      popup.innerHTML = `<div class="place-loading" role="status"><span class="button-spinner" aria-hidden="true"></span>Searching places…</div>`;
      open();
      try {
        const places = await ensurePlacesProvider(), offlineRows = await places.provider.searchPlaces(query, { types, preferredType, limit:8 }),
          rows = [...offlineRows, ...savedPlaceResults(query, types)].filter((place, index, all) => all.findIndex((row) => samePlaceResult(row, place)) === index).slice(0, 8);
        if (ownRequest === request) renderResults(rows);
      } catch (_) {
        if (ownRequest !== request) return;
        popup.innerHTML = `<div class="place-empty place-empty--error" role="status"><strong>Place search is unavailable</strong><span>You can retry or continue by entering the location yourself.</span><div><button type="button" data-place-retry>Try again</button><button type="button" data-place-manual>Enter manually</button></div></div>`;
        open();
      }
    };
    const queueSearch = () => {
      window.clearTimeout(timer);
      const ownRequest = ++request;
      timer = window.setTimeout(() => search(ownRequest), 70);
    };
    input.addEventListener("input", () => {
      syncClearButton();
      if (input.dataset.selectedValue !== input.value) {
        const hidden = form.elements[`${input.name}Place`];
        if (hidden) {
          hidden.value = "";
          hidden.setAttribute("value", "");
        }
        delete input.dataset.placeId;
        delete input.dataset.selectedValue;
      }
      queueSearch();
    });
    input.addEventListener("focus", () => {
      if (fullScreenPanel) setFullScreen(true);
      queueSearch();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (popup.hidden) queueSearch();
        else setActive(active + (event.key === "ArrowDown" ? 1 : -1));
        event.preventDefault();
      } else if (event.key === "Enter" && !popup.hidden && results.length) {
        event.preventDefault();
        choose(results[active >= 0 ? active : 0]);
      }
    });
    input.addEventListener("blur", () => window.setTimeout(() => {
      if (!popup.contains(document.activeElement)) close();
    }, 100));
    popup.addEventListener("mousedown", (event) => event.preventDefault());
    popup.addEventListener("click", (event) => {
      const option = event.target.closest("[data-place-index]");
      if (option) { choose(results[Number(option.dataset.placeIndex)]); return; }
      if (event.target.closest("[data-place-retry]")) {
        globalThis.TriptoPlaces?.provider?.retry?.();
        search();
        return;
      }
      if (event.target.closest("[data-place-manual]")) {
        const hidden = form.elements[`${input.name}Place`];
        if (hidden) {
          hidden.value = "";
          hidden.setAttribute("value", "");
        }
        setManualTimezoneFallback(form, input, true);
        if (fullScreenPanel) closeFullScreen();
        else { close(); input.focus(); }
      }
    });
    clearSearchButton?.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles:true }));
      input.focus({ preventScroll:true });
    });
    fullScreenPanel?.addEventListener("keydown", (event) => {
      if (!fullScreenPanel.classList.contains("is-fullscreen")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeFullScreen();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [closeSearchButton, input, clearSearchButton, ...popup.querySelectorAll("button:not([disabled])")]
        .filter((element) => element && !element.hidden && !element.closest("[hidden]") && element.tabIndex >= 0);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    closeSearchButton?.addEventListener("click", () => closeFullScreen());
  }
  function bindDatalistAutocomplete(form, input) {
    if (input.dataset.datalistBound === "1") return;
    const listId = input.getAttribute("list");
    const source = listId ? form.querySelector(`datalist#${CSS.escape(listId)}`) : null;
    if (!source) return;
    input.dataset.datalistBound = "1";
    const values = [...source.querySelectorAll("option")].map((option) => option.value).filter(Boolean);
    input.removeAttribute("list");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    const popupId = `${input.id || input.name}-suggest-list`,
      popup = document.createElement("div");
    popup.className = "place-suggestions";
    popup.id = popupId;
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", input.dataset.suggestLabel || "Suggestions");
    popup.hidden = true;
    input.insertAdjacentElement("afterend", popup);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", popupId);
    input.setAttribute("aria-expanded", "false");
    let matches = [], active = -1;
    const close = () => {
      popup.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const setActive = (next) => {
      const options = [...popup.querySelectorAll('[role="option"]')];
      if (!options.length) return;
      active = (next + options.length) % options.length;
      options.forEach((option, index) => {
        option.classList.toggle("is-active", index === active);
        option.setAttribute("aria-selected", String(index === active));
      });
      input.setAttribute("aria-activedescendant", options[active].id);
      options[active].scrollIntoView({ block: "nearest" });
    };
    const choose = (value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      input.focus({ preventScroll: true });
    };
    const render = () => {
      const query = input.value.trim().toLowerCase();
      matches = (query
        ? values.filter((value) => value.toLowerCase().includes(query))
            .sort((a, b) => a.toLowerCase().indexOf(query) - b.toLowerCase().indexOf(query))
        : values
      ).slice(0, 8);
      active = -1;
      if (!matches.length) { close(); return; }
      popup.innerHTML = matches.map((value, index) =>
        `<button type="button" class="place-option place-option--plain" id="${popupId}-${index}" role="option" aria-selected="false" data-suggest-index="${index}"><span class="place-option__copy"><strong>${esc(value)}</strong></span></button>`,
      ).join("");
      popup.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (popup.hidden) render();
        else setActive(active + (event.key === "ArrowDown" ? 1 : -1));
        event.preventDefault();
      } else if (event.key === "Enter" && !popup.hidden) {
        event.preventDefault();
        if (active >= 0 && matches[active]) choose(matches[active]);
        else close();
      }
    });
    input.addEventListener("blur", () => window.setTimeout(() => {
      if (!popup.contains(document.activeElement)) close();
    }, 100));
    popup.addEventListener("mousedown", (event) => event.preventDefault());
    popup.addEventListener("click", (event) => {
      const option = event.target.closest("[data-suggest-index]");
      if (option) choose(matches[Number(option.dataset.suggestIndex)]);
    });
  }
  function dateRangeField(startName, endName, label, startLabel, endLabel, startValue = "", endValue = "", options = {}) {
    const fieldId = `range-${startName}-${endName}`;
    return `<fieldset class="date-range-field form-field--wide" id="${fieldId}"${options.allowSingle ? ' data-allow-single="true"' : ""}><legend>${esc(label)}</legend><input class="date-range-input" type="hidden" name="${esc(startName)}" id="form-${esc(startName)}"${startValue ? ` value="${esc(startValue)}"` : ""}><input class="date-range-input" type="hidden" name="${esc(endName)}" id="form-${esc(endName)}"${endValue ? ` value="${esc(endValue)}"` : ""}><button class="date-range-trigger" type="button" data-action="open-date-range" data-start-name="${esc(startName)}" data-end-name="${esc(endName)}" data-range-title="${esc(label)}" data-start-label="${esc(startLabel)}" data-end-label="${esc(endLabel)}" aria-label="${esc(label)}. Choose ${esc(startLabel.toLowerCase())}${options.allowSingle ? "" : ` and ${esc(endLabel.toLowerCase())}`}" aria-describedby="${fieldId}-status"><span class="date-range-trigger__icon">${icon("calendar", 20)}</span><span class="date-range-trigger__copy"><small>Select dates</small><strong>Choose dates</strong></span>${icon("chevron", 18)}</button><span class="sr-only" id="${fieldId}-status" aria-live="polite">No date selected.</span></fieldset>`;
  }
  function syncDateRangeField(form, startName, endName) {
    const start = form?.elements[startName], end = form?.elements[endName];
    if (!start || !end) return;
    const field = start.closest(".date-range-field"), trigger = field?.querySelector(".date-range-trigger"), status = field?.querySelector('[aria-live="polite"]');
    if (!trigger) return;
    const copy = trigger.querySelector(".date-range-trigger__copy");
    const allowSingle = field?.dataset.allowSingle === "true";
    if (start.value && (end.value || allowSingle)) {
      copy.innerHTML = `<small>${end.value ? "Selected dates" : "Selected date"}</small><strong>${esc(formatDateOnly(start.value))}${end.value ? ` – ${esc(formatDateOnly(end.value))}` : ""}</strong>`;
      trigger.classList.add("is-selected");
      trigger.setAttribute("aria-label", `${field.querySelector("legend")?.textContent || "Dates"}. ${formatDateOnly(start.value)}${end.value ? ` to ${formatDateOnly(end.value)}` : ""}`);
      if (status) status.textContent = end.value ? `Selected range: ${formatDateOnly(start.value)} to ${formatDateOnly(end.value)}.` : `Selected date: ${formatDateOnly(start.value)}.`;
    } else {
      const startLabel = trigger.dataset.startLabel || "Start date", endLabel = trigger.dataset.endLabel || "End date";
      const skipped = form.elements.datesSkipped?.value === "1";
      copy.innerHTML = skipped
        ? `<small>Travel dates</small><strong>Dates not set</strong>`
        : `<small>Select dates</small><strong>Choose dates</strong>`;
      trigger.classList.remove("is-selected");
      trigger.setAttribute("aria-label", skipped ? `${field.querySelector("legend")?.textContent || "Dates"}. Dates not set. Choose dates.` : `${field.querySelector("legend")?.textContent || "Dates"}. Choose ${startLabel.toLowerCase()} and ${endLabel.toLowerCase()}`);
      if (status) status.textContent = skipped ? "Trip dates are not set." : "No date range selected.";
    }
  }
  function bindDateRangeControls(form) {
    form.querySelectorAll(".date-range-field").forEach((field) => {
      const inputs = field.querySelectorAll(".date-range-input");
      if (inputs.length === 2) syncDateRangeField(form, inputs[0].name, inputs[1].name);
    });
  }
  function quickTripContext() {
    if (!state.trip) return "";
    return `<section class="quick-trip-context" aria-label="Selected trip"><span class="quick-trip-context__icon">${icon("trips", 20)}</span><span><small>Adding to</small><strong>${esc(state.trip.title || "Current trip")}</strong><em>${esc(formatTripDates(state.trip))}</em></span><button type="button" data-action="switch-trip" aria-label="Choose another trip">Change</button></section>`;
  }
  function quickLocationList(kind) {
    const allowed = kind === "flight" ? ["airport"] : kind === "train" ? ["station"] : ["venue", "hotel", "city", "address"],
      rows = state.locations.filter((location) => allowed.includes(String(val(location, "type") || "")));
    if (!rows.length) return "";
    return `<datalist id="quick-${kind}-locations">${rows.map((location) => { const code = val(location, kind === "flight" ? "iata_code" : "station_code"); return `<option value="${esc(`${code ? `${code} — ` : ""}${val(location, "display_name", "local_name") || code || "Location"}`)}"></option>`; }).join("")}</datalist>`;
  }
  const SUGGEST_LISTS = {
    airlines: ["Aegean Airlines","Aer Lingus","Aeroflot","Aeroméxico","Air Canada","Air China","Air France","Air India","Air New Zealand","Alaska Airlines","American Airlines","ANA","Austrian Airlines","Avianca","British Airways","Brussels Airlines","Cathay Pacific","China Eastern","China Southern","Copa Airlines","Delta Air Lines","EasyJet","Egyptair","El Al","Emirates","Ethiopian Airlines","Etihad Airways","Eurowings","EVA Air","Finnair","Frontier Airlines","Iberia","Icelandair","IndiGo","ITA Airways","Japan Airlines","JetBlue","KLM","Korean Air","LATAM","Lufthansa","Malaysia Airlines","Norwegian","Pegasus Airlines","Philippine Airlines","Qantas","Qatar Airways","Royal Air Maroc","Ryanair","SAS","Saudia","Singapore Airlines","Southwest Airlines","Spirit Airlines","Swiss","TAP Air Portugal","Thai Airways","Turkish Airlines","United Airlines","Virgin Atlantic","Vueling","WestJet","Wizz Air"],
    rail: ["Amtrak","Avanti West Coast","Brightline","Deutsche Bahn (DB)","Eurostar","Great Western Railway","Italo","LNER","NS (Nederlandse Spoorwegen)","ÖBB","Renfe","SBB","SNCB","SNCF","Thalys","Trenitalia","TGV INOUI","VIA Rail","Westbahn","ZSSK","Corsica Ferries","DFDS","Grimaldi Lines","GNV","Irish Ferries","Moby Lines","P&O Ferries","Stena Line","Tirrenia","Viking Line"],
    carRental: ["Alamo","Avis","Budget","Dollar","Enterprise","Europcar","Firefly","Goldcar","Hertz","National","Payless","Sixt","Thrifty"],
    cabin: ["Economy","Premium Economy","Business","First"],
    hotel: ["Accor","Best Western","Four Seasons","Hilton","Holiday Inn","Hyatt","IHG","InterContinental","Marriott","Meliá","NH Hotels","Novotel","Radisson","Ritz-Carlton","Sheraton","Sofitel","Westin"],
  };
  let _timezoneOptionsCache = null;
  function timezoneOptions() {
    if (_timezoneOptionsCache) return _timezoneOptionsCache;
    let list = null;
    try { if (typeof Intl.supportedValuesOf === "function") list = Intl.supportedValuesOf("timeZone"); } catch (_) { list = null; }
    if (!list || !list.length) list = ["Europe/London","Europe/Paris","Europe/Berlin","Europe/Rome","Europe/Madrid","Europe/Athens","Europe/Istanbul","Europe/Moscow","Asia/Jerusalem","Asia/Dubai","Asia/Kolkata","Asia/Bangkok","Asia/Singapore","Asia/Hong_Kong","Asia/Shanghai","Asia/Tokyo","Australia/Sydney","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Sao_Paulo","UTC"];
    _timezoneOptionsCache = list;
    return list;
  }
  function dataListMarkup(id, values) {
    return `<datalist id="${id}">${values.map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>`;
  }
  function quickTravelerField() {
    // Single-traveler product for now: hide the Travelers picker entirely
    // (2026-09-01, per user). Re-enable by restoring the block below when
    // multi-traveler bookings ship.
    return "";
    // eslint-disable-next-line no-unreachable
    if (!state.travelers.length) return "";
    const one = state.travelers.length === 1, selected = formPrefill?.travelerIds || null;
    return `<fieldset class="quick-travelers form-field--wide"><legend>Travelers</legend><p>${one ? "Preselected for this booking. You can change it." : "Choose only the travelers on this booking."}</p><div class="traveler-pills">${state.travelers.map((traveler) => `<label class="traveler-pill"><input type="checkbox" name="travelerIds" value="${esc(traveler.id)}" ${(selected ? selected.includes(String(traveler.id)) : one) ? "checked" : ""}><span>${esc(traveler.display_name || "Traveler")}</span></label>`).join("")}</div></fieldset>`;
  }
  function quickMore(kind, label, content) {
    const id = `quick-more-${kind}`;
    return `<section class="form-more"><button type="button" class="form-more-toggle" data-action="toggle-form-more" aria-expanded="false" aria-controls="${id}"><span>${esc(label)}</span><span class="form-more-chevron">${icon("chevronDown", 18)}</span></button><div class="form-more-panel" id="${id}" hidden>${content}</div></section>`;
  }
  function quickDateSuggestions(kind) {
    if (!state.trip) return "";
    const start = val(state.trip, "starts_on", "startsOn"), end = val(state.trip, "ends_on", "endsOn");
    if (kind === "hotel" && start && end)
      return `<div class="date-suggestions" aria-label="Date suggestions"><button type="button" data-action="apply-trip-dates" data-start="${esc(start)}" data-end="${esc(end)}">${icon("calendar",16)}<span>Trip dates <b>${esc(formatDateOnly(start))} – ${esc(formatDateOnly(end))}</b></span></button></div>`;
    return "";
  }
  function noTripQuickAdd(kind, title) {
    return focusedTaskPage(title, `<section class="quick-no-trip"><span>${icon("trips", 30)}</span><h1>Choose a trip first</h1><p>This ${esc(kind)} needs a trip so it cannot become an orphan booking.</p><div class="quick-trip-list">${state.trips.map((trip) => `<button type="button" data-action="select-trip-for-add" data-id="${esc(trip.id)}"><span><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small></span>${icon("chevron", 20)}</button>`).join("")}</div><button class="mobile-primary-action" type="button" data-action="create-trip">Create trip</button></section>`, "form-screen quick-add-screen");
  }
  function basicMobileForm(kind) {
    const editingTraveler = kind === "traveler" && state.editingEntity?.kind === "traveler"
      ? state.travelers.find((traveler) => String(traveler.id) === String(state.editingEntity.id))
      : null;
    const editingTrip = kind === "trip" && state.editingEntity?.kind === "trip" && state.trip ? state.trip : null;
    const tripStart = editingTrip ? String(val(editingTrip, "starts_on", "startsOn") || "") : "";
    const tripEnd = editingTrip ? String(val(editingTrip, "ends_on", "endsOn") || "") : "";
    const configs = {
        trip: { title:editingTrip?"Edit Trip":"Create Trip", lead:editingTrip?"Edit trip":"New trip", fields:[["destination","Destination","text",true,true],["startsOn","Start date","date",true,false],["endsOn","End date","date",true,false],["title","Trip name","text",false,true]] },
        traveler: { title:editingTraveler?"Edit Traveler":"Add Traveler", lead:"Traveler", fields:[["displayName","Name","text",true,true],["travelerType","Traveler type","select",true,true]] },
        checklist: { title:"Add Essential", lead:"Travel essential", fields:[["title","Item","text",true,true],["category","Group","select-checklist",true,true],["priority","Priority","select-priority",true,true]] },
      }, cfg = configs[kind] || configs.trip;
    const tripPlaceholders = { destination: "City, country, or region", title: "e.g. Summer in Italy" };
    const mappedFields = cfg.fields.map(([name,label,type,required,wide]) => {
      let choices="";
      const current=name==="displayName"?val(editingTraveler||{},"display_name"):name==="travelerType"?val(editingTraveler||{},"traveler_type"):(editingTrip&&name==="destination")?val(editingTrip,"title"):"";
      if(type==="select")choices=['adult','child','infant'].map((option)=>`<option value="${option}" ${current===option?"selected":""}>${statusText(option)}</option>`).join("");
      if(type==="select-checklist")choices='<option value="documents">Documents</option><option value="before_you_leave">Before You Leave</option><option value="packing">Packing</option>';
      if(type==="select-priority")choices='<option value="medium">Normal</option><option value="high">Important</option><option value="critical">Critical</option>';
      const attrs = kind === "trip" && name === "destination"
        ? 'data-place-types="city,airport" data-place-preferred="city" data-place-label="Destination cities and airports"'
        : "";
      return kind === "trip" && type === "date" ? "" : quickField(name,label,{type:type.startsWith("select")?"select":type,required,wide,choices,value:current,placeholder:kind==="trip"?(tripPlaceholders[name]||""):"",optional:kind==="trip"&&!required,attrs});
    });
    const editAttrs=editingTraveler?` data-edit-id="${esc(editingTraveler.id)}" data-edit-version="${esc(editingTraveler.version||1)}"`:editingTrip?` data-edit-id="${esc(editingTrip.id)}" data-edit-version="${esc(val(editingTrip,"version")||1)}"`:"";
    const deleteBar=editingTrip?`<button type="button" class="trip-delete-text" data-action="delete-trip">Delete this trip</button>`:"";
    const submitLabel=kind==="trip"?(editingTrip?"Save changes":`Next ${icon("chevron",18)}`):editingTraveler?"Save changes":`Save ${esc(statusText(kind))}`;
    const heading=kind==="trip"?(editingTrip?"Edit trip details":"Where are you going?"):esc(cfg.title);
    const subhead=kind==="trip"?(editingTrip?"<p>Update the name or dates, or delete the trip.</p>":"<p>Pick a place, set your dates, and we’ll build the itinerary around it.</p>"):"";
    const headerActions=`${editingTrip?`<button type="button" class="icon-button app-bar-delete" data-action="delete-trip" aria-label="Delete this trip">${icon("trash",22)}</button>`:""}<button type="submit" form="native-form" class="app-bar-save mobile-primary-action">${submitLabel}</button>`;
    if (kind === "trip") {
      const tripNameField = editingTrip
        ? `<span class="trip-create-details__divider" aria-hidden="true"></span>${mappedFields[3]}`
        : "";
      const tripBody=`<header class="trip-create-head"><div class="trip-create-head__copy"><span class="trip-create-head__eyebrow">${editingTrip?"Trip details":"New journey"}</span><h1>${heading}</h1><div class="trip-create-head__sub">${subhead}</div></div><div class="trip-create-route" aria-hidden="true"><span class="trip-create-route__stop trip-create-route__origin">${icon("globe",18)}</span><i class="trip-create-route__line"></i><span class="trip-create-route__plane">${icon("flight",23)}</span><i class="trip-create-route__line"></i><span class="trip-create-route__stop trip-create-route__destination">${icon("location",20)}</span></div></header><div class="trip-create-fields"><section class="trip-create-destination" aria-label="Destination search"><div class="trip-create-destination__head"><span>${icon("location",22)}</span><div><strong>Choose your destination</strong><small>Search a city, region, or airport</small></div><button type="button" class="trip-create-destination__close icon-button" data-place-search-close aria-label="Back to trip details" aria-hidden="true" tabindex="-1">${icon("back",22)}</button></div>${mappedFields[0]}<input type="hidden" name="destinationPlace" value=""><p class="trip-create-destination__coverage">${icon("globe",15)} Worldwide city and airport search</p><div class="trip-create-search-guide"><small class="trip-create-search-guide__eyebrow">Explore worldwide</small><strong>Where will you go next?</strong><p>Search cities, countries, regions, or airport codes.</p><small class="trip-create-search-guide__privacy">${icon("lock",15)} Private on this phone · ready offline</small></div></section><section class="trip-create-details" aria-label="Trip dates">${dateRangeField("startsOn", "endsOn", "Travel dates", "Start date", "End date", tripStart, tripEnd)}<input type="hidden" name="datesSkipped" value="${editingTrip && !tripStart && !tripEnd ? "1" : ""}">${tripNameField}</section><p class="trip-create-reassurance">${icon("check",16)} You can change every detail later.</p>${deleteBar}</div>`;
      return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form trip-create-form" id="native-form" data-kind="trip"${editAttrs} novalidate>${tripBody}</form>`, "form-screen trip-create-screen", headerActions);
    }
    return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form" id="native-form" data-kind="${esc(kind)}"${editAttrs} novalidate><section class="form-section"><header><span>${esc(cfg.lead)}</span><h1>${esc(cfg.title)}</h1></header><div class="form-fields">${mappedFields.join("")}</div></section></form>`, "form-screen", headerActions);
  }
  function zonedDateTimeParts(ms, timeZone) {
    const value = Number(ms);
    if (!value) return { date: "", time: "" };
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)), row = {};
      parts.forEach((part) => { if (part.type !== "literal") row[part.type] = part.value; });
      return { date: `${row.year}-${row.month}-${row.day}`, time: `${row.hour}:${row.minute}` };
    } catch (_) {
      return { date: "", time: "" };
    }
  }
  function locationInputValue(id, kind) {
    const loc = locationById(id);
    if (!loc) return "";
    const code = String(val(loc, kind === "flight" ? "iata_code" : "station_code") || "").trim(),
      name = String(val(loc, "display_name", "local_name", "formatted_address") || "").trim();
    return code && name ? `${code} — ${name}` : name || code;
  }
  function travelerIdList(entity) {
    return String(val(entity, "traveler_ids") || "").split(",").map((id) => id.trim()).filter(Boolean);
  }
  const MANUAL_DETAIL_LABELS = Object.freeze({
    Date: "date",
    To: "endLocation",
    "Return / end date": "endDate",
    Guests: "guests",
    Vehicle: "vehicle",
    Driver: "driver",
    Ship: "ship",
    Cabin: "cabin",
    Deck: "deck",
    Embarkation: "embarkation",
    "Seat / section": "seatSection",
    Address: "streetAddress",
    Platform: "platform",
    Coach: "coach",
    Contact: "contact",
    "Reservation window": "reservationWindow",
  });
  function parseManualDetailNotes(value) {
    const details = { notes: "", timeUnset: false }, free = [];
    String(value || "").split(/\s+·\s+|\n+/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      if (part === "Time not set yet") { details.timeUnset = true; return; }
      const match = part.match(/^([^:]{1,40}):\s*(.*)$/), key = match ? MANUAL_DETAIL_LABELS[match[1]] : null;
      if (key && match[2]) details[key] = match[2];
      else if (match?.[1] === "Notes") free.push(match[2]);
      else free.push(part);
    });
    details.notes = free.filter(Boolean).join(" · ");
    return details;
  }
  function buildManualDetailNotes(entries, userNotes = "") {
    return [
      ...entries.map(([label, value]) => String(value || "").trim() ? `${label}: ${String(value).trim()}` : ""),
      String(userNotes || "").trim() ? `Notes: ${String(userNotes).trim()}` : "",
    ].filter(Boolean).join(" · ") || null;
  }
  function directItemContactById(id, type) {
    return state.contacts.find((contact) =>
      String(contact.trip_item_id || "") === String(id || "") && (!type || contact.contact_type === type),
    ) || null;
  }
  function directItemContact(item, type) {
    return directItemContactById(item ? itemId(item) : "", type);
  }
  function buildBookingPrefill(kind, entity) {
    const baseKind = bookingBaseKind(kind);
    if (baseKind === "hotel") {
      const contact = directItemContact(entity, "hotel") || contactFor(entity, "hotel") || {},
        location = locationById(val(entity, "property_location_id", "start_location_id")) || {},
        locationName = String(val(location, "city") || (["city", "airport"].includes(String(val(location, "type") || "")) ? val(location, "display_name", "local_name") : val(location, "formatted_address")) || "");
      return {
        propertyName: String(val(entity, "property_name", "title") || ""),
        checkInDate: String(val(entity, "check_in_date") || ""),
        checkOutDate: String(val(entity, "check_out_date") || ""),
        location: locationName,
        streetAddress: String(val(location, "local_address", "formatted_address") || ""),
        checkInFrom: String(val(entity, "check_in_from") || ""),
        checkInUntil: String(val(entity, "check_in_until") || ""),
        checkOutBy: String(val(entity, "check_out_by") || ""),
        confirmationNumber: String(val(entity, "confirmation_number") || ""),
        roomName: String(val(entity, "room_name") || ""),
        bookingStatus: String(val(entity, "booking_status") || ""),
        phone: String(val(contact, "phone") || ""),
        email: String(val(contact, "email") || ""),
        notes: String(val(contact, "notes") || ""),
        travelerIds: travelerIdList(entity),
      };
    }
    if (baseKind === "flight") {
      const detail = detailFor(entity) || {}, contact = directItemContact(entity, "airline") || {},
        dep = zonedDateTimeParts(val(entity, "scheduled_departure_utc", "starts_at_utc"), val(entity, "departure_timezone", "start_timezone")),
        arr = zonedDateTimeParts(val(entity, "scheduled_arrival_utc", "ends_at_utc"), val(entity, "arrival_timezone", "end_timezone")),
        boarding = zonedDateTimeParts(val(entity, "boarding_time_utc"), val(entity, "departure_timezone", "start_timezone")),
        gateClose = zonedDateTimeParts(val(entity, "gate_close_time_utc"), val(entity, "departure_timezone", "start_timezone"));
      return {
        flightNumber: compactFlightNumber(entity),
        fromLocation: locationInputValue(val(entity, "departure_location_id", "start_location_id"), "flight"),
        toLocation: locationInputValue(val(entity, "arrival_location_id", "end_location_id"), "flight"),
        departureDate: dep.date, departureLocalTime: dep.time,
        departureTimezone: String(val(entity, "departure_timezone", "start_timezone") || ""),
        arrivalTimezone: String(val(entity, "arrival_timezone", "end_timezone") || ""),
        arrivalDate: arr.date, arrivalLocalTime: arr.time,
        carrierName: String(val(entity, "carrier_name") || ""),
        operatingAirlineCode: String(val(entity, "operating_airline_code") || ""),
        departureTerminal: String(val(entity, "departure_terminal") || ""),
        boardingTime: boarding.time, gateCloseTime: gateClose.time,
        seat: String(val(detail, "seat") || ""),
        cabin: String(val(detail, "cabin_class", "cabin") || ""),
        checkedBags: val(detail, "checked_bags") != null ? String(detail.checked_bags) : "",
        bookingReference: String(val(entity, "booking_reference") || ""),
        ticketNumber: String(val(detail, "ticket_number") || ""),
        notes: String(val(contact, "notes") || ""),
        travelerIds: travelerIdList(entity),
      };
    }
    if (baseKind === "train") {
      const detail = detailFor(entity) || {}, contact = directItemContact(entity, "other") || {}, details = parseManualDetailNotes(val(contact, "notes")),
        dep = zonedDateTimeParts(val(entity, "scheduled_departure_utc", "starts_at_utc"), val(entity, "departure_timezone", "start_timezone")),
        arr = zonedDateTimeParts(val(entity, "scheduled_arrival_utc", "ends_at_utc"), val(entity, "arrival_timezone", "end_timezone"));
      return {
        fromLocation: locationInputValue(val(entity, "departure_location_id", "start_location_id"), "train"),
        toLocation: locationInputValue(val(entity, "arrival_location_id", "end_location_id"), "train"),
        departureDate: dep.date, departureLocalTime: dep.time,
        departureTimezone: String(val(entity, "departure_timezone", "start_timezone") || ""),
        arrivalTimezone: String(val(entity, "arrival_timezone", "end_timezone") || ""),
        arrivalDate: arr.date, arrivalLocalTime: arr.time,
        serviceNumber: String(val(entity, "service_number") || ""),
        carrierName: String(val(entity, "carrier_name") || ""),
        platform: String(val(entity, "departure_platform", "platform") || val(detail, "platform") || details.platform || ""),
        coach: String(val(detail, "coach") || details.coach || ""),
        seat: String(val(detail, "seat") || ""),
        vehicle: String(details.vehicle || ""),
        bookingReference: String(val(entity, "booking_reference") || ""),
        checkedBags: val(detail, "checked_bags") != null ? String(detail.checked_bags) : "",
        notes: String(details.notes || ""),
        travelerIds: travelerIdList(entity),
      };
    }
    if (baseKind === "transport") {
      const depZone = String(val(entity, "departure_timezone", "start_timezone") || ""),
        arrZone = String(val(entity, "arrival_timezone", "end_timezone") || depZone),
        dep = zonedDateTimeParts(val(entity, "scheduled_departure_utc", "starts_at_utc"), depZone),
        arr = zonedDateTimeParts(val(entity, "scheduled_arrival_utc", "ends_at_utc"), arrZone),
        from = locationInputValue(val(entity, "departure_location_id", "start_location_id"), "reservation"),
        to = locationInputValue(val(entity, "arrival_location_id", "end_location_id"), "reservation"),
        contact = directItemContact(entity, kind === "car-rental" ? "rental_car" : kind === "bus" ? "other" : "driver") || {},
        details = parseManualDetailNotes(val(contact, "notes"));
      return {
        title: String(val(entity, "carrier_name", "title") || ""),
        location: from,
        endLocation: to,
        reservationDate: dep.date,
        reservationTime: dep.time,
        endDate: arr.date,
        endTime: arr.time,
        timezone: depZone,
        endTimezone: arrZone !== depZone ? arrZone : "",
        confirmationNumber: String(val(entity, "booking_reference") || ""),
        vehicle: String(val(entity, "service_number") || details.vehicle || ""),
        driver: String(details.driver || ""),
        phone: String(val(contact, "phone") || ""),
        notes: String(details.notes || ""),
        travelerIds: travelerIdList(entity),
      };
    }
    // activity or reservation
    const tz = String(val(entity, "timezone", "start_timezone") || ""),
      start = zonedDateTimeParts(val(entity, "starts_at_utc"), tz),
      end = zonedDateTimeParts(val(entity, "ends_at_utc"), tz),
      rawNotes = String(val(entity, "notes", "activity_notes", "reservation_notes") || ""),
      details = parseManualDetailNotes(rawNotes),
      contactType = kind === "restaurant" ? "other" : ["cruise","activity","tour","attraction","event"].includes(kind) ? "tour_operator" : "other",
      providerContact = directItemContact(entity, contactType) || contactFor(entity, contactType) || {},
      location = locationById(val(entity, "start_location_id", "venue_location_id")) || {},
      dateName = baseKind === "activity" ? "activityDate" : "reservationDate",
      timeName = baseKind === "activity" ? "activityTime" : "reservationTime",
      hasTime = Number(val(entity, "starts_at_utc")) > 0;
    return {
      title: String(val(entity, "title") || ""),
      provider: String(val(providerContact, "display_name") || (kind === "cruise" ? val(entity, "title") : "") || ""),
      [dateName]: start.date || details.date || "",
      [timeName]: start.time,
      timezone: tz,
      timeMode: hasTime ? "specific" : "unset",
      endDate: end.date || details.endDate || "",
      endTime: end.time,
      location: String(kind === "restaurant" ? val(location, "city", "display_name", "local_name") : val(location, "display_name", "local_name") || ""),
      streetAddress: String(val(location, "local_address", "formatted_address") || details.streetAddress || ""),
      endLocation: String(details.endLocation || ""),
      guests: String(details.guests || ""),
      vehicle: String(details.vehicle || ""),
      driver: String(details.driver || ""),
      ship: String(details.ship || ""),
      cabin: String(details.cabin || ""),
      deck: String(details.deck || ""),
      embarkation: String(details.embarkation || ""),
      seatSection: String(details.seatSection || ""),
      contact: String(details.contact || ""),
      phone: String(val(providerContact, "phone") || ""),
      activityType: String(val(entity, "activity_type") || ""),
      reservationType: String(val(entity, "reservation_type") || ""),
      confirmationNumber: String(val(entity, "reference", "confirmation_number", "reservation_reference") || ""),
      notes: String(details.notes || ""),
      travelerIds: travelerIdList(entity),
    };
  }
  function manualRouteCard(kind, from = {}, to = {}) {
    const airport = kind === "flight";
    const fromName = from.name || "fromLocation",
      toName = to.name || "toLocation";
    const placeAttrs = airport
      ? 'data-place-types="airport" data-place-preferred="airport"'
      : from.list
        ? `list="${esc(from.list)}"`
        : "";
    const toAttrs = airport
      ? 'data-place-types="airport" data-place-preferred="airport"'
      : to.list
        ? `list="${esc(to.list)}"`
        : "";
    const fromPlace = airport
        ? fromName === "fromLocation"
          ? '<input type="hidden" name="fromLocationPlace" value="">'
          : `<input type="hidden" name="${esc(fromName)}Place" value="">`
        : "",
      toPlace = airport
        ? toName === "toLocation"
          ? '<input type="hidden" name="toLocationPlace" value="">'
          : `<input type="hidden" name="${esc(toName)}Place" value="">`
        : "";
    return `<section class="manual-route-card" aria-label="${esc(from.label || "From")} to ${esc(to.label || "To")}"><div class="manual-route-card__field">${quickField(fromName, from.label || "From", { required: from.required !== false, placeholder: from.placeholder || "Enter location", attrs: `${placeAttrs} data-location-role="departure" data-place-label="${esc(from.aria || from.label || "Departure locations")}"` })}${fromPlace}</div><span class="manual-route-card__line" aria-hidden="true">${icon(kind === "flight" ? "flight" : kind === "ferry" ? "ferry" : kind === "cruise" ? "cruise" : kind === "train" ? "train" : "chevron", 20)}</span><div class="manual-route-card__field">${quickField(toName, to.label || "To", { required: to.required !== false, placeholder: to.placeholder || "Enter location", attrs: `${toAttrs} data-location-role="arrival" data-place-label="${esc(to.aria || to.label || "Arrival locations")}"` })}${toPlace}</div></section>`;
  }
  function manualAttachmentSize(value) {
    const bytes = Number(value) || 0;
    return bytes < 1048576
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
  }
  function manualAttachmentRows(scope) {
    const record = cachedManualAttachment(scope),
      rows = record?.files || [];
    if (!rows.length)
      return `<p class="manual-attachments__empty">No files selected. You can save the booking without one.</p>`;
    return rows.map((row) => {
      const status = String(record?.status || "staged").toLowerCase(),
        failed = ["failed", "error"].includes(status),
        key = manualAttachmentKey(scope);
      const selectedType = String(row.type || record?.type || "other"), typeOptions = [
        ["boarding_pass", "Boarding pass"], ["ticket", "Ticket"],
        ["hotel_confirmation", "Hotel confirmation"], ["reservation", "Reservation / voucher"],
        ["qr_code", "QR code"], ["other", "Other document"],
      ].map(([value, label]) => `<option value="${value}"${selectedType === value ? " selected" : ""}>${label}</option>`).join("");
      return `<div class="manual-attachment-row document-attachment" data-attachment-id="${esc(row.id)}"><span class="manual-attachment-row__icon">${icon("document", 20)}</span><span class="manual-attachment-row__copy"><strong>${esc(row.name || "Travel document")}</strong><small>${esc(row.sizeLabel || manualAttachmentSize(row.size))}</small><label class="manual-attachment-row__type"><span class="sr-only">Document type for ${esc(row.name || "document")}</span><select data-manual-attachment-type data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Document type for ${esc(row.name || "document")}">${typeOptions}</select></label><em class="manual-attachment-row__status ${failed ? "is-error" : ""}">${failed ? "Needs attention" : status === "linked" ? "Available on this device" : "Ready to attach"}</em></span><button type="button" data-action="manual-attachment-open" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Open ${esc(row.name || "document")}">Open</button>${failed ? `<button type="button" data-action="manual-attachment-retry" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Retry ${esc(row.name || "document")}">${icon("refresh", 18)}</button>` : ""}<button type="button" data-action="manual-attachment-remove" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Remove ${esc(row.name || "document")}">${icon("close", 18)}</button></div>`;
    }).join("");
  }
  function manualAttachmentsSection(kind, scope) {
    const suggested = manualBookingConfig(kind)?.documentType || "other",
      key = manualAttachmentKey(scope);
    const options = [
      ["boarding_pass", "Boarding pass"], ["ticket", "Ticket"],
      ["hotel_confirmation", "Hotel confirmation"], ["reservation", "Reservation / voucher"],
      ["qr_code", "QR code"], ["other", "Other document"],
    ];
    return `<section class="manual-attachments" aria-labelledby="manual-attachments-title"><header><span>${icon("document", 20)}</span><div><h2 id="manual-attachments-title">Tickets &amp; Documents</h2><p>Optional · Stored on this device</p></div></header><label class="manual-attachments__picker" for="form-manualAttachments"><span class="manual-attachments__picker-icon">${icon("plus", 20)}</span><span class="manual-attachments__picker-copy"><strong>Add files</strong><small>PDF, images, or passes · up to 10 MB each</small></span><input class="sr-only" id="form-manualAttachments" name="manualAttachments" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pkpass" multiple data-manual-attachments data-scope="${esc(key)}"></label><label class="form-field manual-attachments__type" for="form-manualDocumentType"><span>Suggested type <small>Optional</small></span><select id="form-manualDocumentType" name="manualDocumentType" aria-label="Suggested document type">${options.map(([value, label]) => `<option value="${value}"${value === suggested ? " selected" : ""}>${label}</option>`).join("")}</select></label><div class="manual-attachments__list" data-manual-attachment-list data-scope="${esc(key)}" aria-live="polite">${manualAttachmentRows(scope)}</div></section>`;
  }
  async function refreshManualAttachmentPanel(form, hydrate = false) {
    const scope = form?.dataset.attachmentScope;
    const panel = form?.querySelector("[data-manual-attachment-list]");
    if (!scope || !panel) return null;
    const record = hydrate ? await listManualAttachments(scope) : cachedManualAttachment(scope);
    if (document.contains(form)) {
      panel.innerHTML = manualAttachmentRows(scope);
      if (hydrate && record?.files?.length) {
        form.dataset.hasStagedAttachments = "true";
        formHasMeaningfulChanges = true;
      }
    }
    return record;
  }
  function mobileFormScreen() {
    const kind = String(state.selectedId || "trip");
    if (!QUICK_ADD_KINDS.has(kind)) { formPrefill = null; return basicMobileForm(kind); }
    const config = manualBookingConfig(kind), baseKind = bookingBaseKind(kind);
    const editingRecord = state.editingEntity && state.editingEntity.kind === kind ? findBookingRecord(kind, state.editingEntity.id) : null;
    formPrefill = editingRecord ? buildBookingPrefill(kind, editingRecord.entity) : null;
    const isReturnFlight = !editingRecord && kind === "flight" && Boolean(state.pendingReturnFlight);
    if (isReturnFlight) formPrefill = state.pendingReturnFlight;
    const editId = editingRecord ? itemId(editingRecord.entity) : "", editVersion = editingRecord ? Number(val(editingRecord.entity, "version")) || 1 : 0;
    const title = kind === "document" ? "Add Document" : `${editingRecord ? "Edit" : isReturnFlight ? "Add return" : "Add"} ${config?.shortLabel || config?.label || statusText(kind)}`;
    if (!state.trip) return noTripQuickAdd(kind, title);
    const editing = Boolean(editingRecord), dateDefault = editing ? "" : isReturnFlight ? String(val(state.trip, "ends_on", "endsOn") || "") : String(val(state.trip, "starts_on", "startsOn") || ""), tzDefault = editing ? "" : tripDefaultTimezone(), attachmentScope = manualAttachmentScope(kind, editId);
    // Timezones are derived from the selected location (TripIt-style), never
    // entered by hand. Each booking still persists a timezone, so we render the
    // tz control as a hidden input seeded with the best fallback (trip's
    // dominant zone → this device's zone → UTC) and let syncQuickTimezone()
    // overwrite it the moment a location resolves a real zone.
    const tzFallback = tripDefaultTimezone() || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } })();
    const hiddenTz = (name, role) => {
      const seed = (formPrefill && formPrefill[name] != null && String(formPrefill[name])) || tzFallback;
      return `<input type="hidden" name="${esc(name)}"${role ? ` data-timezone-role="${esc(role)}"` : ""} data-default-timezone="${esc(tzFallback)}" value="${esc(seed)}">`;
    };
    let primary="", moreContent="", note="", list="", dataLists="", extraClass="";
    if (kind === "flight") {
      list = quickLocationList("flight");
      dataLists = dataListMarkup("suggest-airlines",SUGGEST_LISTS.airlines)+dataListMarkup("suggest-cabin",SUGGEST_LISTS.cabin)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${isReturnFlight ? `<div class="round-trip-banner form-field--wide">${icon("navigation",16)}<span>Return flight — route reversed. Set the departure date and time.</span></div>` : ""}${!editing && !isReturnFlight ? `<label class="round-trip-toggle form-field--wide"><span class="round-trip-toggle__copy"><strong>Round trip</strong><small>Choose both dates in one calendar</small></span><input type="checkbox" name="roundTrip" value="1" role="switch"><span class="round-trip-toggle__track" aria-hidden="true"><span class="round-trip-toggle__thumb"></span></span></label>` : ""}${quickField("carrierName","Airline",{required:true,placeholder:"Airline name",attrs:'list="suggest-airlines"'})}${quickField("flightNumber","Flight number",{required:true,placeholder:"LY 383"})}${manualRouteCard(kind,{label:"From",placeholder:"Airport or code"},{label:"To",placeholder:"Airport or code"})}<input type="hidden" name="departureTimezone" id="form-departureTimezone" data-timezone-role="departure" value="${esc(formPrefill?.departureTimezone||"")}"><input type="hidden" name="arrivalTimezone" id="form-arrivalTimezone" data-timezone-role="arrival" value="${esc(formPrefill?.arrivalTimezone||"")}"><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="departure" hidden><span>Origin timezone <b aria-hidden="true">*</b></span><input type="text" name="departureTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="departureTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="arrival" hidden><span>Arrival timezone</span><input type="text" name="arrivalTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="arrivalTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label>${dateRangeField("departureDate", "returnDepartureDate", "Travel dates", "Departure", "Return", dateDefault, "", {allowSingle:true})}<div class="form-fields form-fields--date-time">${quickField("departureLocalTime","Departure time",{type:"time",required:true,wide:false})}${!editing && !isReturnFlight ? `<div class="round-trip-return" data-round-trip-return hidden>${quickField("returnDepartureLocalTime","Return time",{type:"time",wide:false})}</div>` : ""}</div>${quickDateSuggestions(kind)}`;
      moreContent = `<div class="form-fields"><div class="form-fields--date-time">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}</div>${quickField("operatingAirlineCode","Operating airline",{attrs:'list="suggest-airlines"'})}${quickField("departureTerminal","Terminal",{wide:false})}${quickField("departureGate","Gate",{wide:false})}${quickField("boardingTime","Boarding time",{type:"time",wide:false})}${quickField("gateCloseTime","Gate closes",{type:"time",wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("cabin","Cabin",{wide:false,attrs:'list="suggest-cabin"'})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickField("bookingReference","PNR",{wide:false})}${quickField("ticketNumber","Ticket number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Airport timezones are set from the selected airports. Scheduled information is never presented as live.";
    } else if (kind === "hotel") {
      dataLists = dataListMarkup("suggest-hotels",SUGGEST_LISTS.hotel) + quickLocationList("reservation");
      primary = `${quickField("propertyName","Property name",{required:true,placeholder:"Hotel or stay name",attrs:'list="suggest-hotels"'})}${quickField("location","City / location",{optional:true,placeholder:"Search city or airport",attrs:'data-place-types="city,airport" data-place-preferred="city" data-place-label="Hotel cities and airports"'})}<input type="hidden" name="locationPlace" value="">${dateRangeField("checkInDate", "checkOutDate", "Stay dates", "Check-in", "Check-out", formPrefill?.checkInDate||"", formPrefill?.checkOutDate||"")}`;
      moreContent = `<div class="form-fields">${quickField("streetAddress","Address",{placeholder:"Street address",optional:true})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("checkInFrom","Check-in from",{type:"time",wide:false})}${quickField("checkInUntil","Check-in until",{type:"time",wide:false})}${quickField("checkOutBy","Check-out by",{type:"time",wide:false})}${quickField("roomName","Room name or type",{})}${quickField("bookingStatus","Booking status",{})}${quickTravelerField()}${quickField("phone","Hotel phone",{type:"tel",wide:false})}${quickField("email","Hotel email",{type:"email",wide:false})}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Use the single calendar to choose check-in and check-out dates.";
    } else if (["train","ferry"].includes(kind)) {
      const ferry = kind === "ferry";
      list = quickLocationList("train");
      dataLists = dataListMarkup("suggest-rail",SUGGEST_LISTS.rail)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${manualRouteCard(kind,{label:ferry?"Departure port":"From station",placeholder:ferry?"Departure port":"Station",list:"quick-train-locations"},{label:ferry?"Arrival port":"To station",placeholder:ferry?"Arrival port":"Station",list:"quick-train-locations"})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>`;
      moreContent = `<div class="form-fields">${hiddenTz("departureTimezone","departure")}${hiddenTz("arrivalTimezone","arrival")}${quickField("carrierName",ferry?"Ferry operator":"Train operator",{attrs:'list="suggest-rail"',optional:true})}${quickField("serviceNumber",ferry?"Sailing number":"Train / service number",{optional:true})}<div class="form-fields--date-time">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}</div>${quickField("platform",ferry?"Pier / berth":"Platform",{wide:false})}${quickField("coach","Coach / cabin",{wide:false})}${quickField("seat","Seat",{wide:false})}${ferry ? quickField("vehicle","Vehicle",{optional:true,placeholder:"Vehicle or registration"}) : ""}${quickField("bookingReference","Booking reference",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = `${ferry ? "Ports" : "Stations"} remain manual or use saved trip locations; the app does not pretend the city index is a station directory.`;
    } else if (kind === "car-rental") {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-carrental",SUGGEST_LISTS.carRental)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Rental company",{required:true,placeholder:"Company",attrs:'list="suggest-carrental"'})}${manualRouteCard(kind,{name:"location",label:"Pickup location",placeholder:"Airport, city, or address",list:"quick-reservation-locations"},{name:"endLocation",label:"Drop-off location",placeholder:"Airport, city, or address",list:"quick-reservation-locations"})}${dateRangeField("reservationDate", "endDate", "Rental dates", "Pickup", "Drop-off", formPrefill?.reservationDate||dateDefault, formPrefill?.endDate||"")}<div class="form-fields form-fields--date-time">${quickField("reservationTime","Pickup time",{type:"time",required:true,wide:false})}${quickField("endTime","Drop-off time",{type:"time",optional:true,wide:false})}</div><input type="hidden" name="transportType" value="car">`;
      moreContent = `<div class="form-fields">${hiddenTz("timezone","departure")}${hiddenTz("endTimezone","arrival")}${quickField("vehicle","Vehicle / class",{})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("driver","Driver name",{})}${quickField("phone","Rental phone",{type:"tel"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Pickup and drop-off are kept together as one rental booking.";
    } else if (["transfer","bus","taxi"].includes(kind)) {
      const isBus = kind === "bus", isTaxi = kind === "taxi",
        providerLabel = isBus ? "Bus operator" : isTaxi ? "Company / driver" : "Provider / driver",
        fromLabel = isBus ? "Departure stop" : "From",
        toLabel = isBus ? "Arrival stop" : "To",
        dateLabel = isBus ? "Departure date" : "Pickup date",
        timeLabel = isBus ? "Departure time" : "Pickup time";
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title",providerLabel,{optional:true,placeholder:"Optional"})}${manualRouteCard(kind,{name:"location",label:fromLabel,placeholder:isBus?"Station or stop":"Pickup location",list:"quick-reservation-locations"},{name:"endLocation",label:toLabel,placeholder:isBus?"Station or stop":"Destination",list:"quick-reservation-locations"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate",dateLabel,{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime",timeLabel,{type:"time",required:true,wide:false})}</div><input type="hidden" name="transportType" value="${esc(manualBookingConfig(kind)?.subtype || "transfer")}">`;
      moreContent = `<div class="form-fields">${hiddenTz("timezone","departure")}${hiddenTz("endTimezone","arrival")}${quickField("confirmationNumber","Confirmation number",{})}${quickField("phone",isBus?"Operator phone":"Driver / provider phone",{type:"tel"})}${quickField("vehicle",isBus?"Service number / coach":"Vehicle",{optional:true})}${quickField("driver","Driver name",{optional:true})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = isBus ? "Add the confirmed departure details shown on your ticket." : "Only confirmed pickup details are shown in the Timeline.";
    } else if (kind === "cruise") {
      list = quickLocationList("activity");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("provider","Cruise line",{required:true,placeholder:"Cruise line"})}${manualRouteCard(kind,{name:"location",label:"Departure port",placeholder:"Port",list:"quick-activity-locations"},{name:"endLocation",label:"Arrival / return port",placeholder:"Port",list:"quick-activity-locations"})}<div class="form-fields form-fields--date-time">${quickField("activityDate","Departure date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("activityTime","Departure time",{type:"time",optional:true,wide:false})}</div>${quickField("endDate","Return / arrival date",{type:"date",optional:true})}<input type="hidden" name="timeMode" value="specific"><input type="hidden" name="activityType" value="cruise">`;
      moreContent = `<div class="form-fields">${hiddenTz("timezone","departure")}${quickField("ship","Ship",{optional:true,placeholder:"Ship name"})}${quickField("title","Cruise name",{optional:true,placeholder:"Optional itinerary name"})}${quickField("endTime","Arrival time",{type:"time",wide:false,optional:true})}${quickField("confirmationNumber","Booking reference",{})}${quickField("cabin","Cabin",{optional:true})}${quickField("deck","Deck",{optional:true})}${quickField("embarkation","Embarkation details",{optional:true,placeholder:"Terminal, pier, or check-in point"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Port names stay manual until a dedicated port directory is available.";
    } else if (kind === "restaurant") {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Restaurant name",{required:true,placeholder:"Restaurant"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate","Reservation date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime","Local time",{type:"time",optional:true,wide:false})}</div>${quickField("guests","Guests",{type:"number",optional:true,wide:false,attrs:'min="1" max="99" inputmode="numeric"'})}<input type="hidden" name="reservationType" value="restaurant">`;
      moreContent = `<div class="form-fields">${quickField("location","City / location",{optional:true,placeholder:"City or saved trip location",attrs:'list="quick-reservation-locations" data-location-role="location"'})}${hiddenTz("timezone")}${quickField("streetAddress","Street address",{optional:true,placeholder:"Restaurant address"})}${quickField("phone","Restaurant phone",{type:"tel",optional:true})}${quickField("confirmationNumber","Confirmation number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Guest count and confirmation stay with this reservation.";
    } else if (["activity","tour","attraction","event"].includes(kind)) {
      const activitySubtype = manualBookingConfig(kind)?.subtype || "activity",
        activityLabel = kind === "tour" ? "Tour name" : kind === "attraction" ? "Attraction name" : kind === "event" ? "Event name" : "Activity name",
        activityPlaceholder = kind === "tour" ? "Guided city tour" : kind === "attraction" ? "Vatican Museums" : kind === "event" ? "Concert or show" : "Vatican Museums",
        typeControl = kind === "activity" ? quickField("activityType","Type",{type:"select",optional:true,choices:'<option value="activity">Activity</option><option value="tour">Tour</option><option value="concert">Concert</option><option value="theatre">Theatre</option><option value="museum">Museum</option><option value="attraction">Attraction</option><option value="sports">Sports</option><option value="meeting">Meeting</option><option value="show">Show</option><option value="other">Other</option>'}) : `<input type="hidden" name="activityType" value="${esc(activitySubtype)}">`;
      list = quickLocationList("activity");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title",activityLabel,{required:true,placeholder:activityPlaceholder})}${typeControl}${quickField("activityDate","Date",{type:"date",required:true,value:dateDefault})}<input type="hidden" name="timeMode" value="specific">${hiddenTz("timezone")}<div class="form-fields form-fields--activity-time">${quickField("activityTime","Local time",{type:"time",optional:true,wide:false})}</div>${quickField("location","Venue",{optional:true,placeholder:"Venue or saved trip location",attrs:'list="quick-activity-locations" data-location-role="location"'})}`;
      moreContent = `<div class="form-fields">${quickField("endTime","End time",{type:"time",wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("provider","Provider or contact",{})}${quickField("seatSection","Seat / section",{optional:true})}${quickField("streetAddress","Address",{optional:true,placeholder:"Venue address"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Use the venue's local time. Nothing is presented as live.";
    } else if (["other","reservation","parking","insurance"].includes(kind)) {
      const config = manualBookingConfig(kind), isParking = kind === "parking", isInsurance = kind === "insurance",
        titleLabel = isParking ? "Parking name" : isInsurance ? "Policy / provider" : "Booking title",
        titlePlaceholder = isParking ? "Airport parking" : isInsurance ? "Travel insurance" : "What did you book?",
        dateLabel = isParking ? "Start date" : isInsurance ? "Coverage starts" : "Date";
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title",titleLabel,{required:true,placeholder:titlePlaceholder})}<div class="form-fields form-fields--date-time">${quickField("reservationDate",dateLabel,{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime",isParking?"Entry time":"Local time",{type:"time",optional:true,wide:false})}</div><input type="hidden" name="reservationType" value="${esc(config?.subtype || "other")}">`;
      moreContent = `<div class="form-fields">${quickField("location","Location",{optional:true,placeholder:"Optional",attrs:'list="quick-reservation-locations" data-location-role="location"'})}${hiddenTz("timezone")}<div class="form-fields--date-time">${quickField("endDate","End date",{type:"date",wide:false})}${quickField("endTime","End time",{type:"time",wide:false})}</div>${quickField("confirmationNumber","Confirmation number",{})}${quickField("contact","Contact",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = isInsurance ? "Keep the policy reference with your trip; private documents remain on this device." : "Add only the details you know; nothing is guessed.";
    } else {
      const bookingOptions = bookingRows().map(({item}) => `<option value="${esc(itemId(item))}">${esc(val(item,"title","property_name")||"Booking")}</option>`).join(""),
        travelerSpecific = state.travelers.length ? quickTravelerField() : "";
      primary = `<div class="form-field form-field--wide quick-document-file"><label class="document-file-picker" for="form-documentFile">${icon("document",24)}<span><strong>Choose a file</strong><small>PDF, image, or Wallet pass · up to 10 MB</small></span></label><input class="sr-only" id="form-documentFile" name="documentFile" type="file" accept="application/pdf,image/*,.pkpass" required><div class="document-file-meta" role="status">No file selected</div></div>${quickField("documentType","Document type",{type:"select",required:true,choices:'<option value="boarding_pass">Boarding pass</option><option value="ticket">Ticket</option><option value="hotel_confirmation">Hotel confirmation</option><option value="reservation">Reservation</option><option value="voucher">Voucher</option><option value="qr_code">QR code</option><option value="passport_copy">Passport copy</option><option value="other">Other</option>'})}<div class="document-traveler-assignment">${travelerSpecific}</div>`;
      moreContent = `<div class="form-fields">${quickField("relatedBooking","Related booking",{type:"select",choices:`<option value="">No related booking</option>${bookingOptions}`})}</div>`;
      note = "Files stay on this phone.";
      extraClass = " document-quick-add";
    }
    const editAttrs = editingRecord ? ` data-edit-id="${esc(editId)}" data-edit-version="${esc(editVersion)}"` : "";
    const submitLabel = editingRecord ? "Save changes" : (kind === "document" ? "Save on This Phone" : config?.cta || `Add ${esc(statusText(kind))}`);
    const heading = editingRecord ? `Edit ${esc(config?.shortLabel || config?.label || statusText(kind))}` : esc(config?.shortLabel || config?.label || title);
    const attachments = kind === "document" ? "" : manualAttachmentsSection(kind, attachmentScope);
    const form = `<form class="mobile-form premium-form quick-add-form manual-booking-form${extraClass}" id="native-form" data-kind="${esc(kind)}" data-base-kind="${esc(baseKind)}" data-client-request-id="${esc(manualBookingDraftId(kind, editId))}" data-attachment-scope="${esc(attachmentScope.draftId)}"${editAttrs} novalidate>${quickTripContext()}<header class="manual-form-heading"><span>Manual booking</span><h1>${heading}</h1></header><section class="form-section manual-essentials" aria-labelledby="manual-essentials-title"><h2 id="manual-essentials-title">Essentials</h2><div class="quick-primary-fields">${primary}</div>${list}${dataLists}</section>${attachments}${quickMore(kind,"More Details",moreContent)}</form>`;
    return focusedTaskPage(title, form, `form-screen quick-add-screen quick-add-screen--${kind}`, formHeaderSave("native-form", editingRecord ? "Save" : "Save"));
  }
  function driverScreen() {
    const stay = selectedStay(),
      location = stay
        ? locationById(val(stay, "property_location_id", "start_location_id"))
        : null,
      name = val(stay, "property_name", "title") || "Destination",
      localName = val(location, "local_name") || "",
      showLocalName = localName && localName.trim().toLocaleLowerCase() !== String(name).trim().toLocaleLowerCase(),
      address =
        val(location, "local_address", "formatted_address") ||
        "Address unavailable";
    return `<div class="phone-app"><section class="driver-screen"><header class="driver-top"><button class="icon-button" data-action="close-driver" aria-label="Close">${icon("close", 26)}</button><strong>Show to Driver</strong><span aria-hidden="true"></span></header><main class="driver-main"><div class="driver-label">${icon("car", 24)} <span>Please drive to</span></div><section class="driver-pass" aria-labelledby="driver-destination-name"><span class="driver-pass__eyebrow">Destination</span><h1 class="driver-name" id="driver-destination-name">${esc(name)}</h1>${showLocalName ? `<p class="driver-local">${esc(localName)}</p>` : ""}<div class="driver-address">${icon("pin", 26)}<span><small>Address</small><strong>${esc(address)}</strong></span></div></section><p class="driver-hint">Show this screen to your driver. The destination is saved with your trip.</p></main><footer class="driver-cta">${primaryCta("Open directions", "directions-hotel", "navigation", `data-id="${esc(itemId(stay || {}))}"`)}</footer></section></div>`;
  }
  function bottomSheet(id, title, content) {
    return `<div class="sheet-backdrop" data-action="close-sheet" aria-hidden="true"></div><section class="bottom-sheet bottom-sheet--${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1"><div class="sheet-handle" data-sheet-drag aria-hidden="true"></div><div class="sheet-title-row" data-sheet-drag><h2 id="${id}-title">${esc(title)}</h2><button class="icon-button" data-action="close-sheet" aria-label="Close ${esc(title)}">${icon("close", 22)}</button></div><div class="sheet-scroll">${content}</div></section>`;
  }
  function currencyPickerSheet() {
    const currency = initCurrency();
    const field = state.currencyPickerField === "from" ? "from" : "to";
    const selected = currency[field];
    const title = field === "from" ? "You pay in" : "Convert to";
    const choices = TRAVEL_CURRENCIES.map(([code, name]) => {
      const active = code === selected;
      return `<button type="button" class="currency-picker-option${active ? " is-selected" : ""}" role="option" aria-selected="${active}" data-action="select-currency" data-field="${field}" data-code="${code}"><strong>${code}</strong><span>${esc(name)}</span>${active ? icon("check", 17) : ""}</button>`;
    }).join("");
    return bottomSheet("currency-picker", title, `<div class="currency-picker-grid" role="listbox" aria-label="${esc(title)}">${choices}</div>`);
  }
  function rangeMonthStart(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/), now = new Date();
    return match ? `${match[1]}-${match[2]}-01` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  function shiftRangeMonth(value, amount) {
    const date = new Date(`${rangeMonthStart(value)}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + amount);
    return date.toISOString().slice(0, 10);
  }
  function dateRangeSheet() {
    const range = state.dateRange;
    if (!range) return "";
    const monthStart = new Date(`${rangeMonthStart(range.month)}T12:00:00Z`), year = monthStart.getUTCFullYear(), month = monthStart.getUTCMonth(), firstWeekday = monthStart.getUTCDay(), daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), previousDays = new Date(Date.UTC(year, month, 0)).getUTCDate(), cells = [];
    for (let index = 0; index < 42; index += 1) {
      const dayOffset = index - firstWeekday + 1, date = new Date(Date.UTC(year, month, dayOffset)), iso = date.toISOString().slice(0, 10), inMonth = date.getUTCMonth() === month, isStart = iso === range.start, isEnd = iso === range.end, inRange = Boolean(range.start && range.end && iso > range.start && iso < range.end), label = new Intl.DateTimeFormat(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric", timeZone:"UTC" }).format(date);
      const isFocused = iso === range.focusDate || (!range.focusDate && ((range.start && iso === range.start) || (!range.start && inMonth && dayOffset === 1)));
      cells.push(`<button type="button" role="gridcell" tabindex="${isFocused ? "0" : "-1"}" class="range-day${inMonth ? "" : " is-outside"}${inRange ? " is-between" : ""}${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}" data-action="select-range-day" data-date="${iso}" aria-label="${esc(label)}${isStart ? ", start date" : isEnd ? ", end date" : ""}" aria-selected="${isStart || isEnd}"><span>${date.getUTCDate()}</span></button>`);
    }
    const summary = range.start ? range.end ? `${formatDateOnly(range.start)} – ${formatDateOnly(range.end)}` : range.allowSingle ? formatDateOnly(range.start) : `${formatDateOnly(range.start)} · now choose ${range.endLabel.toLowerCase()}` : `Choose ${range.startLabel.toLowerCase()}`;
    const ready = Boolean(range.start && (range.end || range.allowSingle)),
      heading = range.allowSingle ? `Select ${range.startLabel.toLowerCase()}` : "Select dates",
      instruction = range.allowSingle
        ? `Choose the ${range.startLabel.toLowerCase()} you want.`
        : range.start && range.end
          ? "Your travel window is ready."
          : range.start
            ? `Now choose your ${range.endLabel.toLowerCase()}.`
            : `Choose your ${range.startLabel.toLowerCase()} first.`,
      startValue = range.start ? formatDateOnly(range.start) : "Select",
      endValue = range.end ? formatDateOnly(range.end) : range.allowSingle ? "Optional" : "Select";
    const skipAction = range.optional
      ? `<button type="button" class="range-picker__skip" data-action="skip-date-range">I don’t know my dates yet</button>`
      : "";
    return `<section class="full-screen-picker date-range-screen" role="dialog" aria-modal="true" aria-labelledby="date-range-screen-title"><header class="full-screen-picker__bar"><button type="button" class="icon-button full-screen-picker__back" data-action="close-sheet" aria-label="Back">${icon("back",22)}</button><div><strong id="date-range-screen-title">${esc(heading)}</strong></div><button type="button" class="full-screen-picker__clear" data-action="clear-date-range"${range.start || range.end ? "" : " disabled"}>Clear</button></header><main class="range-picker"><p class="range-picker__instruction">${icon("calendar",19)}<span>${esc(instruction)}</span></p><div class="range-picker__selection" role="status" aria-live="polite"><section class="range-choice range-choice--start${!range.start ? " is-active" : ""}"><small>${esc(range.startLabel)}</small><strong>${esc(startValue)}</strong></section>${range.allowSingle ? "" : `<section class="range-choice range-choice--end${range.start && !range.end ? " is-active" : ""}"><small>${esc(range.endLabel)}</small><strong>${esc(endValue)}</strong></section>`}</div><section class="range-picker__calendar" aria-label="Calendar"><div class="range-month"><button type="button" class="icon-button" data-action="range-month" data-offset="-1" aria-label="Previous month">${icon("back",20)}</button><strong>${esc(new Intl.DateTimeFormat(undefined, {month:"long",year:"numeric",timeZone:"UTC"}).format(monthStart))}</strong><button type="button" class="icon-button" data-action="range-month" data-offset="1" aria-label="Next month">${icon("chevron",20)}</button></div><div class="range-weekdays" aria-hidden="true">${["S","M","T","W","T","F","S"].map((day)=>`<span>${day}</span>`).join("")}</div><div class="range-days" role="grid" aria-label="${esc(range.title)}">${cells.join("")}</div></section><p class="range-picker__status sr-only">${esc(summary)}</p><div class="range-picker__actions"><button type="button" class="mobile-primary-action range-picker__apply" data-action="apply-date-range"${ready ? "" : " disabled"}>${range.allowSingle ? "Confirm date" : "Confirm dates"}</button>${skipAction}</div></main></section>`;
  }
  function tripSetupReadyScreen() {
    const preview = state.tripSetupPreview || {},
      destination = preview.destination || "Your destination",
      dates = preview.startsOn && preview.endsOn
        ? formatDateRange(preview.startsOn, preview.endsOn)
        : "Dates not set",
      hasDates = Boolean(preview.startsOn && preview.endsOn);
    const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}${preview.startsOn ? `&checkin=${encodeURIComponent(preview.startsOn)}` : ""}${preview.endsOn ? `&checkout=${encodeURIComponent(preview.endsOn)}` : ""}`;
    const tool = (className, iconName, title, copy, href, sponsored = false, id = "") => `<a${id ? ` id="${id}"` : ""} class="trip-setup-tool ${className}" href="${esc(href)}" target="_blank" rel="${sponsored ? "sponsored " : ""}noopener noreferrer"><span class="trip-setup-tool__icon">${icon(iconName,22)}</span><span class="trip-setup-tool__copy"><strong>${esc(title)}</strong><small>${esc(copy)}</small></span><span class="trip-setup-tool__external" aria-hidden="true">${icon("external",17)}</span></a>`;
    return `<section class="full-screen-picker trip-setup-ready" role="dialog" aria-modal="true" aria-labelledby="trip-setup-ready-title"><header class="full-screen-picker__bar trip-setup-ready__bar"><button type="button" class="icon-button full-screen-picker__back" data-action="return-trip-setup" aria-label="Back to trip details">${icon("back",22)}</button><div><strong>Plan your trip</strong></div><button type="button" class="trip-setup-ready__create" data-action="complete-trip-setup">Create trip</button></header><main class="trip-setup-ready__main"><section class="trip-create-head trip-setup-ready__hero"><div class="trip-create-head__copy"><span class="trip-create-head__eyebrow">Your journey</span><h1 id="trip-setup-ready-title">Bring your trip together</h1><div class="trip-create-head__sub"><p>Keep your bookings and travel details in one clear timeline.</p></div></div><div class="trip-plan-fields"><div class="trip-plan-field">${icon("location",22)}<span><small>Destination</small><strong>${esc(destination === "Your destination" ? "Not selected" : destination)}</strong></span></div><div class="trip-plan-field">${icon("calendar",22)}<span><small>Travel dates</small><strong>${esc(dates)}</strong></span></div></div></section><section class="trip-setup-ready__tools" aria-labelledby="trip-setup-extras-title"><h2 id="trip-setup-extras-title" class="trip-setup-ready__extras-title">Anything else you need?</h2>${tool("trip-setup-tool--flight","flight","Still haven't booked the flights?","Compare routes on Aviasales",AVIASALES_AFFILIATE_URL,true)}${tool("trip-setup-tool--stay","bed","Still looking for a place to stay?","Browse stays on Booking.com",bookingUrl,true,"trip-setup-stay-link")}${tool("trip-setup-tool--esim","sim","Need an eSIM?","Get connected before you land",routeUrl("esim"))}</section><p class="trip-setup-ready__disclosure">Partner links may earn Tripto a commission at no extra cost.</p></main></section>`;
  }
  function addSheet() {
    return bottomSheet(
      "add",
      "What would you like to do?",
      `<div class="sheet-options-group sheet-options-group--v2"><button class="sheet-option" data-action="open-add-booking"><span class="info-icon">${icon("plus",22)}</span><span><strong>Add Booking</strong><small>Add something to ${esc(state.trip?.title || "your trip")}</small></span>${icon("chevron",22)}</button><button class="sheet-option" data-action="create-trip"><span class="info-icon">${icon("plane",22)}</span><span><strong>Create New Trip</strong><small>Start planning another trip</small></span>${icon("chevron",22)}</button></div>`,
    );
  }
  function tripOptionsScreen() {
    if (!state.trip) return missingDetailScreen("Trip options", "Select a trip to see its tools and settings.");
    const mapHint = canShowTripMap()
      ? "See this trip's places on a map"
      : "Add 2+ places to map this trip";
    const pending = pendingImportCount();
    const importsHint = pending
      ? `${pending} booking${pending === 1 ? "" : "s"} to review`
      : "Forwarded and uploaded bookings";
    const optionCard = (tone, iconName, title, sub, attr, badge = 0) =>
      `<button type="button" class="trip-option-card trip-option-card--${esc(tone)}" ${attr}><span class="trip-option-card__icon">${icon(iconName, 24)}</span>${badge ? `<span class="trip-option-card__badge" aria-label="${badge} waiting">${badge > 9 ? "9+" : badge}</span>` : ""}<span class="trip-option-card__copy"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span><span class="trip-option-card__chevron">${icon("chevron", 17)}</span></button>`;
    const collabCard = state.sharing?.enabled
      ? optionCard("together", "users", "Plan together", collabMenuHint(), `data-action="open-collaboration"`)
      : "";
    const editTripCard = canManageCurrentTrip()
      ? optionCard("edit", "edit", "Edit trip", "Name, dates and trip details", `data-action="edit-trip"`)
      : "";
    const alerts = totalNotificationCount();
    const body = `<section class="trip-options-intro"><span>TRIP TOOLS</span><h1>${esc(state.trip.title || "Your trip")}</h1><p>Everything that helps you plan, prepare, and travel with confidence—in one place.</p></section><section class="trip-options-group" aria-labelledby="trip-options-plan"><h2 id="trip-options-plan">Plan & explore</h2><div class="trip-options-grid">${optionCard("weather", "weather", "Weather", "Forecast for your destination", `data-action="open-weather"`)}${optionCard("currency", "currency", "Currency converter", "Convert trip costs offline", `data-action="open-currency"`)}${optionCard("map", "map", "Trip Map", mapHint, `data-action="open-trip-map"`)}${optionCard("connect", "sim", "Travel eSIM", "Data abroad, no roaming", `data-action="open-esim"`)}</div></section><section class="trip-options-group" aria-labelledby="trip-options-tools"><h2 id="trip-options-tools">Travel tools</h2><div class="trip-options-grid">${optionCard("alerts", "bell", "Alerts", alerts ? `${alerts} update${alerts === 1 ? "" : "s"} waiting` : "Important trip updates", `data-action="open-notifications"`, alerts)}${collabCard}${optionCard("imports", "mail", "Booking imports", importsHint, `data-screen="import-history"`, pending)}${optionCard("documents", "document", "Documents", "Tickets and confirmations", `data-screen="documents" aria-label="Tickets and documents"`)}</div></section><section class="trip-options-group" aria-labelledby="trip-options-manage"><h2 id="trip-options-manage">Manage trip</h2><div class="trip-options-grid">${editTripCard}${optionCard("help", "info", "Help & FAQ", "Guides, privacy, and answers", `data-screen="help"`)}</div></section>`;
    return mobilePage("Trip options", body, "trip-options", "", "trip-options-page");
  }
  // ===== Free trip collaboration (owner / editor / viewer) =====
  // Collaboration is free for every signed-in account — there is no paid gate.
  // The frontend never trusts or sends 'owner' as an assignable role and never
  // logs / sends an invite token to analytics. Every "manage" affordance gates
  // on the server-provided role + canManage; the worker re-checks each mutation.
  const COLLAB_ROLES = Object.freeze({
    owner: { label: "Owner", icon: "owner" },
    editor: { label: "Can edit", icon: "editor" },
    viewer: { label: "View only", icon: "viewer" },
  });
  function roleMeta(role) {
    return COLLAB_ROLES[String(role || "").toLowerCase()] || COLLAB_ROLES.viewer;
  }
  function isSignedIn() {
    return state.account?.mode === "account";
  }
  function currentUserId() {
    return state.account?.user?.id || null;
  }
  function canManageSharing() {
    return Boolean(state.sharing?.canManage) && state.sharing?.role === "owner";
  }
  function currentTripRole() {
    const id = state.trip?.id;
    if (!id) return null;
    const listed = state.trips.find((trip) => String(trip.id) === String(id));
    const role = listed?.role || state.trip?.role || state.sharing?.role;
    return role ? String(role).toLowerCase() : null;
  }
  function canEditCurrentTrip() {
    // Viewers see everything but change nothing. Owner/editor (and guest device
    // trips with no role) can edit. Server still enforces on every write.
    return currentTripRole() !== "viewer";
  }
  function canManageCurrentTrip() {
    const role = currentTripRole();
    // Signed-in editors and viewers never manage the trip shell. A local guest
    // trip has no membership role and remains manageable on its creator device.
    return role !== "editor" && role !== "viewer";
  }
  function resetCollaborationState() {
    state.collabRequestId += 1;
    state.sharing = null;
    state.sharingTripId = null;
    state.members = [];
    state.invites = [];
    state.inviteLoadError = null;
    state.collabTripId = null;
    state.collabLoading = false;
    state.collabError = null;
    state.shareInvite = null;
  }
  function viewOnlyBlocked() {
    if (canEditCurrentTrip()) return false;
    showToast("You have view-only access to this trip.", "status");
    return true;
  }
  function tripSharedBadge(trip) {
    // Only shared trips (owner is someone else) carry a badge. Naturally inert
    // while sharing is off — no shared trips exist, so nothing renders.
    if (!trip || !(trip.is_shared === 1 || trip.is_shared === true)) return "";
    const meta = roleMeta(trip.role === "viewer" ? "viewer" : "editor");
    return `<span class="trip-shared-badge">${icon(meta.icon, 13)} Shared · ${esc(meta.label)}</span>`;
  }
  function collabMenuHint() {
    const count = Number(state.sharing?.activeMembers || state.members.length || 0);
    return count > 1 ? `${count} people on this trip` : "Invite people to plan with you";
  }
  function collabScaffold(sub, body) {
    return `<div class="phone-app"><section class="screen collaboration-screen">${appBar("Plan together", sub, true)}<main class="collab-page">${body}</main></section></div>`;
  }
  function collabBenefits() {
    const benefit = (iconName, title, body) => `<div class="collab-benefit"><span class="collab-benefit__icon">${icon(iconName, 21)}</span><span><strong>${esc(title)}</strong><small>${esc(body)}</small></span></div>`;
    return `<section class="collab-benefits" aria-labelledby="collab-benefits-title"><h2 id="collab-benefits-title">Why plan together?</h2>${benefit("edit", "Build one plan", "Editors can add and update bookings.")}${benefit("bell", "Keep everyone aligned", "Trip changes stay visible to everyone in one place.")}${benefit("owner", "You stay in control", "Choose who can edit or view, and remove access anytime.")}</section>`;
  }
  function collaborationScreen() {
    if (!state.trip)
      return missingDetailScreen("Plan together", "Select a trip to invite people.");
    const sub = state.trip.title || "Trip";
    if (!isSignedIn())
      return collabScaffold(
        sub,
        `<header class="collab-hero"><span class="collab-hero__icon">${icon("users", 30)}</span><span class="collab-hero__eyebrow">Shared planning</span><h1>One trip.<br>Everyone in sync.</h1><p>Invite the people travelling with you so the whole group can follow one clear plan.</p></header>${collabBenefits()}<section class="collab-signin"><h2>Ready to plan together?</h2><p>Sign in with your free account. Everyone uses their own login — no shared passwords.</p><button type="button" class="mobile-primary-action" data-action="collab-sign-in">${icon("user", 18)} Sign in to continue</button><small>Free for every trip.</small></section>`,
      );
    if (state.collabLoading || String(state.collabTripId || "") !== String(state.trip.id))
      return collabScaffold(sub, `<section class="collab-loading" role="status"><span class="collab-empty__icon">${icon("users", 32)}</span><p>Loading who’s on this trip…</p></section>`);
    if (state.collabError)
      return collabScaffold(
        sub,
        `<section class="collab-empty"><span class="collab-empty__icon">${icon("warning", 32)}</span><h1>Couldn’t load collaboration</h1><p>${esc(state.collabError)}</p><button type="button" class="mobile-secondary-action" data-action="reload-collaboration">${icon("refresh", 18)} Try again</button></section>`,
      );
    if (state.sharing && state.sharing.enabled === false)
      return collabScaffold(
        sub,
        `<section class="collab-empty"><span class="collab-empty__icon">${icon("users", 32)}</span><h1>Sharing is off right now</h1><p>Trip collaboration isn’t available at the moment. Your trip stays private and safe on this device.</p></section>`,
      );
    const manage = canManageSharing();
    const myId = currentUserId();
    const memberRows = state.members
      .map((member) => {
        const meta = roleMeta(member.role);
        const isYou = myId && String(member.user_id) === String(myId);
        const isOwner = String(member.role).toLowerCase() === "owner";
        const controls =
          manage && !isOwner
            ? `<div class="collab-member__actions">${
                member.role === "editor"
                  ? `<button type="button" class="collab-chip" data-action="member-role" data-id="${esc(member.user_id)}" data-role="viewer">Make view only</button>`
                  : `<button type="button" class="collab-chip" data-action="member-role" data-id="${esc(member.user_id)}" data-role="editor">Make editor</button>`
              }<button type="button" class="collab-chip" data-action="member-transfer" data-id="${esc(member.user_id)}" data-name="${esc(member.display_name || "this person")}">${icon("owner", 15)} Make owner</button><button type="button" class="icon-button collab-member__remove" data-action="member-remove" data-id="${esc(member.user_id)}" data-name="${esc(member.display_name || "this person")}" aria-label="Remove ${esc(member.display_name || "member")}">${icon("trash", 18)}</button></div>`
            : "";
        return `<div class="collab-member"><span class="collab-member__icon">${icon(meta.icon, 22)}</span><span class="collab-member__text"><strong>${esc(member.display_name || "Traveler")}${isYou ? " (You)" : ""}</strong><small>${esc(meta.label)}</small></span>${controls}</div>`;
      })
      .join("");
    const pending = state.invites.filter((invite) => String(invite.status).toLowerCase() === "invited");
    const inviteRows = pending
      .map((invite) => {
        const meta = roleMeta(invite.role);
        const who = invite.invited_email || "Anyone with the link";
        const expires = invite.expires_at ? `expires ${esc(formatDateOnly(invite.expires_at))}` : "no expiry";
        return `<div class="collab-invite"><span class="collab-invite__icon">${icon("invite", 20)}</span><span class="collab-invite__text"><strong>${esc(who)}</strong><small>${esc(meta.label)} · pending · ${expires}</small></span><button type="button" class="icon-button" data-action="invite-revoke" data-id="${esc(invite.id)}" aria-label="Revoke invitation">${icon("close", 18)}</button></div>`;
      })
      .join("");
    const inviteBtn = state.sharing?.enabled && manage
      ? `<button type="button" class="mobile-primary-action collab-invite-cta" data-action="open-share">${icon("invite", 18)} Invite people</button>`
      : "";
    const inviteContent = state.inviteLoadError
      ? `<div role="alert"><p class="collab-note">Pending invitations couldn’t be loaded.</p><button type="button" class="collab-chip" data-action="reload-collaboration">Try again</button></div>`
      : inviteRows || `<p class="collab-note">No pending invitations.</p>`;
    const invitesSection = manage
      ? `<section class="collab-section"><h2 class="collab-section__title">Pending invitations</h2>${inviteContent}</section>`
      : "";
    const leaveBtn = state.sharing?.role && state.sharing.role !== "owner"
      ? `<button type="button" class="mobile-secondary-action collab-leave" data-action="leave-trip">Leave this trip</button>`
      : "";
    const intro = manage
      ? `Invite people to view or edit <strong>${esc(sub)}</strong>. You stay the owner and can change roles or remove people at any time.`
      : state.sharing?.role === "editor"
        ? `You can edit this shared trip. The owner manages who has access.`
        : `You can view this shared trip. The owner manages who has access.`;
    const cap = state.sharing?.maxMembers ? `<p class="collab-note">Up to ${esc(state.sharing.maxMembers)} people per trip.</p>` : "";
    return collabScaffold(
      sub,
      `<header class="collab-hero"><span class="collab-hero__icon">${icon("users", 30)}</span><span class="collab-hero__eyebrow">Shared planning</span><h1>One trip.<br>Everyone in sync.</h1><p>${intro}</p></header>${collabBenefits()}${inviteBtn}<section class="collab-section"><h2 class="collab-section__title">People on this trip</h2><div class="collab-members">${memberRows || `<p class="collab-note">Just you so far. Invite someone when you’re ready.</p>`}</div>${cap}</section>${invitesSection}${leaveBtn}`,
    );
  }
  function shareSheet() {
    if (!state.trip) return "";
    const role = state.shareRole === "viewer" ? "viewer" : "editor";
    const seg = (value, label, sub) =>
      `<button type="button" class="share-role${role === value ? " is-active" : ""}" data-action="share-role" data-role="${value}" aria-pressed="${role === value}">${icon(roleMeta(value).icon, 20)}<span><strong>${esc(label)}</strong><small>${esc(sub)}</small></span></button>`;
    const invite = state.shareInvite;
    const linkBlock = invite?.inviteUrl
      ? `<div class="share-link" role="group" aria-label="Invitation link"><p class="share-link__label">${esc(roleMeta(invite.role).label)} link ready${invite.expiresAt ? ` · expires ${esc(formatDateOnly(invite.expiresAt))}` : ""}</p><div class="share-link__url">${esc(invite.inviteUrl)}</div><div class="share-link__actions"><button type="button" class="mobile-primary-action" data-action="share-invite-link">${icon("share", 18)} Share link</button><button type="button" class="mobile-secondary-action" data-action="copy-invite-link">${icon("copy", 18)} Copy link</button></div></div>`
      : "";
    const createLabel = invite?.inviteUrl ? "Create another link" : "Create invitation link";
    return bottomSheet(
      "share",
      "Invite to this trip",
      `<p class="sheet-note">Anyone you invite signs in with their own free account to join. The link works once and you can revoke it anytime.</p><div class="share-roles">${seg("editor", "Can edit", "Add and change bookings")}${seg("viewer", "View only", "See the trip, can’t change it")}</div>${linkBlock}<button type="button" class="mobile-${invite?.inviteUrl ? "secondary" : "primary"}-action share-create" data-action="create-invite"${state.shareBusy ? " disabled" : ""}>${icon("invite", 18)} ${state.shareBusy ? "Creating…" : esc(createLabel)}</button>`,
    );
  }
  function joinScreen() {
    const token = state.selectedId || state.joinToken || "";
    if (!token)
      return focusedTaskPage("Join trip", `<section class="collab-empty"><span class="collab-empty__icon">${icon("invite", 32)}</span><h1>Invitation link incomplete</h1><p>Open the full invitation link you were sent to join a trip.</p><button type="button" class="mobile-secondary-action" data-action="join-home">Go to my trips</button></section>`, "join-screen");
    if (state.joinCheckedToken !== token || (state.joinLoading && !state.joinPreview))
      return focusedTaskPage("Join trip", `<section class="collab-loading" role="status"><span class="collab-empty__icon">${icon("invite", 32)}</span><p>Checking your invitation…</p></section>`, "join-screen");
    if (state.joinError && !state.joinPreview)
      return focusedTaskPage("Join trip", `<section class="collab-empty"><span class="collab-empty__icon">${icon("warning", 32)}</span><h1>Invitation unavailable</h1><p>${esc(state.joinError)}</p><button type="button" class="mobile-secondary-action" data-action="join-home">Go to my trips</button></section>`, "join-screen");
    const preview = state.joinPreview || {};
    const roleLabel = roleMeta(preview.role).label;
    const title = preview.tripTitle || "a trip";
    if (preview.sharingEnabled === false)
      return focusedTaskPage("Join trip", `<section class="collab-empty"><span class="collab-empty__icon">${icon("invite", 32)}</span><h1>Invitations are paused</h1><p>Trip sharing isn’t available right now. Please ask the trip owner to send a new link later.</p><button type="button" class="mobile-secondary-action" data-action="join-home">Go to my trips</button></section>`, "join-screen");
    const hero = `<section class="join-hero"><span class="collab-empty__icon">${icon("invite", 34)}</span><h1>You’re invited to<br><strong>${esc(title)}</strong></h1><p>Join as <strong>${esc(roleLabel.toLowerCase())}</strong>. Collaboration is free.</p></section>`;
    if (!isSignedIn())
      return focusedTaskPage(
        "Join trip",
        `${hero}<section class="join-signin"><p>Sign in with your free account to accept this invitation.</p><div id="google-signin-button" class="google-signin-button"></div><p class="signin-error" role="alert" hidden></p><p class="collab-note">We only use your Google account to sign you in. Your invitation is kept until you finish.</p></section>`,
        "join-screen",
      );
    return focusedTaskPage(
      "Join trip",
      `${hero}<section class="join-accept"><button type="button" class="mobile-primary-action" data-action="join-accept"${state.joinLoading ? " disabled" : ""}>${state.joinLoading ? "Joining…" : "Accept invitation"}</button><button type="button" class="mobile-secondary-action" data-action="join-home">Not now</button></section>`,
      "join-screen",
    );
  }
  // Loaders --------------------------------------------------------------
  async function loadSharingStatus(tripId) {
    if (PREVIEW_MODE || !tripId) return;
    try {
      const data = await apiGet(`/api/v1/trips/${encodeURIComponent(tripId)}/sharing`);
      if (state.trip?.id !== tripId) return;
      state.sharing = data?.sharing || null;
      state.sharingTripId = tripId;
    } catch (_) {
      /* non-fatal: leave any prior sharing status untouched */
    }
  }
  async function loadCollaboration() {
    if (PREVIEW_MODE || !state.trip || !isSignedIn()) return;
    const tripId = state.trip.id;
    const requestId = state.collabRequestId + 1;
    state.collabRequestId = requestId;
    state.collabLoading = true;
    state.collabError = null;
    state.inviteLoadError = null;
    state.collabTripId = null;
    state.sharing = null;
    state.members = [];
    state.invites = [];
    render();
    try {
      const [statusRes, membersRes] = await Promise.all([
        api(`/api/v1/trips/${encodeURIComponent(tripId)}/sharing`),
        api(`/api/v1/trips/${encodeURIComponent(tripId)}/members`),
      ]);
      if (state.trip?.id !== tripId || state.collabRequestId !== requestId) return;
      state.sharing = statusRes?.sharing || null;
      state.sharingTripId = tripId;
      state.members = membersRes?.members || [];
      state.collabTripId = tripId;
      if (canManageSharing()) {
        try {
          const invRes = await api(`/api/v1/trips/${encodeURIComponent(tripId)}/invites`);
          if (state.trip?.id !== tripId || state.collabRequestId !== requestId) return;
          state.invites = invRes?.invites || [];
        } catch (error) {
          state.invites = [];
          state.inviteLoadError = error?.message || "Pending invitations could not be loaded.";
        }
      } else {
        state.invites = [];
      }
    } catch (error) {
      if (state.trip?.id === tripId && state.collabRequestId === requestId) {
        state.sharing = null;
        state.members = [];
        state.invites = [];
        state.collabTripId = tripId;
        state.collabError = error?.message || "Collaboration could not be loaded.";
      }
    } finally {
      if (state.trip?.id === tripId && state.collabRequestId === requestId) {
        state.collabLoading = false;
        render();
      }
    }
  }
  async function loadJoinPreview(token) {
    if (PREVIEW_MODE || !token) return;
    const requestId = state.joinRequestId + 1;
    state.joinRequestId = requestId;
    state.joinLoading = true;
    state.joinError = null;
    state.joinPreview = null;
    state.joinCheckedToken = null;
    render();
    try {
      const data = await api("/api/v1/invites/preview", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (state.joinRequestId !== requestId || String(state.selectedId || state.joinToken || "") !== String(token)) return;
      state.joinPreview = data?.invite || null;
      if (!state.joinPreview) state.joinError = "This invitation could not be found.";
    } catch (error) {
      if (state.joinRequestId !== requestId || String(state.selectedId || state.joinToken || "") !== String(token)) return;
      state.joinPreview = null;
      state.joinError =
        error?.code === "INVITE_NOT_FOUND"
          ? "This invitation link is not valid. Ask the trip owner for a new one."
          : error?.message || "This invitation could not be checked.";
    } finally {
      if (state.joinRequestId === requestId && String(state.selectedId || state.joinToken || "") === String(token)) {
        state.joinCheckedToken = token;
        state.joinLoading = false;
        render();
      }
    }
  }
  function maybeLoadScreenData() {
    if (state.screen === "currency") void ensureCurrencyRates();
    if (PREVIEW_MODE) return;
    if (state.screen === "join") {
      const token = state.selectedId || "";
      if (token && (state.joinToken !== token || state.joinCheckedToken !== token)) {
        state.joinToken = token;
        state.joinPreview = null;
        state.joinCheckedToken = null;
        // Preserve the token across a Google redirect sign-in (Slice 2 resume).
        try { sessionStorage.setItem("tripto_join_token", token); } catch (_) {}
        void loadJoinPreview(token);
      }
      return;
    }
    if (state.screen === "collaboration" && state.trip && isSignedIn()) void loadCollaboration();
  }
  function collabErrorText(error) {
    const map = {
      SHARING_DISABLED: "Sharing is currently turned off.",
      OWNER_REQUIRED: "Only the trip owner can do that.",
      ACCOUNT_REQUIRED: "Sign in to manage sharing.",
      VALIDATION_ERROR: "That didn’t look right — please try again.",
      INVITE_LIMIT_REACHED: "This trip already has the maximum pending invitations.",
      MEMBER_LIMIT_REACHED: "This trip is already at the maximum number of people.",
      INVITE_ALREADY_PENDING: "There’s already a pending invitation for that email.",
      INVITE_EXPIRED: "This invitation has expired. Ask for a new link.",
      INVITE_UNAVAILABLE: "This invitation is no longer available.",
      INVITE_NOT_FOUND: "This invitation link is not valid.",
      INVITE_EMAIL_MISMATCH: "This invitation was sent to a different email address.",
      OWNER_CANNOT_LEAVE: "Transfer ownership before leaving this trip.",
      OWNER_CANNOT_BE_REMOVED: "The owner can’t be removed.",
      OWNER_ROLE_FIXED: "The owner’s role can’t be changed here.",
    };
    return map[error?.code] || error?.message || "Something went wrong. Please try again.";
  }
  async function createInvite() {
    if (!state.trip || state.shareBusy) return;
    const tripId = state.trip.id;
    const role = state.shareRole === "viewer" ? "viewer" : "editor"; // never 'owner'
    state.shareBusy = true;
    render();
    try {
      const res = await api(`/api/v1/trips/${encodeURIComponent(tripId)}/invites`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      state.shareInvite = res?.invite || null;
      showToast("Invitation link ready.");
      void loadCollaboration();
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    } finally {
      state.shareBusy = false;
      render();
    }
  }
  async function copyInviteLink() {
    const url = state.shareInvite?.inviteUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Invitation link copied.");
    } catch (_) {
      showToast("Copy failed — long-press the link to copy it.", "alert");
    }
  }
  async function shareInviteLink() {
    const invite = state.shareInvite;
    if (!invite?.inviteUrl) return;
    const title = state.trip?.title || "my trip";
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${title} on tripto.to`,
          text: `You’re invited to help plan ${title}.`,
          url: invite.inviteUrl,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyInviteLink();
  }
  async function revokeInvite(inviteId) {
    if (!state.trip || !inviteId) return;
    const tripId = state.trip.id;
    try {
      await api(`/api/v1/trips/${encodeURIComponent(tripId)}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
      if (state.shareInvite?.id === inviteId) state.shareInvite = null;
      showToast("Invitation revoked.");
      await loadCollaboration();
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    }
  }
  async function updateMemberRole(userId, role) {
    if (!state.trip || !userId) return;
    const next = role === "viewer" ? "viewer" : "editor"; // never 'owner'
    const tripId = state.trip.id;
    try {
      await api(`/api/v1/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      });
      await loadCollaboration();
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    }
  }
  async function removeMember(userId, name) {
    if (!state.trip || !userId) return;
    if (!window.confirm(`Remove ${name || "this person"} from ${state.trip.title || "this trip"}?`)) return;
    const tripId = state.trip.id;
    try {
      await api(`/api/v1/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
      showToast("Person removed.");
      await loadCollaboration();
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    }
  }
  async function transferOwnership(userId, name) {
    if (!state.trip || !userId) return;
    if (!window.confirm(`Make ${name || "this person"} the owner? You’ll become an editor and can no longer manage sharing.`)) return;
    const tripId = state.trip.id;
    try {
      await api(`/api/v1/trips/${encodeURIComponent(tripId)}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      showToast("Ownership transferred.");
      await loadCollaboration();
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    }
  }
  async function leaveTrip() {
    if (!state.trip) return;
    if (!window.confirm(`Leave ${state.trip.title || "this trip"}? You’ll lose access until someone invites you again.`)) return;
    const tripId = state.trip.id;
    try {
      await api(`/api/v1/trips/${encodeURIComponent(tripId)}/leave`, { method: "POST" });
      showToast("You left the trip.");
      state.trip = null;
      resetCollaborationState();
      if (localStorage.getItem("tripto_selected_trip") === String(tripId))
        localStorage.removeItem("tripto_selected_trip");
      await loadApp();
      route("trips");
    } catch (error) {
      showToast(collabErrorText(error), "alert");
    }
  }
  async function acceptInvite() {
    const token = state.joinToken || state.selectedId;
    if (!token || !isSignedIn()) return;
    state.joinLoading = true;
    render();
    try {
      const res = await api("/api/v1/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      try { sessionStorage.removeItem("tripto_join_token"); } catch (_) {}
      state.joinToken = null;
      state.joinPreview = null;
      showToast("You joined the trip.");
      await loadApp();
      const joined = state.trips.find((trip) => String(trip.id) === String(res?.tripId));
      if (joined) {
        state.trip = joined;
        localStorage.setItem("tripto_selected_trip", joined.id);
        await loadTripDetails();
      }
      route("timeline");
    } catch (error) {
      state.joinError = collabErrorText(error);
      showToast(collabErrorText(error), "alert");
    } finally {
      state.joinLoading = false;
      render();
    }
  }
  function weatherScreen() {
    if (!state.trip)
      return missingDetailScreen("Weather", "Select a trip to see its forecast.");
    const sub = state.trip.title || "Trip";
    const places = weatherPlaces();
    const place = currentWeatherPlace();
    const wx = place && state.weatherByPlace ? state.weatherByPlace[place.key] : null;
    // Per-place selector, only when the trip visits more than one place.
    const selector =
      places.length > 1
        ? `<div class="wx-places" role="tablist" aria-label="Places">${places
            .map(
              (p) =>
                `<button type="button" role="tab" class="wx-place-chip${p.key === place.key ? " is-active" : ""}" data-action="weather-place" data-key="${esc(p.key)}" aria-selected="${p.key === place.key}">${icon("pin", 14)}<span>${esc(p.label)}</span></button>`,
            )
            .join("")}</div>`
        : "";
    let body;
    if (wx && wx.tempC != null) {
      const hourly = Array.isArray(wx.hourly) ? wx.hourly.slice(0, 6) : [];
      const daily = Array.isArray(wx.daily) ? wx.daily.slice(0, 7) : [];
      const hourItems = hourly
        .map(
          (h, i) =>
            `<li class="wx-hour${i === 0 ? " is-now" : ""}"><span class="wx-hour__t">${i === 0 ? "Now" : esc(hourLabel(h.time))}</span>${icon(h.iconName, 28)}<span class="wx-hour__temp">${esc(h.temp)}°</span><span class="wx-hour__meta">${icon("wx-drop", 14)}${h.precip != null ? esc(h.precip) : 0}%</span><span class="wx-hour__meta">${icon("wx-wind", 14)}${h.wind != null ? esc(h.wind) : 0}</span></li>`,
        )
        .join("");
      const dayItems = daily
        .map(
          (day, i) =>
            `<li class="wx-day${i === 0 ? " is-today" : ""}"><span class="wx-day__label">${esc(i === 0 ? "Today" : day.weekday || "")}</span><span class="wx-day__meta">${icon("wx-drop", 14)}${day.precip != null ? esc(day.precip) : 0}%</span><span class="wx-day__meta">${icon("wx-wind", 14)}${day.wind != null ? esc(day.wind) : 0} m/s</span><span class="wx-day__ico">${icon(day.iconName, 26)}</span><span class="wx-day__hi">${esc(day.hi)}°</span><span class="wx-day__lo">${day.lo != null ? esc(day.lo) + "°" : "—"}</span></li>`,
        )
        .join("");
      body = `${hourItems ? `<section class="wx-block" aria-label="Hourly forecast"><h2 class="wx-block__title">Hourly</h2><ul class="wx-hours">${hourItems}</ul></section>` : ""}${dayItems ? `<section class="wx-block wx-block--days" aria-label="Daily forecast"><h2 class="wx-block__title">7-day forecast</h2><ul class="wx-days">${dayItems}</ul></section>` : ""}<p class="weather-note">Forecast for your destination. tripto.to never uses your location.</p>`;
    } else if (state.offline) {
      body = `<section class="weather-empty"><span>${icon("info", 30)}</span><h1>Weather needs a connection</h1><p>Connect to load the forecast for your destination.</p></section>`;
    } else {
      body = `<section class="weather-empty"><span>${icon("weather", 30)}</span><h1>${state.weatherRefreshing ? "Loading forecast…" : "No forecast yet"}</h1><p>We could not find a forecast for this trip's destination.</p><button type="button" class="mobile-secondary-action" data-action="refresh-weather">${icon("refresh", 18)} Try again</button></section>`;
    }
    return `<div class="phone-app"><section class="screen weather-screen">${appBar("Weather", sub, true)}<main class="weather-page">${selector}${body}</main></section></div>`;
  }
  function currencyScreen() {
    if (!state.trip) return missingDetailScreen("Currency", "Select a trip to use the converter.");
    const currency = initCurrency(), rate = currency.rate == null ? NaN : Number(currency.rate), amount = Number(currency.amount) || 0;
    const result = Number.isFinite(rate) ? amount * rate : null;
    const money = (value, code) => {
      if (!Number.isFinite(value)) return "—";
      try { return new Intl.NumberFormat(undefined, { style:"currency", currency:code, maximumFractionDigits:2 }).format(value); }
      catch (_) { return `${value.toFixed(2)} ${code}`; }
    };
    const currencyChoice = (field) => {
      const code = currency[field];
      const name = TRAVEL_CURRENCIES.find(([itemCode]) => itemCode === code)?.[1] || "Currency";
      const label = field === "from" ? "From currency" : "To currency";
      return `<button type="button" class="currency-select-trigger" data-action="open-currency-picker" data-field="${field}" aria-haspopup="dialog" aria-label="${label}: ${esc(code)}, ${esc(name)}"><strong>${esc(code)}</strong><span>${esc(name)}</span>${icon("chevron-down",16)}</button>`;
    };
    const destinationLocation = (state.locations || []).find((location) => String(val(location,"type") || "") === "city");
    const destination = val(destinationLocation,"city","display_name") || state.trip.title || "Your destination";
    const status = state.currencyLoading
      ? `<span class="currency-status is-loading">${icon("refresh",14)} Updating…</span>`
      : currency.rate
        ? `<span class="currency-status">${currency.cached ? "Saved offline" : "Rate updated"}${currency.date ? ` · ${esc(currency.date)}` : ""}</span>`
        : `<span class="currency-status">Rate not loaded</span>`;
    const error = state.currencyError ? `<section class="currency-error" role="status">${icon("info",18)}<span>${esc(state.currencyError)}</span></section>` : "";
    return `<div class="phone-app"><section class="screen currency-screen">${appBar("Currency", state.trip.title || "Trip", true)}<main class="currency-page"><header class="currency-hero"><span class="currency-hero__icon">${icon("currency",23)}</span><div><span>TRIP RATE</span><h1 id="currency-converter-title">${esc(destination)} uses ${esc(destinationCurrency())}</h1><p>Your destination currency is ready automatically.</p></div></header><section class="currency-workspace" aria-labelledby="currency-converter-title"><section class="currency-zone currency-zone--pay"><header class="currency-zone__head"><span>You pay</span>${currencyChoice("from")}</header><label class="currency-amount"><span class="sr-only">Amount in ${esc(currency.from)}</span><input data-currency-amount type="number" inputmode="decimal" min="0" step="any" value="${esc(currency.amount)}" aria-label="Amount in ${esc(currency.from)}"></label><div class="currency-quick" aria-label="Quick amounts">${[10,50,100,500].map((value) => `<button type="button" data-action="currency-quick" data-value="${value}"${Number(currency.amount) === value ? " class=\"is-active\"" : ""}>${value}</button>`).join("")}</div></section><div class="currency-bridge"><button type="button" class="currency-swap" data-action="currency-swap" aria-label="Swap currencies">${icon("swap",21)}</button><span class="currency-rate-note">${Number.isFinite(rate) ? `1 ${esc(currency.from)} = ${esc(rate.toFixed(rate < 1 ? 4 : 3))} ${esc(currency.to)}` : "Update to load this rate"}</span></div><section class="currency-zone currency-zone--receive"><header class="currency-zone__head"><span>You get</span>${currencyChoice("to")}</header><output class="currency-result" aria-live="polite"><strong class="currency-result__amount">${esc(result == null ? "—" : money(result, currency.to))}</strong><span>${esc(currency.to)} · ${esc(TRAVEL_CURRENCIES.find(([code]) => code === currency.to)?.[1] || "Currency")}</span></output></section><footer class="currency-update-row"><div>${status}<small>${esc(currency.source || "Daily reference rates")}</small></div><button type="button" class="currency-refresh" data-action="refresh-currency" aria-label="Update exchange rate"${state.currencyLoading ? " disabled" : ""}>${icon("refresh",18)}<span>${state.currencyLoading ? "Updating" : "Update"}</span></button></footer></section>${error}<p class="currency-disclaimer">Reference rate only; providers may add fees. Amounts are calculated on this phone.</p></main></section></div>`;
  }
  function esimScreen() {
    const dest =
      (weatherPlaces()[0] && weatherPlaces()[0].label) ||
      (state.trip && state.trip.title) ||
      "your destination";
    const features = [
      ["bolt", "Ready in minutes"],
      ["globe", "200+ destinations"],
      ["phone", "Keep your number"],
      ["shield", "No roaming bills"],
    ];
    const featureRows = features
      .map(
        ([ic, t]) =>
          `<div class="esim-feature"><span class="esim-feature__icon">${icon(ic, 18)}</span><strong>${esc(t)}</strong></div>`,
      )
      .join("");
    return `<div class="phone-app"><section class="screen esim-screen">${appBar("Travel eSIM", "Partner offer", true)}<main class="esim-page"><section class="esim-hero"><span class="esim-hero__icon">${icon("sim", 40)}</span><h1>Land in ${esc(dest)} with data already on</h1><p>Skip the SIM-card queue and roaming bills — a travel eSIM works the moment you arrive.</p><div class="esim-offer"><strong>15% off</strong><span>your first plan with code</span><button type="button" class="esim-code" data-action="copy-esim-code" aria-label="Copy code FKWQX6ES">FKWQX6ES ${icon("copy", 16)}</button></div></section><section class="esim-features">${featureRows}</section><section class="esim-steps"><h2>How it works</h2><ol><li><span>1</span><p>Tap <strong>Get my eSIM</strong> below to open 7g.</p></li><li><span>2</span><p>Pick your destination and plan — enter code <strong>FKWQX6ES</strong> for 15% off.</p></li><li><span>3</span><p>Scan the QR to install it, then land connected.</p></li></ol></section><button type="button" class="mobile-primary-action esim-cta" data-action="esim-signup">${icon("external", 18)} Get my eSIM — 15% off</button><p class="esim-note">tripto.to partners with 7g. This opens 7g in a new tab and we may earn a commission — it never changes your price. tripto.to never uses your location.</p></main></section></div>`;
  }
  function addBookingScreen() {
    if (!state.trip) return noTripQuickAdd("booking", "Add Booking");
    const groups = [...new Set(Object.values(MANUAL_BOOKING_TYPES).map((config) => config.group))];
    const category = ([type, config]) => `<button type="button" class="manual-add-card manual-add-card--${esc(config.tone)}" data-action="add-type" data-type="${esc(type)}" data-manual-label="${esc(config.label)}" aria-label="Add ${esc(config.label)}"><span class="manual-add-card__icon">${icon(config.icon,24)}</span><span class="manual-add-card__copy"><strong>${esc(config.label)}</strong><small>${esc(config.hint)}</small></span></button>`;
    const groupedCategories = groups.map((group) => {
      const id = `manual-group-${group.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
      return `<section class="manual-add-group" aria-labelledby="${esc(id)}"><h2 id="${esc(id)}">${esc(group)}</h2><div class="manual-add-grid">${Object.entries(MANUAL_BOOKING_TYPES).filter(([,config])=>config.group===group).map(category).join("")}</div></section>`;
    }).join("");
    const secondary = (ic,title,copy,action) => `<button type="button" class="manual-add-secondary" data-action="${action}"><span>${icon(ic,20)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${icon("chevron",18)}</button>`;
    return focusedTaskPage(`Add to ${state.trip.title || "trip"}`, `<section class="manual-add-intro"><span>ADD NEW BOOKING</span><h1>Add to your trip</h1><p>Choose a type and add the confirmed details. You can attach tickets or vouchers inside the booking.</p></section><div class="manual-add-groups">${groupedCategories}</div><section class="manual-add-other" aria-labelledby="manual-add-other-title"><h2 id="manual-add-other-title">Already have a confirmation?</h2>${secondary("document","Upload a file","Review a ticket or confirmation","open-upload-booking")}${secondary("mail","Forward an email","Send it to go@tripto.to","open-forward-booking")}</section>`, "v2-add-booking manual-add-page");
  }
  function manualBookingSheet() {
    const options = Object.entries(MANUAL_BOOKING_TYPES);
    return bottomSheet("manual-booking","ADD NEW BOOKING",`<div class="sheet-options-group manual-v2-options" data-manual-category-list>${options.map(([type,config])=>`<button type="button" class="sheet-option" data-action="add-type" data-type="${esc(type)}" data-manual-label="${esc(config.label)}"><span class="info-icon">${icon(config.icon,21)}</span><span><strong>${esc(config.label)}</strong></span>${icon("chevron",20)}</button>`).join("")}</div>`);
  }
  function documentSheet() {
    const travelers = state.travelers
        .map(
          (traveler) =>
            `<label class="traveler-pill"><input type="checkbox" name="documentTraveler" value="${esc(traveler.id)}"><span>${esc(traveler.display_name || "Traveler")}</span></label>`,
        )
        .join(""),
      form = `<form class="sheet-form document-form" id="document-form"><div class="sheet-field"><label for="document-type">Document type</label><select id="document-type" name="documentType"><option value="boarding_pass">Boarding pass</option><option value="ticket">Ticket</option><option value="hotel_confirmation">Hotel confirmation</option><option value="reservation">Reservation</option><option value="voucher">Voucher</option><option value="qr_code">QR code</option><option value="other">Other document</option></select></div>${travelers ? `<div class="sheet-field"><label>Assign to traveler</label><div class="traveler-pills">${travelers}</div></div>` : ""}<div class="sheet-field"><label for="document-file">File</label><label class="document-file-picker" for="document-file">${icon("document",24)}<span><strong>Choose a file</strong><small>PDF, image, or Wallet pass · up to 10 MB</small></span></label><input class="sr-only" id="document-file" name="documentFile" type="file" accept="application/pdf,image/*,.pkpass" required><div class="document-file-meta" role="status">No file selected</div><div class="document-verify-state">Verification starts after you choose a file.</div></div><div class="sheet-submit">${primaryCta("Save on This Phone", "save-document", "download")}</div></form>`;
    return bottomSheet("document", "Save offline document", form);
  }
  function tripSwitchSheet() {
    // Only current + upcoming trips are switchable here; always keep the
    // currently-selected trip visible even if it has moved to the past.
    const shown = state.trips.filter((trip) => {
      const bucket = tripBucket(trip);
      return (
        bucket === "Current" ||
        bucket === "Upcoming" ||
        String(trip.id) === String(state.trip?.id)
      );
    });
    return bottomSheet(
      "trip",
      "Choose trip",
      `<div class="sheet-options-group sheet-options-group--v2">${shown
        .map(
          (trip) =>
            `<button class="sheet-option" data-action="select-trip" data-id="${esc(trip.id)}"><span class="info-icon">${icon("trips", 22)}</span><span><strong>${esc(trip.title)}</strong><small>${esc(formatTripDates(trip))}</small>${tripSharedBadge(trip)}</span></button>`,
        )
        .join("")}</div>`,
    );
  }
  function bookingEmailTripSheet() {
    const email=state.bookingEmails.find((row)=>String(row.id)===String(state.bookingEmailSelectionId));
    return bottomSheet("booking-email-trip","Choose trip",`<p class="sheet-note booking-email-trip-note">${esc(email?.subject||"Booking confirmation")}</p><div class="sheet-options-group">${state.trips.map((trip)=>`<button type="button" class="sheet-option" data-action="assign-booking-email" data-email-id="${esc(email?.id||"")}" data-trip-id="${esc(trip.id)}"><span class="info-icon">${icon("trips",21)}</span><span><strong>${esc(trip.title||"Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small></span>${icon("chevron",20,"chevron")}</button>`).join("")||`<p class="sheet-note">Create a trip before assigning this confirmation.</p><button type="button" class="mobile-primary-action" data-action="create-trip">Create trip</button>`}</div>`);
  }
  function firstRunHowSheet() {
    const steps = [
      ["trips", "Create your trip"],
      ["calendar", "Add your bookings"],
      ["clock", "Everything becomes one Timeline"],
      ["shield", "Know what matters next"],
    ];
    return bottomSheet(
      "first-run-how",
      "How it works",
      `<ol class="first-run-how-list">${steps
        .map(
          ([iconName, label], index) =>
            `<li><span class="first-run-how-list__number">${index + 1}</span><span class="first-run-how-list__icon">${icon(iconName, 21)}</span><strong>${esc(label)}</strong></li>`,
        )
        .join("")}</ol><button class="first-run-how-done" data-action="finish-first-run-how">Got it</button>`,
    );
  }
  function helpSheet() {
    const hasTrip = Boolean(state.trip && !PREVIEW_MODE);
    const rowLink = (ic, title, sub, href) => `<a class="sheet-option" href="${href}"><span class="info-icon">${icon(ic, 21)}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${icon("chevron", 20, "chevron")}</a>`;
    const rowAct = (ic, title, sub, action) => `<button class="sheet-option" data-action="${action}"><span class="info-icon">${icon(ic, 21)}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${icon("chevron", 20, "chevron")}</button>`;
    return bottomSheet(
      "help",
      "Help, privacy & terms",
      `<div class="sheet-options-group sheet-options-group--v2">${rowAct("info", "How tripto.to works", "A quick tour of the basics", "open-first-run-how")}${rowAct("mail", "Booking email", "Forward confirmations to go@tripto.to", "booking-email-info")}${rowLink("shield", "Privacy Policy", "How your trip data is handled", "/privacy")}${rowLink("document", "Terms of Service", "The agreement for using tripto.to", "/terms")}${hasTrip ? rowAct("download", "Download support bundle", "Diagnostics for this trip — no private details", "export-support") : ""}</div><p class="sheet-note">tripto.to Product V2</p>`,
    );
  }

  function skeletonRows(count = 4) {
    return `<div class="skeleton-list">${Array.from({ length: count }, () => `<div class="skeleton-list-row"><i></i><span><b></b><small></small></span></div>`).join("")}</div>`;
  }
  function loadingSkeleton(screen = state.screen) {
    const common = `<div class="skeleton-appbar"><i></i><b></b><i></i></div>`,
      listing = ["trips", "bookings", "documents", "travelers", "import-history"].includes(screen),
      detail = ["flight", "hotel", "train", "plan", "traveler"].includes(screen);
    let body;
    if (screen === "timeline")
      body = `<div class="skeleton-date"></div><div class="skeleton-timeline">${Array.from({ length: 4 }, () => `<div><i></i><span><b></b><small></small></span></div>`).join("")}</div>`;
    else if (screen === "account")
      body = `<div class="skeleton-profile"><i></i><span><b></b><small></small></span></div>${skeletonRows(5)}`;
    else if (listing) body = `<div class="skeleton-heading"></div>${skeletonRows(4)}`;
    else if (detail)
      body = `<div class="skeleton-detail-hero"><div></div><div></div></div><div class="skeleton-facts">${Array.from({ length: 3 }, () => `<i></i>`).join("")}</div>${skeletonRows(2)}`;
    else
      body = `<div class="skeleton-heading"></div><div class="skeleton-home-pass"><div></div><span></span><i></i></div>${skeletonRows(2)}`;
    return `<div class="loading-skeleton loading-skeleton--${esc(screen)}" role="status" aria-label="Opening your trip">${common}${body}<span class="sr-only">Opening your trip…</span></div>`;
  }
  function loadingScreen() {
    // Cold boot with no local cache (first visit, or iOS Safari evicted
    // localStorage after ~7 days of inactivity) used to flash a full-screen
    // grey skeleton, which users read as a broken page. Show a branded splash
    // instead so the brief pre-data moment always looks intentional.
    return `<div class="phone-app"><section class="loading-screen" role="status" aria-live="polite" aria-label="Loading tripto.to"><div class="loading-mark">tripto<span>.</span>to</div><div class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></div><span class="sr-only">Loading your trips…</span></section></div>`;
  }
  function errorScreen() {
    const rejected = state.sessionRejected;
    return `<div class="phone-app"><section class="screen">${topbar()}<div class="error-state"><div class="empty-mobile-icon">${icon(rejected ? "user" : "warning", 31)}</div><h1>${rejected ? "Reconnect your account" : "Trip data could not load"}</h1><p>${esc(state.error || "An unexpected error occurred.")}</p><p class="recovery-safe">Saved trip data on this phone remains safe.</p>${state.requestId ? `<code>Request ID: ${esc(state.requestId)}</code>` : ""}${primaryCta(rejected ? "Reconnect with Google" : "Try Again", rejected ? "restart-google-sign-in" : "retry", rejected ? "user" : "refresh")}</div>${bottomNav("home")}</section></div>`;
  }
  function googleAuthRecoveryScreen() {
    const pending = state.googleAuthHandoffStatus === "pending";
    return `<div class="phone-app"><section class="screen screen--navless google-auth-recovery"><header class="google-auth-recovery__brand" aria-label="tripto.to">tripto<span>.</span>to</header><main class="error-state" role="status" aria-live="polite"><div class="empty-mobile-icon">${icon(pending ? "refresh" : "warning", 31)}</div><h1>${pending ? "Finish signing in" : "Sign-in link expired"}</h1><p>${esc(state.googleAuthHandoffMessage || (pending ? "The secure sign-in handoff was interrupted." : "Please start Google sign-in again."))}</p><p class="recovery-safe">Your trips, offline files, and unsynced changes remain on this phone.</p>${primaryCta(pending ? "Try Again" : "Sign in again", pending ? "retry-google-sign-in" : "restart-google-sign-in", pending ? "refresh" : "user")}</main></section></div>`;
  }
  function toast() {
    const role = state.toastKind === "alert" ? "alert" : "status";
    if (!state.toast) return "";
    const action = state.toastAction
      ? `<button type="button" class="toast-mobile__action" data-action="toast-action">${esc(state.toastAction.label || "Undo")}</button>`
      : "";
    return `<div class="toast-mobile toast-mobile--${role} ${action ? "toast-mobile--action" : ""}" role="${role}" aria-live="${role === "alert" ? "assertive" : "polite"}"><span>${esc(state.toast)}</span>${action}</div>`;
  }
  function decorateScreen(html) {
    if (!state.routeMotion) return html;
    const motion = state.routeMotion;
    state.routeMotion = "";
    return html.replace(
      'class="phone-app"',
      `class="phone-app route-enter route-${motion}"`,
    );
  }
  function transitionRender() {
    // Route changes render immediately. The old route-enter/route-exit classes
    // had no CSS behind them, so the previous setTimeout was pure navigation
    // latency with no visible transition — removed for snappier taps.
    clearTimeout(routeTimer);
    render();
  }
  function render() {
    if (!app) return;
    document.documentElement.classList.remove("place-search-open");
    const firstRun = shouldShowFirstRun();
    const showWelcome = firstRun || state.screen === "home";
    syncFirstRunPresentation(showWelcome);
    document.documentElement.classList.toggle(
      "sheet-open",
      Boolean(state.sheet && state.sheet !== "driver"),
    );
    // Weather and eSIM are single-viewport pages that must never scroll. The
    // phone frame's min-height:100dvh would otherwise stretch past the visible
    // (svh) area and let the document drift under the toolbar; this class pins
    // the frame to the small viewport so the page holds perfectly still.
    document.documentElement.classList.toggle(
      "fixed-screen",
      !state.sheet && (state.screen === "weather" || state.screen === "esim"),
    );
    if (state.loading) {
      app.innerHTML = decorateScreen(loadingScreen());
      return;
    }
    if (state.googleAuthHandoffStatus) {
      app.innerHTML = decorateScreen(googleAuthRecoveryScreen()) + toast();
      bindDynamic();
      return;
    }
    if (state.error && !state.trip) {
      app.innerHTML = decorateScreen(errorScreen()) + toast();
      bindDynamic();
      return;
    }
    let html;
    if (state.sheet === "driver") html = driverScreen();
    else if (firstRun) html = firstRunScreen();
    else
      switch (state.screen) {
        case "home":
          html = firstRunScreen();
          break;
        case "trips":
          html = tripListScreen();
          break;
        case "timeline":
          html = timelineScreen();
          break;
        case "add-booking":
          html = addBookingScreen();
          break;
        case "flight":
          html = flightScreen();
          break;
        case "hotel":
          html = hotelScreen();
          break;
        case "bookings":
          html = premiumBookingsScreen();
          break;
        case "train": html = trainScreen(); break;
        case "plan": html = planScreen(); break;
        case "documents":
          html = documentsScreen();
          break;
        case "ready":
          html = readyScreen();
          break;
        case "health":
          html = healthScreen();
          break;
        case "account":
          html = accountScreen();
          break;
        case "checklist": html = checklistScreen(); break;
        case "help": html = helpScreen(); break;
        case "travelers": html = travelersScreen(); break;
        case "traveler": html = travelerScreen(); break;
        case "import": html = importScreen(); break;
        case "import-review": html = importReviewScreen(); break;
        case "import-history": html = importHistoryScreen(); break;
        case "booking-email-inbox": html = bookingEmailInboxScreen(); break;
        case "sync": html = syncScreen(); break;
        case "form": html = mobileFormScreen(); break;
        case "trip-map": html = tripMapScreen(); break;
        case "weather": html = weatherScreen(); break;
        case "currency": html = currencyScreen(); break;
        case "trip-options": html = tripOptionsScreen(); break;
        case "esim": html = esimScreen(); break;
        case "collaboration": html = collaborationScreen(); break;
        case "join": html = joinScreen(); break;
        default:
          html = state.trip ? timelineScreen() : firstRunScreen();
      }
    // Any screen that carries the bottom nav pins the whole frame to the small
    // viewport so the document can never scroll under the browser toolbar — that
    // scroll is what makes a fixed bottom bar appear to drift. With the frame
    // locked, the screen's own <main> is the single internal scroller and the
    // nav stays stuck in place on every screen, every time.
    document.documentElement.classList.toggle(
      "nav-frame",
      typeof html === "string" && html.includes('class="bottom-nav'),
    );
    html = decorateScreen(html);
    if (state.sheet === "add") html += addSheet();
    if (state.sheet === "document") html += documentSheet();
    if (state.sheet === "trips") html += tripSwitchSheet();
    if (state.sheet === "first-run-how") html += firstRunHowSheet();
    if (state.sheet === "help") html += helpSheet();
    if (state.sheet === "notifications") html += notificationsSheet();
    if (state.sheet === "manual-booking") html += manualBookingSheet();
    if (state.sheet === "manage-booking") html += manageBookingSheet();
    if (state.sheet === "move-booking") html += moveBookingSheet();
    if (state.sheet === "date-range") html += dateRangeSheet();
    if (state.sheet === "trip-setup-ready") html += tripSetupReadyScreen();
    if (state.sheet === "booking-email-trip") html += bookingEmailTripSheet();
    if (state.sheet === "share") html += shareSheet();
    if (state.sheet === "currency-picker") html += currencyPickerSheet();
    app.innerHTML = html + toast();
    // Prepare the approved Stay22 affiliate rewriting while this recommendation
    // page is visible. The normal Booking.com URL remains a working fallback.
    if (state.sheet === "trip-setup-ready") ensureStay22().catch(() => {});
    if (document.querySelector(".account-partners")) ensureStay22().catch(() => {});
    if (state.sheet && state.sheet !== "driver") {
      const background = app.querySelector(".phone-app");
      background?.setAttribute("inert", "");
      background?.setAttribute("aria-hidden", "true");
    }
    bindDynamic();
  }
  function focusKeyFor(element) {
    if (!element) return null;
    for (const key of ["action", "screen"])
      if (element.dataset?.[key])
        return {
          key,
          value: element.dataset[key],
          id: element.dataset.id || "",
          label: element.getAttribute("aria-label") || "",
        };
    return null;
  }
  function restoreSheetFocus() {
    const saved = sheetReturnFocus;
    sheetReturnFocus = null;
    if (!saved) return;
    requestAnimationFrame(() => {
      const selector = `[data-${saved.key}="${CSS.escape(saved.value)}"]${saved.id ? `[data-id="${CSS.escape(saved.id)}"]` : ""}${saved.label ? `[aria-label="${CSS.escape(saved.label)}"]` : ""}`,
        control = document.querySelector(selector);
      if (control) control.focus();
    });
  }
  function openSheet(name, opener) {
    if (!state.sheet)
      sheetReturnFocus = focusKeyFor(opener || document.activeElement);
    state.sheet = name;
    state.routeMotion = "";
    render();
  }
  function closeSheet() {
    const sheet = document.querySelector(".bottom-sheet,.full-screen-picker"),
      backdrop = document.querySelector(".sheet-backdrop"),
      finish = () => {
        state.sheet = null;
        state.dateRange = null;
        state.tripSetupPreview = null;
        state.moveBooking = null;
        state.currencyPickerField = null;
        render();
        restoreSheetFocus();
      };
    if (!sheet || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    sheet.classList.add("is-closing");
    backdrop?.classList.add("is-closing");
    setTimeout(finish, 180);
  }
  function setupSheet() {
    const sheet = document.querySelector(".bottom-sheet,.full-screen-picker");
    if (!sheet) return;
    const first =
      sheet.querySelector(
        '.full-screen-picker__back,.range-picker__summary,.sheet-option,input,select,button:not([data-action="close-sheet"])',
      ) || sheet;
    requestAnimationFrame(() => first.focus());
    if (!sheet.classList.contains("bottom-sheet")) return;
    sheet.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-sheet-drag]") || sheet.scrollTop > 0)
        return;
      sheetPointer = {
        id: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
      };
      sheet.setPointerCapture?.(event.pointerId);
    });
    sheet.addEventListener("pointermove", (event) => {
      if (!sheetPointer || event.pointerId !== sheetPointer.id) return;
      sheetPointer.lastY = Math.max(sheetPointer.startY, event.clientY);
      sheet.style.setProperty(
        "--sheet-drag",
        `${sheetPointer.lastY - sheetPointer.startY}px`,
      );
      sheet.classList.add("is-dragging");
    });
    sheet.addEventListener("pointerup", (event) => {
      if (!sheetPointer || event.pointerId !== sheetPointer.id) return;
      const distance = sheetPointer.lastY - sheetPointer.startY;
      sheetPointer = null;
      sheet.classList.remove("is-dragging");
      sheet.style.removeProperty("--sheet-drag");
      if (distance > 88) closeSheet();
    });
    sheet.addEventListener("pointercancel", () => {
      sheetPointer = null;
      sheet.classList.remove("is-dragging");
      sheet.style.removeProperty("--sheet-drag");
    });
  }
  function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach((row) => row.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
      control.removeAttribute("aria-invalid");
      const statusId = control.dataset.dateLabel ? `${control.id}-status` : "";
      if (statusId) control.setAttribute("aria-describedby", statusId);
      else control.removeAttribute("aria-describedby");
    });
  }
  function showFieldError(form, control, message) {
    if (!control) return;
    const rangeField = control.classList?.contains("date-range-input")
        ? control.closest(".date-range-field")
        : null,
      focusControl = rangeField?.querySelector(".date-range-trigger") || control,
      field = rangeField || control.closest("label") || control.parentElement,
      id = `${control.id || control.name || "field"}-error`,
      error = document.createElement("span");
    error.className = "field-error";
    error.id = id;
    error.setAttribute("role", "alert");
    error.textContent = message;
    field?.append(error);
    focusControl.setAttribute("aria-invalid", "true");
    const describedBy = [control.dataset.dateLabel ? `${control.id}-status` : "", id]
      .filter(Boolean)
      .join(" ");
    focusControl.setAttribute("aria-describedby", describedBy);
    const disclosure = control.closest(".form-more-panel");
    if (disclosure?.hidden) {
      disclosure.hidden = false;
      disclosure.classList.add("is-open");
      const toggle = form.querySelector(`[aria-controls="${disclosure.id}"]`);
      toggle?.setAttribute("aria-expanded", "true");
      if (toggle)
        toggle.querySelector(".form-more-chevron").innerHTML = icon(
          "chevronUp",
          18,
        );
    }
    control.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    requestAnimationFrame(() => focusControl.focus({ preventScroll: true }));
  }
  function validateFocusedForm(form) {
    clearFieldErrors(form);
    const kind = form.dataset.kind,
      baseKind = form.dataset.baseKind || bookingBaseKind(kind);
    if (kind === "trip") {
      const result = tripRules?.validateManualTrip({
        title: form.elements.title?.value || form.elements.destination?.value,
        startsOn: form.elements.startsOn?.value,
        endsOn: form.elements.endsOn?.value,
      });
      if (!result?.valid) {
        const field = result?.field === "title" ? "destination" : result?.field || "destination";
        const message = result?.field === "title" ? "Enter a destination." : result?.message || "Complete the required trip details.";
        showFieldError(form, form.elements[field], message);
        return false;
      }
    }
    if (baseKind === "hotel") {
      const checkIn = form.elements.checkInDate,
        checkOut = form.elements.checkOutDate;
      if (!checkIn?.value || !checkOut?.value) {
        showFieldError(form, checkIn || checkOut, "Choose check-in and check-out dates from one calendar.");
        return false;
      }
      if (checkIn?.value && checkOut?.value && checkOut.value < checkIn.value) {
        showFieldError(form, checkOut, "Check-out cannot be before check-in.");
        return false;
      }
    }
    if (baseKind === "flight") {
      const requiredEssentials = [
        "carrierName",
        "flightNumber",
        "fromLocation",
        "toLocation",
        "departureDate",
        "departureLocalTime",
      ];
      const invalidEssential = requiredEssentials
        .map((name) => form.elements[name])
        .find((control) => control && control.validity?.valid === false);
      if (invalidEssential) {
        showFieldError(
          form,
          invalidEssential,
          invalidEssential.validity?.valueMissing
            ? "This field is required."
            : "Check this value and try again.",
        );
        return false;
      }
    }
    if (baseKind === "flight") {
      const departureTimezone =
          String(form.elements.departureTimezone?.value || "") ||
          placeTimezoneForInput(form.elements.fromLocation, "flight"),
        arrivalTimezone =
          String(form.elements.arrivalTimezone?.value || "") ||
          placeTimezoneForInput(form.elements.toLocation, "flight");
      if (!departureTimezone) {
        setManualTimezoneFallback(form, form.elements.fromLocation, true);
        showFieldError(
          form,
          form.elements.departureTimezoneManual || form.elements.fromLocation,
          "Select a known airport or enter its time zone.",
        );
        return false;
      }
      const arrivalProvided =
        Boolean(String(form.elements.arrivalDate?.value || "").trim()) ||
        Boolean(String(form.elements.arrivalLocalTime?.value || "").trim());
      if (arrivalProvided && !arrivalTimezone) {
        setManualTimezoneFallback(form, form.elements.toLocation, true);
        showFieldError(
          form,
          form.elements.arrivalTimezoneManual || form.elements.toLocation,
          "Select a known airport or enter its time zone.",
        );
        return false;
      }
      form.elements.departureTimezone.value = departureTimezone;
      if (arrivalTimezone) form.elements.arrivalTimezone.value = arrivalTimezone;
    }
    if (["flight", "train"].includes(baseKind)) {
      const date = form.elements.arrivalDate,
        time = form.elements.arrivalLocalTime,
        timezone = form.elements.arrivalTimezone,
        hasDate = Boolean(String(date?.value || "").trim()),
        hasTime = Boolean(String(time?.value || "").trim());
      if (hasDate !== hasTime || ((hasDate || hasTime) && !String(timezone?.value || "").trim())) {
        const missing = !hasDate ? date : !hasTime ? time : timezone;
        showFieldError(
          form,
          missing,
          baseKind === "flight"
            ? "Add arrival date and local time together—or leave both unavailable. The airport timezone is automatic."
            : "Add arrival date, local time, and timezone together—or leave all three unavailable.",
        );
        return false;
      }
    }
    if (
      baseKind === "activity" &&
      form.elements.timeMode?.value === "specific" &&
      form.elements.activityTime?.value &&
      form.elements.activityTime.validity?.valid === false
    ) {
      showFieldError(
        form,
        form.elements.activityTime,
        "Check the local time and try again.",
      );
      return false;
    }
    if (kind === "car-rental") {
      if (!form.elements.reservationDate?.value || !form.elements.endDate?.value) {
        showFieldError(form, form.elements.reservationDate || form.elements.endDate, "Choose pickup and drop-off dates from one calendar.");
        return false;
      }
      const start = `${form.elements.reservationDate?.value || ""}T${form.elements.reservationTime?.value || ""}`,
        end = `${form.elements.endDate?.value || ""}T${form.elements.endTime?.value || ""}`,
        bothTimed = Boolean(form.elements.reservationTime?.value) && Boolean(form.elements.endTime?.value);
      if (bothTimed && end < start) {
        showFieldError(form, form.elements.endDate, "Drop-off cannot be before pickup.");
        return false;
      }
    }
    if (["cruise", "other"].includes(kind)) {
      const timeName = kind === "cruise" ? "activityTime" : "reservationTime",
        time = String(form.elements[timeName]?.value || "").trim(),
        timezone = String(form.elements.timezone?.value || "").trim(),
        endTime = String(form.elements.endTime?.value || "").trim();
      if ((time || endTime) && !timezone) {
        showFieldError(form, form.elements.timezone, "Add the event's time zone when a local time is provided.");
        return false;
      }
    }
    const invalid = form.querySelector(":invalid");
    if (!invalid) return true;
    const message = invalid.validity?.valueMissing
      ? "This field is required."
      : "Check this value and try again.";
    showFieldError(form, invalid, message);
    return false;
  }
  function showFormSubmissionError(form, message) {
    clearFieldErrors(form);
    const text = String(message || "The change was not saved."),
      timezoneError = /timezone/i.test(text),
      arrivalError = /arrival/i.test(text),
      timeError = /local time|daylight|ambiguous|date and time/i.test(text),
      control = timezoneError
        ? form.dataset.kind === "flight"
          ? arrivalError
            ? form.elements.toLocation
            : form.elements.fromLocation
          : form.elements.arrivalTimezone ||
            form.elements.departureTimezone ||
            form.elements.timezone
        : arrivalError
          ? form.elements.arrivalLocalTime
          : timeError
            ? form.elements.departureLocalTime || form.elements.startsAt
            : null;
    if (control) {
      showFieldError(form, control, text);
      return;
    }
    form.querySelector(".form-submit-error")?.remove();
    const alert = document.createElement("p"),
      saveBar = form.querySelector(".form-save-bar");
    alert.className = "form-submit-error";
    alert.setAttribute("role", "alert");
    alert.textContent = `${text} Existing trip data is unchanged.`;
    form.insertBefore(alert, saveBar || null);
    alert.scrollIntoView({ block: "center" });
  }
  function bindMeaningfulChanges(form) {
    let draftTimer = 0;
    const update = () => {
      formHasMeaningfulChanges = form.dataset.hasStagedAttachments === "true" || [...form.elements].some((control) => {
        if (!control.name || control.disabled) return false;
        if (control.type === "file") return Boolean(control.files?.length);
        if (["checkbox", "radio"].includes(control.type))
          return control.checked !== control.hasAttribute("checked");
        if (control.tagName === "SELECT") {
          const selected = [...control.selectedOptions].map((option) => option.value),
            defaults = [...control.options]
              .filter((option) => option.defaultSelected)
              .map((option) => option.value),
            expected = control.multiple
              ? defaults
              : defaults.length
                ? [defaults[0]]
                : control.options.length
                  ? [control.options[0].value]
                  : [];
          return selected.join("\u0000") !== expected.join("\u0000");
        }
        return String(control.value || "") !== String(control.defaultValue || "");
      });
    };
    const persist = (immediate) => {
      if (!supportsFormDraft(form.dataset.kind)) return;
      clearTimeout(draftTimer);
      if (immediate) { saveQuickDraft(form); return; }
      draftTimer = setTimeout(() => saveQuickDraft(form), 400);
    };
    form.addEventListener("input", () => { update(); persist(false); });
    form.addEventListener("change", () => { update(); persist(true); });
    update();
  }
  function saveQuickDraft(form) {
    const kind = form.dataset.kind;
    if (!supportsFormDraft(kind)) return;
    const values = {};
    for (const control of form.elements) {
      if (!control.name || control.type === "file" || control.disabled) continue;
      if (control.type === "checkbox") {
        if (!Array.isArray(values[control.name])) values[control.name] = [];
        if (control.checked) values[control.name].push(control.value);
      } else if (control.type === "radio") {
        if (control.checked) values[control.name] = control.value;
      } else values[control.name] = control.value;
    }
    values.__moreOpen =
      form.querySelector(".form-more-toggle")?.getAttribute("aria-expanded") ===
      "true";
    if (form.dataset.clientRequestId)
      values.__manualDraftId = form.dataset.clientRequestId;
    try {
      sessionStorage.setItem(quickDraftKey(kind), JSON.stringify(values));
    } catch (_) {}
  }
  function restoreQuickDraft(form) {
    let draft = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(quickDraftKey(form.dataset.kind)) || "null");
    } catch (_) {}
    if (!draft) return false;
    if (draft.__manualDraftId && form.dataset.clientRequestId)
      form.dataset.clientRequestId = String(draft.__manualDraftId);
    for (const control of form.elements) {
      if (!control.name || control.type === "file") continue;
      const saved = draft[control.name];
      if (control.type === "checkbox")
        control.checked = Array.isArray(saved) && saved.includes(control.value);
      else if (control.type === "radio") control.checked = saved === control.value;
      else if (saved !== undefined) control.value = saved;
    }
    if (draft.__moreOpen) setQuickMoreOpen(form, true);
    return true;
  }
  function setQuickMoreOpen(form, open) {
    const toggle = form.querySelector(".form-more-toggle"),
      panel = toggle
        ? document.getElementById(toggle.getAttribute("aria-controls"))
        : null;
    if (!toggle || !panel) return;
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    panel.classList.toggle("is-open", open);
    toggle.querySelector(".form-more-chevron").innerHTML = icon(
      open ? "chevronUp" : "chevronDown",
      18,
    );
  }
  function revealPrefilledQuickMore(form) {
    const toggle = form.querySelector(".form-more-toggle"),
      panel = toggle
        ? document.getElementById(toggle.getAttribute("aria-controls"))
        : null;
    if (!panel || !panel.hidden) return;
    const populated = Array.from(
      panel.querySelectorAll("input, select, textarea"),
    ).some((el) => {
      if (el.type === "checkbox" || el.type === "radio") return el.checked;
      const value = String(el.value || "").trim();
      if (!value) return false;
      if (el.tagName === "SELECT")
        return el.selectedIndex > 0 && value !== (el.options[0]?.value || "");
      return true;
    });
    if (populated) setQuickMoreOpen(form, true);
  }
  function normalizedLocationInput(value) {
    return String(value || "")
      .trim()
      .replace(/\s+[—-]\s+/, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }
  function knownLocationForInput(value, kind) {
    const wanted = normalizedLocationInput(value);
    if (!wanted) return null;
    return (
      state.locations.find((location) => {
        const code = String(
            val(location, kind === "flight" ? "iata_code" : "station_code") ||
              "",
          ),
          name = String(val(location, "display_name", "local_name") || ""),
          combined = `${code} ${name}`.trim();
        return [code, name, combined]
          .map(normalizedLocationInput)
          .filter(Boolean)
          .includes(wanted);
      }) || null
    );
  }
  function airportCodeForInput(value) {
    return globalThis.TriptoAirportTimezones?.airportCodeFromInput?.(value) || null;
  }
  function tripDefaultTimezone() {
    const counts = {};
    for (const item of state.timeline || []) {
      const tz = String(val(item, "start_timezone", "startTimezone") || "");
      if (tz) counts[tz] = (counts[tz] || 0) + 2;
    }
    for (const location of state.locations || []) {
      const tz = String(val(location, "timezone") || "");
      if (tz) counts[tz] = (counts[tz] || 0) + 1;
    }
    let best = "", bestCount = 0;
    for (const [tz, count] of Object.entries(counts))
      if (count > bestCount) { best = tz; bestCount = count; }
    return best;
  }
  function timezoneForLocationInput(value, kind) {
    const location = knownLocationForInput(value, kind);
    if (kind === "flight") {
      const code =
        String(val(location, "iata_code") || "").toUpperCase() ||
        airportCodeForInput(value);
      const catalogTimezone = globalThis.TriptoAirportTimezones?.timezoneForAirport?.(code);
      if (catalogTimezone) return String(catalogTimezone);
    }
    return String(val(location, "timezone") || "");
  }
  function syncQuickTimezone(form, input) {
    const kind = form.dataset.kind,
      baseKind = bookingBaseKind(kind),
      role = input.dataset.locationRole,
      locationKind = kind === "flight" ? "flight" : ["train","ferry"].includes(kind) ? "train" : "activity",
      selectedPlace = selectedPlaceForInput(input),
      timezone = String(selectedPlace?.timezone || timezoneForLocationInput(input.value, locationKind) || ""),
      timezoneName = role === "arrival" ? (form.elements.arrivalTimezone ? "arrivalTimezone" : "endTimezone") : ["activity","reservation","transport"].includes(baseKind) ? "timezone" : "departureTimezone",
      control = form.elements[timezoneName],
      field = input.closest(".form-field");
    if (!control) return;
    form.querySelector(`[data-timezone-status="${CSS.escape(role || "location")}"]`)?.remove();
    field?.querySelector(".timezone-derived")?.remove();
    if (timezone) {
      control.value = timezone;
      control.dataset.derived = "true";
      if (field) {
        field.classList.add("is-derived-timezone");
        field.insertAdjacentHTML(
          "afterend",
          `<p class="timezone-derived" data-timezone-status="${esc(role || "location")}">${icon("check", 16)} ${esc(timezone)} — the selected ${kind === "flight" ? "airport's local time" : kind === "train" ? "station's local time" : "location's local time"}</p>`,
        );
      }
    } else {
      // Location cleared or unrecognized: fall back to the trip's default zone
      // (seeded on the hidden control) rather than leaving it empty, so
      // resolveEventLocalDateTime always has a valid zone to work with.
      if (control.dataset.derived === "true") control.value = control.dataset.defaultTimezone || "";
      delete control.dataset.derived;
      field?.classList.remove("is-derived-timezone");
    }
  }
  function placeTimezoneForInput(input, kind = "flight") {
    return String(
      selectedPlaceForInput(input)?.timezone ||
        timezoneForLocationInput(input?.value, kind) ||
        "",
    );
  }
  function syncQuickConditionalFields(form) {
    if (["activity","tour","attraction","event"].includes(form.dataset.kind)) {
      const unset = form.elements.timeMode?.value === "unset",
        group = form.querySelector(".form-fields--activity-time"),
        time = form.elements.activityTime,
        timezone = form.elements.timezone;
      group?.classList.toggle("is-time-unset", unset);
      group?.setAttribute("aria-hidden", String(unset));
      if (time) {
        time.disabled = unset;
        time.required = !unset;
      }
      if (timezone) {
        timezone.disabled = unset;
        timezone.required = !unset;
      }
    }
    if (form.dataset.kind === "document") {
      const type = form.elements.documentType?.value,
        travelerSpecific = ["boarding_pass", "ticket", "passport_copy"].includes(type),
        assignment = form.querySelector(".document-traveler-assignment");
      if (assignment)
        assignment.hidden = state.travelers.length <= 1 && !travelerSpecific;
    }
  }
  function formSubmitButton(form) {
    if (!form) return null;
    return (
      form.querySelector('button[type="submit"]') ||
      (form.id ? document.querySelector(`button[type="submit"][form="${form.id}"]`) : null)
    );
  }
  function setFormSaving(form, saving, label = "Saving…") {
    if (!form) return;
    const submit = formSubmitButton(form);
    if (!submit) return;
    if (!submit.dataset.defaultLabel)
      submit.dataset.defaultLabel = submit.innerHTML;
    form.setAttribute("aria-busy", String(saving));
    submit.disabled = saving;
    submit.toggleAttribute("aria-busy", saving);
    submit.classList.toggle("is-loading", saving);
    submit.innerHTML = saving
      ? `<span class="button-spinner" aria-hidden="true"></span>${esc(label)}`
      : submit.dataset.defaultLabel;
  }
  function keepFocusedFieldVisible() {
    const focused = document.activeElement;
    if (!focused?.matches?.("input,select,textarea")) return;
    requestAnimationFrame(() =>
      focused.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }),
    );
  }
  let keyboardOpen = false, fieldFocused = false, lastObscured = -1;
  const KEYBOARD_FIELD_SELECTOR = "input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]),select,textarea";
  function applyKeyboardState() {
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen || fieldFocused);
  }
  function syncVisualViewport() {
    const viewport = window.visualViewport,
      obscured = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0,
      rounded = Math.round(obscured);
    if (rounded !== lastObscured) {
      lastObscured = rounded;
      document.documentElement.style.setProperty("--keyboard-offset", `${rounded}px`);
    }
    const open = obscured > 80;
    if (open && !keyboardOpen) keepFocusedFieldVisible();
    keyboardOpen = open;
    applyKeyboardState();
  }
  function bindDynamic() {
    const form = document.getElementById("document-form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      const fileInput = form.elements.documentFile,
        fileMeta = form.querySelector(".document-file-meta"),
        verifyState = form.querySelector(".document-verify-state");
      fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) {
          fileMeta.textContent = "No file selected";
          verifyState.textContent = "Verification starts after you choose a file.";
          return;
        }
        fileMeta.textContent = `${file.name} · ${file.size < 1048576 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1048576).toFixed(1)} MB`}`;
        verifyState.textContent = "Ready to verify when saved on this phone.";
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveDocumentForm(form);
      });
    }
    const nativeForm = document.getElementById("native-form");
    if (nativeForm && !nativeForm.dataset.bound) {
      nativeForm.dataset.bound = "1";
      restoreQuickDraft(nativeForm);
      if (nativeForm.dataset.editId) revealPrefilledQuickMore(nativeForm);
      if (nativeForm.dataset.kind === "flight" && state.pendingReturnFlight) {
        const ret = state.pendingReturnFlight,
          fromPlace = nativeForm.elements.fromLocationPlace,
          toPlace = nativeForm.elements.toLocationPlace;
        if (fromPlace && ret.fromLocationPlace) fromPlace.value = ret.fromLocationPlace;
        if (toPlace && ret.toLocationPlace) toPlace.value = ret.toLocationPlace;
        state.pendingReturnFlight = null;
      }
      const roundTripToggle = nativeForm.elements.roundTrip, returnFields = nativeForm.querySelector("[data-round-trip-return]");
      if (roundTripToggle && returnFields) {
        const returnDate = nativeForm.elements.returnDepartureDate, returnTime = nativeForm.elements.returnDepartureLocalTime;
        const syncReturn = () => {
          const on = roundTripToggle.checked;
          returnFields.hidden = !on;
          if (returnDate) returnDate.required = on;
          if (returnTime) returnTime.required = on;
          const rangeField = returnDate?.closest(".date-range-field"), rangeTrigger = rangeField?.querySelector(".date-range-trigger");
          if (rangeField) rangeField.dataset.allowSingle = on ? "false" : "true";
          if (!on && returnDate) returnDate.value = "";
          if (rangeTrigger) rangeTrigger.dataset.rangeTitle = on ? "Travel dates" : "Departure date";
          if (returnDate) syncDateRangeField(nativeForm, "departureDate", "returnDepartureDate");
        };
        roundTripToggle.addEventListener("change", syncReturn);
        syncReturn();
      }
      bindDateRangeControls(nativeForm);
      syncQuickConditionalFields(nativeForm);
      nativeForm
        .querySelectorAll("[data-place-types]")
        .forEach((input) => bindPlaceAutocomplete(nativeForm, input));
      nativeForm
        .querySelectorAll("input[list]")
        .forEach((input) => bindDatalistAutocomplete(nativeForm, input));
      nativeForm
        .querySelectorAll("[data-location-role]")
        .forEach((input) => {
          const sync = () => {
            syncQuickTimezone(nativeForm, input);
            saveQuickDraft(nativeForm);
          };
          input.addEventListener("input", sync);
          input.addEventListener("change", sync);
          sync();
        });
      nativeForm.querySelectorAll("[data-timezone-manual-for]").forEach((input) => {
        input.addEventListener("input", () => {
          const control = nativeForm.elements[input.dataset.timezoneManualFor];
          if (control) {
            control.value = input.value.trim();
            delete control.dataset.derived;
          }
          saveQuickDraft(nativeForm);
        });
      });
      nativeForm
        .querySelectorAll('input[name="timeMode"],select[name="documentType"]')
        .forEach((control) =>
          control.addEventListener("change", () => {
            syncQuickConditionalFields(nativeForm);
            saveQuickDraft(nativeForm);
          }),
        );
      const nativeFile = nativeForm.elements.documentFile;
      if (nativeFile) {
        const fileMeta = nativeForm.querySelector(".document-file-meta"),
          verifyState = nativeForm.querySelector(".document-verify-state");
        nativeFile.addEventListener("change", () => {
          const file = nativeFile.files?.[0];
          if (!file) {
            fileMeta.textContent = "No file selected";
            if (verifyState) verifyState.textContent =
              "Ready offline appears only after checksum verification succeeds.";
            return;
          }
          fileMeta.textContent = `${file.name} · ${
            file.size < 1048576
              ? `${Math.max(1, Math.round(file.size / 1024))} KB`
              : `${(file.size / 1048576).toFixed(1)} MB`
          }`;
          if (verifyState) verifyState.textContent = "Ready to verify when saved on this phone.";
        });
      }
      const manualFiles = nativeForm.querySelector("[data-manual-attachments]");
      if (manualFiles) {
        const attachmentList = nativeForm.querySelector("[data-manual-attachment-list]");
        refreshManualAttachmentPanel(nativeForm, true)
          .then((record) => {
            if (record?.files?.length) formHasMeaningfulChanges = true;
          })
          .catch(() => {});
        manualFiles.addEventListener("change", async () => {
          const files = Array.from(manualFiles.files || []),
            type = String(nativeForm.elements.manualDocumentType?.value || "other"),
            picker = manualFiles.closest(".manual-attachments__picker"),
            submit = formSubmitButton(nativeForm);
          if (!files.length) return;
          picker?.classList.add("is-busy");
          nativeForm.dataset.manualAttachmentsBusy = "true";
          manualFiles.disabled = true;
          if (submit) submit.disabled = true;
          try {
            await stageManualAttachments(nativeForm.dataset.attachmentScope, files, {
              documentType: type,
              kind: nativeForm.dataset.kind,
              tripId: state.trip?.id || null,
              travelerIds: selectedTravelerIds(new FormData(nativeForm)),
            });
            formHasMeaningfulChanges = true;
            await refreshManualAttachmentPanel(nativeForm);
          } catch (error) {
            showFormSubmissionError(nativeForm, error?.message || "The selected files could not be prepared. Your booking details are still here.");
          } finally {
            delete nativeForm.dataset.manualAttachmentsBusy;
            manualFiles.disabled = false;
            manualFiles.value = "";
            picker?.classList.remove("is-busy");
            if (submit && nativeForm.getAttribute("aria-busy") !== "true") submit.disabled = false;
          }
        });
        attachmentList?.addEventListener("change", async (event) => {
          const select = event.target.closest("[data-manual-attachment-type]");
          if (!select) return;
          select.disabled = true;
          try {
            await retypeManualAttachment(select.dataset.scope, select.dataset.id, select.value);
            formHasMeaningfulChanges = true;
            nativeForm.dataset.hasStagedAttachments = "true";
            await refreshManualAttachmentPanel(nativeForm);
          } catch (error) {
            showFormSubmissionError(nativeForm, error?.message || "The document type could not be updated.");
          } finally {
            if (document.contains(select)) select.disabled = false;
          }
        });
      }
      bindMeaningfulChanges(nativeForm);
      nativeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (nativeForm.dataset.kind === "trip" && !nativeForm.dataset.editId) {
          saveQuickDraft(nativeForm);
          state.tripSetupPreview = {
            destination:String(nativeForm.elements.destination?.value || "").trim(),
            startsOn:nativeForm.elements.startsOn?.value || "",
            endsOn:nativeForm.elements.endsOn?.value || "",
          };
          state.dateRange = null;
          state.sheet = "trip-setup-ready";
          render();
          return;
        }
        if (!validateFocusedForm(nativeForm)) return;
        saveNativeForm(nativeForm);
      });
    }
    const importReviewForm = document.getElementById("import-review-form");
    if (importReviewForm && !importReviewForm.dataset.bound) {
      importReviewForm.dataset.bound = "1";
      bindMeaningfulChanges(importReviewForm);
      prefillImportTimezones(importReviewForm);
    }
    const importForm = document.getElementById("import-form");
    if (importForm && !importForm.dataset.bound) {
      importForm.dataset.bound = "1";
      bindMeaningfulChanges(importForm);
      importForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validateFocusedForm(importForm)) return;
        previewImportForm(importForm);
      });
    }
    setupGoogleSignIn();
    const checklistAddForm = document.getElementById("checklist-add-form");
    if (checklistAddForm && !checklistAddForm.dataset.bound) {
      checklistAddForm.dataset.bound = "1";
      checklistAddForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = checklistAddForm.elements.title;
        const title = String(input?.value || "").trim();
        if (!title) return;
        input.value = "";
        state.focusChecklistAdd = true;
        addChecklistItem(title).catch((error) =>
          showToast(error instanceof Error ? error.message : String(error), "alert"),
        );
      });
    }
    if (state.focusChecklistAdd) {
      state.focusChecklistAdd = false;
      const input = document.querySelector("#checklist-add-form .cl-add__input");
      if (input) input.focus();
    }
    const checklistEditForm = document.querySelector("form[data-checklist-edit]");
    if (checklistEditForm && !checklistEditForm.dataset.bound) {
      checklistEditForm.dataset.bound = "1";
      checklistEditForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renameChecklistItem(checklistEditForm.dataset.id, checklistEditForm.elements.title?.value).catch((error) =>
          showToast(error instanceof Error ? error.message : String(error), "alert"),
        );
      });
    }
    if (state.focusChecklistEdit) {
      state.focusChecklistEdit = false;
      const input = document.querySelector("form[data-checklist-edit] .cl-edit__input");
      if (input) {
        input.focus();
        const end = input.value.length;
        try { input.setSelectionRange(end, end); } catch (_) {}
      }
    }
    setupSheet();
  }
  function resolveEventLocalDateTime(localValue, timeZone) {
    if (!localValue || !timeZone) throw new Error("Local time and time zone are required.");
    const match = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) throw new Error("Enter a valid local date and time.");
    try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); } catch (_) { throw new Error("Use a valid time zone, for example Europe/Rome."); }
    const target = Date.UTC(+match[1], +match[2]-1, +match[3], +match[4], +match[5]), offsets = new Set();
    for (let h=-36; h<=36; h+=3) { const instant=target+h*3600000, parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant)), row={}; parts.forEach((part)=>{if(part.type!=="literal")row[part.type]=part.value;}); offsets.add(Math.round((Date.UTC(+row.year,+row.month-1,+row.day,+row.hour,+row.minute)-instant)/60000)); }
    const wanted=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`, candidates=[...offsets].map((offset)=>target-offset*60000).filter((instant)=>{ const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant)), row={}; parts.forEach((part)=>{if(part.type!=="literal")row[part.type]=part.value;}); return `${row.year}-${row.month}-${row.day}T${row.hour}:${row.minute}`===wanted; });
    if (new Set(candidates).size !== 1) throw new Error("That local time is ambiguous or unavailable because of a timezone change. Verify the booking time.");
    return candidates[0];
  }
  async function createMobileLocation(type, name, extra={}) {
    if (PREVIEW_MODE) return { id: `preview-${type}-${Date.now()}` };
    const result = await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/locations`, { method:"POST", body:JSON.stringify({ type, displayName:name, ...extra }) });
    return result.location;
  }
  function parsePlaceSnapshot(value) {
    if (!value) return null;
    try { return typeof value === "string" ? JSON.parse(value) : value; }
    catch (_) { return null; }
  }
  async function createLocationFromPlace(place, fallbackType) {
    if (!place) return null;
    if (place.savedLocationId) {
      const saved = state.locations.find((location) => String(location.id) === String(place.savedLocationId));
      if (saved) return saved;
    }
    return createMobileLocation(place.type || fallbackType, place.displayName || place.name, {
      placeId: place.id || null,
      localName: place.localName || null,
      latitude: Number.isFinite(place.latitude) ? place.latitude : null,
      longitude: Number.isFinite(place.longitude) ? place.longitude : null,
      countryName: place.countryName || null,
      countryCode: place.countryCode || null,
      region: place.region || null,
      city: place.cityName || (place.type === "city" ? place.name : null),
      timezone: place.timezone || null,
      iataCode: place.iata || null,
      icaoCode: place.icao || null,
    });
  }
  async function createManualVenueLocation(type, displayName, cityContext, streetAddress, timezone, selectedPlace, existingId = "") {
    const name = String(displayName || cityContext || streetAddress || "").trim(),
      city = String(cityContext || "").trim(), address = String(streetAddress || "").trim(),
      snapshot = parsePlaceSnapshot(selectedPlace), existing = locationById(existingId);
    if (!name) return null;
    if (existing) {
      const existingName = String(val(existing, "display_name", "local_name") || "").trim(),
        existingCity = String(val(existing, "city") || "").trim(),
        existingAddress = String(val(existing, "local_address", "formatted_address") || "").trim();
      if (existingName === name && existingCity === city && existingAddress === address) return existing;
    }
    return createMobileLocation(type, name, {
      formattedAddress: address || city || null,
      localAddress: address || null,
      city: snapshot?.cityName || (snapshot?.type === "city" ? snapshot.name : null) || city || null,
      countryName: snapshot?.countryName || null,
      countryCode: snapshot?.countryCode || null,
      region: snapshot?.region || null,
      timezone: snapshot?.timezone || timezone || null,
    });
  }
  function quickLocationParts(value, kind) {
    const known = knownLocationForInput(value, kind);
    if (known) return { known, name: String(val(known, "display_name", "local_name") || value), code: String(val(known, kind === "flight" ? "iata_code" : "station_code") || "") };
    const text = String(value || "").trim(), match = text.match(/^([A-Z0-9]{2,12})\s+[—-]\s+(.+)$/i), airportCode = kind === "flight" ? airportCodeForInput(text) : null;
    return { known: null, name: match ? match[2].trim() : text, code: airportCode || (match ? match[1].toUpperCase() : "") };
  }
  async function quickLocation(value, kind, timezone = "", selectedPlace = null) {
    const parts = quickLocationParts(value, kind);
    if (parts.known) return parts.known;
    const type = kind === "flight" ? "airport" : kind === "train" ? "station" : kind === "hotel" ? "hotel" : kind === "transport" ? "address" : kind === "reservation" ? "restaurant" : "attraction";
    const snapshot = parsePlaceSnapshot(selectedPlace);
    if (snapshot) return createLocationFromPlace(snapshot, type);
    return createMobileLocation(type, parts.name, {
      ...(timezone ? { timezone } : {}),
      ...(kind === "flight" && parts.code ? { iataCode: parts.code } : {}),
      ...(kind === "train" && parts.code ? { stationCode: parts.code } : {}),
    });
  }
  function selectedTravelerIds(fd) {
    return fd.getAll("travelerIds").map(String).filter(Boolean);
  }
  function localDateTime(fd, dateName, timeName) {
    const date = String(fd.get(dateName) || ""), time = String(fd.get(timeName) || "");
    return date && time ? `${date}T${time}` : "";
  }
  function parseFlightNumber(value) {
    const raw = String(value || "").trim().toUpperCase(), match = raw.match(/^([A-Z0-9]{2,3})\s*[- ]?\s*(\d{1,4}[A-Z]?)$/);
    if (!match) throw new Error("Enter a flight number such as LY 383.");
    return { raw: `${match[1]} ${match[2]}`, code: match[1], number: match[2] };
  }
  async function saveTravelerFacts(tripId, itemId, travelerIds, fd) {
    const assignedTravelerIds = [...new Set((travelerIds || []).map(String).filter(Boolean))];
    if (!itemId || !assignedTravelerIds.length) return;
    const values = {
      seat: fd.get("seat") || null,
      cabinClass: fd.get("cabin") || null,
      ticketNumber: fd.get("ticketNumber") || null,
      checkedBags: fd.get("checkedBags") === "" ? null : Number(fd.get("checkedBags")),
    };
    if (!Object.values(values).some((value) => value !== null && value !== "")) return;
    for (const travelerId of assignedTravelerIds) {
      await api(`/api/v1/trips/${tripId}/booking-details`, { method: "PUT", body: JSON.stringify({ tripItemId: itemId, travelerId, ...values }) });
    }
  }
  async function saveManualContact(tripId, itemId, type, displayName, details = {}, existingEntity = null, clientRequestId = "") {
    const phone = String(details.phone || "").trim(), email = String(details.email || "").trim(),
      notes = String(details.notes || "").trim(), name = String(displayName || statusText(type)).trim(),
      existing = (existingEntity ? directItemContact(existingEntity, type) : null) || directItemContactById(itemId, type),
      body = { contactType:type, displayName:name, phone:phone || null, email:email || null, notes:notes || null, tripItemId:itemId };
    if (!name && !phone && !email && !notes) return null;
    if (existing?.id) {
      return api(`/api/v1/trips/${tripId}/contacts/${encodeURIComponent(existing.id)}`, {
        method:"PATCH", body:JSON.stringify({ ...body, version:Number(existing.version) || 1 }),
      });
    }
    const requestKey = clientRequestId ? `${clientRequestId}:contact:${type}` : "";
    return api(`/api/v1/trips/${tripId}/contacts`, {
      method:"POST",
      ...(requestKey ? { headers:{ "Idempotency-Key":requestKey } } : {}),
      body:JSON.stringify(body),
    });
  }
  async function saveManualSecondaryDetails(kind, tripId, itemId, fd, existingEntity, saveContact = saveManualContact, clientRequestId = "") {
    if (!itemId) return "";
    try {
      const travelers = selectedTravelerIds(fd), userNotes = String(fd.get("notes") || ""),
        config = manualBookingConfig(kind), label = config?.label || "Booking",
        saveScopedContact = (type, displayName, details = {}) =>
          saveContact(tripId, itemId, type, displayName, details, existingEntity, clientRequestId);
      if (["flight", "train", "ferry"].includes(kind)) await saveTravelerFacts(tripId, itemId, travelers, fd);
      if (kind === "flight") {
        await saveScopedContact("airline", String(fd.get("carrierName") || "Airline"), { notes:userNotes });
      } else if (["train", "ferry"].includes(kind)) {
        const notes = buildManualDetailNotes([
          ["Platform", fd.get("platform")], ["Coach", fd.get("coach")],
          ["Vehicle", kind === "ferry" ? fd.get("vehicle") : ""],
        ], userNotes);
        await saveScopedContact("other", String(fd.get("carrierName") || label), { notes });
      } else if (kind === "hotel") {
        await saveScopedContact("hotel", String(fd.get("propertyName") || "Hotel"), {
          phone:fd.get("phone"), email:fd.get("email"), notes:userNotes,
        });
      } else if (kind === "car-rental") {
        await saveScopedContact("rental_car", String(fd.get("title") || "Car rental"), {
          phone:fd.get("phone"), notes:buildManualDetailNotes([["Driver", fd.get("driver")]], userNotes),
        });
      } else if (["transfer", "taxi"].includes(kind)) {
        await saveScopedContact("driver", String(fd.get("driver") || fd.get("title") || "Transfer"), {
          phone:fd.get("phone"), notes:buildManualDetailNotes([["Driver", fd.get("driver")], ["Vehicle", fd.get("vehicle")]], userNotes),
        });
      } else if (kind === "bus") {
        await saveScopedContact("other", String(fd.get("title") || "Bus operator"), { phone:fd.get("phone"), notes:userNotes });
      } else if (kind === "cruise") {
        await saveScopedContact("tour_operator", String(fd.get("provider") || "Cruise line"));
      } else if (kind === "restaurant") {
        await saveScopedContact("other", String(fd.get("title") || "Restaurant"), { phone:fd.get("phone") });
      } else if (["activity", "tour", "attraction", "event"].includes(kind) && fd.get("provider")) {
        await saveScopedContact("tour_operator", String(fd.get("provider")));
      }
      return "";
    } catch (_) {
      const warning = "Booking saved, but some optional details could not be saved. Edit the booking to retry those details; the booking will not be submitted again.";
      return warning;
    }
  }
  async function saveNativeForm(form) {
    const kind=form.dataset.kind, baseKind=form.dataset.baseKind||bookingBaseKind(kind), fd=new FormData(form), tripId=encodeURIComponent(state.trip?.id || ""), isFirstTripCreation=kind==="trip"&&state.trips.length===0, editId=form.dataset.editId||"", editVersion=Number(form.dataset.editVersion)||1,
      existingBookingEntity=editId?findBookingRecord(kind,editId)?.entity||null:null,
      clientRequestId=String(form.dataset.clientRequestId||manualBookingDraftId(kind,editId)),
      manualCreateHeaders={"Idempotency-Key":clientRequestId},
      manualTransportCreateOptions=(body,key=clientRequestId)=>({method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify(body)}),
      secondaryRecoveryCopy="Booking saved, but some optional details could not be saved. Edit the booking to retry those details; the booking will not be submitted again.";
    let savedBookingId=editId||"",attachmentWarning="",secondaryWarning="";
    if (form.dataset.manualAttachmentsBusy === "true") {
      showFormSubmissionError(form, "Wait for the selected files to finish preparing before saving.");
      return;
    }
    if (form.getAttribute("aria-busy") === "true") return;
    setFormSaving(form, true);
    try {
      if (QUICK_ADD_KINDS.has(kind) && !state.trip) throw new Error("Choose a trip before saving this booking.");
      if (PREVIEW_MODE) {
        if (isFirstTripCreation) {
          const values=tripRules.validateManualTrip({title:fd.get("title")||fd.get("destination"),startsOn:fd.get("startsOn"),endsOn:fd.get("endsOn")}).values;
          const trip={id:"preview-created-trip",title:values.title,destination:fd.get("destination"),lifecycle_state:values.startsOn?"upcoming":"draft",starts_on:values.startsOn,ends_on:values.endsOn};
          Object.assign(state,{trips:[trip],trip,timeline:[],checklist:[],brain:null,impacts:[],transport:[],stays:[],locations:[],travelers:[],connections:[],health:null,bookingDetails:[],contacts:[],syncStatus:null,localDocs:[],tripsLoaded:true});
        }
        clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(`${statusText(kind)} saved in preview.`);
        route(kind==="document"?"documents":kind==="trip"?"add-booking":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"timeline",null,true); return;
      }
      if (kind === "trip") {
        const values=tripRules.validateManualTrip({title:fd.get("title")||fd.get("destination"),startsOn:fd.get("startsOn"),endsOn:fd.get("endsOn")}).values;
        if (form.dataset.editId) {
          const result=await api(`/api/v1/trips/${encodeURIComponent(form.dataset.editId)}`,{method:"PATCH",body:JSON.stringify({title:values.title,startsOn:values.startsOn,endsOn:values.endsOn,version:Number(form.dataset.editVersion)||1})});
          const updated=result.trip; state.trips=state.trips.map((trip)=>String(trip.id)===String(updated.id)?updated:trip); if(String(state.trip?.id)===String(updated.id)) state.trip=updated; clearQuickDraft(kind); state.editingEntity=null;
          const destinationPlace=parsePlaceSnapshot(fd.get("destinationPlace"));
          if(destinationPlace) await createLocationFromPlace(destinationPlace,"city");
          formHasMeaningfulChanges=false; showToast("Trip updated."); route("timeline",null,true); return;
        }
        const result=await api("/api/v1/trips",{method:"POST",headers:{"Idempotency-Key":clientRequestId},body:JSON.stringify({title:values.title,startsOn:values.startsOn,endsOn:values.endsOn,lifecycleState:values.startsOn?"upcoming":"draft"})}); state.trips.unshift(result.trip); state.trip=result.trip; state.tripsLoaded=true; localStorage.setItem("tripto_selected_trip",result.trip.id);
        const destinationPlace=parsePlaceSnapshot(fd.get("destinationPlace"));
        if(destinationPlace) {
          try { await createLocationFromPlace(destinationPlace,"city"); }
          catch (_) { secondaryWarning="Trip saved, but its destination could not be attached. Open trip settings to retry."; }
        }
      } else if (baseKind === "hotel") {
        const existingLocationId=String(val(existingBookingEntity,"property_location_id","start_location_id")||""),
          propertyLocation=await createManualVenueLocation("hotel",fd.get("propertyName"),fd.get("location"),fd.get("streetAddress"),"",fd.get("locationPlace"),existingLocationId),
          locationId=propertyLocation?.id||null;
        if (editId) {
          const body={propertyName:fd.get("propertyName"),propertyLocationId:locationId,checkInDate:fd.get("checkInDate"),checkOutDate:fd.get("checkOutDate"),checkInFrom:fd.get("checkInFrom")||null,checkInUntil:fd.get("checkInUntil")||null,checkOutBy:fd.get("checkOutBy")||null,confirmationNumber:fd.get("confirmationNumber")||null,roomName:fd.get("roomName")||null,bookingStatus:fd.get("bookingStatus")||null,version:editVersion};
          const result=await api(`/api/v1/trips/${tripId}/stays/${encodeURIComponent(editId)}`,{method:"PATCH",body:JSON.stringify(body)});
          savedBookingId=result.stay?.id||editId;
        } else {
          const result=await api(`/api/v1/trips/${tripId}/stays`,{method:"POST",headers:manualCreateHeaders,body:JSON.stringify({propertyName:fd.get("propertyName"),propertyLocationId:locationId,checkInDate:fd.get("checkInDate"),checkOutDate:fd.get("checkOutDate"),checkInFrom:fd.get("checkInFrom")||null,checkInUntil:fd.get("checkInUntil")||null,checkOutBy:fd.get("checkOutBy")||null,confirmationNumber:fd.get("confirmationNumber")||null,roomName:fd.get("roomName")||null,bookingStatus:fd.get("bookingStatus")||null,travelerIds:selectedTravelerIds(fd)})});
          savedBookingId=result.stay?.id||"";
        }
      } else if (baseKind === "transport") {
        const config=manualBookingConfig(kind),depTz=String(fd.get("timezone")||""),arrTz=String(fd.get("endTimezone")||depTz),
          departureLocal=`${fd.get("reservationDate")||""}T${fd.get("reservationTime")||""}`,
          dep=resolveEventLocalDateTime(departureLocal,depTz),arrivalLocal=localDateTime(fd,"endDate","endTime"),arr=arrivalLocal?resolveEventLocalDateTime(arrivalLocal,arrTz):null;
        if(arr!=null&&arr<dep) throw new Error("The arrival or drop-off cannot be before departure or pickup.");
        const from=await quickLocation(fd.get("location"),"transport",depTz),to=await quickLocation(fd.get("endLocation"),"transport",arrTz),travelers=selectedTravelerIds(fd),title=String(fd.get("title")||config?.label||"Transport"),body={title,carrierName:title,serviceNumber:fd.get("vehicle")||null,departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:depTz,arrivalTimezone:arr!=null?arrTz:null,bookingReference:fd.get("confirmationNumber")||null,travelerIds:travelers};
        if(editId){
          const result=await api(`/api/v1/trips/${tripId}/transport/${encodeURIComponent(editId)}`,{method:"PATCH",body:JSON.stringify({...body,version:editVersion})});
          savedBookingId=result.item?.id||editId;
        }else{
          const result=await api(`/api/v1/trips/${tripId}/transport`,manualTransportCreateOptions({...body,transportType:config?.subtype||"other"}));
          savedBookingId=result.item?.id||"";
        }
      } else if (["flight","train"].includes(baseKind)) {
        const depTz=String(fd.get("departureTimezone")||""), arrTz=String(fd.get("arrivalTimezone")||""),
          departureLocal=`${fd.get("departureDate")||""}T${fd.get("departureLocalTime")||""}`,
          arrivalDate=String(fd.get("arrivalDate")||""),arrivalTime=String(fd.get("arrivalLocalTime")||""),
          dep=resolveEventLocalDateTime(departureLocal,depTz), arrivalLocal=arrivalDate&&arrivalTime?`${arrivalDate}T${arrivalTime}`:"", arr=arrivalLocal ? resolveEventLocalDateTime(arrivalLocal,arrTz) : null;
        if(arr!=null&&arr<dep) throw new Error("Arrival cannot be before departure.");
        const from=await quickLocation(fd.get("fromLocation"),baseKind,depTz,fd.get("fromLocationPlace")), to=await quickLocation(fd.get("toLocation"),baseKind,arrTz,fd.get("toLocationPlace")), travelers=selectedTravelerIds(fd), flight=baseKind==="flight"?parseFlightNumber(fd.get("flightNumber")):null;
        const boarding=fd.get("boardingTime")?resolveEventLocalDateTime(`${fd.get("departureDate")}T${fd.get("boardingTime")}`,depTz):null, gateClose=fd.get("gateCloseTime")?resolveEventLocalDateTime(`${fd.get("departureDate")}T${fd.get("gateCloseTime")}`,depTz):null;
        const title=flight?flight.raw:`${fd.get("carrierName")||"Train"}${fd.get("serviceNumber")?` ${fd.get("serviceNumber")}`:""}`;
        if (editId) {
          const body={title,carrierName:fd.get("carrierName")||null,serviceNumber:baseKind==="flight"?flight.number:(fd.get("serviceNumber")||null),departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:depTz,arrivalTimezone:arrTz||null,bookingReference:fd.get("bookingReference")||null,version:editVersion};
          if(baseKind==="flight"){ body.marketingAirlineCode=flight?.code||null; body.marketingFlightNumber=flight?.number||null; body.operatingAirlineCode=fd.get("operatingAirlineCode")||null; body.departureTerminal=fd.get("departureTerminal")||null; body.departureGate=fd.get("departureGate")||null; body.boardingTimeUtc=boarding; body.gateCloseTimeUtc=gateClose; }
          const result=await api(`/api/v1/trips/${tripId}/transport/${encodeURIComponent(editId)}`,{method:"PATCH",body:JSON.stringify(body)});
          savedBookingId=result.item?.id||editId;
        } else {
        const transportType=kind==="ferry"?"ferry":baseKind;
        const result=await api(`/api/v1/trips/${tripId}/transport`,manualTransportCreateOptions({transportType,title,carrierName:fd.get("carrierName")||null,serviceNumber:baseKind==="flight"?flight.number:(fd.get("serviceNumber")||null),marketingAirlineCode:flight?.code||null,marketingFlightNumber:flight?.number||null,operatingAirlineCode:fd.get("operatingAirlineCode")||null,departureTerminal:fd.get("departureTerminal")||null,departureGate:fd.get("departureGate")||null,boardingTimeUtc:boarding,gateCloseTimeUtc:gateClose,departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:depTz,arrivalTimezone:arrTz||null,bookingReference:fd.get("bookingReference")||null,travelerIds:travelers}));
        savedBookingId=result.item?.id||"";
        if (baseKind==="flight" && String(fd.get("roundTrip")||"")==="1" && String(fd.get("returnDepartureDate")||"")) {
          const retDep=resolveEventLocalDateTime(`${fd.get("returnDepartureDate")}T${fd.get("returnDepartureLocalTime")||"00:00"}`,arrTz),
            retTitle=fd.get("carrierName")?String(fd.get("carrierName")):"Return flight";
          await api(`/api/v1/trips/${tripId}/transport`,manualTransportCreateOptions({transportType:"flight",title:retTitle,carrierName:fd.get("carrierName")||null,serviceNumber:null,departureLocationId:to.id,arrivalLocationId:from.id,scheduledDepartureUtc:retDep,scheduledArrivalUtc:null,departureTimezone:arrTz||null,arrivalTimezone:depTz||null,bookingReference:fd.get("bookingReference")||null,travelerIds:travelers},`${clientRequestId}:return`));
        }
        }
      } else if (["activity","reservation"].includes(baseKind)) {
        const dateName=baseKind==="activity"?"activityDate":"reservationDate", timeName=baseKind==="activity"?"activityTime":"reservationTime",
          explicitDate=String(baseKind==="activity"?fd.get("activityDate"):fd.get("reservationDate")||""),
          explicitTime=String(baseKind==="activity"?fd.get("activityTime"):fd.get("reservationTime")||""), timezone=String(fd.get("timezone")||""),
          local=explicitDate&&explicitTime?`${explicitDate}T${explicitTime}`:"", ms=local?resolveEventLocalDateTime(local,timezone):null,
          locationName=String(fd.get("location")||""), existingLocationId=String(val(existingBookingEntity,"start_location_id","venue_location_id")||"");
        let location=null;
        if (["restaurant","activity","tour","attraction","event"].includes(kind) && (locationName || fd.get("streetAddress"))) {
          location=await createManualVenueLocation(kind==="restaurant"?"restaurant":"attraction",fd.get("title"),locationName,fd.get("streetAddress"),timezone,fd.get("locationPlace"),existingLocationId);
        } else if (kind === "cruise" && locationName) {
          const existingLocation=locationById(existingLocationId);
          location=existingLocation&&String(val(existingLocation,"display_name")||"")===locationName
            ? existingLocation
            : await createMobileLocation("port",locationName,{timezone:timezone||null});
        } else if (locationName) location=await quickLocation(locationName,baseKind,timezone,fd.get("locationPlace"));
        const endDate=String(fd.get("endDate")||explicitDate||""), end=fd.get("endTime")?resolveEventLocalDateTime(`${endDate}T${fd.get("endTime")}`,timezone):null;
        if(ms!=null&&end!=null&&end<ms) throw new Error("End time cannot be before the start time.");
        const notes=buildManualDetailNotes([
          ["Date",ms==null?explicitDate:""], ["To",fd.get("endLocation")],
          ["Return / end date",fd.get("endDate")&&!fd.get("endTime")?fd.get("endDate"):""],
          ["Guests",fd.get("guests")], ["Vehicle",fd.get("vehicle")], ["Driver",fd.get("driver")],
          ["Ship",fd.get("ship")], ["Cabin",fd.get("cabin")], ["Deck",fd.get("deck")],
          ["Embarkation",fd.get("embarkation")], ["Seat / section",fd.get("seatSection")],
          ["Address",fd.get("streetAddress")], ["Contact",fd.get("contact")],
          ["Reservation window",fd.get("reservationWindow")],
        ],fd.get("notes")), travelers=selectedTravelerIds(fd), subtype=manualBookingConfig(kind)?.subtype,
          itemTitle=String(fd.get("title")||fd.get("provider")||manualBookingConfig(kind)?.label||"Booking");
        if (editId) {
          const body={kind:baseKind,status:"confirmed",title:itemTitle,startsAtUtc:ms,endsAtUtc:end,timezone:timezone||null,locationId:location?.id||null,reference:fd.get("confirmationNumber")||null,notes,confidence:"confirmed",version:editVersion};
          if(baseKind==="activity") body.activityType=fd.get("activityType")||subtype||formPrefill?.activityType||null; else body.reservationType=fd.get("reservationType")||subtype||formPrefill?.reservationType||"reservation";
          const result=await api(`/api/v1/trips/${tripId}/activities/${encodeURIComponent(editId)}`,{method:"PATCH",body:JSON.stringify(body)});
          savedBookingId=result.item?.id||editId;
        } else {
        const result=await api(`/api/v1/trips/${tripId}/activities`,{method:"POST",headers:manualCreateHeaders,body:JSON.stringify({kind:baseKind,status:"confirmed",title:itemTitle,startsAtUtc:ms,endsAtUtc:end,timezone:timezone||null,locationId:location?.id||null,activityType:baseKind==="activity"?(fd.get("activityType")||subtype||null):null,reservationType:baseKind==="reservation"?(fd.get("reservationType")||subtype||"reservation"):null,reference:fd.get("confirmationNumber")||null,notes,confidence:"confirmed",travelerIds:travelers})});
        savedBookingId=result.item?.id||"";
        }
      } else if (kind === "document") {
        await saveLocalDocument(form.elements.documentFile.files?.[0],fd.get("documentType"),selectedTravelerIds(fd),fd.get("relatedBooking")||null);
      } else if (kind === "traveler") {
        const editId=String(form.dataset.editId||"");
        await api(`/api/v1/trips/${tripId}/travelers${editId?`/${encodeURIComponent(editId)}`:""}`,{method:editId?"PATCH":"POST",body:JSON.stringify({displayName:fd.get("displayName"),travelerType:fd.get("travelerType"),...(editId?{version:Number(form.dataset.editVersion)}:{})})});
      } else if (kind === "checklist") {
        await api(`/api/v1/trips/${tripId}/checklist`,{method:"POST",body:JSON.stringify({title:fd.get("title"),category:fd.get("category"),priority:fd.get("priority")})});
      }
      if (savedBookingId && manualBookingConfig(kind)) {
        secondaryWarning=await saveManualSecondaryDetails(kind,tripId,savedBookingId,fd,existingBookingEntity,saveManualContact,clientRequestId);
        if(secondaryWarning) secondaryWarning=secondaryRecoveryCopy;
      }
      if (savedBookingId && form.dataset.attachmentScope) {
        let attachmentResult=null;
        try {
          attachmentResult=await commitManualAttachments(form.dataset.attachmentScope,savedBookingId,kind,selectedTravelerIds(fd));
        }catch(error){
          rememberManualAttachmentRetry(kind,savedBookingId,form.dataset.attachmentScope);
          attachmentWarning="Booking saved, but one or more documents could not be attached. Edit the booking and tap Retry; the booking will not be submitted again.";
        }
        if(attachmentResult?.status==="linked"){
          forgetManualAttachmentRetry(kind,savedBookingId);
          try {
            await clearManualAttachment(form.dataset.attachmentScope);
          } catch (_) {
            attachmentWarning="Booking and documents saved. Temporary copies could not be cleared from this phone, but the attached documents are safe.";
          }
        }
      }
      let saveWarning=[secondaryWarning,attachmentWarning].filter(Boolean).join(" ");
      try {
        await loadTripDetails();
      } catch (error) {
        if (!savedBookingId) throw error;
        saveWarning=[saveWarning,"Booking saved, but the Timeline could not refresh. Reload when your connection is stable; the booking will not be submitted again."].filter(Boolean).join(" ");
      }
      clearQuickDraft(kind); formHasMeaningfulChanges=false; state.manualLabel=null; state.editingEntity=null; formPrefill=null;
      const roundTripSaved = kind==="flight" && !editId && String(fd.get("roundTrip")||"")==="1" && String(fd.get("returnDepartureDate")||"") && savedBookingId;
      showToast(saveWarning||(roundTripSaved?"Round trip saved — outbound and return flights added.":(editId?`${manualBookingConfig(kind)?.label || statusText(kind)} updated.`:`${manualBookingConfig(kind)?.label || state.manualLabel || statusText(kind)} saved.`)),saveWarning?"alert":"status");
      route(kind==="document"?"documents":kind==="trip"?"add-booking":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"timeline",null,true);
    } catch (error) {
      const message = error?.status === 409
        ? "A newer saved version exists. Review it before trying again. Your entered data is still here."
        : error.message || "The change was not saved.";
      showFormSubmissionError(form,message);
    } finally {
      if (document.contains(form)) setFormSaving(form, false);
    }
  }
  function importFormatWarnings(file, kind) {
    const ext = String(file?.name || "").toLowerCase().split(".").pop() || "";
    const out = [];
    if (kind === "image") out.push("Read from a photo or screenshot with on-device OCR — check every field carefully. For the most accurate result, upload the original PDF or forward the confirmation email instead.");
    if (ext === "heic" || ext === "heif") out.push("HEIC photos may not be readable in some browsers. If fields look wrong or empty, re-save as JPEG or PDF, or forward the confirmation email.");
    return out;
  }
  async function previewImportForm(form) {
    if (form.getAttribute("aria-busy") === "true") return;
    setFormSaving(form, true, "Reading document…");
    // saveLocalDocument() calls render(), which detaches this form node. Re-resolve
    // the live form for any error/cleanup so messages don't land in a dead node.
    const liveForm = () => document.getElementById("import-form") || form;
    try {
      const fd=new FormData(form),file=form.elements.document?.files?.[0],pasted=String(fd.get("body")||"").trim();
      if(!file&&!pasted)throw new Error("Choose a booking document or paste a confirmation email.");
      if(file){
        if(!globalThis.TriptoSmartImport){try{await ensureSmartImport();}catch{throw new Error("Local document recognition is unavailable. Reload and try again.");}}
        if(!globalThis.TriptoSmartImport)throw new Error("Local document recognition is unavailable. Reload and try again.");
        // Recognize BEFORE saving: saveLocalDocument()'s render() detaches the form,
        // so recognition errors must surface first. A hung on-device pdf.js/OCR would
        // otherwise leave the spinner forever, so cap it with a timeout.
        const result=await Promise.race([
          globalThis.TriptoSmartImport.recognizeFile(file),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("Reading this document took too long on this phone. Try the original PDF, a smaller file, or add the booking manually.")),45000)),
        ]);
        const local=await saveLocalDocument(file,"other",[]);
        state.importLocalDocumentId=local.id;
        const fmtWarnings=importFormatWarnings(file,result.kind);
        if(!result.candidates.length){state.importReview={candidates:[],localOnly:true,warnings:[...fmtWarnings,...result.warnings]};formHasMeaningfulChanges=false;route("import-review");return;}
        // A document can hold several bookings (round-trip e-tickets = two legs).
        // Send EVERY recognized candidate, not just the first, so each leg becomes
        // its own reviewable row.
        const buildCandidate=(cand,withFmt)=>{const safeFields=Object.fromEntries(Object.entries(cand.fields).filter(([key])=>key!=="barcodeValue"));return {type:cand.type,confidence:cand.confidence,fields:safeFields,warnings:withFmt&&fmtWarnings.length?[...fmtWarnings,...(cand.warnings||[])]:cand.warnings};};
        const requestCandidates=result.candidates.map((cand,i)=>buildCandidate(cand,i===0));
        const requestBody={checksum:result.checksum,filename:file.name,documentKind:result.kind,candidates:requestCandidates,candidate:requestCandidates[0]};
        state.importUploadRequest=requestBody;
        if(PREVIEW_MODE)state.importReview={duplicate:false,import:{id:"preview-upload"},candidates:result.candidates.map((cand,i)=>({id:`candidate-${i+1}`,candidate_type:cand.type,payload:{...Object.fromEntries(Object.entries(cand.fields).map(([k,v])=>[k,v.value])),fieldMeta:Object.fromEntries(Object.entries(cand.fields).map(([k,v])=>[k,{confidence:v.confidence,source:v.source}])),warnings:requestCandidates[i].warnings},confidence:cand.confidence}))};
        else if(!navigator.onLine){queuePendingMutation({kind:"smart-import-preview",tripId:state.trip.id,path:`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,body:requestBody});showToast("Document saved on this phone. Recognition will sync when you reconnect.");route("import-history");return;}
        else state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,{method:"POST",body:JSON.stringify(requestBody)});
      } else if(PREVIEW_MODE)state.importReview={import:{id:"preview-email"},candidates:[{id:"candidate-1",candidate_type:"flight",payload:{title:"Example booking",warnings:["Timezone missing","Date is ambiguous"]},confidence:.55}]};
      else state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/forwarded-email/preview`,{method:"POST",body:JSON.stringify({body:pasted})});
      formHasMeaningfulChanges=false;route("import-review");
    } catch(error){
      const message=error?.message||"Could not read this document. Add the booking manually.";
      const target=liveForm();
      // Always toast: render() may have detached the form, so an inline-only error
      // would be invisible and the screen would look like nothing happened.
      showToast(message,"alert");
      if(document.contains(target))showFormSubmissionError(target,message);
    } finally { const target=liveForm(); if(document.contains(target)) setFormSaving(target,false); }
  }

  function reviewedImportPayload(candidateId){const form=document.getElementById("import-review-form"),payload={};for(const input of form?.querySelectorAll(`[name^="field-${CSS.escape(candidateId)}-"]`)||[]){const key=input.dataset.fieldName||input.name.slice(`field-${candidateId}-`.length);payload[key]=input.value||null;}const type=form?.querySelector(`[name="field-${CSS.escape(candidateId)}-candidateType"]`)?.value;if(type)payload.candidateType=type;const tzFor=(code)=>{const c=String(code||"").trim().toUpperCase();return c?String(globalThis.TriptoAirportTimezones?.timezoneForAirport?.(c)||"")||null:null;};if(!payload.departureTimezone&&payload.departureIata)payload.departureTimezone=tzFor(payload.departureIata);if(!payload.arrivalTimezone&&payload.arrivalIata)payload.arrivalTimezone=tzFor(payload.arrivalIata);if(payload.departureLocalDatetime&&payload.departureTimezone)payload.scheduledDepartureUtc=resolveEventLocalDateTime(payload.departureLocalDatetime,payload.departureTimezone);if(payload.arrivalLocalDatetime&&payload.arrivalTimezone)payload.scheduledArrivalUtc=resolveEventLocalDateTime(payload.arrivalLocalDatetime,payload.arrivalTimezone);delete payload.departureLocalDatetime;delete payload.arrivalLocalDatetime;
    // Non-flight bookings (trains, cars, activities, restaurants…) recognize bare dates
    // as startDate/endDate — names the server materializers don't read. Map them to the
    // UTC timestamps each type expects so the imported booking keeps its date instead of
    // landing undated. No time-of-day is known, so anchor to local midnight in the
    // device's timezone; a bad conversion falls back to null (undated), never blocks.
    const localTz=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";}catch{return "UTC";}})();
    const dateToUtc=(value,tz)=>{const v=String(value||"").trim();if(!v)return null;const dt=/T\d/.test(v)?v.slice(0,16):`${v.slice(0,10)}T00:00`;try{return resolveEventLocalDateTime(dt,tz||localTz);}catch{return null;}};
    if(["train","car","transfer","ferry","cruise"].includes(payload.candidateType)){
      if(payload.scheduledDepartureUtc==null&&payload.startDate)payload.scheduledDepartureUtc=dateToUtc(payload.startDate,payload.departureTimezone);
      if(payload.scheduledArrivalUtc==null&&payload.endDate)payload.scheduledArrivalUtc=dateToUtc(payload.endDate,payload.arrivalTimezone||payload.departureTimezone);
    }else if(["activity","restaurant","reservation","generic_ticket"].includes(payload.candidateType)){
      if(payload.startsAtUtc==null&&payload.startDate)payload.startsAtUtc=dateToUtc(payload.startDate,payload.timezone);
      if(payload.endsAtUtc==null&&payload.endDate)payload.endsAtUtc=dateToUtc(payload.endDate,payload.timezone);
    }
    delete payload.startDate;delete payload.endDate;
    return payload;}
  async function resolveImport(candidateId,action){if(PREVIEW_MODE){showToast(action==="confirm"?"Added to Timeline in preview.":"Import rejected in preview.");route(action==="confirm"?"timeline":"import-history");return;}if(action==="confirm")try{await ensureAirportTimezones();}catch{}const importId=state.importReview?.import?.id;if(!importId)throw new Error("Import is unavailable.");const result=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/${encodeURIComponent(importId)}/resolve`,{method:"POST",body:JSON.stringify({candidateId,action,payload:action==="confirm"?reviewedImportPayload(candidateId):undefined})});if(action==="confirm"&&state.importLocalDocumentId&&result.entityId)await linkLocalDocument(state.importLocalDocumentId,result.entityId);await loadTripDetails();
    // A document can yield several candidates (round-trip legs). Resolve them one at
    // a time and stay on the review screen while any remain, so confirming the first
    // leg doesn't navigate away and strand the rest.
    const remaining=(state.importReview?.candidates||[]).filter((c)=>String(c.id)!==String(candidateId));
    if(state.importReview)state.importReview.candidates=remaining;
    if(remaining.length){showToast(action==="confirm"?`Booking imported. ${remaining.length} more to review.`:`Import rejected. ${remaining.length} more to review.`);formHasMeaningfulChanges=false;render();return;}
    showToast(action==="confirm"?"Added to Timeline.":"Import rejected.");route(action==="confirm"?"timeline":"import-history");}
  // Maps API/cached checklist rows to a stable shape with a reliable `completed`
  // boolean. Real API rows carry `completed_at` (a timestamp) and no `completed`
  // key, so val(item,"completed") is always null for them — derive it here.
  function normalizeChecklist(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
      const completedAt = val(item, "completed_at", "completedAt");
      const completed = item.completed != null ? Boolean(item.completed) : completedAt != null;
      return {
        ...item,
        id: String(val(item, "id") || ""),
        title: val(item, "title") || "Item",
        category: String(val(item, "category") || "custom"),
        priority: String(val(item, "priority") || "medium"),
        version: Number(item.version) || 1,
        completion_source: val(item, "completion_source", "completionSource") || (completed ? "user" : "none"),
        completed,
      };
    });
  }
  function checklistPath() {
    return `/api/v1/trips/${encodeURIComponent(state.trip.id)}/checklist`;
  }
  function checklistItemPath(id) {
    return `${checklistPath()}/${encodeURIComponent(id)}`;
  }
  // Persist the current (optimistic) checklist back into the read cache so a
  // reload — even offline — shows the same completed/added/removed state.
  function persistChecklistCache() {
    if (!state.trip) return;
    try { cacheWrite(checklistPath(), { items: state.checklist }); } catch (_) {}
  }
  function applyChecklistServerRow(local, row) {
    if (!row) return;
    Object.assign(local, normalizeChecklist([row])[0], { __local: false });
  }
  // A newer version exists on the server (409). Recover the current version so
  // the caller can retry once, instead of reverting or leaving stale state.
  async function currentChecklistVersion(item, conflictDetails) {
    const fromError = Number(
      conflictDetails && typeof conflictDetails === "object" ? conflictDetails.currentVersion : NaN,
    );
    if (Number.isSafeInteger(fromError)) return fromError;
    try {
      const res = await api(checklistPath());
      const fresh = normalizeChecklist(res?.items || []).find((row) => String(row.id) === String(item.id));
      return fresh ? Number(fresh.version) : null;
    } catch (_) {
      return null;
    }
  }
  async function toggleChecklistItem(id) {
    const item = state.checklist.find((row) => String(row.id) === String(id));
    if (!item || item.__saving) return;
    const previous = { completed: item.completed, source: item.completion_source };
    const next = !item.completed;
    item.completed = next;
    item.completion_source = next ? "user" : "none";
    renderChecklist();
    if (PREVIEW_MODE) return;
    if (item.__local) { persistChecklistCache(); return; }
    item.__saving = true;
    try {
      let res;
      try {
        res = await api(checklistItemPath(item.id), { method: "PATCH", body: JSON.stringify({ version: Number(item.version), completed: next }) });
      } catch (error) {
        // Self-heal a version conflict (e.g. a background refresh landed between
        // taps): re-sync the version and retry once so the tap still sticks.
        if (error?.status === 409) {
          const fresh = await currentChecklistVersion(item, error.details);
          if (fresh != null) {
            item.version = fresh;
            res = await api(checklistItemPath(item.id), { method: "PATCH", body: JSON.stringify({ version: fresh, completed: next }) });
          } else throw error;
        } else throw error;
      }
      applyChecklistServerRow(item, res?.item);
      persistChecklistCache();
    } catch (error) {
      if (!navigator.onLine) {
        queuePendingMutation({ kind: "checklist", op: "toggle", tripId: state.trip.id, itemId: item.id, body: { version: Number(item.version), completed: next } });
        persistChecklistCache();
      } else {
        item.completed = previous.completed;
        item.completion_source = previous.source;
        showToast("The checklist change was not saved. Try again.", "alert");
        render();
      }
    } finally {
      item.__saving = false;
    }
  }
  async function addChecklistItem(rawTitle) {
    const title = String(rawTitle || "").trim();
    if (!title || !state.trip) return;
    if (PREVIEW_MODE) {
      state.checklist.push({ id: `preview-${state.checklist.length + 1}`, title, category: "custom", priority: "medium", version: 1, completed: false, completion_source: "none", created_at: 0, __local: true });
      render();
      return;
    }
    const tempId = `local-${crypto.randomUUID()}`;
    const temp = { id: tempId, title, category: "custom", priority: "medium", version: 1, completed: false, completion_source: "none", created_at: Date.now(), __local: true };
    state.checklist.push(temp);
    render();
    try {
      const res = await api(checklistPath(), { method: "POST", body: JSON.stringify({ title, category: "custom", priority: "medium" }) });
      applyChecklistServerRow(temp, res?.item);
      persistChecklistCache();
    } catch (error) {
      if (!navigator.onLine) {
        queuePendingMutation({ kind: "checklist", op: "create", tripId: state.trip.id, tempId, body: { title, category: "custom", priority: "medium" } });
        persistChecklistCache();
      } else {
        state.checklist = state.checklist.filter((row) => row.id !== tempId);
        showToast("Could not add the item. Try again.", "alert");
        render();
      }
    }
  }
  // Open the inline editor. window.prompt() is unreliable in installed PWAs
  // (iOS standalone silently suppresses it), so rename happens inside the row.
  function startEditChecklistItem(id) {
    const item = state.checklist.find((row) => String(row.id) === String(id));
    if (!item) return;
    state.editingChecklistId = item.id;
    state.focusChecklistEdit = true;
    renderChecklist();
  }
  function cancelEditChecklistItem() {
    if (state.editingChecklistId == null) return;
    state.editingChecklistId = null;
    renderChecklist();
  }
  async function renameChecklistItem(id, rawTitle) {
    const item = state.checklist.find((row) => String(row.id) === String(id));
    if (!item) return;
    const title = String(rawTitle || "").trim();
    state.editingChecklistId = null;
    if (!title || title === item.title) { renderChecklist(); return; }
    const previous = item.title;
    item.title = title;
    renderChecklist();
    if (PREVIEW_MODE || item.__local) { persistChecklistCache(); return; }
    try {
      let res;
      try {
        res = await api(checklistItemPath(item.id), { method: "PATCH", body: JSON.stringify({ version: Number(item.version), title }) });
      } catch (error) {
        if (error?.status === 409) {
          const fresh = await currentChecklistVersion(item, error.details);
          if (fresh != null) {
            item.version = fresh;
            res = await api(checklistItemPath(item.id), { method: "PATCH", body: JSON.stringify({ version: fresh, title }) });
          } else throw error;
        } else throw error;
      }
      applyChecklistServerRow(item, res?.item);
      persistChecklistCache();
    } catch (error) {
      if (!navigator.onLine) {
        queuePendingMutation({ kind: "checklist", op: "rename", tripId: state.trip.id, itemId: item.id, body: { version: Number(item.version), title } });
        persistChecklistCache();
      } else {
        item.title = previous;
        showToast("Could not rename the item. Try again.", "alert");
        render();
      }
    }
  }
  const checklistDeleteTimers = new Map();
  function deleteChecklistItem(id) {
    const idx = state.checklist.findIndex((row) => String(row.id) === String(id));
    if (idx < 0) return;
    const [removed] = state.checklist.splice(idx, 1);
    render();
    persistChecklistCache();
    // Defer the server delete for the undo window so undo is a pure local
    // re-insert (no fragile server re-create with a new id).
    const timer = setTimeout(() => {
      checklistDeleteTimers.delete(id);
      commitChecklistDelete(removed);
    }, 5000);
    checklistDeleteTimers.set(id, timer);
    showUndoToast(`Removed "${removed.title}"`, () => {
      clearTimeout(timer);
      checklistDeleteTimers.delete(id);
      const at = Math.min(idx, state.checklist.length);
      state.checklist.splice(at, 0, removed);
      render();
      persistChecklistCache();
    });
  }
  async function commitChecklistDelete(removed) {
    if (!removed || PREVIEW_MODE || removed.__local) return;
    try {
      try {
        await api(checklistItemPath(removed.id), { method: "DELETE", body: JSON.stringify({ version: Number(removed.version) }) });
      } catch (error) {
        // Version drifted (e.g. the item was toggled just before delete): re-sync
        // and retry once so the delete actually lands instead of the row silently
        // reappearing on the next trip load.
        if (error?.status === 409) {
          const fresh = await currentChecklistVersion(removed, error.details);
          if (fresh != null) await api(checklistItemPath(removed.id), { method: "DELETE", body: JSON.stringify({ version: fresh }) });
          else throw error;
        } else throw error;
      }
      persistChecklistCache();
    } catch (error) {
      if (!navigator.onLine) {
        queuePendingMutation({ kind: "checklist", op: "delete", tripId: state.trip.id, itemId: removed.id, body: { version: Number(removed.version) } });
      }
      // A failed online delete leaves the item gone locally; the next full
      // trip load reconciles from the server (item reappears if not deleted).
    }
  }
  async function flushChecklistQueue() {
    if (PREVIEW_MODE || !navigator.onLine || !state.token) return;
    const rows = pendingMutations();
    const keep = [];
    let touched = false;
    for (const row of rows) {
      if (row.kind !== "checklist" || row.status === "done") { keep.push(row); continue; }
      try {
        if (row.op === "create") await api(`/api/v1/trips/${encodeURIComponent(row.tripId)}/checklist`, { method: "POST", body: JSON.stringify(row.body) });
        else if (row.op === "delete") await api(`/api/v1/trips/${encodeURIComponent(row.tripId)}/checklist/${encodeURIComponent(row.itemId)}`, { method: "DELETE", body: JSON.stringify(row.body) });
        else await api(`/api/v1/trips/${encodeURIComponent(row.tripId)}/checklist/${encodeURIComponent(row.itemId)}`, { method: "PATCH", body: JSON.stringify(row.body) });
        touched = true;
      } catch (_) {
        keep.push({ ...row, status: "retry" });
      }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(keep));
    return touched;
  }
  async function saveDocumentForm(form) {
    try {
      const file = form.elements.documentFile.files[0],
        type = form.elements.documentType.value,
        travelerIds = [
          ...form.querySelectorAll('input[name="documentTraveler"]:checked'),
        ].map((input) => input.value),
        status = form.querySelector(".document-verify-state"),
        submit = form.querySelector('button[data-action="save-document"]');
      if (status) status.textContent = "Verifying file integrity…";
      if (submit) { submit.disabled = true; submit.setAttribute("aria-busy", "true"); }
      await saveLocalDocument(file, type, travelerIds);
      state.sheet = null;
      route("documents", null, true);
    } catch (error) {
      const status = form.querySelector(".document-verify-state"), submit = form.querySelector('button[data-action="save-document"]');
      if (status) status.textContent = "Verification failed. Choose the file again or try another file.";
      if (submit) { submit.disabled = false; submit.removeAttribute("aria-busy"); }
      showToast(error instanceof Error ? error.message : String(error), "alert");
    }
  }
  function mapQueryForLocation(location) {
    if (!location) return "";
    const lat = val(location, "latitude"),
      lng = val(location, "longitude");
    if (lat != null && lng != null) return `${lat},${lng}`;
    return String(
      val(
        location,
        "local_address",
        "formatted_address",
        "display_name",
        "local_name",
      ) || "",
    );
  }
  function openMaps(query) {
    if (!query) {
      showToast("Address or coordinates are unavailable.");
      return;
    }
    // Same-tab navigation so the browser Back button returns to the app
    // (a _blank tab bounces to the Maps app and leaves no history to go back to).
    window.location.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  // Actions that mutate the CURRENT trip's contents. Blocked in the UI for
  // view-only members (server still enforces with 403 as the real backstop).
  // Account/cross-trip actions (create-trip, delete-account, email inbox…) are
  // intentionally NOT here — viewers can still manage their own account.
  const VIEWER_BLOCKED_ACTIONS = new Set([
    "open-add", "open-add-booking", "add-booking", "add-checklist-suggested",
    "add-document", "add-type", "add-duplicate-import", "confirm-import",
    "delete-booking", "delete-checklist", "delete-trip", "edit-booking",
    "edit-checklist", "edit-note", "edit-trip", "save-note", "toggle-checklist",
    "move-booking", "apply-move", "manage-booking", "remove-document",
    "remove-import", "reject-import", "review-import", "import",
    "manual-attachment-remove", "manual-attachment-retry",
    "open-forward-booking", "open-manual-booking", "open-upload-booking",
  ]);
  const OWNER_ONLY_ACTIONS = new Set(["edit-trip", "delete-trip"]);
  async function handleAction(action, target, inputMethod = "pointer") {
    if (VIEWER_BLOCKED_ACTIONS.has(action) && viewOnlyBlocked()) return;
    if (OWNER_ONLY_ACTIONS.has(action) && !canManageCurrentTrip()) {
      showToast("Only the trip owner can change trip details.", "alert");
      return;
    }
    switch (action) {
      case "view-only-hint":
        showToast("You have view-only access to this trip.", "status");
        break;
      case "back":
        {
          const goBack = () => {
            formHasMeaningfulChanges = false;
            state.routeMotion = "back";
            if (history.length > 1) history.back();
            else route("timeline", null, false, "back");
          };
          if (
            formHasMeaningfulChanges &&
            DIRTY_TASK_SCREENS.has(state.screen)
          )
            requestDiscardChanges(goBack);
          else goBack();
        }
        break;
      case "retry":
        await loadApp();
        break;
      case "retry-google-sign-in":
        await resumeGoogleRedirectSession();
        break;
      case "restart-google-sign-in":
        state.token = "";
        localStorage.removeItem("tripto_token");
        state.googleAuthHandoffStatus = null;
        state.googleAuthHandoffMessage = "";
        state.screen = "account";
        state.selectedId = null;
        history.replaceState(null, "", routeUrl("account"));
        await loadApp();
        showToast("Please continue with Google again.");
        break;
      case "open-add":
        if (state.screen === "trips") {
          state.editingEntity = null;
          route("form", "trip");
        } else {
          // Create-trip lives only on /trips and Account now — the ubiquitous "+"
          // adds a booking to the current trip.
          closeSheet();
          route("add-booking");
        }
        break;
      case "open-add-booking":
        closeSheet();
        route("add-booking");
        break;
      case "toggle-checklist":
        await toggleChecklistItem(target.dataset.id);
        break;
      case "edit-checklist":
        startEditChecklistItem(target.dataset.id);
        break;
      case "cancel-edit-checklist":
        cancelEditChecklistItem();
        break;
      case "delete-checklist":
        deleteChecklistItem(target.dataset.id);
        break;
      case "add-checklist-suggested":
        await addChecklistItem(target.dataset.title);
        break;
      case "toast-action":
        {
          const fn = toastActionFn;
          state.toast = "";
          state.toastAction = null;
          toastActionFn = null;
          clearTimeout(toastTimer);
          if (fn) fn();
          else render();
        }
        break;
      case "faq-toggle":
        {
          const id = target.dataset.id;
          const opening = !state.openFaq.has(id);
          if (opening) state.openFaq.add(id);
          else state.openFaq.delete(id);
          const row = target.closest(".faq-row");
          const panel = row?.querySelector(".faq-a");
          const toggle = target.querySelector(".faq-q__toggle");
          row?.classList.toggle("is-open", opening);
          target.setAttribute("aria-expanded", String(opening));
          if (panel) panel.hidden = !opening;
          if (toggle) toggle.innerHTML = icon(opening ? "minus" : "plus", 18, "faq-chev");
        }
        break;
      case "open-trip-menu":
        if (!state.trip) break;
        route("trip-options");
        break;
      case "open-collaboration":
        closeSheet();
        state.collabLoading = true;
        state.collabError = null;
        state.shareInvite = null;
        route("collaboration");
        await loadCollaboration();
        break;
      case "collab-sign-in":
        rememberPostAuthDestination("collaboration", state.trip?.id || null);
        route("account");
        break;
      case "reload-collaboration":
        await loadCollaboration();
        break;
      case "open-share":
        state.shareRole = state.shareRole === "viewer" ? "viewer" : "editor";
        openSheet("share", target);
        break;
      case "share-role":
        state.shareRole = target.dataset.role === "viewer" ? "viewer" : "editor";
        render();
        break;
      case "create-invite":
        await createInvite();
        break;
      case "copy-invite-link":
        await copyInviteLink();
        break;
      case "share-invite-link":
        await shareInviteLink();
        break;
      case "invite-revoke":
        await revokeInvite(target.dataset.id);
        break;
      case "member-role":
        await updateMemberRole(target.dataset.id, target.dataset.role);
        break;
      case "member-remove":
        await removeMember(target.dataset.id, target.dataset.name);
        break;
      case "member-transfer":
        await transferOwnership(target.dataset.id, target.dataset.name);
        break;
      case "leave-trip":
        await leaveTrip();
        break;
      case "join-accept":
        await acceptInvite();
        break;
      case "join-home":
        try { sessionStorage.removeItem("tripto_join_token"); } catch (_) {}
        state.joinToken = null;
        state.joinPreview = null;
        route("trips");
        break;
      case "open-weather":
        closeSheet();
        state.weatherSel = null;
        route("weather");
        void ensureWeather();
        break;
      case "open-currency":
        closeSheet();
        route("currency");
        void ensureCurrencyRates();
        break;
      case "open-currency-picker":
        state.currencyPickerField = target.dataset.field === "from" ? "from" : "to";
        openSheet("currency-picker", target);
        break;
      case "select-currency": {
        const currency = initCurrency();
        const field = target.dataset.field === "from" ? "from" : "to";
        const code = String(target.dataset.code || "").toUpperCase();
        if (!TRAVEL_CURRENCIES.some(([itemCode]) => itemCode === code)) break;
        currency[field] = code;
        if (currency.from === currency.to)
          currency[field === "from" ? "to" : "from"] = code === "USD" ? "EUR" : "USD";
        currency.rate = null;
        currency.source = "";
        saveCurrencyPreferences();
        state.sheet = null;
        state.currencyPickerField = null;
        render();
        restoreSheetFocus();
        void ensureCurrencyRates(true);
        break;
      }
      case "refresh-currency":
        await ensureCurrencyRates(true);
        break;
      case "currency-quick":
        initCurrency().amount = Number(target.dataset.value) || 100;
        saveCurrencyPreferences();
        render();
        break;
      case "currency-swap": {
        const currency = initCurrency(), from = currency.from;
        currency.from = currency.to;
        currency.to = from;
        currency.rate = null;
        currency.source = "";
        saveCurrencyPreferences();
        render();
        void ensureCurrencyRates(true);
        break;
      }
      case "open-esim":
        closeSheet();
        route("esim");
        break;
      case "esim-signup":
        // Referral partner (7g eSIM, code FKWQX6ES → 15% off). Opens externally
        // in a new tab so the trip stays open; noopener isolates the app context.
        window.open("https://esim-7g.app.link/free-credit", "_blank", "noopener,noreferrer");
        break;
      case "copy-esim-code":
        try {
          await navigator.clipboard.writeText("FKWQX6ES");
          showToast("Code FKWQX6ES copied.");
        } catch (_) {
          showToast("Code: FKWQX6ES");
        }
        break;
      case "weather-place":
        state.weatherSel = target.dataset.key || null;
        render();
        void ensureWeather();
        break;
      case "open-upload-booking":
        state.importMode = "upload";
        route("import");
        break;
      case "open-forward-booking":
        state.importMode = "forward";
        route("import");
        break;
      case "open-manual-booking":
        openSheet("manual-booking", target);
        break;
      case "open-trip-map":
        closeSheet();
        if (!canShowTripMap()) {
          showToast("This trip needs at least two places to map.");
          break;
        }
        state.tripMapDay = null;
        route("trip-map");
        // Resolve any address-only places to precise coordinates for the
        // Google Maps link, then repaint if positions arrived.
        geocodeMissingTripPlaces().then((changed) => {
          if (changed && state.screen === "trip-map") render();
        });
        break;
      case "trip-map-day":
        state.tripMapDay = target.dataset.day || null;
        render();
        break;
      case "trip-map-navigate":
        if (state.offline) showToast("Connect to open directions. Your trip places remain available offline.");
        else openMaps(target.dataset.query || "");
        break;
      case "open-first-run-how":
        openSheet("first-run-how", target);
        break;
      case "open-date-range": {
        const form = target.closest("form"), startName = target.dataset.startName, endName = target.dataset.endName, start = String(form?.elements[startName]?.value || ""), end = String(form?.elements[endName]?.value || "");
        if (!form || !startName || !endName) break;
        saveQuickDraft(form);
        state.dateRange = {
          startName,
          endName,
          start,
          end,
          focusDate: start || new Date().toISOString().slice(0, 10),
          month: rangeMonthStart(start || end),
          title: target.dataset.rangeTitle || "Choose dates",
          startLabel: target.dataset.startLabel || "Start date",
          endLabel: target.dataset.endLabel || "End date",
          allowSingle: target.closest(".date-range-field")?.dataset.allowSingle === "true",
          optional: form.dataset.kind === "trip",
        };
        openSheet("date-range", target);
        break;
      }
      case "clear-date-range":
        if (state.dateRange) {
          const today = new Date().toISOString().slice(0, 10);
          state.dateRange.start = "";
          state.dateRange.end = "";
          state.dateRange.focusDate = today;
          state.dateRange.month = rangeMonthStart(today);
          render();
        }
        break;
      case "range-month":
        if (state.dateRange) {
          state.dateRange.month = shiftRangeMonth(state.dateRange.month, Number(target.dataset.offset) || 0);
          state.dateRange.focusDate = state.dateRange.month;
          render();
        }
        break;
      case "select-range-day":
        if (state.dateRange) {
          const selected = String(target.dataset.date || "");
          state.dateRange.focusDate = selected;
          if (state.dateRange.allowSingle) {
            state.dateRange.start = selected;
            state.dateRange.end = "";
          } else if (!state.dateRange.start || state.dateRange.end) {
            state.dateRange.start = selected;
            state.dateRange.end = "";
          } else if (selected < state.dateRange.start) {
            state.dateRange.end = state.dateRange.start;
            state.dateRange.start = selected;
          } else {
            state.dateRange.end = selected;
          }
          render();
        }
        break;
      case "skip-date-range": {
        const range = state.dateRange, rangeForm = document.getElementById("native-form");
        if (!range?.optional || !rangeForm) break;
        rangeForm.elements[range.startName].value = "";
        rangeForm.elements[range.endName].value = "";
        if (rangeForm.elements.datesSkipped) rangeForm.elements.datesSkipped.value = "1";
        rangeForm.elements[range.startName].dispatchEvent(new Event("input", { bubbles:true }));
        rangeForm.elements[range.endName].dispatchEvent(new Event("input", { bubbles:true }));
        syncDateRangeField(rangeForm, range.startName, range.endName);
        saveQuickDraft(rangeForm);
        formHasMeaningfulChanges = true;
        closeSheet();
        break;
      }
      case "apply-date-range": {
        const range = state.dateRange, rangeForm = document.getElementById("native-form");
        if (!range || !range.start || (!range.end && !range.allowSingle) || !rangeForm) break;
        rangeForm.elements[range.startName].value = range.start;
        rangeForm.elements[range.endName].value = range.end || "";
        if (rangeForm.elements.datesSkipped) rangeForm.elements.datesSkipped.value = "";
        rangeForm.elements[range.startName].dispatchEvent(new Event("input", { bubbles:true }));
        rangeForm.elements[range.endName].dispatchEvent(new Event("input", { bubbles:true }));
        syncDateRangeField(rangeForm, range.startName, range.endName);
        saveQuickDraft(rangeForm);
        formHasMeaningfulChanges = true;
        closeSheet();
        break;
      }
      case "return-trip-setup":
        state.sheet = null;
        state.tripSetupPreview = null;
        render();
        break;
      case "complete-trip-setup":
        state.sheet = null;
        state.tripSetupPreview = null;
        render();
        requestAnimationFrame(() => {
          const form = document.getElementById("native-form");
          if (form && validateFocusedForm(form)) saveNativeForm(form);
        });
        break;
      case "preview-google":
        showToast("Google sign-in is disabled in the isolated visual preview.");
        break;
      case "finish-first-run-how":
        closeSheet();
        break;
      case "close-sheet":
        closeSheet();
        break;
      case "create-trip":
        closeSheet();
        state.editingEntity = null;
        route("form", "trip");
        break;
      case "edit-trip":
        if (!state.trip) break;
        closeSheet();
        state.editingEntity = { kind: "trip", id: state.trip.id };
        route("form", "trip");
        break;
      case "delete-trip":
        closeSheet();
        confirmDeleteTrip();
        break;
      case "manage-booking":
        state.manageBooking = { kind: target.dataset.kind, id: target.dataset.id };
        openSheet("manage-booking", target);
        break;
      case "move-booking":
        state.moveBooking = { kind: target.dataset.kind, id: target.dataset.id };
        state.manageBooking = null;
        openSheet("move-booking", target);
        break;
      case "apply-move": {
        const menu = state.moveBooking;
        if (menu) moveBookingToDay(menu.kind, menu.id, String(target.dataset.key || ""));
        break;
      }
      case "edit-booking": {
        const record = findBookingRecord(target.dataset.kind, target.dataset.id);
        if (!record) break;
        const formKind = bookingFormKind(target.dataset.kind, record.entity);
        state.sheet = null;
        state.manageBooking = null;
        state.manualLabel = null;
        state.editingEntity = { kind: formKind, id: itemId(record.entity) };
        route("form", formKind);
        break;
      }
      case "delete-booking": {
        const kind = target.dataset.kind, id = target.dataset.id;
        if (state.sheet === "manage-booking") { state.sheet = null; state.manageBooking = null; render(); }
        confirmDeleteBooking(kind, id);
        break;
      }
      case "open-timeline":
        route("timeline");
        break;
      case "enter-app":
        route("trips");
        break;
      case "open-health":
        route("health");
        break;
      case "switch-trip":
        openSheet("trips", target);
        break;
      case "toggle-form-more": {
        const form = target.closest("form"),
          open = target.getAttribute("aria-expanded") !== "true";
        if (form) {
          setQuickMoreOpen(form, open);
          saveQuickDraft(form);
        }
        break;
      }
      case "apply-date-suggestion": {
        const form = target.closest("form"),
          control = form?.elements[target.dataset.field];
        if (control) {
          control.value = target.dataset.value || "";
          control.dispatchEvent(new Event("input", { bubbles: true }));
          control.focus();
        }
        break;
      }
      case "apply-trip-dates": {
        const form = target.closest("form"),
          start = form?.elements.checkInDate,
          end = form?.elements.checkOutDate;
        if (start && end) {
          start.value = target.dataset.start || "";
          end.value = target.dataset.end || "";
          start.dispatchEvent(new Event("input", { bubbles: true }));
          end.dispatchEvent(new Event("input", { bubbles: true }));
          syncDateRangeField(form, "checkInDate", "checkOutDate");
        }
        break;
      }
      case "select-trip-for-add": {
        const trip = state.trips.find(
          (row) => String(row.id) === String(target.dataset.id),
        );
        if (!trip) return;
        const kind = state.selectedId;
        state.trip = trip;
        localStorage.setItem("tripto_selected_trip", trip.id);
        await enterTripWithDetails(() => route("form", kind, true));
        break;
      }
      case "select-trip": {
        const trip = state.trips.find(
          (row) => String(row.id) === String(target.dataset.id),
        );
        if (!trip) return;
        state.trip = trip;
        localStorage.setItem("tripto_selected_trip", trip.id);
        state.sheet = null;
        await enterTripWithDetails(() => {
          if (state.screen === "form" && QUICK_ADD_KINDS.has(state.selectedId))
            route("form", state.selectedId, true);
          else route("timeline", null, true);
        });
        break;
      }
      case "add-type": {
        const type = target.dataset.type;
        state.manualLabel = manualBookingConfig(type)?.label || null;
        state.editingEntity = null;
        closeSheet();
        route("form", type);
        break;
      }
      case "manual-attachment-remove": {
        const form = document.getElementById("native-form");
        try {
          await clearManualAttachment(target.dataset.scope, target.dataset.id);
          await refreshManualAttachmentPanel(form);
          formHasMeaningfulChanges = true;
        } catch (error) {
          if (form) showFormSubmissionError(form, error?.message || "The file could not be removed.");
        }
        break;
      }
      case "close-doc-viewer": {
        closeDocumentViewer();
        break;
      }
      case "manual-attachment-open": {
        try {
          await openManualAttachment(target.dataset.scope, target.dataset.id);
        } catch (error) {
          showToast(error?.message || "The local file could not be opened.", "alert");
        }
        break;
      }
      case "manual-attachment-retry": {
        const form = document.getElementById("native-form");
        target.disabled = true;
        try {
          const editId = String(form?.dataset.editId || ""),
            kind = String(form?.dataset.kind || "other"),
            details = editId
              ? {
                  tripId: state.trip?.id || null,
                  bookingId: editId,
                  kind,
                  travelerIds: selectedTravelerIds(new FormData(form)),
                }
              : {},
            record = await retryManualAttachment(target.dataset.scope, details);
          if (record?.status === "linked") {
            await clearManualAttachment(target.dataset.scope);
            forgetManualAttachmentRetry(kind, editId);
            state.localDocs = await listLocalDocs(state.trip?.id);
            showToast("Documents attached. The booking was not submitted again.");
          }
          await refreshManualAttachmentPanel(form);
        } catch (error) {
          if (form) showFormSubmissionError(form, error?.message || "The file could not be retried.");
        } finally {
          if (document.contains(target)) target.disabled = false;
        }
        break;
      }
      case "open-form": {
        const kind=target.dataset.form||"trip";
        state.editingEntity=target.dataset.id?{kind,id:target.dataset.id}:null;
        route("form",kind);
        break;
      }
      case "open-trip": {
        const trip=state.trips.find((row)=>String(row.id)===String(target.dataset.id));
        if(!trip)return; state.trip=trip; localStorage.setItem("tripto_selected_trip",trip.id); await enterTripWithDetails(()=>route("timeline")); break;
      }
      case "filter-trips": {
        const filter = target.dataset.filter;
        if (!["all","current","upcoming","past"].includes(filter)) break;
        state.tripFilter = filter;
        render();
        document.querySelector(`.trip-filter[data-filter="${filter}"]`)?.focus({preventScroll:true});
        break;
      }
      case "filter-bookings": state.bookingFilter=target.dataset.filter||"all"; render(); break;
      case "document-sheet":
      case "add-document":
        route("form", "document");
        break;
      case "open-document":
      case "boarding-pass":
        await openLocalDocument(target.dataset.id);
        break;
      case "remove-document":
        confirmDeleteDocument(target.dataset.id);
        break;
      case "select-timeline-day": {
        const dayKey = target.dataset.key || null;
        if (dayKey === state.timelineDayKey) break;
        state.timelineDayKey = dayKey;
        let patched = false;
        try {
          patched = patchTimelineDayDOM();
        } catch (_e) {
          patched = false;
        }
        if (!patched) render();
        break;
      }
      case "timeline-detail": {
        const id = target.dataset.id,
          transport = transportForItem(id),
          stay = stayForItem(id);
        if (transport && String(val(transport, "transport_type")) === "flight")
          route("flight", id);
        else if (transport && ["train", "ferry"].includes(String(val(transport, "transport_type")))) route("train", id);
        else if (stay) route("hotel", id);
        else route("plan", id);
        break;
      }
      case "booking-detail": {
        const kind = target.dataset.kind,
          id = target.dataset.id;
        if (kind === "flight") route("flight", id);
        else if (kind === "hotel") route("hotel", id);
        else if (["train", "ferry"].includes(kind)) route("train", id);
        else route("plan", id);
        break;
      }
      case "refresh-booking-email-inbox":
        try { await refreshBookingEmailInbox(); render(); showToast("Email inbox refreshed."); }
        catch (error) { showToast(error.message,"alert"); }
        break;
      case "choose-booking-email-trip":
        state.bookingEmailSelectionId=target.dataset.id||null;
        openSheet("booking-email-trip",target);
        break;
      case "assign-booking-email": {
        const emailId=target.dataset.emailId,tripId=target.dataset.tripId;
        if (!emailId||!tripId) break;
        target.disabled=true;
        try {
          const assigned=PREVIEW_MODE
            ? {emailId,tripId,importId:state.bookingEmails.find((row)=>String(row.id)===String(emailId))?.import_id||"preview-import"}
            : await api(`/api/v1/booking-emails/${encodeURIComponent(emailId)}/assign`,{method:"POST",body:JSON.stringify({tripId})});
          const email=state.bookingEmails.find((row)=>String(row.id)===String(emailId));
          if (email) Object.assign(email,{trip_id:tripId,trip_title:state.trips.find((trip)=>String(trip.id)===String(tripId))?.title||null,status:"needs_confirmation",rejection_code:null,import_id:assigned.importId||email.import_id});
          state.sheet=null;
          state.bookingEmailSelectionId=null;
          await openBookingEmailReview(email);
        } catch (error) { target.disabled=false; showToast(error.message,"alert"); }
        break;
      }
      case "review-booking-email": {
        const email=state.bookingEmails.find((row)=>String(row.id)===String(target.dataset.id));
        try { await openBookingEmailReview(email); }
        catch (error) { showToast(error.message,"alert"); }
        break;
      }
      case "dismiss-booking-email":
        try {
          if (!PREVIEW_MODE) await api(`/api/v1/booking-emails/${encodeURIComponent(target.dataset.id)}/dismiss`,{method:"POST",body:"{}"});
          state.bookingEmails=state.bookingEmails.filter((row)=>String(row.id)!==String(target.dataset.id));
          render();
          showToast("Booking email dismissed.");
        } catch (error) { showToast(error.message,"alert"); }
        break;
      case "review-import":
        if(PREVIEW_MODE){state.importReview={candidates:[{id:"candidate-1",type:"flight",title:"LY 383 · TLV → FCO",confidence:"low",warnings:["Timezone missing"]}]};route("import-review");}
        else {try{state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/${encodeURIComponent(target.dataset.id)}`);route("import-review");}catch(error){showToast(error.message,"alert");}}
        break;
      case "remove-import": if(target.dataset.id) confirmRemoveImport(target.dataset.id); break;
      case "confirm-import": try{await resolveImport(target.dataset.id,"confirm");}catch(error){showToast(error.message,"alert");} break;
      case "reject-import": try{await resolveImport(target.dataset.id,"reject");}catch(error){showToast(error.message,"alert");} break;
      case "add-duplicate-import": {
        try{if(PREVIEW_MODE){state.importReview.duplicate=false;render();break;}const response=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,{method:"POST",body:JSON.stringify({...state.importUploadRequest,duplicateDisposition:"add_anyway"})});state.importReview=response;render();showToast("A separate review was created.");}catch(error){showToast(error.message,"alert");}break;
      }
      case "sync-retry": if(PREVIEW_MODE){state.syncStatus={pendingOperations:0,openConflicts:0};render();showToast("Pending changes synced in preview.");}else await loadApp(); break;
      case "sync-review": {
        try { const result=await apiGet(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/sync/conflicts`); state.syncConflicts=Array.isArray(result)?result:(result.conflicts||[]); render(); }
        catch (error) { showToast(error.message,"alert"); }
        break;
      }
      case "export-trip":
        if(PREVIEW_MODE){showToast("Trip export is available outside preview mode.");break;}
        if(!state.trip){showToast("Select a trip first to export it.");break;}
        try{showToast("Preparing trip export…");await apiDownload(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/export/json`,`tripto-trip-${String(state.trip.id).slice(0,8)}.json`);}catch(error){showToast(error.message,"alert");}
        break;
      case "support":
      case "export-support":
        if(PREVIEW_MODE){showToast("Support bundle is available outside preview mode.");break;}
        if(!state.trip){showToast("Select a trip first to build a support bundle.");break;}
        try{showToast("Preparing support bundle…");await apiDownload(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/support`,`tripto-support-${String(state.trip.id).slice(0,8)}.json`);}catch(error){showToast(error.message,"alert");}
        break;
      case "open-help":
        openSheet("help", target);
        break;
      case "open-notifications":
        state.notifSeenSnapshot = lastSeenNotificationAt();
        markNotificationsSeen();
        openSheet("notifications", target);
        break;
      case "notification-open": {
        const id = target.dataset.id,
          transport = transportForItem(id),
          stay = stayForItem(id);
        closeSheet();
        if (transport && String(val(transport, "transport_type")) === "flight") route("flight", id);
        else if (transport && ["train", "ferry"].includes(String(val(transport, "transport_type")))) route("train", id);
        else if (stay) route("hotel", id);
        else route("plan", id);
        break;
      }
      case "open-upcoming-trips":
        state.tripFilter = "upcoming";
        route("trips");
        break;
      case "open-past-trips":
        state.tripFilter = "past";
        route("trips");
        break;
      case "booking-email-info":
        state.sheet = null;
        route("booking-email-inbox");
        break;
      case "remove-local-data": {
        const pending=pendingMutations().filter((x)=>x.status!=="done").length+Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
        if(pending){showToast("Review pending changes before removing local data.","alert");break;}
        if(confirm("Remove locally stored documents and cached trip data from this phone? Your server trip will not be deleted.")) {
          try { await clearLocalDeviceData(); showToast("Local files and cached trip data were removed from this phone."); render(); }
          catch (error) { showToast(error.message,"alert"); }
        }
        break;
      }
      case "delete-account": {
        try {
          const preview=await api("/api/v1/account/deletion-preview");
          const trips=Number(val(preview?.deletion||preview,"ownedTrips","owned_trips")||0);
          if(prompt(`Permanently delete your account and ${trips} server trip${trips===1?"":"s"}? Type DELETE to confirm.`)!=="DELETE") break;
          await api("/api/v1/account",{method:"DELETE",body:JSON.stringify({confirm:"DELETE"})});
          await clearLocalDeviceData();
          localStorage.removeItem("tripto_token"); state.token=""; state.trip=null; state.trips=[];
          await loadApp(); showToast("Your account and server data were deleted.");
        } catch (error) { showToast(error.message,"alert"); }
        break;
      }
      case "sign-out": {
        const pending=pendingMutations().filter((x)=>x.status!=="done").length+Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
        if(pending&&!confirm(`${pending} change${pending===1?" is":"s are"} still pending. Sign out anyway? The changes and local documents will stay on this phone.`))break;
        try{const previousIdentity=sessionIdentity();const result=await api("/api/v1/auth/signout",{method:"POST",body:"{}"});globalThis.google?.accounts?.id?.disableAutoSelect?.();clearApiCache(previousIdentity);state.token=result.session.token;localStorage.setItem("tripto_token",state.token);await loadApp();showToast("Signed out. Local documents remain on this phone.");}catch(error){showToast(error.message,"alert");}break;
      }
      case "show-driver":
        state.selectedId = target.dataset.id || state.selectedId;
        state.sheet = "driver";
        render();
        break;
      case "close-driver":
        state.sheet = null;
        route("hotel", state.selectedId, true);
        break;
      case "directions-hotel": {
        const stay =
          state.stays.find(
            (row) => itemId(row) === String(target.dataset.id),
          ) || selectedStay();
        openMaps(
          mapQueryForLocation(
            locationById(
              val(stay, "property_location_id", "start_location_id"),
            ),
          ),
        );
        break;
      }
      case "toggle-live-flight": {
        if (!state.liveFlights?.available || !state.trip) break;
        const id = String(target.dataset.id),
          flight =
            state.transport.find((row) => itemId(row) === id) ||
            selectedFlight(),
          enable = Number(val(flight, "live_data_enabled")) !== 1;
        try {
          await api(
            `/api/v1/trips/${encodeURIComponent(state.trip.id)}/transport/${encodeURIComponent(id)}/live`,
            { method: "PATCH", body: JSON.stringify({ enabled: enable }) },
          );
          await loadTripDetails();
          render();
          showToast(
            enable ? "Live flight status on." : "Live flight status off.",
          );
        } catch (error) {
          showToast(
            error?.message || "Live flight status could not be updated.",
            "alert",
          );
        }
        break;
      }
      case "refresh-live-flight": {
        if (!state.liveFlights?.available || !state.trip) break;
        const id = String(target.dataset.id);
        try {
          await api(
            `/api/v1/trips/${encodeURIComponent(state.trip.id)}/transport/${encodeURIComponent(id)}/live/refresh`,
            { method: "POST", body: "{}" },
          );
          await loadTripDetails();
          render();
          showToast("Live flight status refreshed.");
        } catch (error) {
          showToast(
            error?.message || "Live status could not be refreshed.",
            "alert",
          );
        }
        break;
      }
      case "directions-flight": {
        const flight =
          state.transport.find(
            (row) => itemId(row) === String(target.dataset.id),
          ) || selectedFlight();
        openMaps(
          mapQueryForLocation(
            locationById(
              val(flight, "departure_location_id", "start_location_id"),
            ),
          ),
        );
        break;
      }
      case "toggle-flight-details":
        if (flightDetailsCloseTimer) {
          clearTimeout(flightDetailsCloseTimer);
          flightDetailsCloseTimer = null;
        }
        state.flightDetailsOpen = !state.flightDetailsOpen;
        target.setAttribute("aria-expanded", String(state.flightDetailsOpen));
        target.querySelector(".flight-more__chevron").innerHTML = icon(
          state.flightDetailsOpen ? "chevronUp" : "chevronDown",
          18,
        );
        {
          const panel = document.getElementById("flight-details-panel"),
            content = target.closest(".detail-content"),
            stack = target.closest(".flight-detail-stack"),
            keyboardActivation = inputMethod === "keyboard",
            reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!panel || !content || !stack) break;
          if (state.flightDetailsOpen) {
            content.classList.add("detail-content--expanded");
            stack.classList.add("is-expanded");
            panel.hidden = false;
            requestAnimationFrame(() => panel.classList.add("is-open"));
          } else {
            panel.classList.remove("is-open");
            panel.classList.add("is-closing");
            flightDetailsCloseTimer = setTimeout(
              () => {
                flightDetailsCloseTimer = null;
                render();
                if (keyboardActivation)
                  document.getElementById("flight-details-toggle")?.focus();
              },
              reducedMotion ? 0 : 180,
            );
          }
        }
        break;
      case "directions-item": {
        const item = state.timeline.find(
            (row) => itemId(row) === String(target.dataset.id),
          ),
          transport = transportForItem(target.dataset.id),
          stay = stayForItem(target.dataset.id),
          locationId = transport
            ? val(transport, "departure_location_id", "start_location_id")
            : stay
              ? val(stay, "property_location_id", "start_location_id")
              : val(item, "start_location_id");
        openMaps(mapQueryForLocation(locationById(locationId)));
        break;
      }
      case "refresh-weather":
        if (state.weatherRefreshing) break;
        state.weatherRefreshing = true;
        render();
        try {
          await ensureWeather(true);
        } finally {
          state.weatherRefreshing = false;
          if (state.screen === "timeline" || state.screen === "weather") render();
        }
        break;
      case "call":
        if (target.dataset.value) location.href = `tel:${target.dataset.value}`;
        else showToast("Phone number unavailable.");
        break;
      case "copy":
        if (target.dataset.value) {
          await navigator.clipboard.writeText(target.dataset.value);
          showToast("Copied.");
        } else showToast("Value unavailable.");
        break;
      case "edit-note":
        state.editingNote = target.dataset.id || null;
        render();
        requestAnimationFrame(() => {
          const field = document.querySelector(".fd-note-edit__field");
          if (field) {
            field.focus();
            field.setSelectionRange(field.value.length, field.value.length);
          }
        });
        break;
      case "cancel-note":
        state.editingNote = null;
        render();
        break;
      case "save-note": {
        const id = target.dataset.id, kind = target.dataset.kind,
          field = target.closest(".fd-note-edit")?.querySelector(".fd-note-edit__field"),
          record = findBookingRecord(kind, id);
        if (!record?.entity) {
          showToast("This booking is no longer available.");
          state.editingNote = null;
          render();
          break;
        }
        if (target.getAttribute("aria-busy") === "true") break;
        target.setAttribute("aria-busy", "true");
        target.textContent = "Saving…";
        try {
          await saveBookingNote(record.entity, kind, field ? field.value : "");
          state.editingNote = null;
          showToast("Note saved.");
        } catch (error) {
          showToast(error?.message || "The note was not saved.");
          target.removeAttribute("aria-busy");
          target.textContent = "Save note";
          break;
        }
        render();
        break;
      }
      case "share-flight": {
        const flight = selectedFlight();
        if (!flight) return;
        const r = flightRoute(flight),
          text = `${flightNumber(flight)} · ${r.fromCode} → ${r.toCode} · ${formatDateTime(flightDeparture(flight), val(flight, "departure_timezone"))}`;
        if (navigator.share) await navigator.share({ title: "Flight", text });
        else {
          await navigator.clipboard.writeText(text);
          showToast("Flight details copied.");
        }
        break;
      }
      case "share-booking": {
        const record = findBookingRecord(target.dataset.kind, target.dataset.id);
        if (!record) return;
        const text = bookingShareText(record);
        if (navigator.share) await navigator.share({ title: bookingRecordTitle(record), text });
        else {
          await navigator.clipboard.writeText(text);
          showToast("Details copied.");
        }
        break;
      }
      case "recalculate-health": {
        if (PREVIEW_MODE) {
          showToast("Trip Health preview is current.");
          break;
        }
        try {
          const id = encodeURIComponent(state.trip.id),
            result = await api(`/api/v1/trips/${id}/health/recalculate`, {
              method: "POST",
              body: "{}",
            });
          state.health = result.health;
          showToast("Trip Health updated.");
          render();
        } catch (error) {
          showToast(error.message);
        }
        break;
      }
      case "refresh-data":
        state.refreshingOffline = true;
        render();
        try {
          if (!PREVIEW_MODE) await loadTripDetails();
          showToast("Offline trip data refreshed.");
        } finally {
          state.refreshingOffline = false;
          render();
        }
        break;
      case "fix-offline": {
        const missingDocuments = documentRequirementRows().some(
          (row) => !row.ready,
        );
        if (missingDocuments) route("documents");
        else await loadApp();
        break;
      }
      case "download-missing":
        route("documents");
        break;
      case "offline-info":
        showToast(
          "Ready means the required data or checksum-verified document is stored on this phone.",
        );
        break;
      case "health-info":
        showToast(
          "Trip Health uses deterministic rules and only the travel information currently available.",
        );
        break;
      default:
        break;
    }
  }
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-screen],[data-action]");
    if (!target) return;
    if (target.dataset.screen) {
      // Generic navigation to the trips list shows every trip. Only the explicit
      // "Upcoming trips" / "Past trips" rows (data-action) set a filter, right
      // before they route — so clear any stale filter here.
      if (target.dataset.screen === "trips") state.tripFilter = null;
      route(
        target.dataset.screen,
        target.dataset.id || null,
        false,
        target.classList.contains("nav-item") ? "tab" : "forward",
      );
      return;
    }
    handleAction(target.dataset.action, target, "pointer").catch((error) =>
      showToast(error instanceof Error ? error.message : String(error), "alert"),
    );
  });
  app.addEventListener("input", (event) => {
    const faqSearch = event.target.closest?.("[data-faq-search]");
    if (faqSearch) {
      const query = String(faqSearch.value || "").trim().toLocaleLowerCase();
      let visible = 0;
      app.querySelectorAll("[data-faq-section]").forEach((section) => {
        let sectionVisible = 0;
        section.querySelectorAll("[data-faq-row]").forEach((row) => {
          const match = !query || String(row.dataset.search || "").includes(query);
          row.hidden = !match;
          if (match) sectionVisible += 1;
        });
        section.hidden = sectionVisible === 0;
        visible += sectionVisible;
      });
      const count = app.querySelector("[data-faq-count]");
      const empty = app.querySelector("[data-faq-empty]");
      if (count) count.textContent = `${visible} answer${visible === 1 ? "" : "s"}`;
      if (empty) empty.hidden = visible !== 0;
      return;
    }
    const input = event.target.closest?.("[data-currency-amount]");
    if (!input) return;
    const currency = initCurrency(), amount = Math.max(0, Number(input.value) || 0);
    currency.amount = amount;
    saveCurrencyPreferences();
    const result = app.querySelector(".currency-result__amount"), note = app.querySelector(".currency-rate-note"), rate = Number(currency.rate);
    if (result) {
      const converted = Number.isFinite(rate) ? amount * rate : null;
      try { result.textContent = converted == null ? "—" : new Intl.NumberFormat(undefined, { style:"currency", currency:currency.to, maximumFractionDigits:2 }).format(converted); }
      catch (_) { result.textContent = converted == null ? "—" : `${converted.toFixed(2)} ${currency.to}`; }
    }
    if (note && Number.isFinite(rate)) note.textContent = `1 ${currency.from} = ${rate.toFixed(rate < 1 ? 4 : 3)} ${currency.to}`;
  });
  window.addEventListener(
    "pointerdown",
    () => {
      document.documentElement.dataset.inputMethod = "pointer";
    },
    { capture: true },
  );
  window.addEventListener("popstate", () => {
    if (document.getElementById("doc-viewer")) {
      closeDocumentViewer(true);
      return;
    }
    const next = parseRoute();
    if (
      formHasMeaningfulChanges &&
      DIRTY_TASK_SCREENS.has(state.screen) &&
      next.screen !== state.screen
    ) {
      history.pushState(
        null,
        "",
        routeUrl(state.screen, state.selectedId),
      );
      requestDiscardChanges(() => history.back());
      return;
    }
    scrollPositions.set(state.screen, window.scrollY);
    if (
      next.screen !== "flight" ||
      String(next.id || "") !== String(state.selectedId || "")
    )
      state.flightDetailsOpen = false;
    if (!state.routeMotion) state.routeMotion = "back";
    state.screen = next.screen;
    state.selectedId = next.id;
    state.sheet = null;
    transitionRender();
    maybeLoadScreenData();
    const restore = scrollPositions.get(next.screen) || 0;
    requestAnimationFrame(() => window.scrollTo({ top: restore, behavior: "instant" }));
  });
  window.addEventListener("online", async () => {
    state.offline = false;
    if (googleRedirectMarker === "complete") {
      await resumeGoogleRedirectSession();
      return;
    }
    await flushSmartImportQueue();
    await flushChecklistQueue();
    loadApp();
  });
  window.addEventListener("offline", () => {
    state.offline = true;
    render();
  });
  // A backgrounded tab can be restored (bfcache) frozen mid-load, leaving the
  // loading skeleton on screen forever. Re-kick the load when the tab returns:
  // always after a bfcache restore, and otherwise only if we're stuck loading —
  // so a healthy tab-switch never churns the network. hydrateAppFromCache paints
  // cached data instantly, so this does not flash the skeleton when cache exists.
  function revalidateOnReturn(force) {
    if (PREVIEW_MODE || googleRedirectExchangePromise) return;
    if (!force && !state.loading && state.tripsLoaded) return;
    loadApp();
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) revalidateOnReturn(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidateOnReturn(false);
  });
  window.addEventListener("beforeunload", (event) => {
    if (!formHasMeaningfulChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.addEventListener("resize", syncVisualViewport);
  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.(KEYBOARD_FIELD_SELECTOR)) {
      fieldFocused = true;
      applyKeyboardState();
      setTimeout(keepFocusedFieldVisible, 80);
    }
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      fieldFocused = Boolean(
        document.activeElement?.matches?.(KEYBOARD_FIELD_SELECTOR),
      );
      applyKeyboardState();
    }, 120);
  });
  window.addEventListener("keydown", (event) => {
    document.documentElement.dataset.inputMethod = "keyboard";
    const rangeDay = event.target?.closest?.(".range-day[data-date]");
    if (rangeDay && state.sheet === "date-range" && state.dateRange) {
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 },
        current = new Date(`${rangeDay.dataset.date}T12:00:00Z`);
      let next = null;
      if (Object.hasOwn(offsets, event.key)) {
        current.setUTCDate(current.getUTCDate() + offsets[event.key]);
        next = current;
      } else if (event.key === "Home") {
        current.setUTCDate(current.getUTCDate() - current.getUTCDay());
        next = current;
      } else if (event.key === "End") {
        current.setUTCDate(current.getUTCDate() + (6 - current.getUTCDay()));
        next = current;
      } else if (event.key === "PageUp" || event.key === "PageDown") {
        current.setUTCMonth(current.getUTCMonth() + (event.key === "PageUp" ? -1 : 1));
        next = current;
      }
      if (next) {
        event.preventDefault();
        const iso = next.toISOString().slice(0, 10);
        state.dateRange.focusDate = iso;
        state.dateRange.month = rangeMonthStart(iso);
        render();
        requestAnimationFrame(() =>
          document.querySelector(`.range-day[data-date="${CSS.escape(iso)}"]`)?.focus(),
        );
        return;
      }
    }
    const disclosureButton = event.target?.closest?.(
      '[data-action="toggle-flight-details"]',
    );
    if (
      disclosureButton &&
      ["Enter", " ", "Spacebar"].includes(event.key)
    ) {
      event.preventDefault();
      handleAction(
        "toggle-flight-details",
        disclosureButton,
        "keyboard",
      ).catch((error) =>
        showToast(
          error instanceof Error ? error.message : String(error),
          "alert",
        ),
      );
      return;
    }
    if (!state.sheet || state.sheet === "driver") return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const sheet = document.querySelector(".bottom-sheet,.full-screen-picker"),
      focusable = sheet
        ? [...sheet.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
        : [];
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  syncVisualViewport();
  if ("serviceWorker" in navigator && !PREVIEW_MODE)
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("/sw.js").catch((error) => console.error("Service worker registration failed", error)),
    );
  window.TriptoMobileApp = {
    reload: loadApp,
    show: route,
    getState: () => state,
  };
  const startupRoute = parseRoute();
  if (startupRoute.redirect || location.hash)
    history.replaceState(
      null,
      "",
      routeUrl(startupRoute.screen, startupRoute.id),
    );
  resumeGoogleRedirectSession();
})();
