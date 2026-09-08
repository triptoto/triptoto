(function () {
  "use strict";

  // Reuse formatting machinery, never formatted travel data. Keep the cache
  // bounded when a traveler visits many time zones in one session.
  const dateFormatters = new Map();
  function dateFormatter(locale, options = {}) {
    const key = JSON.stringify([locale || null, options]);
    let formatter = dateFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      if (dateFormatters.size >= 128) dateFormatters.delete(dateFormatters.keys().next().value);
      dateFormatters.set(key, formatter);
    }
    return formatter;
  }

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
    tripDetailsLoading: false,
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
    expandedChecklistTripId: null,
    focusChecklistEdit: false,
    brain: null,
    impacts: [],
    transport: [],
    liveFlights: { enabled: false, available: false, betaOnly: true, reason: "disabled" },
    stays: [],
    locations: [],
    collections: [],
    collectionStops: [],
    stopMenu: null,
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
    memberMenu: null,
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
    documentViewerContext = null,
    sessionRefreshPromise = null,
    sheetReturnFocus = null,
    sheetPointer = null,
    routeTimer = null,
    formHasMeaningfulChanges = false,
    discardDialogOpen = false,
    formPrefill = null,
    discardReturnFocus = null;
  const scrollPositions = new Map();
  const DIRTY_TASK_SCREENS = new Set(["form", "import", "import-review", "collection-form", "stop-form", "day-plan-form"]);
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
  // "Add a booking" is for confirmed reservations/tickets only (transport &
  // stays). Sightseeing/experience types live in Day Plan, so they are hidden
  // from the booking picker — but kept in MANUAL_BOOKING_TYPES because existing
  // bookings, forwarded emails and edit forms still render through that map.
  const BOOKING_PICKER_HIDDEN = new Set(["restaurant", "tour", "activity", "attraction", "event"]);
  const BOOKING_GROUP_DISPLAY = Object.freeze({ "Stay & plans": "Stay" });
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
    if (!fromHistory && history.state?.triptoDocumentViewer) {
      history.back();
      return;
    }
    const url = el.dataset.blobUrl;
    el.remove();
    document.documentElement.classList.remove("doc-viewer-open");
    if (!documentViewerContext?.wasInert) app.removeAttribute("inert");
    const opener = documentViewerContext?.opener;
    documentViewerContext = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
  }
  function openDocumentViewer(blob, name) {
    if (document.getElementById("doc-viewer")) return;
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
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", name || "Travel document");
    overlay.dataset.blobUrl = url;
    overlay.innerHTML = `<header class="doc-viewer__bar"><button type="button" class="doc-viewer__back" data-action="close-doc-viewer" aria-label="Back to app" title="Back to app">${icon("back", 24)}</button><strong class="doc-viewer__title">${safeName}</strong><a class="doc-viewer__ext" href="${url}" download="${safeName}" target="_blank" rel="noopener" aria-label="Download ${safeName}">${icon("download", 24)}</a></header><div class="doc-viewer__body">${media}</div>`;
    document.body.appendChild(overlay);
    documentViewerContext = { opener: document.activeElement, wasInert: app.hasAttribute("inert") };
    app.setAttribute("inert", "");
    document.documentElement.classList.add("doc-viewer-open");
    history.pushState({ ...(history.state || {}), triptoDocumentViewer: true }, "", location.href);
    overlay
      .querySelector(".doc-viewer__back")
      ?.addEventListener("click", () => closeDocumentViewer());
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDocumentViewer();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...overlay.querySelectorAll("button,a[href]")].filter(control => !control.disabled);
      const index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    });
    overlay.querySelector(".doc-viewer__back")?.focus();
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
  function routeEntities(screen) {
    if (screen === "timeline") return state.trips || [];
    if (screen === "collection" || screen === "collection-form" || screen === "stop-form") return state.collections || [];
    if (screen === "flight") return (state.transport || []).filter((item) => String(val(item, "transport_type") || "") === "flight");
    if (screen === "train") return (state.transport || []).filter((item) => ["train", "ferry"].includes(String(val(item, "transport_type") || "")));
    if (screen === "hotel") return state.stays || [];
    if (["plan", "add-to-plan", "day-plan-form"].includes(screen)) return state.timeline || [];
    if (screen === "traveler") return state.travelers || [];
    return [];
  }
  function routeEntityLabel(screen, entity) {
    if (!entity) return "";
    const locationFor = (id) => (state.locations || []).find((row) => String(row.id) === String(id)) || null;
    const locationNameFor = (id) => val(locationFor(id), "city", "display_name", "local_name") || "";
    if (screen === "timeline") return [val(entity, "title"), val(entity, "starts_on", "startsOn")].filter(Boolean).join(" ");
    if (["collection", "collection-form", "stop-form"].includes(screen)) return [val(entity, "title"), val(entity, "city", "area")].filter(Boolean).join(" ");
    if (screen === "flight") {
      const from = locationFor(val(entity, "departure_location_id", "start_location_id")), to = locationFor(val(entity, "arrival_location_id", "end_location_id"));
      return [val(entity, "title", "carrier_name", "marketing_flight_number"), val(from, "iata_code", "station_code"), val(to, "iata_code", "station_code")].filter(Boolean).join(" ");
    }
    if (screen === "train") {
      const from = locationFor(val(entity, "departure_location_id", "start_location_id")), to = locationFor(val(entity, "arrival_location_id", "end_location_id"));
      return [val(entity, "title", "service_number", "carrier_name"), val(from, "city", "display_name"), val(to, "city", "display_name")].filter(Boolean).join(" ");
    }
    if (screen === "hotel") return [val(entity, "property_name", "title"), locationNameFor(val(entity, "property_location_id", "start_location_id"))].filter(Boolean).join(" ");
    if (["plan", "add-to-plan", "day-plan-form"].includes(screen)) return [val(entity, "title"), val(entity, "activity_type", "reservation_type")].filter(Boolean).join(" ");
    if (screen === "traveler") return val(entity, "display_name", "name") || "Traveler";
    return val(entity, "title", "name") || "Item";
  }
  function routeEntitySlug(screen, entity) {
    const id = itemId(entity), label = routeEntityLabel(screen, entity), base = routes?.slugify?.(label) || "item";
    if (!id) return base;
    const peers = routeEntities(screen).filter((candidate) => (routes?.slugify?.(routeEntityLabel(screen, candidate)) || "item") === base);
    if (peers.length <= 1) return base;
    const disambiguator = routes?.slugify?.(id) || id.replace(/[^a-z0-9]+/gi, "-") || "item";
    return `${base}-${disambiguator.slice(0, 8)}`;
  }
  function routeEntityForId(screen, id) {
    const wanted = String(id || "");
    const collectionRoute = ["collection", "collection-form", "stop-form"].includes(screen);
    return routeEntities(screen).find((entity) =>
      itemId(entity) === wanted ||
      (collectionRoute && String(val(entity, "trip_item_id") || "") === wanted),
    ) || null;
  }
  function resolveRouteId(screen, rawId) {
    const wanted = String(rawId || "");
    if (!wanted) return null;
    const exact = routeEntityForId(screen, wanted);
    if (exact) return itemId(exact);
    const match = routeEntities(screen).find((entity) => routeEntitySlug(screen, entity) === wanted);
    return match ? itemId(match) : null;
  }
  // Detail routes carry a private record ID (or its readable slug). A stale
  // link must never leave that unresolved ID in state: detail screens otherwise
  // render the misleading generic "Plan unavailable" page.
  const ENTITY_ROUTE_SCREENS = new Set([
    "flight", "hotel", "train", "plan", "traveler", "collection",
    "collection-form", "stop-form", "day-plan-form", "add-to-plan",
  ]);
  const MISSING_ENTITY_DESTINATIONS = Object.freeze({
    flight: "bookings", hotel: "bookings", train: "bookings", plan: "timeline",
    traveler: "travelers", collection: "planning", "collection-form": "day-plan",
    "stop-form": "planning", "day-plan-form": "day-plan", "add-to-plan": "save-later",
  });
  function isNewEntityRoute(screen, rawId) {
    return ["collection-form", "day-plan-form"].includes(screen) &&
      String(rawId || "").startsWith("new:");
  }
  function requiresResolvedRouteEntity(screen, rawId) {
    return Boolean(rawId) && ENTITY_ROUTE_SCREENS.has(screen) && !isNewEntityRoute(screen, rawId);
  }
  function missingEntityDestination(screen) {
    return { screen: MISSING_ENTITY_DESTINATIONS[screen] || "timeline", id: null };
  }
  function applyRouteTripSelection() {
    const parsed = parseRoute();
    if (parsed.screen !== "timeline" || !parsed.id) return;
    const tripId = resolveRouteId("timeline", parsed.id), trip = (state.trips || []).find((row) => String(row.id) === String(tripId));
    if (trip) {
      state.trip = trip;
      try { localStorage.setItem("tripto_selected_trip", trip.id); } catch (_) {}
    }
  }
  function resolveRouteSelection() {
    const parsed = parseRoute();
    if (parsed.screen === "timeline" && parsed.id) {
      applyRouteTripSelection();
      state.selectedId = null;
      return true;
    }
    if (!requiresResolvedRouteEntity(parsed.screen, parsed.id)) return true;
    const resolved = resolveRouteId(parsed.screen, parsed.id);
    if (resolved) {
      state.selectedId = resolved;
      return true;
    }
    state.selectedId = null;
    return false;
  }
  function readableRouteId(screen, id) {
    const wanted = String(id || "");
    if (!wanted || wanted.startsWith("new:")) return id;
    const entity = routeEntityForId(screen, wanted);
    return entity ? routeEntitySlug(screen, entity) : id;
  }
  function canonicalizeAppRoute() {
    if (state.loading || state.tripDetailsLoading || !state.tripsLoaded) return;
    const parsed = parseRoute();
    const hasResolvedSelection = resolveRouteSelection();
    if (requiresResolvedRouteEntity(parsed.screen, parsed.id) && !hasResolvedSelection) {
      const fallback = missingEntityDestination(parsed.screen);
      state.screen = fallback.screen;
      state.selectedId = fallback.id;
      state.sheet = null;
      const fallbackUrl = routeUrl(fallback.screen, fallback.id);
      history.replaceState(
        routeHistoryState(fallback.screen, fallback.id, routeHistoryIndex()),
        "",
        fallbackUrl,
      );
      return;
    }
    const screen = parsed.screen === "timeline" ? "timeline" : state.screen;
    const id = screen === "timeline" ? state.trip?.id || parsed.id : state.selectedId || parsed.id;
    const nextUrl = routeUrl(screen, id);
    const currentUrl = `${location.pathname}${location.search}`;
    if (nextUrl !== currentUrl) history.replaceState(routeHistoryState(screen, id, routeHistoryIndex()), "", nextUrl);
  }
  function routeUrl(screen, id = null) {
    const routeId = screen === "timeline" && !id ? state.trip?.id || null : id;
    // Keep the public shell at its canonical root URL on first load. Internal
    // navigation still has its own /home route, while /, /app, and
    // /index.html remain equivalent entry points for search and bookmarks.
    if (screen === "home" && !routeId && ["/", "/app", "/index.html"].includes(location.pathname))
      return `/${location.search || ""}`;
    return routes?.urlFor(screen, readableRouteId(screen, routeId), location.search) || "/timeline";
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
  function confirmDeleteTrip(tripArg, returnScreen) {
    const trip = tripArg || state.trip;
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
        await deleteCurrentTrip(trip, returnScreen);
        backdrop.remove();
      } catch (error) {
        confirmBtn.disabled = false; cancel.disabled = false;
        showToast(error?.message || "The trip could not be deleted.", "alert");
      }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  async function deleteCurrentTrip(trip, returnScreen) {
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
      route(returnScreen === "trips" ? "trips" : "timeline", null, true);
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
  function bookingNavigationActions() {
    if (!state.trip || state.error || state.googleAuthHandoffStatus) return "";
    // Resolve the same record as the visible detail page, including legacy
    // routes whose selected ID is an alias rather than the booking ID.
    const item = state.screen === "flight" ? selectedFlight()
      : state.screen === "hotel" ? selectedStay()
      : state.screen === "train" ? selectedTrain()
      : state.screen === "plan" ? selectedPlan() : null;
    if (!item) return "";
    const kind = state.screen === "hotel" ? "hotel"
      : String(val(item, "transport_type", "type") || "plan"),
      isIdea = !val(item, "transport_type") && String(val(item, "activity_type", "reservation_type", "type")).toLowerCase() === "idea",
      attrs = ` data-kind="${esc(kind)}" data-id="${esc(itemId(item))}"`,
      canEdit = canEditCurrentTrip();
    const actions = [
      canEdit ? sheetActionRow(isIdea ? "edit-idea" : "edit-booking", "edit", "Edit", attrs) : "",
      sheetActionRow("share-booking", "share", "Share", attrs),
      canEdit && !isIdea ? sheetActionRow("move-booking", "calendar", "Move to another day", attrs) : "",
      canEdit ? sheetActionRow(isIdea ? "delete-idea" : "delete-booking", "trash", "Delete", attrs, "", true) : "",
    ].join("");
    return `<section class="booking-navigation-actions" aria-label="Booking actions">${sheetActionList(actions)}</section>`;
  }
  function collectionNavigationActions() {
    if (state.screen !== "collection" || !state.trip || state.error || state.googleAuthHandoffStatus || !canEditCurrentTrip()) return "";
    const collection = collectionForItem(state.selectedId);
    if (!collection) return "";
    const label = collectionConfig(collection.collection_type)?.label || "Plan";
    return `<section class="collection-navigation-actions" aria-label="Plan actions">${sheetActionList(sheetActionRow("edit-collection", "edit", `Edit ${label}`, ` data-id="${esc(collection.id)}"`))}</section>`;
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
    const attrs = ` data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"`;
    const actions = `${sheetActionRow("edit-booking", "edit", "Edit", attrs, "Update the details of this booking")}${sheetActionRow("move-booking", "calendar", "Move to another day", attrs, "Keep the times, change the day")}`;
    const destructive = sheetActionRow("delete-booking", "trash", "Delete", attrs, "Remove this booking from the trip", true);
    return bottomSheet("manage-booking", "Manage booking", `${sheetActionList(actions)}${sheetActionList(destructive, { danger: true })}`);
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
  // Only the trip's own dates (starts_on..ends_on), no item-derived days. Ideas
  // can be planned onto these days exclusively — the trip owns its calendar.
  function tripDateDays() {
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
    return keys;
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
  const BACK_FALLBACKS = Object.freeze({
    home: "trips", trips: "timeline", timeline: "trips", bookings: "timeline", flight: "bookings", hotel: "bookings",
    train: "bookings", plan: "bookings", documents: "bookings", ready: "bookings",
    health: "timeline", account: "trips", collaboration: "timeline", planning: "timeline",
    "trip-options": "timeline", travelers: "account", traveler: "travelers", checklist: "timeline",
    import: "add-booking", "import-review": "import", "import-history": "import",
    "booking-email-inbox": "bookings", sync: "trip-options", join: "trips",
    collection: "planning", "collection-form": "day-plan", "stop-form": "collection",
    "add-trip": "timeline", "add-booking": "add-trip", "day-plan": "add-trip",
    "day-plan-form": "day-plan", "save-later": "add-trip", "add-to-plan": "save-later",
    "trip-map": "timeline", weather: "trip-options", currency: "trip-options", esim: "trip-options",
  });
  function routeHistoryState(screen, id, index = 0) {
    return { tripto: true, triptoIndex: Math.max(0, Number(index) || 0), screen, id: id || null };
  }
  function routeHistoryIndex() {
    return history.state?.tripto === true ? Math.max(0, Number(history.state.triptoIndex) || 0) : 0;
  }
  function backDestination() {
    const screen = state.screen, id = String(state.selectedId || "");
    if (screen === "form") {
      if (id === "trip") return { screen: "trips", id: null };
      if (id === "document") return { screen: "documents", id: null };
      if (QUICK_ADD_KINDS.has(id)) return { screen: "add-booking", id: null };
      return { screen: "bookings", id: null };
    }
    if (screen === "stop-form" && id) return { screen: "collection", id };
    if (screen === "collection-form" && id && !id.startsWith("new:")) return { screen: "collection", id };
    if (screen === "day-plan-form" && state.dayPlanContext === "save-later") return { screen: "save-later", id: null };
    return { screen: BACK_FALLBACKS[screen] || "timeline", id: null };
  }
  function goBackFromCurrentScreen() {
    const destination = backDestination();
    const goBack = () => {
      formHasMeaningfulChanges = false;
      state.routeMotion = "back";
      if (routeHistoryIndex() > 0) history.back();
      else route(destination.screen, destination.id, false, "back");
    };
    if (formHasMeaningfulChanges && DIRTY_TASK_SCREENS.has(state.screen)) requestDiscardChanges(goBack);
    else goBack();
  }
  function route(screen, id, replace = false, kind = "forward") {
    if (
      formHasMeaningfulChanges &&
      DIRTY_TASK_SCREENS.has(state.screen) &&
      (screen !== state.screen || String(id || "") !== String(state.selectedId || ""))
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
    if (replace) history.replaceState(routeHistoryState(screen, id, routeHistoryIndex()), "", nextUrl);
    else if (`${location.pathname}${location.search}` !== nextUrl)
      history.pushState(routeHistoryState(screen, id, routeHistoryIndex() + 1), "", nextUrl);
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
    renderToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      state.toastAction = null;
      toastActionFn = null;
      renderToast();
    }, 3600);
  }
  let toastActionFn = null;
  function showUndoToast(message, onUndo, ms = 5000) {
    state.toast = String(message || "");
    state.toastKind = "status";
    state.toastAction = { label: "Undo" };
    toastActionFn = typeof onUndo === "function" ? onUndo : null;
    renderToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      state.toastAction = null;
      toastActionFn = null;
      renderToast();
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
      return dateFormatter(undefined, {
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
      return dateFormatter(undefined, { weekday: "short" }).format(
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
        wd = dateFormatter(undefined, { weekday: "short" }).format(d),
        md = dateFormatter(undefined, { month: "short", day: "numeric" }).format(d);
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
  // All timeline, booking-list, and notification routes use this one resolver.
  // It only opens a detail page after the current trip data confirms the item;
  // deleted or stale notifications therefore cannot route into a blank detail.
  function detailRouteForItem(rawId) {
    const id = String(rawId || "");
    if (!id) return null;
    const collection = collectionForItem(id);
    if (collection) return { screen: "collection", id: itemId(collection) };
    const transport = transportForItem(id);
    if (transport) {
      const kind = String(val(transport, "transport_type") || "");
      if (kind === "flight") return { screen: "flight", id: itemId(transport) };
      if (["train", "ferry"].includes(kind)) return { screen: "train", id: itemId(transport) };
    }
    const stay = stayForItem(id);
    if (stay) return { screen: "hotel", id: itemId(stay) };
    const timelineItem = (state.timeline || []).find((item) => itemId(item) === id);
    return timelineItem ? { screen: "plan", id: itemId(timelineItem) } : null;
  }
  function openTimelineItemDetail(rawId) {
    if (state.tripDetailsLoading) {
      showToast("Your trip is still loading. Try again in a moment.");
      return false;
    }
    const destination = detailRouteForItem(rawId);
    if (!destination) {
      showToast("This item is no longer available. Your trip is unchanged.", "alert");
      return false;
    }
    route(destination.screen, destination.id);
    return true;
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
      return dateFormatter(undefined, {
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
      return dateFormatter(undefined, {
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
      const parts = dateFormatter(undefined, {
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
      return dateFormatter(undefined, {
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
      return dateFormatter(undefined, {
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
      return dateFormatter(undefined, {
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
  // Shared detail grammar used across every booking screen: one category hero,
  // then compact, flat rows. Every detail type deliberately uses the same list
  // class so spacing cannot drift between activities, stays and transport.
  function fdRowIcon(name, warn = false) {
    return `<span class="fd-row__icon${warn ? " fd-row__icon--warn" : ""}">${icon(name, 20)}</span>`;
  }
  function fdRowText(title, sub = "") {
    return `<span class="fd-row__text"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
  }
  function fdStaticRow(iconName, title, sub = "", warn = false) {
    return `<div class="fd-row fd-row--static">${fdRowIcon(iconName, warn)}${fdRowText(title, sub)}</div>`;
  }
  function fdButtonRow(iconName, title, action, attrs = "", sub = "", trail = "chevron", rowClass = "") {
    return `<button type="button" class="fd-row fd-row--button${rowClass ? ` ${esc(rowClass)}` : ""}" data-action="${action}" ${attrs}>${fdRowIcon(iconName)}${fdRowText(title, sub)}${trail ? `<span class="fd-row__chev">${icon(trail, 18)}</span>` : ""}</button>`;
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
    return body ? `<section class="fd-list fd-list--detail" aria-label="${esc(label)}">${body}</section>` : "";
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
    if (["car", "car-rental"].includes(k) || tt === "car") return { mode: "contact", type: "rental_car", structured: [["Driver", "driver"]], keep: ["phone"] };
    if (["transfer", "taxi"].includes(k) || ["transfer", "taxi"].includes(tt)) return { mode: "contact", type: "driver", structured: [["Driver", "driver"], ["Vehicle", "vehicle"]], keep: ["phone"] };
    if (k === "bus" || tt === "bus") return { mode: "contact", type: "other", structured: [], keep: ["phone", "email"] };
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
  // One loading language for network waits, local processing and screen startup.
  // Tokens keep overlapping work independent; every caller releases in finally.
  const activeActivities = new Map();
  let activityTimer = null;
  let awaitingConfirmation = 0;
  function thinkingPattern() {
    return '<span class="thinking-pattern" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  }
  function thinkingPanel(label = "Getting things ready…", compact = false) {
    return `<div class="thinking-panel${compact ? " thinking-panel--compact" : ""}" role="status" aria-live="polite" aria-atomic="true">${thinkingPattern()}<div class="thinking-copy"><strong>${esc(label)}</strong>${compact ? "" : '<span>A little moment for your next adventure.</span>'}</div></div>`;
  }
  function syncActivityPanel() {
    let node = document.getElementById("tripto-activity");
    if (!activeActivities.size || awaitingConfirmation) {
      clearTimeout(activityTimer); activityTimer = null;
      node?.remove();
      return;
    }
    if (!node) {
      if (activityTimer) return;
      activityTimer = setTimeout(() => {
        activityTimer = null;
        if (!activeActivities.size || awaitingConfirmation || document.querySelector("#app .thinking-panel")) return;
        node = document.createElement("div");
        node.id = "tripto-activity";
        node.className = "thinking-notice";
        const specific = [...activeActivities.values()].find(label => label !== "Updating your trip…");
        node.innerHTML = thinkingPanel(specific || "Updating your trip…", true);
        document.body.appendChild(node);
      }, 250);
      return;
    }
    const label = [...activeActivities.values()].find(value => value !== "Updating your trip…") || "Updating your trip…";
    const text = node.querySelector("strong");
    if (text && text.textContent !== label) text.textContent = label;
  }
  function beginActivity(label = "Updating your trip…") {
    const token = Symbol("activity");
    activeActivities.set(token, label);
    syncActivityPanel();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      activeActivities.delete(token);
      syncActivityPanel();
    };
  }
  function actionActivityLabel(action) {
    if (/import|upload/.test(action)) return "Preparing your booking…";
    if (/weather/.test(action)) return "Checking the forecast…";
    if (/currency/.test(action)) return "Updating exchange rates…";
    if (/open-trip|switch-trip|select-trip/.test(action)) return "Opening your trip…";
    if (/save|confirm|create/.test(action)) return "Saving your changes…";
    return "Getting things ready…";
  }
  const REQUEST_TIMEOUT_MS = 15000;
  async function fetchWithTimeout(url, options = {}) {
    const finishActivity = beginActivity();
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
      finishActivity();
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
    render();
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
      if (QA_STATE === "trips-journal") {
        const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
        state.trips = [
          { id: "qa-current", title: "A journey along the coast", starts_on: iso(-4), ends_on: iso(7), lifecycle_state: "active", is_shared: true, role: "viewer" },
          { id: "qa-long", title: "A longer journey", starts_on: iso(-45), ends_on: iso(45), lifecycle_state: "active" },
          ...state.trips,
          { id: "qa-undated", title: "A trip to plan", lifecycle_state: "draft" },
          { id: "qa-cancelled", title: "Cancelled journey", starts_on: iso(-20), ends_on: iso(-10), lifecycle_state: "cancelled" },
        ];
      }
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
      applyRouteTripSelection();
      state.tripsLoaded = !state.error;
      state.loading = false;
      resolveRouteSelection();
      canonicalizeAppRoute();
      render();
      maybeLoadScreenData();
      return;
    }
    const hydrated = hydrateAppFromCache();
    // Cached detail pages still carry a readable URL slug on startup. Resolve
    // it before the first paint; an incomplete cache must wait for the record,
    // not briefly render the missing-plan fallback while requests are pending.
    state.loading = !hydrated || !resolveRouteSelection();
    if (hydrated) state.tripsLoaded = true;
    render();
    try {
      const [tripsResult, accountResult] = await Promise.all([
        apiGet("/api/v1/trips"),
        apiGet("/api/v1/account"),
      ]);
      state.trips = tripsResult?.trips || [];
      state.account = accountResult?.account || null;
      // Inbox and trip detail requests are independent. Start both before
      // waiting so account startup does not serialize their network latency.
      const inboxReady = state.account?.mode === "account"
        ? apiGet("/api/v1/booking-emails").then(
            (result) => { state.bookingEmails = result?.bookingEmails || []; },
            () => { state.bookingEmails = []; },
          )
        : Promise.resolve().then(() => { state.bookingEmails = []; });
      applyRouteTripSelection();
      const selected = localStorage.getItem("tripto_selected_trip");
      state.trip = state.trip ||
        state.trips.find((trip) => String(trip.id) === selected) ||
        selectRelevantTrip(state.trips) ||
        null;
      if (state.trip)
        localStorage.setItem("tripto_selected_trip", state.trip.id);
      await Promise.all([loadTripDetails(), inboxReady]);
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
      resolveRouteSelection();
      canonicalizeAppRoute();
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
      `/api/v1/trips/${id}/collections`,
    ];
  }
  function applyTripDetails(results) {
    const take = (index, key, fallback) =>
      results[index] && results[index].status === "fulfilled"
        ? (results[index].value?.[key] ?? fallback)
        : fallback;
    // Every section is independently cached. Keep the last good section if a
    // secondary request fails, rather than emptying the whole trip because one
    // optional endpoint (for example collections or live-flight data) is down.
    state.timeline = take(0, "items", state.timeline || []);
    state.timelineDayKey = null;
    state.checklist = normalizeChecklist(take(1, "items", state.checklist || []));
    state.brain = take(2, "brain", state.brain || null);
    state.impacts = take(3, "impacts", state.impacts || []);
    state.transport = take(4, "transport", state.transport || []);
    state.liveFlights =
      results[4] && results[4].status === "fulfilled"
        ? results[4].value?.liveFlights || {
            enabled: false,
            available: false,
            betaOnly: true,
            reason: "disabled",
          }
        : state.liveFlights || { enabled: false, available: false, betaOnly: true, reason: "unavailable" };
    state.stays = take(5, "stays", state.stays || []);
    state.locations = take(6, "locations", state.locations || []);
    state.travelers = take(7, "travelers", state.travelers || []);
    state.connections = take(8, "connections", state.connections || []);
    state.health = take(9, "health", state.health || null);
    state.bookingDetails = take(10, "bookingDetails", state.bookingDetails || []);
    state.contacts = take(11, "contacts", state.contacts || []);
    state.syncStatus = take(
      12,
      "sync",
      state.syncStatus || null,
    );
    const activityDetails = take(13, "activities", []),
      activityById = new Map(activityDetails.map((item) => [String(item.id), item]));
    state.timeline = state.timeline.map((item) => activityById.has(String(item.id)) ? { ...item, ...activityById.get(String(item.id)) } : item);
    state.imports = take(14, "imports", state.imports || []);
    state.changes = take(15, "changes", state.changes || []);
    state.collections = take(16, "collections", state.collections || []);
    state.collectionStops = take(16, "stops", state.collectionStops || []);
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
  let tripDetailsRequestId = 0;
  async function loadTripDetails() {
    const requestId = ++tripDetailsRequestId;
    if (!state.trip) {
      state.tripDetailsLoading = false;
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
      state.collections = [];
      state.collectionStops = [];
      resetCollaborationState();
      return;
    }
    const tripId = state.trip.id;
    state.tripDetailsLoading = true;
    try {
      if (
        (state.sharingTripId && String(state.sharingTripId) !== String(tripId)) ||
        (state.collabTripId && String(state.collabTripId) !== String(tripId))
      )
        resetCollaborationState();
      const [results, localDocs] = await Promise.all([
        Promise.allSettled(tripDetailPaths().map(apiGet)),
        // Local documents improve offline use but must never block the itinerary
        // if this browser temporarily cannot open IndexedDB.
        listLocalDocs(tripId).catch(() => []),
      ]);
      // Drop the response if the user switched trips while it was in flight, so a
      // slow request can never overwrite the newly-opened trip's data.
      if (state.trip?.id !== tripId || requestId !== tripDetailsRequestId) return;
      // Do not make the entire itinerary unavailable when one independent
      // section fails. applyTripDetails keeps the last verified values for any
      // rejected request and still applies the sections that did arrive.
      applyTripDetails(results);
      state.localDocs = localDocs;
      if (state.trip?.id !== tripId) return;
      void ensureWeather();
      // Soft, non-fatal: lets the trip menu reveal "Plan together" only when the
      // server kill-switch (SHARING_ENABLED) is on. Never blocks trip loading.
      void loadSharingStatus(tripId);
    } finally {
      // An older request must not clear the loading state of a newer one.
      if (requestId === tripDetailsRequestId) state.tripDetailsLoading = false;
    }
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
    Object.assign(state, { timeline: [], transport: [], stays: [], locations: [], travelers: [], checklist: [], brain: null, impacts: [], changes: [], health: null, bookingDetails: [], contacts: [], collections: [], collectionStops: [] });
    state.tripDetailsLoading = true;
    routeAfter();
    await loadTripDetails();
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
    return `<header class="app-header"><button class="brand" data-screen="home" aria-label="tripto.to Home">tripto<span class="brand-dot">.</span>to</button><div class="connection-state">${state.offline ? `<span class="offline-state" role="status">${icon("info", 16)} Offline</span>` : ""}${HeaderNavigation()}</div></header>`;
  }
  function appBar(title, subtitle = "", dark = false, right = "") {
    return `<header class="app-bar app-bar--navigation ${dark ? "app-bar--dark" : ""}${right ? " app-bar--with-actions" : ""}"><button class="icon-button" data-action="back" aria-label="Back">${icon("back", 24)}</button><div class="app-bar-title"><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>${HeaderNavigation()}${right ? `<div class="app-bar-actions">${right}</div>` : ""}</header>`;
  }
  function HeaderNavigation() {
    const collection = state.screen === "collection" ? collectionForItem(state.selectedId) : null;
    const addPlace = state.trip && collection && canEditCurrentTrip();
    const label = addPlace ? `Add ${collectionConfig(collection.collection_type)?.stop || "place"}` : !state.trip ? "Create trip" : "Add to trip";
    const add = addPlace ? `data-action="collection-add-place" data-id="${esc(collection.id)}"` : 'data-action="open-add"';
    return `<div class="header-navigation"><button type="button" class="icon-button header-navigation__add${addPlace ? " collection-header-add" : ""}" ${add} aria-label="${esc(label)}" title="${esc(label)}">${icon("plus", 24)}</button><button type="button" class="icon-button header-navigation__menu" data-action="open-navigation" aria-label="Menu" title="Menu" aria-haspopup="dialog" aria-expanded="${state.sheet === "navigation"}" aria-controls="navigation-menu">${icon("menu", 24)}</button></div>`;
  }
  function navigationSheet() {
    const entries = [
      ["trips", "trips", "All trips"],
      ["trip-options", "route", "Trip Options"],
      ["checklist", "checklist", "To-Do List"],
      ["account", "user", "Account"],
    ];
    const links = entries.map(([screen, glyph, label]) => sheetActionLink(
      glyph, label, "", routeUrl(screen),
      ` data-screen="${screen}"${state.screen === screen ? ' aria-current="page"' : ""}`,
    )).join("");
    return bottomSheet("navigation", "Menu", `<div id="navigation-menu">${bookingNavigationActions()}${collectionNavigationActions()}<nav aria-label="Primary navigation">${sheetActionList(links)}</nav></div>`);
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

  // -----------------------------------------------------------------------
  // Tripto Flat Travel primitives
  // -----------------------------------------------------------------------
  // These small string primitives are intentionally framework-free: the app's
  // renderer is a single offline-capable shell, so keeping the grammar here
  // means every route can share the same row, status, header and state markup
  // without changing its data flow or event delegation.
  function PastelIcon(name, tone = "activity", size = 22, extra = "") {
    return `<span class="ds-pastel-icon ds-pastel-icon--${esc(tone)} ${esc(extra)}" aria-hidden="true">${icon(name, size)}</span>`;
  }
  function StatusLabel(label, tone = "neutral") {
    return label ? `<span class="ds-status ds-status--${esc(tone)}">${esc(label)}</span>` : "";
  }
  function SectionHeader(title, action = "", label = "View all") {
    return `<div class="ds-section-header"><h2>${esc(title)}</h2>${action ? `<button type="button" class="ds-text-action" data-action="${esc(action)}">${esc(label)}</button>` : ""}</div>`;
  }
  function SegmentedControl(items, active, action = "") {
    return `<div class="ds-segmented" role="group">${items.map(([key, label]) => `<button type="button" class="${key === active ? "is-active" : ""}" data-action="${esc(action)}" data-filter="${esc(key)}" aria-pressed="${key === active}">${esc(label)}</button>`).join("")}</div>`;
  }
  function FlatList(rows, label = "") {
    return `<div class="ds-flat-list ds-grouped-card ds-grouped-card--list"${label ? ` aria-label="${esc(label)}"` : ""}>${rows.join("")}</div>`;
  }
  function FlatRow({ title, meta = "", iconName = "info", tone = "activity", action = "", screen = "", id = "", attrs = "", status = "", statusTone = "neutral", className = "", trailing = "chevron", description = "" }) {
    const target = action ? `data-action="${esc(action)}"` : screen ? `data-screen="${esc(screen)}"` : "";
    const identity = id ? ` data-id="${esc(id)}"` : "";
    const trail = trailing === "none" ? "" : trailing === "chevron" ? icon("chevron", 18, "ds-flat-row__chevron") : trailing;
    return `<button type="button" class="ds-flat-row ${esc(className)}" ${target}${identity}${attrs}><span class="ds-flat-row__icon">${PastelIcon(iconName, tone, 22)}</span><span class="ds-flat-row__copy"><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}${description ? `<small class="ds-flat-row__description">${esc(description)}</small>` : ""}${status ? StatusLabel(status, statusTone) : ""}</span>${trail}</button>`;
  }
  function ChoiceTile({ title, meta = "", iconName = "info", tone = "activity", action = "", attrs = "" }) {
    return `<button type="button" class="ds-choice-tile" data-action="${esc(action)}"${attrs}><span class="ds-choice-tile__icon">${PastelIcon(iconName, tone, 22)}</span><span><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span>${icon("chevron", 18, "ds-choice-tile__chevron")}</button>`;
  }
  function HeroSummary(eyebrow, title, meta = "", tone = "activity", body = "") {
    return `<section class="ds-hero-summary ds-hero-summary--${esc(tone)}"><span class="ds-hero-summary__eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${meta ? `<p>${esc(meta)}</p>` : ""}${body}</section>`;
  }
  function TimelineRow(time, title, meta = "", index = "", tone = "activity", attrs = "") {
    return `<div class="ds-timeline-row"${attrs}><time>${esc(time || "—")}</time><span class="ds-timeline-row__rail"><i></i></span>${index ? `<span class="ds-timeline-row__marker ds-timeline-row__marker--${esc(tone)}">${esc(index)}</span>` : PastelIcon("info", tone, 22)}<span class="ds-timeline-row__copy"><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span></div>`;
  }
  function FormField(label, value = "", attrs = "") {
    return `<label class="ds-form-field"><span>${esc(label)}</span><input value="${esc(value)}" ${attrs}></label>`;
  }
  function PrimaryButton(label, action = "", attrs = "") {
    return `<button type="button" class="ds-primary-button" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
  }
  function SecondaryButton(label, action = "", attrs = "") {
    return `<button type="button" class="ds-secondary-button" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
  }
  function ProgressSummary(done, total, title = "Ready") {
    const current = Math.max(0, Number(done) || 0), max = Math.max(current, Number(total) || 0), pct = max ? Math.round((current / max) * 100) : 0;
    return `<section class="ds-progress-summary"><strong>${esc(title)}</strong><span>${current} of ${max} ready</span><span class="ds-progress-summary__bar" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${max}"><i style="width:${pct}%"></i></span></section>`;
  }
  function EmptyState(title, body, iconName = "info", action = "", actionLabel = "") {
    return `<section class="ds-empty-state"><span class="ds-empty-state__icon">${icon(iconName, 28)}</span><h1>${esc(title)}</h1><p>${esc(body)}</p>${action && actionLabel ? PrimaryButton(actionLabel, action) : ""}</section>`;
  }
  function LoadingState(label = "Loading…") {
    return `<section class="ds-loading-state" role="status" aria-live="polite"><span class="ds-loading-state__mark" aria-hidden="true"></span><strong>${esc(label)}</strong></section>`;
  }
  function ErrorState(title, body, action = "retry", actionLabel = "Try again") {
    return `<section class="ds-error-state" role="alert"><span class="ds-error-state__icon">${icon("warning", 28)}</span><h1>${esc(title)}</h1><p>${esc(body)}</p>${PrimaryButton(actionLabel, action)}</section>`;
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
    return `<section class="next-action-card ${view.setup ? "next-action-card--setup" : ""}"><span class="ticket-chip ${view.setup ? "ticket-chip--setup" : ""}">${icon(view.icon, 18)} ${esc(view.label)}</span><h2>${esc(view.title)}</h2><p>${esc(view.copy)}</p><div class="next-action-actions"><button class="secondary-cta ${view.setup ? "next-action-primary" : ""}" data-action="open-add-booking">${icon("plus", 20)} Add booking</button><button class="secondary-cta" data-screen="trips">${icon("trips", 20)} Timeline</button></div></section>`;
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
    return `<div class="phone-app"><section class="screen home-screen">${topbar()}${mobileAlert()}<main class="content">${tripContext()}${nextCard}${summaries}</main></section></div>`;
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
        // Explicit routes (including invitations, Account and Create trip)
        // remain reachable from the header even before a guest has a trip.
        ["home", "timeline"].includes(state.screen),
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
    return `<ul class="welcome-features ds-grouped-card"><li><span class="row-icon">${icon("ticket",22)}</span><span>All your bookings in one place</span></li><li><span class="row-icon">${icon("calendar",22)}</span><span>A clear plan for every day</span></li><li><span class="row-icon">${icon("favorite",22)}</span><span>Ideas to save for later</span></li></ul>`;
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
    return `<div class="phone-app"><section class="first-run-screen welcome-thread screen--navless" aria-labelledby="first-run-title"><header class="first-run-brand-row"><div class="first-run-brand" role="img" aria-label="tripto.to"><span class="first-run-brand__name">tripto</span><span class="first-run-brand__dot">.</span><span class="first-run-brand__to">to</span></div>${offline}${HeaderNavigation()}</header><main class="first-run-main"><section class="first-run-hero"><p class="first-run-eyebrow">A little less to think about</p><h1 id="first-run-title" aria-label="Your trip. In good order."><span class="first-run-title__line">Your trip.</span><span class="first-run-title__line">In good order.</span></h1><p class="first-run-lede">Flights, stays, and everything between.<br>Together, wherever you go.</p></section>${firstRunProductPreview()}<div class="first-run-actions"><div class="first-run-google">${entryAction}</div><p class="signin-error" role="alert" hidden></p><button class="first-run-secondary" data-action="open-first-run-how"><span>Take a tour</span></button></div></main><footer class="welcome-v2__footer"><span class="welcome-private-note">Your plans stay private.</span><nav aria-label="Legal"><a href="/privacy">Privacy</a><span aria-hidden="true">·</span><a href="/terms">Terms</a></nav></footer></section></div>`;
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
    const article = /^[aeiou]/i.test(noun) ? "An" : "A";
    return `${article} ${noun} ${verb} this trip.`;
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
        : `<div class="notif-empty">${icon("bell", 30)}<h2>You're all caught up</h2><p>Booking imports, added stops, and other trip updates will show up here.</p></div>`;
    return bottomSheet("notifications", "Notifications", body);
  }

  function timelineScreen() {
    if (!state.trip)
      return `<div class="phone-app"><section class="screen timeline-screen">${appBar("Trip")}<main class="timeline-page timeline-page--empty"><div class="timeline-empty"><span class="timeline-empty__icon">${icon("calendar", 28)}</span><h1>No trip selected</h1><p>Create or select a trip first.</p>${primaryCta("Create a Trip", "create-trip", "plus")}</div></main></section></div>`;
    const now = Date.now(),
      highlightedNextId =
        QA_STATE === "timeline-normal" ? "" : itemId(nextItem() || {}),
      groups = [];
    for (const item of state.timeline) {
      // Wishlists and unscheduled collections never appear as main-timeline
      // rows — they live in the Planning area. A scheduled collection appears
      // once here; its stops are only ever shown inside the collection screen.
      if (!isTimelineVisibleItem(item)) continue;
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
                `<button type="button" class="timeline-day-tab${index === activeDayIdx ? " timeline-day-tab--active" : ""}" data-action="select-timeline-day" data-key="${esc(group.key)}"${index === activeDayIdx ? ' aria-current="true"' : ""}><span class="timeline-day-tab__dow">${esc(group.day.weekday)}</span><span class="timeline-day-tab__date">${esc(group.day.month ? `${group.day.month} ${group.day.dayNum || group.day.dayOfMonth}` : group.day.dayOfMonth || group.day.date.split(" ").pop())}</span></button>`,
            )
            .join("")}</nav>`
        : "";
    const pagedGroups = groups.length > 1 ? [groups[activeDayIdx]] : groups;
    const content = state.tripDetailsLoading && !groups.length
      ? `<div class="thinking-stage thinking-stage--inline timeline-inline-loading">${thinkingPanel("Opening your trip…")}</div>`
      : groups.length
      ? `<div class="timeline-ribbon${groups.length > 1 ? " timeline-ribbon--paged" : ""}">${pagedGroups
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
                  return `<button type="button" class="journey-event journey-event--${phase}${exception ? ` journey-event--${esc(exception.tone)}` : ""}" data-action="timeline-detail" data-id="${esc(itemId(item))}" aria-label="${esc(aria)}"${active || next ? ' aria-current="step"' : ""}><span class="journey-time">${esc(eventTime)}</span><span class="journey-track" aria-hidden="true"><span class="journey-dot"></span></span><span class="journey-marker journey-marker--${esc(markerClass)}">${icon(glyph, 24)}</span><span class="journey-content"><span class="journey-copy">${flags ? `<span class="timeline-flags">${flags}</span>` : ""}<strong>${esc(title)}</strong><small>${esc(subtitle)}</small>${meta ? `<small class="journey-meta">${esc(meta)}</small>` : ""}</span><span class="journey-chevron" aria-hidden="true">${icon("chevron", 20)}</span></span></button>`;
                })
                .join("")}</div></section>`,
          )
          .join("")}</div>`
      : `<div class="timeline-empty timeline-empty--intent"><span class="timeline-empty__eyebrow">Start building</span><h1>Add to ${esc(state.trip.title || "your trip")}</h1><p>Book it, plan your days, or save an idea.</p>${addIntentRows()}</div>`;
    const headerAction = `<div class="trip-v2-actions">${notifyAction()}${HeaderNavigation()}</div>`;
    const header = `<header class="trip-v2-header"><button class="trip-v2-selector" data-action="switch-trip" aria-label="Switch trip"><strong>${esc(state.trip.title || "Trip")}</strong>${icon("chevronDown",15)}<small>${esc(formatTripDates(state.trip))}</small></button>${headerAction}</header>`;
    return `<div class="phone-app"><section class="screen timeline-screen timeline-screen--ribbon">${header}${mobileAlert()}${dayTabs}<main class="timeline-page ${groups.length ? "timeline-page--journey" : "timeline-page--empty"}">${groups.length ? timelineContextCard() : ""}${content}</main></section></div>`;
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
    // Keep the add form (and its draft) while another task is being changed.
    const addForm = cur.querySelector("#checklist-add-form");
    const freshAddForm = fresh.querySelector("#checklist-add-form");
    if (addForm && freshAddForm) freshAddForm.replaceWith(addForm);
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
    return "";
  }

  function timelineDay(ms, timeZone) {
    if (ms == null)
      return { key: "unavailable", weekday: "Date", date: "Unavailable" };
    try {
      const parts = dateFormatter("en-US", {
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
        month: get("month"),
        dayNum: String(Number(get("day")) || get("day")),
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
    const collection = collectionForItem(itemId(item));
    if (collection) { const cfg = collectionConfig(collection.collection_type); return cfg ? cfg.icon : "city"; }
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
    const collection = collectionForItem(itemId(item));
    if (collection) { const cfg = collectionConfig(collection.collection_type); return [cfg ? cfg.label : "Plan", collectionSummary(item)].filter(Boolean).join(" · "); }
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
      boardingRow = `<div class="fd-row fd-row--static fd-row--with-meta"><span class="fd-row__icon${bpStored ? "" : " fd-row__icon--warn"}">${icon(bpStored ? "qr" : "warning", 20)}</span><span class="fd-row__text"><strong>Boarding pass</strong><small>${bpStored ? "Stored and verified on this phone" : "No verified boarding pass on this phone yet"}</small></span></div>`,
      directionsRow = fdButtonRow("navigation", "Directions", "directions-flight", `data-id="${esc(itemId(flight))}"`, "", "chevron", "fd-row--compact"),
      addRow = `<button type="button" class="fd-row fd-row--button fd-row--compact" data-action="add-document"><span class="fd-row__icon">${icon("plus", 20)}</span><span class="fd-row__text"><strong>Add document</strong></span><span class="fd-row__chev">${icon("chevron", 18)}</span></button>`,
      liveEnabled = Number(val(flight, "live_data_enabled")) === 1,
      liveControls = state.liveFlights?.available
        ? `<button type="button" class="fd-row fd-row--button fd-row--with-meta" data-action="toggle-live-flight" data-id="${esc(itemId(flight))}" aria-pressed="${liveEnabled}"><span class="fd-row__icon">${icon("plane", 20)}</span><span class="fd-row__text"><strong>Live flight status</strong><small>${liveEnabled ? "On · beta" : "Off"}</small></span><span class="fd-row__chev">${icon(liveEnabled ? "chevronUp" : "chevron", 18)}</span></button>${liveEnabled ? fdButtonRow("refresh", "Refresh now", "refresh-live-flight", `data-id="${esc(itemId(flight))}"`, "", "chevron", "fd-row--compact") : ""}`
        : "",
      flightDetailsList = fdList(
        [
          directionsRow,
          liveControls,
          boardingRow,
          docRows,
          addRow,
          disclosure,
          fdNoteRow(flight, "flight"),
        ],
        "Flight details and actions",
      );
    return `<div class="phone-app"><section class="screen dark-detail flight-detail-screen">${appBar("Flight Detail", "", true)}<main class="detail-content ${state.flightDetailsOpen ? "detail-content--expanded" : ""}"><div class="flight-detail-stack ${state.flightDetailsOpen ? "is-expanded" : ""}">${flightPass(flight, true)}${flightDetailsList}</div></main></section></div>`;
  }
  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000)),
      hours = Math.floor(minutes / 60),
      rest = minutes % 60;
    return hours ? `${hours}h ${rest ? `${rest}m` : ""}`.trim() : `${rest}m`;
  }
  function missingDetailScreen(title, body) {
    if (state.loading || state.tripDetailsLoading)
      return `<div class="phone-app"><section class="screen">${appBar("Loading…")}<main class="missing-detail-content" aria-busy="true">${loadingSkeleton()}</main></section></div>`;
    return `<div class="phone-app"><section class="screen">${appBar(title)}<main class="missing-detail-content">${EmptyState(title, body)}</main></section></div>`;
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
    return `<div class="phone-app"><section class="screen dark-detail hotel-detail-screen">${appBar("Hotel", "", false)}<main class="detail-content">${imageUrl ? `<div class="fd-hero-image" role="img" aria-label="Hotel property image"><img src="${esc(imageUrl)}" alt="" loading="lazy" decoding="async">${state.offline ? `<span class="hotel-offline-badge" role="status">${icon("info", 16)} Offline · saved details</span>` : ""}</div>` : ""}<section class="fd-card${imageUrl ? " fd-card--attached" : ""}" aria-label="Stay details"><div class="fd-card__head"><span class="fd-flight">${icon("hotel", 16)} ${esc(val(stay, "property_name", "title") || "Stay")}</span><span class="fd-status-wrap" role="status" aria-label="${esc(statusLabel)}. Scheduled booking data is never presented as live."><span class="fd-status ${statusTone === "confirmed" ? "is-confirmed" : ""}">${statusTone === "confirmed" ? checkDot() : ""}${esc(statusLabel)}</span><small>Scheduled data</small></span></div>${roomName ? `<p class="fd-sub">${esc(roomName)}</p>` : ""}<div class="fd-stay"><div class="fd-stay__col"><span class="fd-label">Check-in</span><strong>${esc(formatTripBoundDate(val(stay, "check_in_date"), state.trip))}</strong><small>${esc(val(stay, "check_in_from") || "Time not set")}</small></div><div class="fd-stay__mid"><span class="fd-stay__track" aria-hidden="true">${icon("night", 16)}</span><span class="fd-stay__nights">${esc(nights(stay))} ${nights(stay) === 1 ? "night" : "nights"}</span></div><div class="fd-stay__col fd-stay__col--right"><span class="fd-label">Check-out</span><strong>${esc(formatTripBoundDate(val(stay, "check_out_date"), state.trip))}</strong><small>${esc(val(stay, "check_out_by") || "Time not set")}</small></div></div></section>${fdList([
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
    ], "Hotel details and documents")}</main></section></div>`;
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
    return `<div class="phone-app"><section class="screen">${appBar("Bookings")}${mobileAlert()}<div class="intro-block"><h1>Your bookings</h1><p>Only the details you need while travelling.</p></div><main class="bookings-list">${rows.length ? rows.join("") : `<div class="empty-mobile"><h2>No bookings yet</h2><p>Add transport, a stay or an activity.</p>${primaryCta("Add Booking", "open-add", "plus")}</div>`}<button class="booking-card" data-screen="documents"><span class="info-icon green">${icon("document", 22)}</span><span><strong>Documents</strong><span>${state.localDocs.filter((doc) => doc.integrity === "verified").length} verified offline files</span></span>${icon("chevron", 22, "chevron")}</button><button class="booking-card" data-screen="ready"><span class="info-icon">${icon("download", 22)}</span><span><strong>Ready Offline</strong><span>Check what is saved on this phone</span></span>${icon("chevron", 22, "chevron")}</button></main></section></div>`;
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
    return mobilePage("Documents", `<header class="screen-intro"><span class="screen-intro__icon">${icon("document", 26)}</span><div><h1>Your travel documents</h1><p>${verified} of ${state.localDocs.length} ready offline on this phone</p></div></header><section class="mobile-group"><h2>Saved documents</h2><div class="document-list ds-grouped-card ds-grouped-card--list">${rows || `<div class="mobile-empty mobile-empty--compact"><span class="mobile-empty__icon">${icon("document", 30)}</span><h1>No offline documents</h1><p>Add a ticket, boarding pass, or confirmation.</p></div>`}</div></section><button class="mobile-primary-action" data-action="document-sheet">${icon("plus", 20)} Add Document</button>`, "bookings");
  }

  function mobilePage(title, body, active = "trips", right = "", extraClass = "") {
    return PageShell({ title, body, active, right, extraClass });
  }
  function focusedTaskPage(title, body, className = "", right = "") {
    return PageShell({ title, body, right, extraClass: `focused-task ${className}`, task: true });
  }
  function AppHeader(title, subtitle = "", dark = false, right = "") {
    return appBar(title, subtitle, dark, right);
  }
  function PageShell({ title, body, active = "trips", right = "", extraClass = "", task = false }) {
    const shellClass = `screen mobile-v1-screen app-surface ${esc(extraClass)}`;
    return `<div class="phone-app"><section class="${shellClass}">${AppHeader(title, "", false, right)}${mobileAlert()}<main class="${task ? "focused-page" : "mobile-page"}">${body}</main></section></div>`;
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
  // Trips journal, backed by the existing trip list and actions.
  function journalDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return null;
    const date = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date : null;
  }
  function journalDays(trip) {
    const start = journalDate(val(trip, "starts_on", "startsOn")),
      end = journalDate(val(trip, "ends_on", "endsOn"));
    if (!start || !end || end < start) return null;
    const total = Math.round((end - start) / 86400000) + 1;
    const today = journalDate(new Date().toISOString().slice(0, 10));
    return { total, day: Math.min(total, Math.max(1, Math.round((today - start) / 86400000) + 1)) };
  }
  function journalDayRail(trip) {
    const days = journalDays(trip);
    if (!days) return "";
    // Keep long trips bounded without hiding today, the start, or the end.
    const visible = days.total <= 12 ? Array.from({ length: days.total }, (_, i) => i + 1)
      : [...new Set([1, days.day - 2, days.day - 1, days.day, days.day + 1, days.day + 2, days.total].filter((n) => n >= 1 && n <= days.total))].sort((a, b) => a - b);
    const marks = visible.map((n, i) => `${i && n - visible[i - 1] > 1 ? '<span class="journal-day-gap">…</span>' : ""}<span class="${n === days.day ? "is-today" : n < days.day ? "is-elapsed" : ""}">${n}</span>`).join("");
    return `<div class="journal-days"><p>Day ${days.day} of ${days.total}</p><div class="journal-days__rail" aria-hidden="true">${marks}</div></div>`;
  }
  function journalCurrentTrip(trip) {
    const start = journalDate(val(trip, "starts_on", "startsOn")),
      end = journalDate(val(trip, "ends_on", "endsOn"));
    const dateLine = (date) => dateFormatter(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
    const dates = start && end ? `<span>${esc(dateLine(start))}${start.getUTCFullYear() !== end.getUTCFullYear() ? ` ${start.getUTCFullYear()}` : ""}</span><span>${esc(dateLine(end))}</span><small>${end.getUTCFullYear()}</small>` : `<span>${esc(formatTripDates(trip))}</span>`;
    const days = journalDays(trip);
    return `<section class="journal-current" data-longpress-trip data-id="${esc(trip.id)}"><p class="journal-eyebrow">In progress</p><h2>${esc(trip.title || "Untitled trip")}</h2><div class="journal-current__details"><div class="journal-date-range">${dates}</div><p>${days ? `${days.total} day${days.total === 1 ? "" : "s"} of travel` : "Your current journey"}</p></div>${journalDayRail(trip)}<div class="journal-current__actions"><button type="button" class="journal-open" data-action="open-trip" data-id="${esc(trip.id)}" aria-label="Open trip: ${esc(trip.title || "Untitled trip")}">Open trip</button>${tripSharedBadge(trip)}</div></section>`;
  }
  function journalNextTrip(trip) {
    const days = journalDays(trip);
    return `<section class="journal-next" data-longpress-trip data-id="${esc(trip.id)}"><div class="journal-next__info"><p class="journal-eyebrow">Up next</p><h2>${esc(trip.title || "Untitled trip")}</h2><p class="journal-next__dates">${esc(formatTripDates(trip))}${days ? ` <span>· ${days.total} days</span>` : ""}</p></div><div class="journal-next__aside"><span class="journal-next__countdown">${icon("sun", 18)} ${esc(tripCountdownLabel(trip) || "A new adventure awaits")}</span><button type="button" class="journal-open" data-action="open-trip" data-id="${esc(trip.id)}" aria-label="Open trip: ${esc(trip.title || "Untitled trip")}">Let's go ${icon("plane", 18)}</button></div>${tripSharedBadge(trip)}</section>`;
  }
  function journalTripRow(trip, label) {
    const archived = label === "Past" || label === "Cancelled";
    const date = journalDate(val(trip, "starts_on", "startsOn"));
    const month = date ? dateFormatter(undefined, { month: "short", timeZone: "UTC" }).format(date) : "";
    const stamp = date ? archived ? `<small>${esc(month)}<br>${date.getUTCFullYear()}</small>` : `<strong>${date.getUTCDate()}</strong><small>${esc(month)}</small>` : '<small>To plan</small>';
    const countdown = label === "Upcoming" ? tripCountdownLabel(trip) : "";
    return `<li class="journal-row-wrap" data-swipe-row><button type="button" class="journal-row__delete-action" data-action="delete-trip" data-id="${esc(trip.id)}" aria-label="Delete ${esc(trip.title || "trip")}" tabindex="-1">Delete</button><button type="button" class="journal-row${archived ? " journal-row--archive" : ""}" data-swipe-handle data-action="open-trip" data-id="${esc(trip.id)}"><span class="journal-row__date" aria-hidden="true">${stamp}</span><span class="journal-row__copy"><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small>${tripSharedBadge(trip)}</span>${countdown || label === "Cancelled" ? `<span class="journal-row__status">${icon("clock", 16)} ${esc(countdown || "Cancelled")}</span>` : ""}<span class="journal-row__arrow" aria-hidden="true">${icon("chevron", 18)}</span></button></li>`;
  }
  // Trips is a root destination, so it uses the same centered app bar as the
  // rest of the product. Account and Create trip stay accessible in the header
  // without showing trip-specific bottom navigation on the full trip list.
  function tripsPageHeader() {
    return `<header class="app-bar app-bar--root trips-app-bar"><button type="button" class="icon-button trips-header-account" data-screen="account" aria-label="Account" title="Account">${icon("user", 24)}</button><div class="app-bar-title"><strong>Trips</strong></div><div class="app-bar-actions"><button type="button" class="icon-button trips-header-add" data-action="create-trip" aria-label="Create trip">${icon("plus", 24)}</button></div></header>`;
  }
  function tripListRow(trip, label) {
    const isCurrent = label === "Current";
    const isPast = label === "Past";
    const isCancelled = label === "Cancelled";
    const days = isCurrent ? journalDays(trip) : null;
    const dateMeta = `${formatTripDates(trip)}${days ? ` · Day ${days.day} of ${days.total}` : ""}`;
    const status = isCurrent
      ? "Current"
      : isCancelled
        ? "Cancelled"
        : isPast
          ? "Completed"
          : tripCountdownLabel(trip) || "Upcoming";
    const iconName = isCurrent ? "directions" : isCancelled ? "close" : isPast ? "clock" : tripMarkIcon(trip);
    return `<li class="trip-list-row-wrap" data-swipe-row><button type="button" class="trip-list-row__delete-action" data-action="delete-trip" data-id="${esc(trip.id)}" aria-label="Delete ${esc(trip.title || "trip")}" tabindex="-1">Delete</button><button type="button" class="trip-list-row ds-flat-row${isCurrent ? " trip-list-row--current" : ""}${isPast ? " trip-list-row--past" : ""}${isCancelled ? " trip-list-row--cancelled" : ""}" data-swipe-handle data-action="open-trip" data-id="${esc(trip.id)}" aria-label="Open trip: ${esc(trip.title || "Untitled trip")}"><span class="trip-list-row__mark" aria-hidden="true">${icon(iconName, 22)}</span><span class="ds-flat-row__copy trip-list-row__copy"><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(dateMeta)}</small>${tripSharedBadge(trip)}<span class="trip-list-row__status">${esc(status)}</span></span>${icon("chevron", 18, "ds-flat-row__chevron")}</button></li>`;
  }
  function tripListScreen() {
    const filters = [["all","All"],["current","Current"],["upcoming","Upcoming"],["past","Past"]];
    const filter = filters.some(([key]) => key === state.tripFilter) ? state.tripFilter : "all";
    const order = ["Current", "Upcoming", "Past", "Cancelled"];
    const groups = Object.fromEntries(order.map((label) => [label, state.trips.filter((trip) => tripBucket(trip) === label).sort((a, b) => {
      const sa = String(val(a, "starts_on", "startsOn") || "9999-12-31"), sb = String(val(b, "starts_on", "startsOn") || "9999-12-31");
      return label === "Past" ? sb.localeCompare(sa) : sa.localeCompare(sb);
    })]));
    const filterBar = `<div class="ds-segmented trips-filter" role="group" aria-label="Filter trips">${filters.map(([key,label]) => `<button type="button" data-action="filter-trips" data-filter="${key}" aria-pressed="${filter === key}" class="${filter === key ? "is-active" : ""}">${label}<span>${key === "all" ? state.trips.length : groups[label].length}</span></button>`).join("")}</div>`;
    const content = order.filter((label) => filter === "all" || label.toLowerCase() === filter).map((label) => {
      const trips = groups[label];
      if (!trips.length) return "";
      const heading = label === "Past" ? "Past trips" : label;
      return `<section class="trip-list-group trip-list-group--${label.toLowerCase()}"><header class="trip-list-group__header"><h2>${heading}</h2><span class="trip-list-group__count">${trips.length}</span></header><ul class="trip-list ds-grouped-card ds-grouped-card--list">${trips.map((trip) => tripListRow(trip, label)).join("")}</ul></section>`;
    }).join("");
    const emptyCopy = {current:"Trips happening now will appear here.",upcoming:"Your next adventures will appear here.",past:"Completed trips will appear here.",all:"Create your first trip and keep everything in one place."};
    const body = content || `<section class="ds-empty-state trips-empty"><span class="ds-empty-state__icon">${icon("trips", 26)}</span><h1>${!state.trips.length ? "No trips yet" : `No ${filter === "all" ? "" : filter + " "}trips`}</h1><p>${emptyCopy[filter]}</p><button type="button" class="ds-primary-button" data-action="${state.trips.length ? "filter-trips" : "create-trip"}"${state.trips.length ? ' data-filter="all"' : ""}>${state.trips.length ? "Show all trips" : "Create trip"}</button></section>`;
    return `<div class="phone-app"><section class="screen trips-screen">${tripsPageHeader()}${mobileAlert()}<main class="trips-page"><section class="trips-intro"><span>YOUR JOURNEYS</span><h1>All your trips</h1><p>Plans, bookings, and ideas stay together here.</p></section>${filterBar}<div class="trip-list-results" aria-live="polite">${body}</div></main></section></div>`;
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
      return `<button class="ds-flat-row travel-row" data-action="booking-detail" data-kind="${esc(kind)}" data-id="${esc(itemId(item))}"><span class="ds-flat-row__icon travel-row__icon">${PastelIcon(transportIcon(kind), ["hotel"].includes(kind) ? "stay" : ["flight", "train", "ferry"].includes(kind) ? "flight" : "transfer", 22)}</span><span class="ds-flat-row__copy travel-row__body"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small>${status ? StatusLabel(status, "attention") : ""}</span>${icon("chevron", 20, "chevron")}</button>`;
    }).join("");
    return mobilePage("Bookings", `<div class="segmented-control" role="group" aria-label="Filter bookings">${filters.map(([key,label]) => `<button data-action="filter-bookings" data-filter="${key}" class="${state.bookingFilter === key ? "is-active" : ""}" aria-pressed="${state.bookingFilter === key}">${label}</button>`).join("")}</div><section class="mobile-group booking-trip-group"><h2>${esc(state.trip?.title || "Current trip")}</h2><div class="travel-list ds-grouped-card ds-grouped-card--list">${list || `<section class="mobile-empty mobile-empty--compact"><h1>No bookings here</h1><p>Add transport, a stay, or a plan.</p></section>`}</div></section><button class="mobile-secondary-action" data-action="open-add-booking">${icon("plus", 20)} Add booking</button>`, "bookings");
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
    return `<div class="phone-app"><section class="screen dark-detail train-detail-screen">${appBar(ferry ? "Ferry Detail" : "Train Detail", "", true)}<main class="detail-content">${hero}${fdList([
      fdButtonRow("navigation", `Directions to ${ferry ? "port" : "station"}`, "directions-item", `data-id="${esc(itemId(train))}"`),
      doc ? fdButtonRow("ticket", "Open ticket", "open-document", `data-id="${esc(doc.id)}"`) : "",
      bookingRef ? fdButtonRow("copy", bookingRef, "copy", `data-value="${esc(bookingRef)}"`, "Booking reference · tap to copy", "copy") : "",
      fdDocRows(train),
      fdAddRow(),
      fdNoteRow(train, kind),
    ], "Journey details and documents")}</main></section></div>`;
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
    return `<div class="phone-app"><section class="screen dark-detail plan-detail-screen">${appBar(`${statusText(kind)} Detail`, "", true)}<main class="detail-content">${hero}${fdList([
      doc ? fdButtonRow("ticket", "Open ticket", "open-document", `data-id="${esc(doc.id)}"`) : "",
      locationName ? fdButtonRow("pin", locationName, "directions-item", `data-id="${esc(itemId(item))}"`, endLocationName ? "From" : "Location", "map") : "",
      endLocationName ? fdStaticRow("navigation", endLocationName, "To") : "",
      confirmation ? fdButtonRow("copy", confirmation, "copy", `data-value="${esc(confirmation)}"`, "Confirmation · tap to copy", "copy") : "",
      val(contact, "phone") ? fdButtonRow("phone", val(contact, "display_name") || contact.phone, "call", `data-value="${esc(contact.phone)}"`, "Call contact") : "",
      fdDocRows(item),
      fdAddRow(),
      fdNoteRow(item, kind),
    ], "Plan details and documents")}</main></section></div>`;
  }

  // ---------------------------------------------------------------------------
  // Trip planning collections — Neighborhoods, Day Trips, Walking Routes, and the
  // unscheduled wishlists (Places to Visit, Food & Drink, Shopping). A collection
  // is a single timeline item (type custom) with an ordered list of child
  // "stops" that live ONLY inside the collection's own minimal secondary
  // timeline. Stops are never separate rows in the main timeline.
  // Neighborhood is the ONE grouped Day Plan type: it shows once on the main
  // Timeline (when scheduled) and opens its own monochrome mini timeline of
  // places. It is reached through Day Plan, never as a separate top-level
  // category. The other nine Day Plan types are single activities (see
  // DAY_PLAN_TYPES) and reuse the activities model directly.
  const COLLECTION_TYPE_CONFIG = Object.freeze({
    neighborhood: { label: "Neighborhood", hint: "Plan places in one area", icon: "city", timeline: true, stop: "place", stops: "places", intro: "Group several places in one district into one plan. It shows once on your timeline and opens its own list of places." },
  });
  const TIMELINE_COLLECTION_TYPES = new Set(["neighborhood"]);
  // The ten Day Plan activity types (spec §8/§9). Keys are the canonical
  // activity_type enum values persisted on activities.activity_type (free text,
  // no migration). Neighborhood is grouped (routes to a collection); the rest
  // are single activities that land directly on the Timeline once given a day.
  const DAY_PLAN_TYPES = Object.freeze([
    { type: "neighborhood", label: "Neighborhood", desc: "Group several nearby places into one area to explore", icon: "city", grouped: true },
    { type: "attraction", label: "Attraction", desc: "A landmark or must-see sight worth a visit", icon: "landmark" },
    { type: "museum_culture", label: "Museum & Culture", desc: "Museums, galleries, and cultural spots", icon: "museum" },
    { type: "food_drink", label: "Food & Drink", desc: "A cafe, bar, or restaurant you want to try", icon: "restaurant" },
    { type: "shopping", label: "Shopping", desc: "Shops, markets, and places to browse", icon: "shopping" },
    { type: "tour_experience", label: "Tour & Experience", desc: "A guided tour, class, or booked experience", icon: "tour" },
    { type: "nature_outdoors", label: "Nature & Outdoors", desc: "Parks, gardens, hikes, and green spaces", icon: "mountain" },
    { type: "beach_relax", label: "Beach & Relax", desc: "A beach, pool, or somewhere to unwind", icon: "beach" },
    { type: "entertainment", label: "Entertainment", desc: "A show, concert, game, or night out", icon: "event" },
    { type: "viewpoint_scenic", label: "Viewpoint & Scenic", desc: "A lookout or scenic spot for the view", icon: "camera" },
    { type: "other", label: "Other", desc: "Anything else you want to do or remember", icon: "more" },
  ]);
  const DAY_PLAN_TYPE_MAP = Object.freeze(Object.fromEntries(DAY_PLAN_TYPES.map((t) => [t.type, t])));
  function dayPlanType(type) { return DAY_PLAN_TYPE_MAP[String(type || "")] || null; }
  // Save for Later buckets (spec §25). Each is an unscheduled activity (null
  // start) tagged with a canonical activity_type so it never touches the main
  // Timeline until it is given a day.
  const SAVE_LATER_TYPES = Object.freeze([
    { type: "place", label: "Place", desc: "An interesting place to visit", icon: "pin", activityType: "attraction" },
    { type: "food_drink", label: "Food & Drink", desc: "Somewhere to eat or drink", icon: "restaurant", activityType: "food_drink" },
    { type: "shopping", label: "Shopping", desc: "A shop or market to browse", icon: "shopping", activityType: "shopping" },
  ]);
  const SAVE_LATER_TYPE_MAP = Object.freeze(Object.fromEntries(SAVE_LATER_TYPES.map((t) => [t.type, t])));
  // An activity is a "save for later" idea when it has no scheduled start. Its
  // bucket is derived from the activity_type it was tagged with.
  const SAVE_LATER_BUCKET_FOR = Object.freeze({ food_drink: "food_drink", shopping: "shopping" });
  function saveLaterBucketForType(activityType) { return SAVE_LATER_BUCKET_FOR[String(activityType || "")] || "place"; }
  const PLACE_TYPE_OPTIONS = [["", "Choose a type"], ["cafe", "Cafe"], ["restaurant", "Restaurant"], ["attraction", "Attraction"], ["museum", "Museum"], ["shop", "Shop"], ["market", "Market"], ["park", "Park"], ["activity", "Activity"], ["viewpoint", "Viewpoint"], ["monument", "Monument"], ["street", "Street"], ["other", "Other"]];
  const STOP_STATE_LABEL = { next: "Next", future: "Upcoming", past: "Visited", skipped: "Skipped" };
  function collectionConfig(type) { return COLLECTION_TYPE_CONFIG[String(type || "")] || null; }
  function collectionForItem(id) {
    const key = String(id || "");
    return (state.collections || []).find((c) => String(c.trip_item_id || "") === key || String(c.id || "") === key) || null;
  }
  function collectionStopsFor(id) {
    const collection = collectionForItem(id), keys = new Set([String(id || "")]);
    if (collection) {
      keys.add(String(collection.id || ""));
      keys.add(String(collection.trip_item_id || ""));
    }
    return (state.collectionStops || []).filter((s) => keys.has(String(s.collection_item_id || "")) && !s.deleted_at);
  }
  function isCollectionItem(item) { return Boolean(collectionForItem(itemId(item))); }
  // A collection is shown on the MAIN timeline only when it is a timeline-capable
  // type AND it has been scheduled (starts_at_utc set). Wishlists and any
  // unscheduled collection live in the planning area, never the main timeline.
  function isTimelineVisibleItem(item) {
    const c = collectionForItem(itemId(item));
    if (!c) return !isSaveForLaterItem(item);
    const starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null;
    return TIMELINE_COLLECTION_TYPES.has(String(c.collection_type)) && starts != null;
  }
  // A Save for Later idea is an activity/reservation kept without a scheduled
  // start (spec §12/§25). It lives on the Save for Later screen, never the main
  // Timeline, until it is given a day. Collections are excluded — their own
  // scheduling rule is handled in isTimelineVisibleItem.
  function isSaveForLaterItem(item) {
    if (!item || isCollectionItem(item)) return false;
    const type = String(val(item, "type", "kind") || "");
    if (type !== "activity" && type !== "reservation") return false;
    return (Number(val(item, "starts_at_utc", "startsAtUtc")) || null) == null;
  }
  function saveForLaterItems() {
    return (state.timeline || []).filter((item) => !val(item, "deleted_at", "deletedAt") && isSaveForLaterItem(item));
  }
  // Save for Later ↔ Day Plan / Neighborhood integration (Day Trip = a day's
  // plan). An idea is a plain activity kept without a start (see
  // isSaveForLaterItem). It becomes "planned" WITHOUT being duplicated by being
  // linked into a Neighborhood as a stop (link-not-copy via
  // planning_stops.linked_trip_item_id). The idea's own row stays undated, so it
  // never appears twice: it shows once inside the neighborhood (whose scheduled
  // day carries it) and in the Planned filter here. Scheduling an idea straight
  // onto a day ("General day plan") instead gives it a start and moves it to the
  // main Timeline — handled by the shared day-plan form.
  function stopsLinkingItem(id) {
    const key = String(id || "");
    if (!key) return [];
    return (state.collectionStops || []).filter((s) => !s.deleted_at && String(s.linked_trip_item_id || "") === key);
  }
  function ideaIsPlanned(item) { return stopsLinkingItem(itemId(item)).length > 0; }
  // Neighborhoods an idea has been placed into, paired with the linking stop.
  function ideaPlacements(item) {
    return stopsLinkingItem(itemId(item))
      .map((s) => ({ stop: s, collection: collectionForItem(s.collection_item_id) }))
      .filter((p) => p.collection && !val(p.collection, "deleted_at", "deletedAt"));
  }
  // One-line "In Trastevere · MON APR 07" summary for a planned idea.
  function ideaPlacementSummary(item) {
    const placements = ideaPlacements(item);
    if (!placements.length) return "";
    const first = placements[0];
    const cfg = collectionConfig(first.collection.collection_type);
    const bits = [first.collection.title || (cfg ? cfg.label : "Neighborhood")];
    const starts = Number(val(first.collection, "starts_at_utc", "startsAtUtc")) || null;
    if (starts != null) bits.push(timelineDay(starts, val(first.collection, "start_timezone", "startTimezone")).date);
    else if (String(first.stop.scheduled_time || "").trim()) bits.push(String(first.stop.scheduled_time).trim());
    const extra = placements.length > 1 ? ` +${placements.length - 1}` : "";
    return `In ${bits.join(" · ")}${extra}`;
  }
  // The neighborhoods a plan panel offers: every live neighborhood collection.
  function neighborhoodCollections() {
    return (state.collections || []).filter((c) => String(c.collection_type) === "neighborhood" && !val(c, "deleted_at", "deletedAt"));
  }
  // Guard against double-submits (rapid taps / slow network): an idea id is held
  // here for the duration of an in-flight plan mutation.
  const planInFlight = new Set();
  // "5 places · 10:00–16:00" — the parent's main-timeline summary computed from
  // its children, so the parent never needs a stored subtitle.
  function collectionSummary(item) {
    const c = collectionForItem(itemId(item)), cfg = collectionConfig(c && c.collection_type);
    const stops = collectionStopsFor(itemId(item)), count = stops.length;
    const noun = count === 1 ? (cfg ? cfg.stop : "place") : (cfg ? cfg.stops : "places");
    const times = stops.map((s) => String(s.scheduled_time || "").trim()).filter(Boolean).sort();
    const range = times.length ? (times.length > 1 && times[0] !== times[times.length - 1] ? `${times[0]}–${times[times.length - 1]}` : times[0]) : "";
    return [`${count} ${noun}`, range].filter(Boolean).join(" · ");
  }
  // Dot state is derived from status + order and communicated by SHAPE/tone, not
  // color: solid = next, outlined = future, muted = past, muted+strike = skipped.
  function collectionStopStates(stops) {
    let nextAssigned = false;
    return stops.map((s) => {
      const status = String(s.status || "planned");
      if (status === "skipped") return "skipped";
      if (status === "visited") return "past";
      if (!nextAssigned) { nextAssigned = true; return "next"; }
      return "future";
    });
  }

  // Stops can be linked to an existing booking or saved idea. Keep the
  // neighborhood row self-contained, but reuse the main Timeline's truthful
  // description when that source is still available.
  function collectionStopLinkedItem(stop) {
    const linkedId = String(stop?.linked_trip_item_id || "");
    if (!linkedId) return null;
    return [...(state.timeline || []), ...(state.transport || []), ...(state.stays || [])]
      .find((item) => itemId(item) === linkedId) || null;
  }
  function collectionStopTimelineMeta(stop) {
    const linked = collectionStopLinkedItem(stop);
    const typeLabel = stop.place_type
      ? PLACE_TYPE_OPTIONS.find(([value]) => value === String(stop.place_type))?.[1] || ""
      : "";
    let linkedSummary = "";
    if (linked) {
      const type = timelineType(linked), transport = transportForItem(itemId(linked));
      linkedSummary = timelineSecondary(linked, type, transport, timelineGlyph(linked, type, transport));
    }
    const address = String(stop.address_snapshot || "").trim();
    const unique = (parts) => [...new Set(parts.map((part) => String(part || "").trim()).filter(Boolean))];
    const secondary = address
      ? unique([typeLabel, address]).join(" · ")
      : linkedSummary || typeLabel;
    const detail = unique([
      // When the stop also has an address, retain the linked booking's own
      // Timeline summary here instead of hiding its route/category context.
      linkedSummary && linkedSummary !== secondary ? linkedSummary : "",
      linked && String(linked.title || "").trim() !== String(stop.title || "").trim()
        ? `Linked to ${String(linked.title).trim()}`
        : "",
      stop.notes,
    ]).join(" · ");
    return { secondary, detail };
  }

  // The Planning Overview: every collection, grouped into "On your timeline"
  // (scheduled) and "Planning" (unscheduled + wishlists). NOT a bottom-nav tab.
  function planningScreen() {
    if (!state.trip) return missingDetailScreen("Planning", "Create or select a trip first.");
    const all = (state.collections || []).slice();
    const canEdit = canEditCurrentTrip();
    const scheduled = all.filter((c) => TIMELINE_COLLECTION_TYPES.has(String(c.collection_type)) && (Number(val(c, "starts_at_utc", "startsAtUtc")) || null) != null);
    const planning = all.filter((c) => !scheduled.includes(c));
    const row = (c) => {
      const cfg = collectionConfig(c.collection_type);
      return `<button type="button" class="planning-row" data-action="open-collection" data-id="${esc(c.id)}"><span class="planning-row__icon">${icon(cfg ? cfg.icon : "city", 22)}</span><span class="planning-row__copy"><strong>${esc(c.title || (cfg ? cfg.label : "Plan"))}</strong><small>${esc([cfg ? cfg.label : "", collectionSummary(c)].filter(Boolean).join(" · "))}</small></span>${icon("chevron", 18)}</button>`;
    };
    const section = (heading, items, emptyCopy) => `<section class="planning-group" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2>${items.length ? `<div class="planning-list ds-grouped-card ds-grouped-card--list">${items.map(row).join("")}</div>` : `<p class="planning-empty">${esc(emptyCopy)}</p>`}</section>`;
    const addTypes = Object.entries(COLLECTION_TYPE_CONFIG).map(([type, cfg]) => `<button type="button" class="planning-add-card" data-action="add-collection" data-collection-type="${esc(type)}" aria-label="Add ${esc(cfg.label)}"><span class="planning-add-card__icon">${icon(cfg.icon, 22)}</span><span class="planning-add-card__copy"><strong>${esc(cfg.label)}</strong><small>${esc(cfg.hint)}</small></span></button>`).join("");
    const addSection = canEdit ? `<section class="planning-group" aria-label="Start a plan"><h2>Start a plan</h2><div class="planning-add-grid">${addTypes}</div></section>` : "";
    const body = `<section class="planning-intro"><span>PLAN YOUR DAYS</span><h1>Planning</h1><p>Your neighborhood plans. A scheduled neighborhood appears on your timeline; unscheduled ones wait here.</p></section>${section("On your timeline", scheduled, "Nothing scheduled yet.")}${section("Planning", planning, "No draft plans yet.")}${addSection}`;
    return focusedTaskPage("Planning", body, "planning-page");
  }

  // A collection keeps manual stop order, with one rail and optional time inside each row.
  function collectionScreen() {
    const id = String(state.selectedId || "");
    const c = collectionForItem(id);
    if (!c) return missingDetailScreen("Plan unavailable", "This plan is not available.");
    const cfg = collectionConfig(c.collection_type) || { label: "Plan", stop: "place", stops: "places" };
    const canEdit = canEditCurrentTrip();
    const stops = collectionStopsFor(id), states = collectionStopStates(stops);
    const scheduled = Number(val(c, "starts_at_utc", "startsAtUtc")) || null;
    const zone = val(c, "start_timezone", "startTimezone");
    const metaBits = [c.city, scheduled ? formatDateTime(scheduled, zone) : ""].filter(Boolean).join(" · ");
    const hit = (s, st, inner) => {
      const time = String(s.scheduled_time || "").trim();
      const label = `${time ? time + ", " : ""}${s.title || "Place"}. ${STOP_STATE_LABEL[st] || ""}`;
      return canEdit
        ? `<button type="button" class="mini-stop__hit" data-action="stop-menu" data-collection="${esc(id)}" data-id="${esc(s.id)}" aria-label="${esc(label)}">${inner}</button>`
        : `<div class="mini-stop__hit" aria-label="${esc(label)}">${inner}</div>`;
    };
    const miniTimeline = stops.length
      ? `<ol class="mini-timeline" aria-label="${esc(cfg.stops)} in ${esc(c.title || cfg.label)}">${stops.map((s, i) => {
          const st = states[i], time = String(s.scheduled_time || "").trim();
          const { secondary, detail } = collectionStopTimelineMeta(s);
          const number = String(i + 1).padStart(2, "0");
          const inner = `<span class="mini-stop__time">${time ? esc(time) : "—"}</span><span class="mini-stop__rail" aria-hidden="true"><span class="mini-stop__dot"></span></span><span class="mini-stop__marker" aria-hidden="true">${number}</span><span class="mini-stop__content"><span class="mini-stop__meta"><span class="mini-stop__status">${esc(STOP_STATE_LABEL[st] || "Upcoming")}</span></span><span class="mini-stop__name">${esc(s.title || "Place")}</span>${secondary ? `<span class="mini-stop__secondary">${esc(secondary)}</span>` : ""}${detail ? `<span class="mini-stop__detail">${esc(detail)}</span>` : ""}</span>`;
          return `<li class="mini-stop mini-stop--${esc(st)}${secondary || detail ? " mini-stop--rich" : ""}">${hit(s, st, inner)}</li>`;
        }).join("")}</ol>`
      : `<div class="collection-empty"><span class="collection-empty__badge" aria-hidden="true">${icon("location", 24)}</span><strong>No ${esc(cfg.stops)} yet</strong>${canEdit ? `<p>Add your first ${esc(cfg.stop)} to start this plan.</p>` : ""}</div>`;
    const visited = stops.filter((s) => s.status === "visited").length;
    const body = `<section class="collection-hero"><span class="collection-hero__eyebrow">${esc(cfg.label.toUpperCase())}</span><h1>${esc(c.title || cfg.label)}</h1>${metaBits ? `<p class="collection-hero__meta">${icon("calendar", 16)}<span>${esc(metaBits)}</span></p>` : `<p class="collection-hero__meta">No date set</p>`}${c.collection_notes ? `<p class="collection-hero__notes">${esc(c.collection_notes)}</p>` : ""}</section><section class="collection-stops" aria-label="Places"><div class="collection-stops__heading"><h2>Places <span class="collection-count">${stops.length}</span></h2>${stops.length ? `<span class="collection-progress">${visited} of ${stops.length} visited</span>` : ""}</div><div class="collection-timeline-scroll" aria-label="Places timeline">${miniTimeline}</div></section>`;
    return focusedTaskPage(cfg.label, body, "collection-page timeline-screen--ribbon");
  }

  // Create / edit a collection. state.selectedId is "new:<type>" to create, or a
  // collection id to edit (with state.editingEntity flagged).
  function collectionFormScreen() {
    if (!state.trip) return missingDetailScreen("Plan", "Create or select a trip first.");
    const raw = String(state.selectedId || "");
    const editing = !raw.startsWith("new:");
    const existing = editing ? collectionForItem(raw) : null;
    if (editing && !existing) return missingDetailScreen("Plan unavailable", "This plan is not available.");
    const type = editing ? String(existing.collection_type) : raw.slice(4);
    const cfg = collectionConfig(type);
    if (!cfg) return missingDetailScreen("Plan", "Unknown plan type.");
    const editId = editing ? existing.id : "";
    const scheduled = editing ? (Number(val(existing, "starts_at_utc", "startsAtUtc")) || null) : null;
    const local = editing ? String(val(existing, "start_local_datetime", "startLocalDatetime") || "") : "";
    const dateVal = local.slice(0, 10) || (editing ? "" : String(val(state.trip, "starts_on", "startsOn") || ""));
    const timeVal = local.slice(11, 16);
    const tz = (editing ? val(existing, "start_timezone") : "") || tripDefaultTimezone() || "UTC";
    const field = (name, label, value, opts = {}) => {
      const req = opts.required ? " required" : "", ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
      if (opts.type === "textarea") return `<label class="form-field form-field--wide" for="cf-${name}"><span>${esc(label)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><textarea id="cf-${name}" name="${name}" rows="3"${ph} autocapitalize="sentences" spellcheck="true">${esc(value || "")}</textarea></label>`;
      return `<label class="form-field form-field--${opts.wide === false ? "half" : "wide"}" for="cf-${name}"><span>${esc(label)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><input type="${opts.type || "text"}" id="cf-${name}" name="${name}"${req}${ph} autocomplete="off" value="${esc(value || "")}"></label>`;
    };
    const scheduleHelperId = "collection-schedule-help";
    const scheduleFields = cfg.timeline
      ? `<section class="collection-schedule" aria-label="Timeline schedule">${dateRangeField("scheduleDate", "scheduleDateEnd", "Date on timeline", "Date", "Date", dateVal, "", { allowSingle: true })}<p class="field-helper collection-schedule__helper" id="${scheduleHelperId}">Optional — choose a date when this neighborhood belongs on your timeline. Leave it blank to keep planning it later.</p>${field("scheduleTime", "Start time", timeVal, { type: "time" })}</section>`
      : `<p class="field-helper">${esc(cfg.label)} lists stay in planning and never appear on the main timeline.</p>`;
    const form = `<form class="mobile-form premium-form collection-form" id="collection-form" data-collection-type="${esc(type)}"${editId ? ` data-edit-id="${esc(editId)}"` : ""} novalidate><header class="manual-form-heading"><span>${esc(editing ? "Edit plan" : "New plan")}</span><h1>${esc(editing ? existing.title || cfg.label : cfg.label)}</h1></header><p class="collection-form__intro">${esc(cfg.intro)}</p><section class="form-section manual-essentials" aria-labelledby="collection-essentials-title"><h2 id="collection-essentials-title">Details</h2><div class="quick-primary-fields">${field("title", cfg.label + " name", editing ? existing.title : "", { required: true, placeholder: cfg.label === "Neighborhood" ? "Trastevere" : cfg.label })}${field("city", "City or area", editing ? existing.city : "", { placeholder: "Rome" })}${scheduleFields}${field("notes", "Notes", editing ? existing.collection_notes : "", { type: "textarea" })}</div><input type="hidden" name="timezone" value="${esc(tz)}"></section></form>`;
    return focusedTaskPage(editing ? `Edit ${cfg.label}` : `New ${cfg.label}`, form, "form-screen collection-form-screen", formHeaderSave("collection-form", editing ? "Save" : "Create"));
  }

  // Add / edit a stop (place) inside a collection. state.selectedId is the
  // collection id; state.editingEntity carries the stop id when editing.
  function stopFormScreen() {
    if (!state.trip) return missingDetailScreen("Place", "Create or select a trip first.");
    const collectionId = String(state.selectedId || "");
    const c = collectionForItem(collectionId);
    if (!c) return missingDetailScreen("Plan unavailable", "This plan is not available.");
    const cfg = collectionConfig(c.collection_type) || { label: "Plan", stop: "place" };
    const editingStop = state.editingEntity && state.editingEntity.kind === "stop"
      ? collectionStopsFor(collectionId).find((s) => String(s.id) === String(state.editingEntity.id)) || (state.collectionStops || []).find((s) => String(s.id) === String(state.editingEntity.id))
      : null;
    const s = editingStop || {};
    const field = (name, label, value, opts = {}) => {
      const req = opts.required ? " required" : "", ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
      if (opts.type === "textarea") return `<label class="form-field form-field--wide" for="sf-${name}"><span>${esc(label)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><textarea id="sf-${name}" name="${name}" rows="3"${ph} autocapitalize="sentences" spellcheck="true">${esc(value || "")}</textarea></label>`;
      if (opts.type === "select") return `<label class="form-field form-field--${opts.wide === false ? "half" : "wide"}" for="sf-${name}"><span>${esc(label)}${opts.required ? "" : ' <em class="field-optional">Optional</em>'}</span><select id="sf-${name}" name="${name}">${opts.choices}</select></label>`;
      return `<label class="form-field form-field--${opts.wide === false ? "half" : "wide"}" for="sf-${name}"><span>${esc(label)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><input type="${opts.type || "text"}" id="sf-${name}" name="${name}"${req}${ph} autocomplete="off" value="${esc(value || "")}"></label>`;
    };
    const placeChoices = PLACE_TYPE_OPTIONS.map(([v, l]) => `<option value="${esc(v)}"${String(s.place_type || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    const statusChoices = [["planned", "Planned"], ["visited", "Visited"], ["skipped", "Skipped"]].map(([v, l]) => `<option value="${esc(v)}"${String(s.status || "planned") === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    // Existing bookings that can be grouped into this plan without duplication.
    const linkable = (state.timeline || []).filter((it) => !isCollectionItem(it) && String(itemId(it)) !== String(collectionId));
    const linkChoices = `<option value="">Not linked</option>` + linkable.map((it) => `<option value="${esc(itemId(it))}"${String(s.linked_trip_item_id || "") === String(itemId(it)) ? " selected" : ""}>${esc(it.title || "Booking")}</option>`).join("");
    const statusField = editingStop ? field("status", "Status", "", { type: "select", choices: statusChoices }) : "";
    const form = `<form class="mobile-form premium-form stop-form" id="stop-form" data-collection="${esc(collectionId)}"${editingStop ? ` data-edit-id="${esc(s.id)}"` : ""} novalidate><header class="manual-form-heading"><span>${esc(editingStop ? "Edit " + cfg.stop : "Add " + cfg.stop)}</span><h1>${esc(editingStop ? s.title || "Place" : "New " + cfg.stop)}</h1></header><section class="form-section manual-essentials" aria-labelledby="stop-essentials-title"><h2 id="stop-essentials-title">Details</h2><div class="quick-primary-fields">${field("title", "Name", s.title, { required: true, placeholder: "Place name" })}<div class="form-fields form-fields--date-time">${field("scheduledTime", "Time", s.scheduled_time, { type: "time", wide: false })}${field("placeType", "Type", "", { type: "select", choices: placeChoices, wide: false })}</div>${field("streetAddress", "Address", s.address_snapshot, { placeholder: "Street address or area" })}${statusField}${field("notes", "Notes", s.notes, { type: "textarea" })}</div><input type="hidden" name="timezone" value="${esc(s.timezone || val(c, "start_timezone") || tripDefaultTimezone() || "UTC")}"></section></form>`;
    return focusedTaskPage(editingStop ? `Edit ${cfg.stop}` : `Add ${cfg.stop}`, form, "form-screen stop-form-screen", formHeaderSave("stop-form", "Save"));
  }

  function collectionStopSheet() {
    const ctx = state.stopMenu || {};
    const stop = (state.collectionStops || []).find((s) => String(s.id) === String(ctx.stopId));
    if (!stop) return bottomSheet("collection-stop", "Place", `<p class="sheet-empty">This place is no longer available.</p>`);
    const stops = collectionStopsFor(ctx.collectionId), idx = stops.findIndex((s) => String(s.id) === String(stop.id));
    const canUp = idx > 0, canDown = idx >= 0 && idx < stops.length - 1, status = String(stop.status || "planned");
    const opt = (action, ic, label, sub, extra = "", danger = false) => sheetActionRow(action, ic, label, ` data-collection="${esc(ctx.collectionId)}" data-id="${esc(stop.id)}"${extra}`, sub, danger);
    const moveRows = `${canUp ? opt("stop-move", "chevron-up", "Move earlier", "", ` data-dir="up"`) : ""}${canDown ? opt("stop-move", "chevron-down", "Move later", "", ` data-dir="down"`) : ""}`;
    const visitedRow = status !== "visited"
      ? opt("stop-status", "check", "Mark visited", "Tick off once you've been", ` data-status="visited"`)
      : opt("stop-status", "refresh", "Mark planned", "Put it back on the plan", ` data-status="planned"`);
    const skipRow = status !== "skipped"
      ? opt("stop-status", "eye-off", "Skip this place", "Keep it, but grey it out", ` data-status="skipped"`)
      : opt("stop-status", "eye", "Un-skip", "Bring it back into the plan", ` data-status="planned"`);
    // The row itself already carries time, type and status in the timeline.
    // Keep this menu strictly action-focused so it opens as a compact sheet.
    const body = `${sheetActionList(`${opt("edit-stop", "edit", "Edit place", "Name, time, address and notes")}${moveRows}${visitedRow}${skipRow}`)}${sheetActionList(opt("delete-stop", "delete", "Delete place", "Remove from this plan", "", true), { danger: true })}`;
    return bottomSheet("collection-stop", stop.title || "Place", body);
  }

  // One app-controlled confirmation, including typed account deletion.
  function openConfirmDialog({ title, body, confirmLabel = "Delete", cancelLabel = "Cancel", danger = true, confirmationText = "", onConfirm, onCancel }) {
    const returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "discard-dialog-backdrop";
    const typedField = confirmationText ? `<label class="confirmation-field" for="confirm-dialog-input">Type ${esc(confirmationText)} to confirm<input id="confirm-dialog-input" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>` : "";
    backdrop.innerHTML = `<section class="discard-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-copy"><h2 id="confirm-dialog-title">${esc(title)}</h2><p id="confirm-dialog-copy">${esc(body)}</p>${typedField}<div class="discard-dialog-actions"><button type="button" class="mobile-secondary-action" data-confirm-action="cancel">${esc(cancelLabel)}</button><button type="button" class="${danger ? "mobile-danger-action" : "mobile-primary-action"}" data-confirm-action="confirm"${confirmationText ? " disabled" : ""}>${esc(confirmLabel)}</button></div></section>`;
    const cancel = backdrop.querySelector('[data-confirm-action="cancel"]'), confirmBtn = backdrop.querySelector('[data-confirm-action="confirm"]'), input = backdrop.querySelector("input");
    let busy = false;
    let closed = false;
    const background = document.querySelector(".phone-app");
    const wasInert = background?.hasAttribute("inert");
    background?.setAttribute("inert", "");
    awaitingConfirmation += 1;
    syncActivityPanel();
    const close = (cancelled = true) => {
      if (busy || closed) return;
      closed = true;
      backdrop.remove();
      if (!wasInert) background?.removeAttribute("inert");
      awaitingConfirmation = Math.max(0, awaitingConfirmation - 1);
      syncActivityPanel();
      if (returnFocus?.isConnected) returnFocus.focus();
      if (cancelled) onCancel?.();
    };
    input?.addEventListener("input", () => { confirmBtn.disabled = input.value !== confirmationText; });
    cancel.addEventListener("click", () => close());
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...backdrop.querySelectorAll("input,button")].filter(control => !control.disabled), index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    });
    confirmBtn.addEventListener("click", async () => {
      if (busy || (input && input.value !== confirmationText)) return;
      busy = true; confirmBtn.disabled = true; cancel.disabled = true;
      try { await onConfirm(); busy = false; close(false); }
      catch (error) { busy = false; confirmBtn.disabled = Boolean(input && input.value !== confirmationText); cancel.disabled = false; showToast(error?.message || "That action could not be completed.", "alert"); }
    });
    document.body.append(backdrop);
    requestAnimationFrame(() => cancel.focus());
  }
  function requestConfirmation(options) {
    return new Promise(resolve => openConfirmDialog({ ...options, onConfirm: () => resolve(true), onCancel: () => resolve(false) }));
  }

  async function saveCollectionForm(form) {
    if (!state.trip) return;
    const editId = form.dataset.editId || "", type = form.dataset.collectionType, cfg = collectionConfig(type);
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    if (!title) { showFormSubmissionError(form, "Add a name to continue."); return; }
    const city = String(fd.get("city") || "").trim(), notes = String(fd.get("notes") || "").trim();
    const tz = String(fd.get("timezone") || "").trim() || tripDefaultTimezone() || "UTC";
    const date = String(fd.get("scheduleDate") || "").trim(), time = String(fd.get("scheduleTime") || "").trim();
    let startsAtUtc = null, startLocal = null;
    if (cfg && cfg.timeline && date) {
      startLocal = `${date}T${time || "09:00"}`;
      try { startsAtUtc = resolveEventLocalDateTime(startLocal, tz); }
      catch (error) { showFormSubmissionError(form, error.message); return; }
    }
    const tripId = state.trip.id;
    const body = { collectionType: type, title, city: city || null, notes: notes || null, startsAtUtc, startLocalDatetime: startLocal, timezone: startsAtUtc ? tz : null };
    setFormSaving(form, true);
    try {
      let targetId = editId;
      if (editId) {
        const existing = collectionForItem(editId);
        body.version = Number(val(existing || {}, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(tripId)}/collections/${encodeURIComponent(editId)}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const result = await api(`/api/v1/trips/${encodeURIComponent(tripId)}/collections`, { method: "POST", body: JSON.stringify(body) });
        targetId = result?.collection?.id || "";
      }
      await loadTripDetails();
      formHasMeaningfulChanges = false; state.editingEntity = null;
      // If this neighborhood was created from the "Add to plan" panel, drop the
      // pending idea straight into it (link-not-copy) and land on the collection.
      const pendingIdea = state.pendingPlanIdea;
      state.pendingPlanIdea = null;
      if (!editId && pendingIdea && targetId) {
        await planIdeaToNeighborhood(pendingIdea, targetId);
        return;
      }
      showToast(`${cfg ? cfg.label : "Plan"} ${editId ? "updated" : "added"}.`);
      route(targetId ? "collection" : "planning", targetId || null, true);
    } catch (error) {
      if (!editId && !navigator.onLine) {
        // Offline: the new neighborhood is queued as a temp collection, but the
        // idea→neighborhood link can't be made until the collection has a real
        // server id. Clear the pending idea so it never leaks into the NEXT
        // neighborhood the user creates. The idea stays safe in Save-for-Later.
        const hadPendingIdea = !!state.pendingPlanIdea;
        state.pendingPlanIdea = null;
        const tempId = `local-${crypto.randomUUID()}`;
        state.collections = [...(state.collections || []), { id: tempId, trip_id: tripId, type: "custom", status: "planned", title, city: city || null, collection_notes: notes || null, collection_type: type, starts_at_utc: startsAtUtc, start_local_datetime: startLocal, start_timezone: startsAtUtc ? tz : null, version: 1, __local: true }];
        if (startsAtUtc) state.timeline = [...(state.timeline || []), { id: tempId, type: "custom", title, starts_at_utc: startsAtUtc, start_timezone: tz, status: "planned", version: 1, __local: true }];
        queuePendingMutation({ kind: "collection", op: "create", tripId, tempId, body });
        formHasMeaningfulChanges = false; state.editingEntity = null;
        showToast(hadPendingIdea ? "Neighborhood saved on this phone. Reconnect, then add your idea to it." : "Saved on this phone. It will sync when you reconnect.");
        route("planning", null, true);
        return;
      }
      showFormSubmissionError(form, error?.message || "Could not save. Try again.");
      if (document.contains(form)) setFormSaving(form, false);
      return;
    }
    if (document.contains(form)) setFormSaving(form, false);
  }

  async function saveStopForm(form) {
    if (!state.trip) return;
    const editId = form.dataset.editId || "", collectionId = form.dataset.collection;
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    if (!title) { showFormSubmissionError(form, "Add a name to continue."); return; }
    const body = {
      title,
      scheduledTime: String(fd.get("scheduledTime") || "").trim() || null,
      timezone: String(fd.get("timezone") || "").trim() || null,
      addressSnapshot: String(fd.get("streetAddress") || "").trim() || null,
      placeType: String(fd.get("placeType") || "").trim() || null,
      linkedTripItemId: String(fd.get("linkedTripItemId") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
      status: String(fd.get("status") || "planned").trim() || "planned",
    };
    const tripId = state.trip.id, base = `/api/v1/trips/${encodeURIComponent(tripId)}/collections/${encodeURIComponent(collectionId)}/stops`;
    setFormSaving(form, true);
    try {
      if (editId) {
        const existing = (state.collectionStops || []).find((s) => String(s.id) === String(editId));
        body.version = Number(val(existing || {}, "version")) || 1;
        await api(`${base}/${encodeURIComponent(editId)}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api(base, { method: "POST", body: JSON.stringify(body) });
      }
      await loadTripDetails();
      formHasMeaningfulChanges = false; state.editingEntity = null;
      showToast(`Place ${editId ? "updated" : "added"}.`);
      route("collection", collectionId, true);
    } catch (error) {
      if (!editId && !navigator.onLine) {
        const tempId = `local-${crypto.randomUUID()}`;
        const position = collectionStopsFor(collectionId).length;
        state.collectionStops = [...(state.collectionStops || []), { id: tempId, collection_item_id: collectionId, position, version: 1, __local: true, ...toStopRow(body) }];
        queuePendingMutation({ kind: "collection", op: "add-stop", tripId, collectionId, tempId, body });
        formHasMeaningfulChanges = false; state.editingEntity = null;
        showToast("Saved on this phone. It will sync when you reconnect.");
        route("collection", collectionId, true);
        return;
      }
      showFormSubmissionError(form, error?.message || "Could not save. Try again.");
      if (document.contains(form)) setFormSaving(form, false);
      return;
    }
    if (document.contains(form)) setFormSaving(form, false);
  }
  function toStopRow(body) {
    return { title: body.title, scheduled_time: body.scheduledTime, timezone: body.timezone, address_snapshot: body.addressSnapshot, place_type: body.placeType, linked_trip_item_id: body.linkedTripItemId, notes: body.notes, status: body.status };
  }

  function confirmDeleteCollection(id) {
    const c = collectionForItem(id);
    if (!c) return;
    const cfg = collectionConfig(c.collection_type);
    openConfirmDialog({
      title: `Delete this ${cfg ? cfg.label.toLowerCase() : "plan"}?`,
      body: `“${c.title || (cfg ? cfg.label : "Plan")}” and its ${cfg ? cfg.stops : "places"} will be removed. Linked bookings stay on your trip. This cannot be undone.`,
      onConfirm: async () => {
        const version = Number(val(c, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ version }) });
        await loadTripDetails();
        showToast(`${cfg ? cfg.label : "Plan"} deleted.`);
        route("planning", null, true);
      },
    });
  }
  function confirmDeleteStop(collectionId, stopId) {
    const stop = (state.collectionStops || []).find((s) => String(s.id) === String(stopId));
    if (!stop) return;
    if (state.sheet === "collection-stop") { state.sheet = null; state.stopMenu = null; render(); }
    openConfirmDialog({
      title: "Delete this place?",
      body: `“${stop.title || "Place"}” will be removed from this plan. This cannot be undone.`,
      onConfirm: async () => {
        const version = Number(val(stop, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(collectionId)}/stops/${encodeURIComponent(stopId)}`, { method: "DELETE", body: JSON.stringify({ version }) });
        await loadTripDetails();
        showToast("Place deleted.");
        route("collection", collectionId, true);
      },
    });
  }
  async function moveStop(collectionId, stopId, dir) {
    const stops = collectionStopsFor(collectionId), order = stops.map((s) => String(s.id));
    const idx = order.indexOf(String(stopId));
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= order.length) return;
    [order[idx], order[swap]] = [order[swap], order[idx]];
    // Optimistic reorder so the UI updates instantly.
    order.forEach((sid, i) => { const s = (state.collectionStops || []).find((x) => String(x.id) === sid); if (s) s.position = i; });
    if (state.sheet === "collection-stop") { state.sheet = null; state.stopMenu = null; }
    render();
    try {
      await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(collectionId)}/stops/order`, { method: "PUT", body: JSON.stringify({ order }) });
    } catch (error) {
      if (!navigator.onLine) { queuePendingMutation({ kind: "collection", op: "reorder", tripId: state.trip.id, collectionId, body: { order } }); showToast("Order saved on this phone. It will sync when you reconnect."); return; }
      showToast(error?.message || "Could not reorder. Refreshing.", "alert");
      await loadTripDetails().catch(() => {}); render();
    }
  }
  async function setStopStatus(collectionId, stopId, status) {
    const stop = (state.collectionStops || []).find((s) => String(s.id) === String(stopId));
    if (!stop) return;
    const prev = stop.status;
    stop.status = status; // optimistic
    if (state.sheet === "collection-stop") { state.sheet = null; state.stopMenu = null; }
    render();
    try {
      await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(collectionId)}/stops/${encodeURIComponent(stopId)}`, { method: "PATCH", body: JSON.stringify({ version: Number(val(stop, "version")) || 1, title: stop.title, scheduledTime: stop.scheduled_time || null, addressSnapshot: stop.address_snapshot || null, placeType: stop.place_type || null, linkedTripItemId: stop.linked_trip_item_id || null, notes: stop.notes || null, status }) });
      await loadTripDetails();
    } catch (error) {
      if (!navigator.onLine) { queuePendingMutation({ kind: "collection", op: "status", tripId: state.trip.id, collectionId, stopId, body: { status } }); showToast("Saved on this phone. It will sync when you reconnect."); return; }
      stop.status = prev; showToast(error?.message || "Could not update. Try again.", "alert"); render();
    }
  }
  async function flushCollectionsQueue() {
    if (PREVIEW_MODE || !navigator.onLine || !state.token) return;
    const rows = pendingMutations(), keep = [];
    let touched = false;
    for (const row of rows) {
      if (row.kind !== "collection" || row.status === "done") { keep.push(row); continue; }
      try {
        const t = encodeURIComponent(row.tripId), c = encodeURIComponent(row.collectionId || "");
        if (row.op === "create") await api(`/api/v1/trips/${t}/collections`, { method: "POST", body: JSON.stringify(row.body) });
        else if (row.op === "add-stop") await api(`/api/v1/trips/${t}/collections/${c}/stops`, { method: "POST", body: JSON.stringify(row.body) });
        else if (row.op === "reorder") await api(`/api/v1/trips/${t}/collections/${c}/stops/order`, { method: "PUT", body: JSON.stringify(row.body) });
        else if (row.op === "status") await api(`/api/v1/trips/${t}/collections/${c}/stops/${encodeURIComponent(row.stopId)}`, { method: "PATCH", body: JSON.stringify(row.body) });
        touched = true;
      } catch (_) { keep.push({ ...row, status: "retry" }); }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(keep));
    return touched;
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
    return `<div class="phone-app"><section class="screen ready-screen">${appBar("Ready Offline", "", false, `<button class="icon-button" data-action="offline-info" aria-label="Offline information">${icon("info", 24)}</button>`)}<main class="ready-content"><section class="offline-summary ${allReady ? "offline-summary--ready" : "offline-summary--attention"}"><span class="offline-summary-icon">${icon(allReady ? "check" : "warning", 27)}</span><span class="offline-summary-copy"><strong>${ready} of ${rows.length} ready</strong><span>${allReady ? "Your essentials are saved on this phone." : `${rows.length - ready} item${rows.length - ready === 1 ? "" : "s"} need attention before offline use.`}</span></span></section><div class="list-stack ready-list ds-grouped-card ds-grouped-card--list">${rows.map((row) => `<div class="info-card ${row.ready ? "" : "needs-attention"}"><span class="info-icon">${icon(row.icon, 22)}</span><span class="info-copy"><strong>${esc(row.title)}</strong><span>${esc(row.subtitle)}</span></span><span class="info-status ${row.ready ? "" : "warning"}" aria-label="${row.ready ? "Ready" : esc(row.status)}">${row.ready ? checkDot() : `${esc(row.status)} ${icon("warning", 16)}`}</span></div>`).join("")}</div><div class="download-action">${allReady ? `<button class="secondary-cta offline-refresh ${state.refreshingOffline ? "is-loading" : ""}" data-action="refresh-data" ${state.refreshingOffline ? "disabled aria-busy=\"true\"" : ""}>${icon("refresh", 20)} ${state.refreshingOffline ? "Refreshing…" : "Refresh Offline Data"}</button>` : primaryCta("Download Missing Items", "fix-offline", "download")}</div></main></section></div>`;
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
          ? `<div class="health-card info"><span>${icon("plus", 26)}</span><span><strong>Trip setup</strong><p>Add your first booking to build the itinerary.</p><button class="text-action" data-action="open-add-booking">Add booking</button></span></div>`
          : `<div class="health-card ${top.kind === "good" ? "good" : "info"}"><span>${icon(top.kind === "good" ? "check" : "info", 26)}</span><span><strong>${top.kind === "good" ? "No known issues" : "Not enough information"}</strong><p>${esc(top.subtitle)}</p></span></div>`;
    return `<div class="phone-app"><section class="screen">${appBar("Trip Health", "", false, `<button class="icon-button" data-action="health-info" aria-label="Trip Health information">${icon("info", 24)}</button>`)}<main class="health-content"><div class="health-summary"><div class="health-shield ${shieldClass} ${setup ? "setup" : ""}">${icon(issues.length ? "warning" : setup ? "plus" : top.kind === "good" ? "check" : "info", 34)}</div><h1>${esc(top.title)}</h1><p>${esc(top.subtitle)}</p></div><div class="list-stack">${rows}${setup ? "" : `<button class="secondary-cta" data-action="recalculate-health">${icon("refresh", 20)} Recalculate Trip Health</button>`}</div></main></section></div>`;
  }
  function checklistScreen() {
    if (!state.trip)
      return mobilePage("To-do", `<div class="cl-screen"><section class="mobile-empty"><span class="mobile-empty__icon">${icon("checklist", 28)}</span><h1>No trip open</h1><p>Open a trip to see its checklist.</p><button class="mobile-secondary-action" data-screen="trips">${icon("trips", 20)} My trips</button></section></div>`, "checklist");
    const rows = state.checklist || [];
    const total = rows.length;
    const pending = rows.filter((r) => !r.completed);
    const completed = rows.filter((r) => r.completed);
    const expanded = state.expandedChecklistTripId === state.trip.id;
    const summary = `<header class="cl-heading"><h1>${esc(state.trip.title || "Your trip")}</h1>${total ? `<p class="${pending.length ? "" : "cl-all-done"}">${pending.length ? `${pending.length} task${pending.length === 1 ? "" : "s"} left` : `${icon("check",16)} All done`}</p>` : ""}</header>`;
    const addForm = `<form class="cl-add" id="checklist-add-form" novalidate><label class="sr-only" for="checklist-new-title">Add a task</label><input id="checklist-new-title" type="text" name="title" class="cl-add__input" placeholder="Add a task…" maxlength="160" autocomplete="off" enterkeyhint="done" aria-label="Add a checklist item"><button type="submit" class="cl-add__btn" aria-label="Add task" disabled>Add</button></form>`;
    const rowHtml = (item) => state.editingChecklistId === item.id
      ? `<li class="cl-row cl-row--editing"><form class="cl-edit" data-checklist-edit data-id="${esc(item.id)}" novalidate><input type="text" name="title" class="cl-edit__input" value="${esc(item.title)}" maxlength="160" autocomplete="off" enterkeyhint="done" aria-label="Rename item"><div class="cl-edit__actions"><button type="button" class="cl-row__act cl-row__del" data-action="delete-checklist" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.title)}">${icon("trash", 18)}</button><button type="button" class="cl-edit__act cl-edit__cancel" data-action="cancel-edit-checklist">Cancel</button><button type="submit" class="cl-edit__act cl-edit__save" aria-label="Save name">Save</button></div></form></li>`
      : `<li class="cl-row ${item.completed ? "is-complete" : ""}"><button type="button" class="cl-row__toggle" data-action="toggle-checklist" data-id="${esc(item.id)}" aria-pressed="${item.completed}"><span class="cl-check" aria-hidden="true">${item.completed ? icon("check", 16) : ""}</span><span class="cl-row__title">${esc(item.title)}</span></button><button type="button" class="cl-row__act" data-action="edit-checklist" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.title)}">${icon("edit", 18)}</button></li>`;
    let body = `<div class="cl-screen">${summary}${addForm}`;
    if (total === 0) {
      body += `<p class="cl-empty">Nothing here yet. Add your first task above.</p>`;
    } else {
      if (pending.length) body += `<ul class="cl-list ds-grouped-card ds-grouped-card--list" aria-label="Tasks to do">${pending.map(rowHtml).join("")}</ul>`;
      if (completed.length) body += `<section class="cl-completed"><button type="button" id="checklist-completed-toggle" class="cl-completed__toggle" data-action="toggle-completed-checklist" aria-expanded="${expanded}" aria-controls="checklist-completed"><span>Completed (${completed.length})</span>${icon("chevron",18)}</button><ul id="checklist-completed" class="cl-list ds-grouped-card ds-grouped-card--list" aria-label="Completed tasks"${expanded ? "" : " hidden"}>${completed.map(rowHtml).join("")}</ul></section>`;
    }
    body += `</div>`;
    return mobilePage("To-do", body, "checklist");
  }
  // Help & FAQ content. Kept as data so copy stays maintainable and testable.
  // Product names below mirror the current UI (see MANUAL_BOOKING_TYPES, the add
  // and trip menus). Forward-by-email is intentionally omitted while that option
  // is hidden from the add screen (2026-08-30).
  const FAQ_SECTIONS = [
    { title: "Getting started", questions: [
      { id: "create-trip", q: "How do I create a trip?", a: "Open Account and tap Create trip, or tap + on the Trips screen. Add a name, destination and dates. Your trip opens in the Timeline.", keywords: "new trip start plan create destination dates", action: { label: "Create trip", action: "create-trip" } },
      { id: "edit-trip", q: "How do I edit my trip?", a: "Open Menu, choose Trip Options, then Edit trip to change its name, dates or details.", keywords: "edit change trip name dates rename" },
      { id: "switch-trip", q: "How do I switch between trips?", a: "Open Account and tap Switch trip to pick another one. Your upcoming and past trips are listed there too.", keywords: "switch change multiple trips select", action: { label: "My trips", screen: "trips" } },
    ] },
    { title: "Bookings", questions: [
      { id: "add-booking", q: "How do I add a booking?", a: "Tap + in the header, choose Add a booking, then Upload Booking or ADD NEW BOOKING. Everything you add appears in the Timeline.", keywords: "add booking flight hotel reservation upload manual" },
      { id: "upload-booking", q: "How does Upload Booking work?", a: "Tap + then Upload Booking and choose a ticket or confirmation file. tripto.to reads it on this device and fills in what it can. Check the details before saving, because recognition is not always perfect.", keywords: "upload file pdf ticket confirmation ocr read extract" },
      { id: "manual-booking", q: "How do I add a booking manually?", a: "Tap + then Add a booking and pick a type: Flight, Hotel / Stay, Train, Ferry, Bus, Cruise, Car Rental, Transfer, Taxi, Parking, Insurance or Other. Only the essential fields are required. To plan restaurants, tours, museums and other things to see and do, use Day Plan instead.", keywords: "manual enter flight hotel stay train ferry bus cruise car rental transfer taxi parking insurance other day plan" },
      { id: "edit-booking", q: "How do I edit a booking?", a: "Open the booking from your Timeline, then choose Edit to update its details.", keywords: "edit change booking details update" },
      { id: "remove-booking", q: "How do I remove a booking?", a: "Open the booking from your Timeline and choose Delete. Delete only when a booking was added by mistake.", keywords: "delete remove cancel booking mistake" },
    ] },
    { title: "Your trip", questions: [
      { id: "timeline", q: "What is the Timeline?", a: "The Timeline is the main view of your trip. Flights, stays, restaurants, activities and other bookings are shown in travel order so you can see what is coming next.", keywords: "timeline schedule order plans main view" },
      { id: "checklist", q: "How does the checklist work?", a: "Open Menu and choose To-Do List. Type a task and tap Add, then tick it when it is done. Open Completed to find finished tasks and untick one to return it to your list. Use the pencil to rename or delete a task.", keywords: "checklist packing list passport wallet charger pack completed tasks", action: { label: "Open checklist", screen: "checklist" } },
      { id: "documents", q: "Where are my tickets and documents?", a: "Documents attached to a booking open from that booking. You can also open Menu, choose Trip Options, then Documents to see your trip files. Some files are stored only on this device.", keywords: "tickets documents files pdf storage device" },
      { id: "trip-map", q: "When can I use Trip Map?", a: "Open Menu, choose Trip Options, then Trip Map. It becomes available once your trip has at least two places to map, and it uses the places already in your itinerary.", keywords: "map trip map places locations itinerary" },
      { id: "offline", q: "What works offline?", a: "Your cached Timeline, checklist and saved documents stay available without internet. Live details such as weather, new booking imports and opening directions need a connection.", keywords: "offline internet connection cached without wifi directions" },
    ] },
    { title: "Plan together", flag: "sharing", questions: [
      { id: "collab-what", q: "Can I plan a trip with other people?", a: "Yes. Open Menu, choose Trip Options, then Plan together to invite people. Everyone signs in with their own free account — planning together never costs anything.", keywords: "collaborate share invite together people group family plan", action: { label: "Plan together", action: "open-collaboration" } },
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
    return mobilePage("Travelers", `<div class="travel-list ds-grouped-card ds-grouped-card--list">${rows || `<section class="mobile-empty"><h1>No travelers yet</h1><p>Add a traveler to assign bookings and documents correctly.</p></section>`}</div><button class="mobile-secondary-action" data-action="open-form" data-form="traveler">${icon("plus",20)} Add traveler</button>`, "account");
  }
  function travelerScreen() {
    const traveler = state.travelers.find((t)=>String(t.id)===String(state.selectedId));
    if (!traveler) return missingDetailScreen("Traveler unavailable", "This traveler is not available.");
    const details = state.bookingDetails.filter((d)=>String(val(d,"traveler_id"))===String(traveler.id)), docs = state.localDocs.filter((d)=>d.travelerIds?.includes(String(traveler.id))), assigned = bookingRows().filter(({item})=>String(val(item,"traveler_ids")||"").split(",").includes(String(traveler.id))), checklist = state.checklist.filter((item)=>String(val(item,"traveler_id"))===String(traveler.id));
    return mobilePage("Traveler", `<section class="traveler-profile"><span class="traveler-avatar traveler-avatar--large">${esc(String(val(traveler,"display_name")||"T").slice(0,1).toUpperCase())}</span><h1>${esc(val(traveler,"display_name")||"Traveler")}</h1><p>${esc(statusText(val(traveler,"traveler_type")||"Traveler"))}</p><button class="text-action" data-action="open-form" data-form="traveler" data-id="${esc(traveler.id)}">Edit traveler</button></section><section class="mobile-group"><h2>Assignments</h2><div class="detail-list ds-grouped-card ds-grouped-card--list">${assigned.map(({kind,item})=>`<div class="detail-row"><span>${icon(timelineIcon(kind),20)}</span><span><small>${esc(statusText(kind))}</small><strong>${esc(val(item,"title","property_name")||"Booking")}</strong></span></div>`).join("") || `<p class="muted-copy">No assigned bookings.</p>`}</div></section><section class="mobile-group"><h2>Travel details</h2><div class="fact-grid">${details.flatMap((d)=>[["Seat",val(d,"seat")],["Cabin",val(d,"cabin_class")],["Baggage",val(d,"checked_bags") != null ? `${d.checked_bags} checked` : null],["Ticket",val(d,"ticket_number")]]).filter(([,v])=>v).map(([k,v])=>`<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join("") || `<p class="muted-copy">No traveler-specific booking facts saved.</p>`}</div></section><section class="mobile-group"><h2>Documents</h2><div class="travel-list ds-grouped-card ds-grouped-card--list">${docs.map((d)=>`<button class="travel-row" data-action="open-document" data-id="${esc(d.id)}"><span class="travel-row__icon">${icon("document",20)}</span><span class="travel-row__body"><strong>${esc(d.name)}</strong><small>${d.integrity==="verified"?"Ready offline":statusText(d.integrity)}</small></span>${icon("chevron",18)}</button>`).join("") || `<p class="muted-copy">No traveler-specific documents.</p>`}</div></section><section class="mobile-group"><h2>Checklist</h2><div class="traveler-checklist ds-grouped-card ds-grouped-card--list">${checklist.map((item)=>`<div class="traveler-checklist__row ${val(item,"completed")?"is-complete":""}">${icon(val(item,"completed")?"check":"clock",18)}<span><strong>${esc(val(item,"title")||"Travel essential")}</strong><small>${esc(statusText(val(item,"category")||"packing"))}</small></span></div>`).join("") || `<p class="muted-copy">No traveler-specific essentials.</p>`}</div></section>`, "account");
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
    return `<section class="review-card ds-grouped-card"><header><span class="review-type">${icon(transportIcon(type),19)} ${esc(statusText(type))}</span><span class="travel-state ${confidence<.7?"travel-state--attention":""}">${confidence<.7?"Check carefully":"Recognized"}</span></header>${warnings.length?`<div class="review-warnings">${warnings.map((w)=>`<p>${icon("warning",16)} ${esc(w)}</p>`).join("")}</div>`:""}${hero}<label><span>Booking type</span><select name="field-${esc(c.id)}-candidateType">${["flight","hotel","train","car","transfer","ferry","cruise","activity","restaurant","reservation","generic_ticket"].map(x=>`<option value="${x}" ${x===type?"selected":""}>${esc(statusText(x))}</option>`).join("")}</select></label><div class="review-fields">${entries.map(control).join("")}</div><div class="review-actions">${duplicate?`<button type="button" class="mobile-secondary-action" data-action="add-duplicate-import" data-id="${esc(c.id)}">Add anyway</button>`:`<button type="button" class="mobile-primary-action" data-action="confirm-import" data-id="${esc(c.id)}">${icon("check",18)} Add to Timeline</button>`}<button type="button" class="review-reject" data-action="reject-import" data-id="${esc(c.id)}">Discard this booking</button></div></section>`;
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
    return mobilePage("Import History", `<div class="travel-list ds-grouped-card ds-grouped-card--list">${rows || `<section class="mobile-empty"><h1>No imports yet</h1><p>Forwarded bookings you review will appear here.</p></section>`}</div><button class="mobile-secondary-action" data-screen="import">${icon("plus",20)} Import booking</button>`, "account");
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
    const partnerRow = (ic, title, sub, href, tone) => `<a class="ds-flat-row account-partner-row" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer"><span class="ds-flat-row__icon">${PastelIcon(ic, tone)}</span><span class="ds-flat-row__copy"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${icon("external",18,"ds-flat-row__chevron")}</a>`;
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
    const pending = pendingMutations().filter((x)=>x.status!=="done").length + Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
    const row = (iconName,title,meta,screen,action="",tone="activity") => FlatRow({ iconName, title, meta, screen, action, tone, className: ["remove-local-data","delete-account"].includes(action) ? "account-danger-row" : "" });
    const google=state.account?.providers?.find((provider)=>provider.provider==="google"&&provider.enabled),identity=state.account?.identities?.find((item)=>item.provider==="google");
    const authBlock=mode==="guest"&&google?`<section class="account-signin ds-grouped-card"><h2>Keep your trips with you</h2><p>Sign in with Google to access your trips on other devices.</p><div id="google-signin-button" data-client-id="${esc(google.clientId)}"></div><p class="signin-error" role="alert" hidden></p></section>`:"";
    const identityEmail = state.account?.user?.primary_email || identity?.email || "Google identity";
    const pendingEmails=(state.bookingEmails||[]).filter((item)=>["needs_trip","needs_confirmation"].includes(String(item.status))).length;
    const tripCounts = ["Current", "Upcoming", "Past"].map(label => ({ label, count: state.trips.filter(trip => tripBucket(trip) === label).length }));
    return `<div class="phone-app"><section class="screen mobile-v1-screen account-page">${appBar("Account")}<main class="account-section mobile-page">
      <section class="account-profile-card ds-grouped-card" aria-label="Your profile"><div class="account-profile"><span class="account-avatar" aria-hidden="true">${esc(initials)}</span><div class="account-profile__id"><h1 title="${esc(name)}">${esc(name)}</h1><p class="account-meta" title="${mode === "account" ? esc(identityEmail) : "Guest profile"}">${mode === "account" ? esc(identityEmail) : "Guest profile"}</p></div>${mode === "account" ? `<button type="button" class="account-signout-btn" data-action="sign-out">Sign out</button>` : ""}</div><div class="account-trip-summary">${tripCounts.map(({label,count}) => `<div><strong>${count}</strong><span>${label}</span></div>`).join("")}</div></section>
      ${authBlock}
      <div class="account-shortcuts"><button type="button" class="ds-secondary-button" data-screen="trips">${icon("trips",20)} All trips</button><button type="button" class="ds-primary-button" data-action="create-trip">${icon("plus",20)} New trip</button></div>
      <section class="account-settings-group">${SectionHeader("Your trips")}${FlatList([row("trips","Switch trip",`${state.trips.length} available`,"","switch-trip","stay"),row("mail","Email Inbox",mode === "account" ? pendingEmails?`${pendingEmails} waiting for review`:"Forward to go@tripto.to" : "Sign in to verify a sender","booking-email-inbox","","flight"),...(pending?[row("refresh","Pending changes",`${pending} waiting for review or sync`,"sync")]:[])])}</section>
      <section class="account-settings-group">${SectionHeader("Travel essentials")}${FlatList([partnerRow("flight","Find a flight","Compare routes on Aviasales",AVIASALES_AFFILIATE_URL,"flight"),partnerRow("bed","Find a place to stay","Browse stays on Booking.com","https://www.booking.com/","stay"),row("sim","Travel eSIM","Get connected before you land","","open-esim","activity")])}<p class="account-partner-disclosure">Partner links may earn Tripto a commission at no extra cost.</p></section>
      <section class="account-settings-group">${SectionHeader("Help & support")}${FlatList([row("info","Take the tour","Get to know Tripto","","open-first-run-how"),row("info","Help, privacy & terms","Support and legal information","","open-help")])}</section>
      <section class="account-settings-group">${SectionHeader("Privacy & data")}${FlatList([row("trash","Remove local data","Clears files and cached trips from this phone only","","remove-local-data","food"),...(mode==="account"?[row("warning","Delete my account","Permanently removes your server account and trips","","delete-account","food")]:[])])}</section>
      <div class="account-footer-brand"><button class="account-brand" data-screen="home" aria-label="Open welcome screen">tripto<span>.</span>to</button><p class="app-version">Product V2</p></div></main></section></div>`;
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
      popup.innerHTML = `<div class="place-loading" role="status">${thinkingPattern()}<span>Searching places…</span></div>`;
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
    const bounds = `${options.min ? ` data-min="${esc(options.min)}"` : ""}${options.max ? ` data-max="${esc(options.max)}"` : ""}`;
    return `<fieldset class="date-range-field form-field--wide" id="${fieldId}"${options.allowSingle ? ' data-allow-single="true"' : ""}><legend>${esc(label)}</legend><input class="date-range-input" type="hidden" name="${esc(startName)}" id="form-${esc(startName)}"${startValue ? ` value="${esc(startValue)}"` : ""}><input class="date-range-input" type="hidden" name="${esc(endName)}" id="form-${esc(endName)}"${endValue ? ` value="${esc(endValue)}"` : ""}><button class="date-range-trigger" type="button" data-action="open-date-range" data-start-name="${esc(startName)}" data-end-name="${esc(endName)}" data-range-title="${esc(label)}" data-start-label="${esc(startLabel)}" data-end-label="${esc(endLabel)}"${bounds} aria-label="${esc(label)}. Choose ${esc(startLabel.toLowerCase())}${options.allowSingle ? "" : ` and ${esc(endLabel.toLowerCase())}`}" aria-describedby="${fieldId}-status"><span class="date-range-trigger__icon">${icon("calendar", 20)}</span><span class="date-range-trigger__copy"><small>Select dates</small><strong>Choose dates</strong></span>${icon("chevron", 18)}</button><span class="sr-only" id="${fieldId}-status" aria-live="polite">No date selected.</span></fieldset>`;
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
    // Removed per user request: the "Adding to <trip> … Change" banner is not
    // wanted on any form. Kept as a no-op so existing call sites stay valid.
    return "";
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
      const tripBody=`<header class="trip-create-head trip-create-intro"><div class="trip-create-head__copy"><span class="trip-create-head__eyebrow">${editingTrip?"Trip details":"New journey"}</span><h1>${heading}</h1><div class="trip-create-head__sub">${subhead}</div></div></header><div class="trip-create-fields ds-grouped-card"><section class="trip-create-destination" aria-label="Destination search"><div class="trip-create-destination__head"><span>${icon("location",22)}</span><div><strong>Choose your destination</strong><small>Search a city, region, or airport</small></div><button type="button" class="trip-create-destination__close icon-button" data-place-search-close aria-label="Back to trip details" aria-hidden="true" tabindex="-1">${icon("back",22)}</button></div>${mappedFields[0]}<input type="hidden" name="destinationPlace" value=""><p class="trip-create-destination__coverage">${icon("globe",15)} Worldwide city and airport search</p><div class="trip-create-search-guide"><small class="trip-create-search-guide__eyebrow">Explore worldwide</small><strong>Where will you go next?</strong><p>Search cities, countries, regions, or airport codes.</p><small class="trip-create-search-guide__privacy">${icon("lock",15)} Private on this phone · ready offline</small></div></section><section class="trip-create-details" aria-label="Trip dates">${dateRangeField("startsOn", "endsOn", "Travel dates", "Start date", "End date", tripStart, tripEnd)}<input type="hidden" name="datesSkipped" value="${editingTrip && !tripStart && !tripEnd ? "1" : ""}">${tripNameField}</section><p class="trip-create-reassurance">${icon("check",16)} You can change every detail later.</p>${deleteBar}</div>`;
      return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form trip-create-form" id="native-form" data-kind="trip"${editAttrs} novalidate>${tripBody}</form>`, "form-screen trip-create-screen", headerActions);
    }
    return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form" id="native-form" data-kind="${esc(kind)}"${editAttrs} novalidate><section class="form-section ds-grouped-card"><header><span>${esc(cfg.lead)}</span><h1>${esc(cfg.title)}</h1></header><div class="form-fields">${mappedFields.join("")}</div></section></form>`, "form-screen", headerActions);
  }
  function zonedDateTimeParts(ms, timeZone) {
    const value = Number(ms);
    if (!value) return { date: "", time: "" };
    try {
      const parts = dateFormatter("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)), row = {};
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
      return `<div class="manual-attachment-row document-attachment" data-attachment-id="${esc(row.id)}"><span class="manual-attachment-row__icon">${icon("document", 20)}</span><span class="manual-attachment-row__copy"><strong>${esc(row.name || "Travel document")}</strong><small>${esc(row.sizeLabel || manualAttachmentSize(row.size))}</small><em class="manual-attachment-row__status ${failed ? "is-error" : ""}">${failed ? "Needs attention" : status === "linked" ? "Available on this device" : "Ready to attach"}</em></span><button type="button" data-action="manual-attachment-open" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Open ${esc(row.name || "document")}">Open</button>${failed ? `<button type="button" data-action="manual-attachment-retry" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Retry ${esc(row.name || "document")}">${icon("refresh", 18)}</button>` : ""}<button type="button" data-action="manual-attachment-remove" data-scope="${esc(key)}" data-id="${esc(row.id)}" aria-label="Remove ${esc(row.name || "document")}">${icon("close", 18)}</button></div>`;
    }).join("");
  }
  function manualAttachmentsSection(kind, scope) {
    const key = manualAttachmentKey(scope);
    return `<section class="manual-attachments" aria-labelledby="manual-attachments-title"><header><span>${icon("document", 20)}</span><div><h2 id="manual-attachments-title">Tickets &amp; Documents</h2><p>Optional · Stored on this device</p></div></header><label class="manual-attachments__picker" for="form-manualAttachments"><span class="manual-attachments__picker-icon">${icon("plus", 20)}</span><span class="manual-attachments__picker-copy"><strong>Add files</strong><small>PDF, images, or passes · up to 10 MB each</small></span><input class="sr-only" id="form-manualAttachments" name="manualAttachments" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pkpass" multiple data-manual-attachments data-scope="${esc(key)}"></label><div class="manual-attachments__list" data-manual-attachment-list data-scope="${esc(key)}" aria-live="polite">${manualAttachmentRows(scope)}</div></section>`;
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
      primary = `${isReturnFlight ? `<div class="round-trip-banner form-field--wide">${icon("navigation",16)}<span>Return flight — route reversed. Set the departure date and time.</span></div>` : ""}${!editing && !isReturnFlight ? `<label class="round-trip-toggle form-field--wide"><span class="round-trip-toggle__copy"><strong>Round trip</strong><small>Choose both dates in one calendar</small></span><input type="checkbox" name="roundTrip" value="1" role="switch"><span class="round-trip-toggle__track" aria-hidden="true"><span class="round-trip-toggle__thumb"></span></span></label>` : ""}${quickField("carrierName","Airline",{required:true,placeholder:"Airline name",attrs:'list="suggest-airlines"'})}${quickField("flightNumber","Flight number",{required:true,placeholder:"LY 383"})}${manualRouteCard(kind,{label:"From",placeholder:"Airport or code"},{label:"To",placeholder:"Airport or code"})}<input type="hidden" name="departureTimezone" id="form-departureTimezone" data-timezone-role="departure" value="${esc(formPrefill?.departureTimezone||"")}"><input type="hidden" name="arrivalTimezone" id="form-arrivalTimezone" data-timezone-role="arrival" value="${esc(formPrefill?.arrivalTimezone||"")}"><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="departure" hidden><span>Origin timezone <b aria-hidden="true">*</b></span><input type="text" name="departureTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="departureTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="arrival" hidden><span>Arrival timezone</span><input type="text" name="arrivalTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="arrivalTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label><div class="form-fields form-fields--date-time form-fields--flight-when">${dateRangeField("departureDate", "returnDepartureDate", "Travel dates", "Departure", "Return", dateDefault, "", {allowSingle:true})}${quickField("departureLocalTime","Departure time",{type:"time",required:true,wide:false})}${!editing && !isReturnFlight ? `<div class="round-trip-return" data-round-trip-return hidden>${quickField("returnDepartureLocalTime","Return time",{type:"time",wide:false})}</div>` : ""}</div>${quickDateSuggestions(kind)}`;
      moreContent = `<div class="form-fields"><div class="form-fields--date-time">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}</div>${quickField("operatingAirlineCode","Operating airline",{attrs:'list="suggest-airlines"'})}${quickField("departureTerminal","Terminal",{wide:false})}${quickField("departureGate","Gate",{wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("cabin","Cabin",{wide:false,attrs:'list="suggest-cabin"'})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickField("bookingReference","PNR",{wide:false})}${quickField("ticketNumber","Ticket number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
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
      primary = `${quickField("title",activityLabel,{required:true,placeholder:activityPlaceholder})}${typeControl}<input type="hidden" name="timeMode" value="specific">${hiddenTz("timezone")}<div class="form-fields form-fields--date-time">${quickField("activityDate","Date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("activityTime","Local time",{type:"time",optional:true,wide:false})}</div>${quickField("location","Venue",{optional:true,placeholder:"Venue or saved trip location",attrs:'list="quick-activity-locations" data-location-role="location"'})}`;
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
      primary = `<div class="form-field form-field--wide quick-document-file"><label class="document-file-picker" for="form-documentFile">${icon("document",24)}<span><strong>Choose a file</strong><small>PDF, image, or Wallet pass · up to 10 MB</small></span></label><input class="sr-only" id="form-documentFile" name="documentFile" type="file" accept="application/pdf,image/*,.pkpass" required><div class="document-file-meta" role="status">No file selected</div></div><div class="document-traveler-assignment">${travelerSpecific}</div>`;
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
    return `<div class="phone-app"><section class="driver-screen"><header class="driver-top"><button class="icon-button" data-action="close-driver" aria-label="Close">${icon("close", 26)}</button><strong>Show to Driver</strong>${HeaderNavigation()}</header><main class="driver-main"><div class="driver-label">${icon("car", 24)} <span>Please drive to</span></div><section class="driver-pass" aria-labelledby="driver-destination-name"><span class="driver-pass__eyebrow">Destination</span><h1 class="driver-name" id="driver-destination-name">${esc(name)}</h1>${showLocalName ? `<p class="driver-local">${esc(localName)}</p>` : ""}<div class="driver-address">${icon("pin", 26)}<span><small>Address</small><strong>${esc(address)}</strong></span></div></section><p class="driver-hint">Show this screen to your driver. The destination is saved with your trip.</p></main><footer class="driver-cta">${primaryCta("Open directions", "directions-hotel", "navigation", `data-id="${esc(itemId(stay || {}))}"`)}</footer></section></div>`;
  }
  // One action-row primitive for every compact popup that performs a choice.
  // One-line rows stay at least 48px; rows with explanatory copy stay 56px.
  // This keeps touch targets, icon geometry and trailing affordances consistent.
  function sheetActionRow(action, iconName, label, attrs = "", sub = "", danger = false) {
    return `<button type="button" class="sheet-option sheet-action-row${danger ? " sheet-option--danger" : ""}" data-action="${esc(action)}"${attrs}><span class="info-icon">${icon(iconName, 20)}</span><span class="sheet-action-row__copy"><strong>${esc(label)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="sheet-action-row__chev" aria-hidden="true">${icon("chevron", 18)}</span></button>`;
  }
  function sheetActionLink(iconName, label, sub, href, attrs = "") {
    return `<a class="sheet-option sheet-action-row" href="${esc(href)}"${attrs}><span class="info-icon">${icon(iconName, 20)}</span><span class="sheet-action-row__copy"><strong>${esc(label)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="sheet-action-row__chev" aria-hidden="true">${icon("chevron", 18)}</span></a>`;
  }
  function sheetActionList(rows, { danger = false } = {}) {
    return `<div class="sheet-options-group sheet-action-list${danger ? " sheet-action-list--danger" : ""}">${rows}</div>`;
  }
  function bottomSheet(id, title, content) {
    return `<div class="sheet-backdrop" data-action="close-sheet" aria-hidden="true"></div><section class="bottom-sheet compact-sheet bottom-sheet--${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1"><div class="sheet-handle" data-sheet-drag aria-hidden="true"></div><div class="sheet-title-row" data-sheet-drag><h2 id="${id}-title">${esc(title)}</h2><button class="icon-button" data-action="close-sheet" aria-label="Close ${esc(title)}">${icon("close", 22)}</button></div><div class="sheet-scroll">${content}</div></section>`;
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
      const dayOffset = index - firstWeekday + 1, date = new Date(Date.UTC(year, month, dayOffset)), iso = date.toISOString().slice(0, 10), inMonth = date.getUTCMonth() === month, isStart = iso === range.start, isEnd = iso === range.end, inRange = Boolean(range.start && range.end && iso > range.start && iso < range.end), label = dateFormatter(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric", timeZone:"UTC" }).format(date);
      const outOfBounds = (range.min && iso < range.min) || (range.max && iso > range.max);
      const isFocused = iso === range.focusDate || (!range.focusDate && ((range.start && iso === range.start) || (!range.start && inMonth && dayOffset === 1)));
      cells.push(`<button type="button" role="gridcell" tabindex="${isFocused && !outOfBounds ? "0" : "-1"}" class="range-day${inMonth ? "" : " is-outside"}${inRange ? " is-between" : ""}${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}${outOfBounds ? " is-disabled" : ""}"${outOfBounds ? " disabled aria-disabled=\"true\"" : ` data-action="select-range-day" data-date="${iso}"`} aria-label="${esc(label)}${outOfBounds ? ", outside your trip dates" : isStart ? ", start date" : isEnd ? ", end date" : ""}" aria-selected="${isStart || isEnd}"><span>${date.getUTCDate()}</span></button>`);
    }
    // With trip-date bounds, hide month arrows that would leave the trip window.
    const prevBlocked = Boolean(range.min && rangeMonthStart(shiftRangeMonth(range.month, -1)) < rangeMonthStart(range.min));
    const nextBlocked = Boolean(range.max && rangeMonthStart(shiftRangeMonth(range.month, 1)) > rangeMonthStart(range.max));
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
    return `<section class="full-screen-picker date-range-screen" role="dialog" aria-modal="true" aria-labelledby="date-range-screen-title"><header class="full-screen-picker__bar"><button type="button" class="icon-button full-screen-picker__back" data-action="close-sheet" aria-label="Back">${icon("back",22)}</button><div><strong id="date-range-screen-title">${esc(heading)}</strong></div><button type="button" class="full-screen-picker__clear" data-action="clear-date-range"${range.start || range.end ? "" : " disabled"}>Clear</button></header><main class="range-picker"><p class="range-picker__instruction">${icon("calendar",19)}<span>${esc(instruction)}</span></p><div class="range-picker__selection" role="status" aria-live="polite"><section class="range-choice range-choice--start${!range.start ? " is-active" : ""}"><small>${esc(range.startLabel)}</small><strong>${esc(startValue)}</strong></section>${range.allowSingle ? "" : `<section class="range-choice range-choice--end${range.start && !range.end ? " is-active" : ""}"><small>${esc(range.endLabel)}</small><strong>${esc(endValue)}</strong></section>`}</div><section class="range-picker__calendar" aria-label="Calendar"><div class="range-month"><button type="button" class="icon-button" data-action="range-month" data-offset="-1" aria-label="Previous month"${prevBlocked ? " disabled" : ""}>${icon("back",20)}</button><strong>${esc(dateFormatter(undefined, {month:"long",year:"numeric",timeZone:"UTC"}).format(monthStart))}</strong><button type="button" class="icon-button" data-action="range-month" data-offset="1" aria-label="Next month"${nextBlocked ? " disabled" : ""}>${icon("chevron",20)}</button></div><div class="range-weekdays" aria-hidden="true">${["S","M","T","W","T","F","S"].map((day)=>`<span>${day}</span>`).join("")}</div><div class="range-days" role="grid" aria-label="${esc(range.title)}">${cells.join("")}</div></section><p class="range-picker__status sr-only">${esc(summary)}</p><div class="range-picker__actions"><button type="button" class="mobile-primary-action range-picker__apply" data-action="apply-date-range"${ready ? "" : " disabled"}>${range.allowSingle ? "Confirm date" : "Confirm dates"}</button>${skipAction}</div></main></section>`;
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
    const tripTitle = state.trip?.title || "your trip";
    return bottomSheet(
      "add",
      "What would you like to do?",
      sheetActionList(`${sheetActionRow("open-add-booking", "plus", "Add Booking", "", `Add something to ${tripTitle}`)}${sheetActionRow("create-trip", "plane", "Create New Trip", "", "Start planning another trip")}`),
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
      `<button type="button" class="ds-flat-row trip-option-card trip-option-card--${esc(tone)}" ${attr}><span class="ds-flat-row__icon trip-option-card__icon">${PastelIcon(iconName, tone === "currency" ? "stay" : tone === "map" || tone === "together" ? "activity" : tone === "connect" ? "transfer" : tone === "documents" ? "stay" : "flight", 22)}</span>${badge ? `<span class="trip-option-card__badge" aria-label="${badge} waiting">${badge > 9 ? "9+" : badge}</span>` : ""}<span class="ds-flat-row__copy trip-option-card__copy"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span><span class="trip-option-card__chevron">${icon("chevron", 18)}</span></button>`;
    // Show unless the server kill-switch explicitly disables sharing. When the
    // status hasn't loaded yet (guest trip / pending fetch) the card still
    // appears; the collaboration screen handles sign-in and disabled states.
    const collabCard = state.sharing?.enabled === false
      ? ""
      : optionCard("together", "users", "Plan together", collabMenuHint(), `data-action="open-collaboration"`);
    const editTripCard = canManageCurrentTrip()
      ? optionCard("edit", "edit", "Edit trip", "Name, dates and trip details", `data-action="edit-trip"`)
      : "";
    const alerts = totalNotificationCount();
    const body = `<section class="trip-options-intro"><span>Your travel companion</span><h1>${esc(state.trip.title || "Your trip")}</h1><p>${esc(formatTripDates(state.trip))}</p></section><section class="trip-options-group" aria-labelledby="trip-options-plan"><h2 id="trip-options-plan">Plan & explore</h2><div class="trip-options-grid ds-grouped-card ds-grouped-card--list">${optionCard("weather", "weather", "Weather", "Forecast for your destination", `data-action="open-weather"`)}${optionCard("currency", "currency", "Currency converter", "Convert trip costs offline", `data-action="open-currency"`)}${collabCard}${optionCard("connect", "sim", "Travel eSIM", "Data abroad, no roaming", `data-action="open-esim"`)}</div></section><section class="trip-options-group" aria-labelledby="trip-options-tools"><h2 id="trip-options-tools">Travel tools</h2><div class="trip-options-grid ds-grouped-card ds-grouped-card--list">${optionCard("map", "map", "Trip Map", mapHint, `data-action="open-trip-map"`)}${optionCard("alerts", "bell", "Alerts", alerts ? `${alerts} update${alerts === 1 ? "" : "s"} waiting` : "Important trip updates", `data-action="open-notifications"`, alerts)}${optionCard("imports", "mail", "Booking imports", importsHint, `data-screen="import-history"`, pending)}${optionCard("documents", "document", "Documents", "Tickets and confirmations", `data-screen="documents" aria-label="Tickets and documents"`)}</div></section><section class="trip-options-group" aria-labelledby="trip-options-manage"><h2 id="trip-options-manage">Manage trip</h2><div class="trip-options-grid ds-grouped-card ds-grouped-card--list">${editTripCard}${optionCard("help", "info", "Help & FAQ", "Guides, privacy, and answers", `data-screen="help"`)}</div></section>`;
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
    state.memberMenu = null;
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
  function collabScaffold(_sub, body) {
    // Use the same task shell, header height, page padding and typography as
    // the rest of Tripto's operational pages. The trip context lives in the
    // compact hero instead of creating a second, special header treatment.
    return PageShell({
      title: "Plan together",
      body,
      extraClass: "focused-task collaboration-screen",
      task: true,
    });
  }
  function collabRoleTone(role) {
    const value = String(role || "").toLowerCase();
    if (value === "owner") return "activity";
    if (value === "editor") return "stay";
    return "neutral";
  }
  function collabHero(tripTitle, intro) {
    return `<section class="ds-hero-summary ds-hero-summary--activity collab-hero"><span class="ds-hero-summary__eyebrow">Shared trip</span><h1>${esc(tripTitle || "Your trip")}</h1><p>${intro}</p><span class="collab-hero__promise">One trip.<br>Everyone in sync.</span></section>`;
  }
  function collabBenefits() {
    const benefit = (iconName, tone, title, body) => `<div class="collab-benefit"><span class="ds-pastel-icon ds-pastel-icon--${esc(tone)}">${icon(iconName, 21)}</span><span class="ds-flat-row__copy"><strong>${esc(title)}</strong><small>${esc(body)}</small></span></div>`;
    return `<section class="collab-benefits" aria-labelledby="collab-benefits-title"><div class="ds-section-header"><h2 id="collab-benefits-title">Why plan together?</h2></div><div class="ds-flat-list ds-grouped-card ds-grouped-card--list">${benefit("edit", "flight", "Build one plan", "Editors can add and update bookings.")}${benefit("bell", "stay", "Keep everyone aligned", "Trip changes stay visible to everyone in one place.")}${benefit("owner", "food", "You stay in control", "Choose who can edit or view, and remove access anytime.")}</div></section>`;
  }
  function collaborationScreen() {
    if (!state.trip)
      return missingDetailScreen("Plan together", "Select a trip to invite people.");
    const sub = state.trip.title || "Trip";
    if (!isSignedIn())
      return collabScaffold(
        sub,
        `${collabHero(sub, "Invite the people travelling with you so the whole group can follow one clear plan.")}${collabBenefits()}<section class="collab-signin"><h2>Ready to plan together?</h2><p>Sign in with your free account. Everyone uses their own login — no shared passwords.</p><button type="button" class="ds-primary-button" data-action="collab-sign-in">${icon("user", 18)} Sign in to continue</button><small>Free for every trip.</small></section>`,
      );
    if (state.collabLoading || String(state.collabTripId || "") !== String(state.trip.id))
      return collabScaffold(sub, LoadingState("Loading your travel companions…"));
    if (state.collabError)
      return collabScaffold(
        sub,
        ErrorState("Couldn’t load collaboration", state.collabError, "reload-collaboration", "Try again"),
      );
    if (state.sharing && state.sharing.enabled === false)
      return collabScaffold(
        sub,
        EmptyState("Sharing is off right now", "Trip collaboration isn’t available at the moment. Your trip stays private and safe on this device.", "users"),
      );
    const manage = canManageSharing();
    const myId = currentUserId();
    const memberRows = state.members
      .map((member) => {
        const meta = roleMeta(member.role);
        const isYou = myId && String(member.user_id) === String(myId);
        const isOwner = String(member.role).toLowerCase() === "owner";
        const manageButton =
          manage && !isOwner
            ? `<button type="button" class="icon-button collab-member__manage" data-action="open-member-actions" data-id="${esc(member.user_id)}" aria-label="Manage access for ${esc(member.display_name || "traveler")}">${icon("edit", 20)}</button>`
            : `<span class="collab-member__trailing" aria-hidden="true"></span>`;
        return `<article class="collab-member">${PastelIcon(meta.icon, collabRoleTone(member.role), 22, "collab-member__icon")}<span class="ds-flat-row__copy collab-member__text"><strong>${esc(member.display_name || "Traveler")}${isYou ? " (You)" : ""}</strong><small>${esc(meta.label)}</small></span>${manageButton}</article>`;
      })
      .join("");
    const pending = state.invites.filter((invite) => String(invite.status).toLowerCase() === "invited");
    const inviteRows = pending
      .map((invite) => {
        const meta = roleMeta(invite.role);
        const who = invite.invited_email || "Anyone with the link";
        const expires = invite.expires_at ? `expires ${esc(formatDateOnly(invite.expires_at))}` : "no expiry";
        return `<article class="collab-invite">${PastelIcon("invite", "transfer", 20, "collab-invite__icon")}<span class="ds-flat-row__copy collab-invite__text"><strong>${esc(who)}</strong><small>${esc(meta.label)} · pending · ${expires}</small></span><button type="button" class="icon-button collab-invite__revoke" data-action="invite-revoke" data-id="${esc(invite.id)}" aria-label="Revoke invitation">${icon("close", 18)}</button></article>`;
      })
      .join("");
    const inviteBtn = state.sharing?.enabled && manage
      ? `<button type="button" class="ds-primary-button collab-invite-cta" data-action="open-share">${icon("invite", 18)} Invite people</button>`
      : "";
    const inviteContent = state.inviteLoadError
      ? `<div role="alert"><p class="collab-note">Pending invitations couldn’t be loaded.</p><button type="button" class="collab-chip" data-action="reload-collaboration">Try again</button></div>`
      : inviteRows || `<p class="collab-note">No pending invitations.</p>`;
    const invitesSection = manage
      ? `<section class="collab-section">${SectionHeader("Pending invitations")}${inviteContent}</section>`
      : "";
    const leaveBtn = state.sharing?.role && state.sharing.role !== "owner"
      ? `<button type="button" class="ds-secondary-button collab-leave" data-action="leave-trip">Leave this trip</button>`
      : "";
    const intro = manage
      ? `Invite people to view or edit <strong>${esc(sub)}</strong>. You stay the owner and can change roles or remove people at any time.`
      : state.sharing?.role === "editor"
        ? `You can edit this shared trip. The owner manages who has access.`
        : `You can view this shared trip. The owner manages who has access.`;
    const cap = state.sharing?.maxMembers ? `<p class="collab-note">Up to ${esc(state.sharing.maxMembers)} people per trip.</p>` : "";
    return collabScaffold(
      sub,
      `${collabHero(sub, intro)}${collabBenefits()}${inviteBtn}<section class="collab-section">${SectionHeader("People on this trip")}<div class="ds-flat-list collab-members ds-grouped-card ds-grouped-card--list">${memberRows || `<p class="collab-note">Just you so far. Invite someone when you’re ready.</p>`}</div>${cap}</section>${invitesSection}${leaveBtn}`,
    );
  }
  function collabMemberSheet() {
    const member = state.members.find((item) => String(item.user_id) === String(state.memberMenu));
    if (!member || !canManageSharing() || String(member.role).toLowerCase() === "owner")
      return bottomSheet("member-actions", "Manage access", `<p class="sheet-note">This person’s access can’t be changed from here.</p>`);
    const displayName = member.display_name || "Traveler";
    const nextRole = String(member.role).toLowerCase() === "editor" ? "viewer" : "editor";
    const nextMeta = roleMeta(nextRole);
    return bottomSheet(
      "member-actions",
      `Manage ${displayName}`,
      `<p class="sheet-context">${esc(roleMeta(member.role).label)} access to ${esc(state.trip?.title || "this trip")}</p><div class="sheet-action-list">${sheetActionRow("member-role", nextMeta.icon, nextRole === "viewer" ? "Make view only" : "Make editor", ` data-id="${esc(member.user_id)}" data-role="${nextRole}"`, nextRole === "viewer" ? "They can see the plan but can’t change it." : "They can add and update the trip.")}${sheetActionRow("member-transfer", "owner", "Make owner", ` data-id="${esc(member.user_id)}" data-name="${esc(displayName)}"`, "You’ll become an editor and lose sharing controls.")}</div><div class="sheet-action-list sheet-action-list--danger">${sheetActionRow("member-remove", "trash", "Remove from trip", ` data-id="${esc(member.user_id)}" data-name="${esc(displayName)}"`, "They’ll no longer have access to this trip.", true)}</div>`,
    );
  }
  function shareSheet() {
    if (!state.trip) return "";
    const role = state.shareRole === "viewer" ? "viewer" : "editor";
    const seg = (value, label, sub, tone) =>
      `<button type="button" class="share-role${role === value ? " is-active" : ""}" data-action="share-role" data-role="${value}" aria-pressed="${role === value}">${PastelIcon(roleMeta(value).icon, tone, 20, "share-role__icon")}<span class="share-role__copy"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span><span class="share-role__indicator" aria-hidden="true">${role === value ? icon("check", 18) : ""}</span></button>`;
    const invite = state.shareInvite;
    const linkBlock = invite?.inviteUrl
      ? `<div class="share-link" role="group" aria-label="Invitation link"><p class="share-link__label">${esc(roleMeta(invite.role).label)} link ready${invite.expiresAt ? ` · expires ${esc(formatDateOnly(invite.expiresAt))}` : ""}</p><div class="share-link__url" title="${esc(invite.inviteUrl)}">${esc(invite.inviteUrl)}</div><div class="share-link__actions"><button type="button" class="ds-primary-button" data-action="share-invite-link">${icon("share", 18)} Share link</button><button type="button" class="ds-secondary-button" data-action="copy-invite-link">${icon("copy", 18)} Copy link</button></div></div>`
      : "";
    const createLabel = invite?.inviteUrl ? "Create another link" : "Create invitation link";
    return bottomSheet(
      "share",
      "Invite to this trip",
      `<p class="sheet-note">Anyone you invite signs in with their own free account to join. The link works once and you can revoke it anytime.</p><section class="share-role-picker" aria-labelledby="share-role-title"><h3 id="share-role-title">Choose access</h3><div class="share-roles">${seg("editor", "Can edit", "Add and change bookings", "stay")}${seg("viewer", "View only", "See the trip, can’t change it", "neutral")}</div></section>${linkBlock}<button type="button" class="ds-${invite?.inviteUrl ? "secondary" : "primary"}-button share-create" data-action="create-invite"${state.shareBusy ? " disabled" : ""}>${icon("invite", 18)} ${state.shareBusy ? "Creating…" : esc(createLabel)}</button>`,
    );
  }
  function joinScreen() {
    const token = state.selectedId || state.joinToken || "";
    if (!token)
      return focusedTaskPage("Join trip", EmptyState("Invitation link incomplete", "Open the full invitation link you were sent to join a trip.", "invite", "join-home", "Go to my trips"), "join-screen");
    if (state.joinCheckedToken !== token || (state.joinLoading && !state.joinPreview))
      return focusedTaskPage("Join trip", LoadingState("Checking your invitation…"), "join-screen");
    if (state.joinError && !state.joinPreview)
      return focusedTaskPage("Join trip", ErrorState("Invitation unavailable", state.joinError, "join-home", "Go to my trips"), "join-screen");
    const preview = state.joinPreview || {};
    const roleLabel = roleMeta(preview.role).label;
    const title = preview.tripTitle || "a trip";
    if (preview.sharingEnabled === false)
      return focusedTaskPage("Join trip", EmptyState("Invitations are paused", "Trip sharing isn’t available right now. Please ask the trip owner to send a new link later.", "invite", "join-home", "Go to my trips"), "join-screen");
    const hero = `<section class="ds-hero-summary ds-hero-summary--activity join-hero"><span class="ds-hero-summary__eyebrow">Trip invitation</span><h1>Join ${esc(title)}</h1><p>Join as <strong>${esc(roleLabel.toLowerCase())}</strong>. Collaboration is free.</p></section>`;
    if (!isSignedIn())
      return focusedTaskPage(
        "Join trip",
        `${hero}<section class="join-signin"><h2>Sign in to join</h2><p>Sign in with your free account to accept this invitation.</p><div id="google-signin-button" class="google-signin-button"></div><p class="signin-error" role="alert" hidden></p><p class="collab-note">We only use your Google account to sign you in. Your invitation is kept until you finish.</p></section>`,
        "join-screen",
      );
    return focusedTaskPage(
      "Join trip",
      `${hero}<section class="join-accept"><p>You’ll get access to this shared trip on your own account.</p><button type="button" class="ds-primary-button" data-action="join-accept"${state.joinLoading ? " disabled" : ""}>${state.joinLoading ? "Joining…" : "Accept invitation"}</button><button type="button" class="ds-secondary-button" data-action="join-home">Not now</button></section>`,
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
    if (!await requestConfirmation({ title: "Remove from trip?", body: `Remove ${name || "this person"} from ${state.trip.title || "this trip"}?`, confirmLabel: "Remove" })) return;
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
    if (!await requestConfirmation({ title: "Transfer ownership?", body: `Make ${name || "this person"} the owner? You’ll become an editor and can no longer manage sharing.`, confirmLabel: "Make owner" })) return;
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
    if (!await requestConfirmation({ title: "Leave this trip?", body: `Leave ${state.trip.title || "this trip"}? You’ll lose access until someone invites you again.`, confirmLabel: "Leave trip" })) return;
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
            `<li class="wx-day${i === 0 ? " is-today" : ""}"><span class="wx-day__label">${esc(i === 0 ? "Today" : day.weekday || "")}</span><span class="wx-day__ico">${icon(day.iconName, 28)}</span><span class="wx-day__temps"><span class="wx-day__hi">${esc(day.hi)}°</span><span class="wx-day__lo">${day.lo != null ? esc(day.lo) + "°" : "—"}</span></span><span class="wx-day__meta">${icon("wx-drop", 14)}${day.precip != null ? esc(day.precip) : 0}%</span><span class="wx-day__meta">${icon("wx-wind", 14)}${day.wind != null ? esc(day.wind) : 0}</span></li>`,
        )
        .join("");
      body = `${state.offline ? '<small class="wx-offline-note">Saved forecast · offline</small>' : ""}${hourItems ? `<section class="wx-block" aria-label="Hourly forecast"><h2 class="wx-block__title">Hourly</h2><ul class="wx-hours">${hourItems}</ul></section>` : ""}${dayItems ? `<section class="wx-block wx-block--days" aria-label="Daily forecast"><h2 class="wx-block__title">7-day forecast</h2><ul class="wx-days">${dayItems}</ul></section>` : ""}<p class="weather-note">Forecast for your destination. tripto.to never uses your location.</p>`;
    } else if (state.weatherRefreshing) {
      body = thinkingPanel("Checking the forecast…");
    } else if (state.offline) {
      body = `<section class="weather-empty"><span>${icon("info", 30)}</span><h1>Weather needs a connection</h1><p>Connect to load the forecast for your destination.</p></section>`;
    } else {
      body = `<section class="weather-empty"><span>${icon("weather", 30)}</span><h1>${state.weatherRefreshing ? "Loading forecast…" : "No forecast yet"}</h1><p>We could not find a forecast for this trip's destination.</p><button type="button" class="mobile-secondary-action" data-action="refresh-weather">${icon("refresh", 18)} Try again</button></section>`;
    }
    return `<div class="phone-app"><section class="screen weather-screen weather-refresh">${appBar("Weather", sub, true)}<main class="weather-page">${selector}${body}</main></section></div>`;
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
    return `<div class="phone-app"><section class="screen currency-screen">${appBar("Currency", state.trip.title || "Trip", true)}<main class="currency-page"><header class="currency-hero"><span class="currency-hero__icon">${icon("currency",23)}</span><div><span>TRIP RATE</span><h1 id="currency-converter-title">${esc(destination)} uses ${esc(destinationCurrency())}</h1><p>Your destination currency is ready automatically.</p></div></header><section class="currency-workspace" aria-labelledby="currency-converter-title"><section class="currency-zone currency-zone--pay"><header class="currency-zone__head"><span>You pay</span>${currencyChoice("from")}</header><label class="currency-amount"><span class="sr-only">Amount in ${esc(currency.from)}</span><input data-currency-amount class="${String(currency.amount).length > 9 ? "is-long" : ""}" type="number" inputmode="decimal" min="0" step="any" value="${esc(currency.amount)}" aria-label="Amount in ${esc(currency.from)}"></label><div class="currency-quick" aria-label="Quick amounts">${[10,50,100,500].map((value) => `<button type="button" data-action="currency-quick" data-value="${value}"${Number(currency.amount) === value ? " class=\"is-active\"" : ""}>${value}</button>`).join("")}</div></section><div class="currency-bridge"><button type="button" class="currency-swap" data-action="currency-swap" aria-label="Swap currencies">${icon("swap",21)}</button><span class="currency-rate-note">${Number.isFinite(rate) ? `1 ${esc(currency.from)} = ${esc(rate.toFixed(rate < 1 ? 4 : 3))} ${esc(currency.to)}` : "Update to load this rate"}</span></div><section class="currency-zone currency-zone--receive"><header class="currency-zone__head"><span>You get</span>${currencyChoice("to")}</header><output class="currency-result" aria-live="polite"><strong class="currency-result__amount${result != null && money(result, currency.to).length > 12 ? " is-long" : ""}">${esc(result == null ? "—" : money(result, currency.to))}</strong><span>${esc(currency.to)} · ${esc(TRAVEL_CURRENCIES.find(([code]) => code === currency.to)?.[1] || "Currency")}</span></output></section><footer class="currency-update-row"><div>${status}<small>${esc(currency.source || "Daily reference rates")}</small></div><button type="button" class="currency-refresh" data-action="refresh-currency" aria-label="Update exchange rate"${state.currencyLoading ? " disabled" : ""}>${icon("refresh",18)}<span>${state.currencyLoading ? "Updating" : "Update"}</span></button></footer></section>${error}<p class="currency-disclaimer">Reference rate only; providers may add fees. Amounts are calculated on this phone.</p></main></section></div>`;
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
    return `<div class="phone-app"><section class="screen esim-screen esim-refresh">${appBar("Travel eSIM", "Partner offer", true)}<main class="esim-page"><section class="esim-hero"><div class="esim-hero__top"><span>Stay connected</span><span class="esim-hero__icon">${icon("sim", 28)}</span></div><h1>Data for ${esc(dest)}</h1><p>Find a travel data plan before you go.</p><div class="esim-offer"><strong>15% off</strong><span>your first plan · copy code</span><button type="button" class="esim-code" data-action="copy-esim-code" aria-label="Copy code FKWQX6ES">FKWQX6ES ${icon("copy", 16)}</button></div></section><section class="esim-features">${featureRows}</section><section class="esim-steps"><h2>How it works</h2><ol><li><span>1</span><p>Tap <strong>Get my eSIM</strong> below to open 7g.</p></li><li><span>2</span><p>Pick your destination and plan — enter code <strong>FKWQX6ES</strong> for 15% off.</p></li><li><span>3</span><p>Scan the QR to install it, then land connected.</p></li></ol></section><button type="button" class="mobile-primary-action esim-cta" data-action="esim-signup">${icon("external", 18)} Get my eSIM — 15% off</button><p class="esim-note">tripto.to partners with 7g. This opens 7g in a new tab and we may earn a commission — it never changes your price. tripto.to never uses your location.</p></main></section></div>`;
  }
  // The Add screen (spec §2): exactly three tappable intention rows for the
  // current trip. Create-trip and other global actions deliberately live
  // elsewhere. Stay is NOT here — it belongs under Add a booking.
  function addToTripScreen() {
    if (!state.trip) return noTripQuickAdd("booking", "Add to your trip");
    const tripName = state.trip.title || "your trip";
    // Gradient hero + dashed journey stepper, matching the "Where are you going?"
    // new-journey screen (reuses the .trip-create-head / .trip-create-route look).
    const stepper = `<div class="trip-create-route" aria-hidden="true"><span class="trip-create-route__stop trip-create-route__origin">${icon("ticket", 18)}</span><i class="trip-create-route__line"></i><span class="trip-create-route__plane">${icon("map", 22)}</span><i class="trip-create-route__line"></i><span class="trip-create-route__stop trip-create-route__destination">${icon("favorite", 20)}</span></div>`;
    const hero = `<header class="trip-create-head add-intent-head"><div class="trip-create-head__copy"><span class="trip-create-head__eyebrow">ADD TO TRIP</span><h1>What would you like to add?</h1><div class="trip-create-head__sub"><p>Book it, plan your days, or save an idea for ${esc(tripName)}.</p></div></div>${stepper}</header>`;
    const body = `${hero}${addIntentRows()}`;
    return focusedTaskPage(`Add to ${tripName}`, body, "add-intent-page");
  }
  // The three "Add to trip" intention rows, shared by the Add-to-trip screen and
  // the empty Timeline (an empty trip lands straight on these choices).
  function addIntentRows() {
    const row = (action, ic, title, copy, tone) => `<button type="button" class="ds-flat-row add-intent-row add-intent-row--${tone}" data-action="${esc(action)}"><span class="ds-flat-row__icon add-intent-row__icon">${PastelIcon(ic, tone === "booking" ? "flight" : tone === "plan" ? "activity" : "food", 22)}</span><span class="ds-flat-row__copy add-intent-row__copy"><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${icon("chevron", 20)}</button>`;
    return `<div class="add-intent-fields ds-grouped-card ds-grouped-card--list">${row("open-add-booking", "ticket", "Add a booking", "Flights, stays, trains, restaurants and more", "booking")}${row("open-day-plan", "map", "Day Plan", "Plan what you want to see and do", "plan")}${row("open-save-later", "favorite", "Save for Later", "Keep ideas you haven't scheduled yet", "later")}</div>`;
  }

  // Day Plan (spec §8/§9): pick one of ten activity types. Neighborhood is the
  // one grouped type (opens a collection); the rest open the shared activity
  // form and land directly on the Timeline once given a day.
  function dayPlanScreen() {
    if (!state.trip) return missingDetailScreen("Day Plan", "Create or select a trip first.");
    const row = (t) => `<button type="button" class="ds-flat-row day-plan-row" data-action="day-plan-type" data-type="${esc(t.type)}" aria-label="${esc(t.label)}"><span class="ds-flat-row__icon day-plan-row__icon">${PastelIcon(t.icon, ["restaurant", "food_drink", "shopping"].includes(t.type) ? "food" : ["flight", "train", "ferry", "bus", "cruise"].includes(t.type) ? "flight" : ["car", "transfer", "taxi", "parking"].includes(t.type) ? "transfer" : ["hotel", "neighborhood"].includes(t.type) ? "stay" : "activity", 22)}</span><span class="ds-flat-row__copy day-plan-row__copy"><strong>${esc(t.label)}</strong><small>${esc(t.desc)}</small></span>${icon("chevron", 18)}</button>`;
    const body = `<section class="day-plan-intro"><span>DAY PLAN</span><h1>Plan your day</h1><p>What do you want to visit or do? Pick a type, then add the details.</p></section><div class="day-plan-list ds-grouped-card ds-grouped-card--list">${DAY_PLAN_TYPES.map(row).join("")}</div>`;
    return focusedTaskPage("Day Plan", body, "day-plan-page");
  }

  // Contextual prefill (spec §7): the ISO date of the day currently shown on the
  // Timeline, or "" when no day is in context. Never invents a date.
  function activeTimelineDateISO() {
    const key = state.timelineDayKey;
    if (!key) return "";
    for (const item of state.timeline || []) {
      const starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null;
      if (starts == null) continue;
      const zone = val(item, "start_timezone", "startTimezone");
      if (timelineDay(starts, zone).key !== key) continue;
      try {
        const parts = dateFormatter("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone || undefined }).formatToParts(new Date(starts));
        const g = (t) => parts.find((p) => p.type === t)?.value || "";
        return `${g("year")}-${g("month")}-${g("day")}`;
      } catch (_) { return ""; }
    }
    return "";
  }

  // Shared activity form for the nine single-activity Day Plan types and for
  // scheduling a Save for Later idea (spec §10). Day and time live INSIDE the
  // form — there is never a separate "choose day" screen. state.selectedId is
  // "new:<activityType>" to create, or an activity id to edit.
  function dayPlanFormScreen() {
    if (!state.trip) return missingDetailScreen("Day Plan", "Create or select a trip first.");
    const raw = String(state.selectedId || "");
    const editing = !raw.startsWith("new:");
    const existing = editing ? (state.timeline || []).find((it) => itemId(it) === raw) : null;
    if (editing && !existing) return missingDetailScreen("Plan unavailable", "This activity is not available.");
    const activityType = editing ? String(val(existing, "activity_type", "activityType") || "") : raw.slice(4);
    const meta = dayPlanType(activityType);
    const isIdea = !meta && activityType === "idea";
    const label = meta ? meta.label : (isIdea ? "Idea" : "Activity");
    const desc = meta ? meta.desc : (isIdea ? "Give it a name now — add the day and details whenever you like." : "Add what you want to do and, when you know it, the day and time.");
    // A brand-new idea names its trip in the heading ("Save idea for \"Trip\"").
    const tripTitle = String(val(state.trip, "title") || "").trim();
    const newHeading = isIdea ? (tripTitle ? `Save idea for "${tripTitle}"` : "Save idea") : label;
    const fromSaveLater = state.dayPlanContext === "save-later";
    const tz = (editing ? val(existing, "start_timezone", "startTimezone") : "") || tripDefaultTimezone() || "UTC";
    // Prefill the day from the day in context, unless we came from Save for
    // Later (an explicitly unscheduled idea) or are editing an existing item.
    let dateVal = "", timeVal = "", endTimeVal = "";
    if (editing) {
      const starts = Number(val(existing, "starts_at_utc", "startsAtUtc")) || null;
      if (starts != null) {
        try {
          const p = dateFormatter("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).formatToParts(new Date(starts));
          const gp = dateFormatter("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).formatToParts(new Date(starts));
          const g = (parts, t) => parts.find((x) => x.type === t)?.value || "";
          dateVal = `${g(gp, "year")}-${g(gp, "month")}-${g(gp, "day")}`;
          timeVal = `${g(p, "hour")}:${g(p, "minute")}`;
        } catch (_) {}
      }
      const ends = Number(val(existing, "ends_at_utc", "endsAtUtc")) || null;
      if (ends != null) {
        try {
          const p = dateFormatter("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).formatToParts(new Date(ends));
          const g = (t) => p.find((x) => x.type === t)?.value || "";
          endTimeVal = `${g("hour")}:${g("minute")}`;
        } catch (_) {}
      }
    } else if (!fromSaveLater) {
      dateVal = activeTimelineDateISO();
    }
    const address = editing ? String(val(locationById(val(existing, "start_location_id", "venue_location_id")) || {}, "local_address", "formatted_address") || "") : "";
    const notes = editing ? String(val(existing, "activity_notes", "notes") || "") : "";
    const nameVal = editing ? String(val(existing, "title") || "") : "";
    const field = (name, lbl, value, opts = {}) => {
      const req = opts.required ? " required" : "", ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
      if (opts.type === "textarea") return `<label class="form-field form-field--wide" for="dp-${name}"><span>${esc(lbl)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><textarea id="dp-${name}" name="${name}" rows="3"${ph} autocapitalize="sentences" spellcheck="true">${esc(value || "")}</textarea></label>`;
      return `<label class="form-field form-field--${opts.wide === false ? "half" : "wide"}" for="dp-${name}"><span>${esc(lbl)}${opts.required ? ' <b aria-hidden="true">*</b>' : ' <em class="field-optional">Optional</em>'}</span><input type="${opts.type || "text"}" id="dp-${name}" name="${name}"${req}${ph} autocomplete="off" value="${esc(value || "")}"></label>`;
    };
    const editAttrs = editing ? ` data-edit-id="${esc(raw)}" data-edit-version="${esc(Number(val(existing, "version")) || 1)}"` : "";
    const attachmentScope = manualAttachmentScope("activity", editing ? raw : "");
    const attachments = manualAttachmentsSection("activity", attachmentScope);
    // A day plan / idea can only be scheduled onto a day WITHIN the trip window.
    // With no trip dates yet, there is no day to choose — it saves as an idea.
    const tripRange = tripDateDays(), tripStart = tripRange[0] || "", tripEnd = tripRange[tripRange.length - 1] || "";
    const dayField = tripRange.length
      ? dateRangeField("dpDate", "dpDateEnd", "Day", "Day", "Day", dateVal, "", { allowSingle: true, min: tripStart, max: tripEnd })
      : `<div class="day-plan-no-dates form-field--wide"><span class="day-plan-no-dates__icon" aria-hidden="true">${icon("calendar", 20)}</span><span class="day-plan-no-dates__copy"><strong>No trip dates yet</strong><small>Add your trip's dates to schedule this. For now it's saved as an idea.</small></span><input type="hidden" name="dpDate" value=""><input type="hidden" name="dpDateEnd" value=""></div>`;
    const noteCopy = tripRange.length
      ? "Leave the day blank to keep this as an idea in Save for Later. Pick a day within your trip and it appears on your timeline."
      : "This is saved as an idea. Add your trip's dates to schedule it onto a day.";
    const form = `<form class="mobile-form premium-form day-plan-form" id="day-plan-form" data-kind="activity" data-activity-type="${esc(activityType)}" data-attachment-scope="${esc(attachmentScope.draftId)}"${editAttrs} novalidate><header class="manual-form-heading"><span>Day plan</span><h1>${esc(editing ? nameVal || label : newHeading)}</h1><p>${esc(desc)}</p></header><section class="form-section manual-essentials" aria-labelledby="day-plan-essentials-title"><h2 id="day-plan-essentials-title">Details</h2><div class="quick-primary-fields">${field("title", "Name or place", nameVal, { required: true, placeholder: label })}${dayField}<div class="form-fields form-fields--date-time">${field("dpTime", "Start time", timeVal, { type: "time", wide: false })}${field("dpEndTime", "End time", endTimeVal, { type: "time", wide: false })}</div>${field("dpAddress", "Address", address, { placeholder: "Street address or area" })}${field("dpNotes", "Notes", notes, { type: "textarea" })}</div></section>${attachments}<p class="field-helper form-note">${esc(noteCopy)}</p><input type="hidden" name="timezone" value="${esc(tz)}"><input type="hidden" name="activityType" value="${esc(activityType)}"></form>`;
    return focusedTaskPage(editing ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`, form, "form-screen day-plan-form-screen", formHeaderSave("day-plan-form", "Save"));
  }

  async function saveDayPlanForm(form) {
    if (!state.trip) return;
    const editId = form.dataset.editId || "", activityType = form.dataset.activityType || "";
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    if (!title) { showFormSubmissionError(form, "Add a name to continue."); return; }
    const tz = String(fd.get("timezone") || "").trim() || tripDefaultTimezone() || "UTC";
    const date = String(fd.get("dpDate") || "").trim(), time = String(fd.get("dpTime") || "").trim(), endTime = String(fd.get("dpEndTime") || "").trim();
    const addressText = String(fd.get("dpAddress") || "").trim(), notes = String(fd.get("dpNotes") || "").trim();
    let startsAtUtc = null, endsAtUtc = null;
    if (date) {
      // Day plans and ideas live inside the trip window only — reject any day
      // outside it so scheduling can never drift onto a non-trip date.
      const tripRange = tripDateDays();
      if (tripRange.length && (date < tripRange[0] || date > tripRange[tripRange.length - 1])) {
        showFormSubmissionError(form, "Pick a day within your trip dates.");
        return;
      }
      try { startsAtUtc = resolveEventLocalDateTime(`${date}T${time || "09:00"}`, tz); }
      catch (error) { showFormSubmissionError(form, error.message); return; }
      if (endTime) {
        try { endsAtUtc = resolveEventLocalDateTime(`${date}T${endTime}`, tz); }
        catch (_) { endsAtUtc = null; }
        if (endsAtUtc != null && endsAtUtc < startsAtUtc) { showFormSubmissionError(form, "End time cannot be before the start time."); return; }
      }
    }
    const tripId = state.trip.id;
    setFormSaving(form, true);
    try {
      let location = null;
      if (addressText) {
        const existingLocationId = editId ? String(val((state.timeline || []).find((it) => itemId(it) === editId) || {}, "start_location_id", "venue_location_id") || "") : "";
        location = await createManualVenueLocation("attraction", title, "", addressText, date ? tz : null, "", existingLocationId).catch(() => null);
      }
      const body = { kind: "activity", status: date ? "confirmed" : "planned", title, startsAtUtc, endsAtUtc, timezone: date ? tz : null, locationId: location?.id || null, activityType: activityType || null, notes: notes || null, confidence: date ? "confirmed" : "estimated" };
      let savedId = editId;
      if (editId) {
        const existing = (state.timeline || []).find((it) => itemId(it) === editId);
        body.version = Number(val(existing || {}, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(editId)}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const created = await api(`/api/v1/trips/${encodeURIComponent(tripId)}/activities`, { method: "POST", body: JSON.stringify(body) });
        savedId = String(created?.item?.id || "");
      }
      const scope = form.dataset.attachmentScope || "";
      let attachmentWarning = "";
      if (savedId && scope) {
        try {
          const linked = await commitManualAttachments(scope, savedId, "activity", []);
          if (linked?.status === "linked") { forgetManualAttachmentRetry("activity", savedId); try { await clearManualAttachment(scope); } catch (_) {} }
        } catch (_) {
          rememberManualAttachmentRetry("activity", savedId, scope);
          attachmentWarning = "Saved, but one or more documents could not be attached. Edit this plan and tap Retry.";
        }
      }
      await loadTripDetails();
      formHasMeaningfulChanges = false; state.editingEntity = null; state.dayPlanContext = null;
      showToast(attachmentWarning || (date ? `${title} added to your timeline.` : `${title} saved for later.`), attachmentWarning ? "alert" : "status");
      if (date) { state.timelineDayKey = timelineDay(startsAtUtc, tz).key; route("timeline", null, true); }
      else route("save-later", null, true);
    } catch (error) {
      showFormSubmissionError(form, error?.message || "Could not save. Try again.");
      if (document.contains(form)) setFormSaving(form, false);
      return;
    }
    if (document.contains(form)) setFormSaving(form, false);
  }

  // Save for Later (spec §25/§26): unscheduled ideas grouped into Place, Food &
  // Drink, Shopping. Nothing here appears on the main Timeline until scheduled.
  function saveLaterScreen() {
    if (!state.trip) return missingDetailScreen("Save for Later", "Create or select a trip first.");
    const canEdit = canEditCurrentTrip();
    const items = saveForLaterItems();
    // Two states of the SAME idea: an idea is "planned" once it has been placed
    // into a neighborhood (a live linking stop). The default view shows only
    // un-planned ideas; the Planned filter shows where placed ideas landed.
    const planned = items.filter(ideaIsPlanned);
    const ideas = items.filter((it) => !ideaIsPlanned(it));
    const filter = state.saveLaterFilter === "planned" ? "planned" : "ideas";
    const tab = (key, label, count) => `<button type="button" class="save-later-tab${filter === key ? " is-active" : ""}" data-action="save-later-filter" data-filter="${key}"${filter === key ? ' aria-current="true"' : ""}>${esc(label)}${count ? ` <span class="save-later-tab__count">${count}</span>` : ""}</button>`;
    // Always show both tabs so the Planned list is discoverable even before any
    // idea has been placed — tapping Planned then shows an empty-planned state.
    const filterBar = `<div class="save-later-filter" role="tablist" aria-label="Show">${tab("ideas", "Ideas", ideas.length)}${tab("planned", "Planned", planned.length)}</div>`;
    // One clean list, no category buckets: every idea is a row you can open.
    const ideaRow = (item) => {
      const address = String(val(locationById(val(item, "start_location_id", "venue_location_id")) || {}, "local_address", "formatted_address") || "");
      const sub = ["Not scheduled", address].filter(Boolean).join(" · ");
      return `<button type="button" class="save-later-row" data-action="open-idea" data-id="${esc(itemId(item))}"><span class="save-later-row__mark" aria-hidden="true">${icon("star", 18)}</span><span class="save-later-row__copy"><strong>${esc(val(item, "title") || "Idea")}</strong><small>${esc(sub)}</small></span>${icon("chevron", 18)}</button>`;
    };
    const plannedRow = (item) => {
      const sub = ideaPlacementSummary(item) || "In your plan";
      return `<button type="button" class="save-later-row save-later-row--planned" data-action="open-idea" data-id="${esc(itemId(item))}"><span class="save-later-row__mark" aria-hidden="true">${icon("check", 18)}</span><span class="save-later-row__copy"><strong>${esc(val(item, "title") || "Idea")}</strong><small>${esc(sub)}</small></span>${icon("chevron", 18)}</button>`;
    };
    const addCta = canEdit ? `<button type="button" class="save-later-add-cta" data-action="add-save-later" data-type="idea">${icon("plus", 20)}<span>Add an idea</span></button>` : "";
    const tripName = String(val(state.trip, "title") || "").trim();
    const hasTripDates = tripDateDays().length > 0;
    const heading = tripName ? `Save ideas for “${esc(tripName)}”` : "Save for Later";
    const scheduleHint = hasTripDates
      ? "Open one to add it to a day plan."
      : "Add your trip's dates first, then you can plan these onto its days.";
    let body;
    if (filter === "planned") {
      const plannedList = planned.length
        ? `<div class="save-later-list ds-grouped-card ds-grouped-card--list" role="list">${planned.map(plannedRow).join("")}</div>`
        : `<div class="save-later-empty-state"><span class="save-later-empty-state__badge" aria-hidden="true">${icon("check", 24)}</span><strong>Nothing planned yet</strong><p>Ideas you add to a day plan show up here. Open an idea in the Ideas tab to place it.</p></div>`;
      body = `<section class="save-later-intro"><span>SAVE FOR LATER</span><h1>${heading}</h1><p>Ideas you've added to a day plan. Open one to see it, or return it to your ideas.</p></section>${filterBar}${plannedList}`;
    } else {
      const list = ideas.length
        ? `<div class="save-later-list ds-grouped-card ds-grouped-card--list" role="list">${ideas.map(ideaRow).join("")}</div>`
        : `<div class="save-later-empty-state"><span class="save-later-empty-state__badge" aria-hidden="true">${icon("star", 24)}</span><strong>No ideas yet</strong><p>Save places, food and things you might want to do. ${hasTripDates ? "Plan them onto a day whenever you're ready." : "Add your trip's dates to plan them onto days."}</p></div>`;
      body = `<section class="save-later-intro"><span>SAVE FOR LATER</span><h1>${heading}</h1><p>A running list of things you might do. ${scheduleHint}</p></section>${filterBar}${list}${addCta}`;
    }
    return focusedTaskPage("Save for Later", body, "save-later-page");
  }
  // Idea action sheet (spec §5/§6/§10): the hub for a single Save-for-Later idea.
  // Un-planned ideas offer "Add to a day plan" (opens the plan panel) plus edit
  // and delete; planned ideas add "Open in plan" and "Return to ideas".
  function ideaSheet() {
    const id = String(state.ideaMenu || "");
    const item = (state.timeline || []).find((it) => itemId(it) === id && isSaveForLaterItem(it));
    if (!item) return bottomSheet("idea", "Idea", `<p class="sheet-empty">This idea is no longer available.</p>`);
    const canEdit = canEditCurrentTrip();
    const placements = ideaPlacements(item);
    const planned = placements.length > 0;
    const opt = (action, ic, label, sub, extra = "", danger = false) => sheetActionRow(action, ic, label, `${String(extra).includes("data-id=") ? "" : ` data-id="${esc(id)}"`}${extra}`, sub, danger);
    const meta = planned ? `<p class="sheet-context"><span>${esc(ideaPlacementSummary(item))}</span></p>` : "";
    if (!canEdit) {
      const openRow = planned ? opt("open-collection", "map", "Open in plan", "See where this idea sits", ` data-id="${esc(placements[0].collection.id)}"`) : "";
      return bottomSheet("idea", val(item, "title") || "Idea", `${meta}<div class="sheet-options-group sheet-action-list">${openRow || `<p class="sheet-note">You have view-only access to this trip.</p>`}</div>`);
    }
    const hasTripDates = tripDateDays().length > 0;
    const planRows = planned
      ? `${opt("open-collection", "map", "Open in plan", ideaPlacementSummary(item), ` data-id="${esc(placements[0].collection.id)}"`)}${opt("idea-return", "refresh", "Return to ideas", "Unschedule without deleting")}`
      : `${hasTripDates
          ? opt("idea-add-to-plan", "map", "Add to a day plan", "Choose a day and an optional time")
          : opt("idea-add-to-plan", "map", "Add to a day plan", "Add your trip's dates first", " disabled")}${opt("edit-idea", "edit", "Edit idea", "Name, address and notes")}`;
    const editRows = planned ? opt("edit-idea", "edit", "Edit idea", "Name, address and notes") : "";
    const body = `${meta}<div class="sheet-options-group sheet-action-list">${planRows}${editRows}</div><div class="sheet-options-group sheet-action-list sheet-action-list--danger">${opt("delete-idea", "delete", "Delete idea", "Remove it from Save for Later", "", true)}</div>`;
    return bottomSheet("idea", val(item, "title") || "Idea", body);
  }
  // The "Add to a day plan" panel (spec §7/§8/§9). Day Trip = a day of the trip.
  // Pick a day, then either drop the idea into that day's general plan (schedules
  // the activity) or group it inside a Neighborhood (a linked stop, no copy).
  function addToPlanScreen() {
    if (!state.trip) return missingDetailScreen("Add to plan", "Create or select a trip first.");
    const id = String(state.selectedId || "");
    const item = (state.timeline || []).find((it) => itemId(it) === id && isSaveForLaterItem(it));
    if (!item) return missingDetailScreen("Idea unavailable", "This idea is no longer available. It may already be on your timeline.");
    if (!canEditCurrentTrip()) return missingDetailScreen("Add to plan", "You have view-only access to this trip.");
    const days = tripDateDays();
    const selectedDay = days.includes(state.addToPlanDay) ? state.addToPlanDay : (days[0] || "");
    const timeVal = /^\d{2}:\d{2}$/.test(String(state.addToPlanTime || "")) ? state.addToPlanTime : "";
    const title = val(item, "title") || "this idea";
    const dayChips = days.length
      ? `<section class="plan-panel__section" aria-label="Choose a day"><h2>Choose a day</h2><div class="plan-day-list" role="radiogroup" aria-label="Trip days">${days.map((key, i) => {
          const lbl = moveDayLabel(key), on = key === selectedDay;
          return `<button type="button" class="plan-day-chip${on ? " is-active" : ""}" role="radio" aria-checked="${on}" data-action="plan-pick-day" data-key="${esc(key)}"><span class="plan-day-chip__dow">${esc(lbl.weekday)}</span><span class="plan-day-chip__date">${esc(lbl.date)}</span></button>`;
        }).join("")}</div></section>`
      : `<section class="plan-panel__section" aria-label="Days"><h2>Choose a day</h2><p class="plan-panel__note">This trip has no dates yet. Set the trip's dates first, then you can plan ideas onto its days.</p></section>`;
    // One optional start time, applied to the day plan.
    const timeField = days.length
      ? `<label class="plan-time-row" for="plan-time"><span class="plan-time-row__icon" aria-hidden="true">${icon("clock", 22)}</span><span class="plan-time-row__copy"><strong>Start time</strong><small>Optional — used for the day plan</small></span><input type="time" id="plan-time" name="plan-time" value="${esc(timeVal)}" data-action="plan-set-time" class="plan-time-row__input"></label>`
      : "";
    const generalRow = days.length
      ? `<button type="button" class="plan-option plan-option--general plan-option--cta" data-action="plan-general" data-id="${esc(id)}"${selectedDay ? "" : " disabled"}><span class="plan-option__icon">${icon("calendar", 22)}</span><span class="plan-option__copy"><strong>Add to the day plan</strong><small>Put it on ${esc(selectedDay ? moveDayLabel(selectedDay).date : "the day")}${timeVal ? ` at ${esc(timeVal)}` : ""}</small></span></button>`
      : "";
    const generalSection = generalRow ? `<section class="plan-panel__section" aria-label="Day plan"><h2>Add to the day</h2><div class="plan-option-list">${generalRow}</div></section>` : "";
    const body = `<section class="plan-panel__intro"><span>ADD TO PLAN</span><h1>Add ${esc(title)}</h1><p>Pick a trip day and an optional time, then add it to the day plan.</p></section>${dayChips}${timeField}${generalSection}`;
    return focusedTaskPage("Add to plan", body, "plan-panel-page");
  }
  // Schedule an idea straight onto the chosen day (the day plan): give the
  // activity a start so it moves to the main Timeline. Reuses the activities
  // PATCH; the idempotency lock stops a double-tap from firing twice.
  async function planIdeaToDay(id, dayISO, timeStr, trigger) {
    if (!id || !dayISO || planInFlight.has(id)) return;
    const item = (state.timeline || []).find((it) => itemId(it) === id && isSaveForLaterItem(it));
    if (!item) { showToast("This idea is no longer available.", "alert"); return; }
    const tz = String(val(item, "start_timezone", "startTimezone") || "") || tripDefaultTimezone() || "UTC";
    const time = /^\d{2}:\d{2}$/.test(String(timeStr || "")) ? timeStr : "09:00";
    let startsAtUtc;
    try { startsAtUtc = resolveEventLocalDateTime(`${dayISO}T${time}`, tz); }
    catch (error) { showToast(error?.message || "Could not add to that day.", "alert"); return; }
    planInFlight.add(id);
    if (trigger) trigger.disabled = true;
    try {
      const body = { kind: "activity", status: "confirmed", title: String(val(item, "title") || "Idea"), startsAtUtc, endsAtUtc: null, timezone: tz, locationId: val(item, "start_location_id", "venue_location_id") || null, activityType: val(item, "activity_type", "activityType") || null, notes: val(item, "activity_notes", "notes") || null, confidence: "confirmed", version: Number(val(item, "version")) || 1 };
      await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/activities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      await loadTripDetails();
      showToast(`${body.title} added to ${moveDayLabel(dayISO).date}.`);
      state.timelineDayKey = timelineDay(startsAtUtc, tz).key;
      route("timeline", null, true);
    } catch (error) {
      showToast(error?.message || "Could not add to that day. Try again.", "alert");
      if (trigger && document.contains(trigger)) trigger.disabled = false;
    } finally { planInFlight.delete(id); }
  }
  // Place an idea inside a neighborhood as a linked stop (link-not-copy). The
  // server dedupes a repeat link into the same neighborhood, and the in-flight
  // lock stops a double submit; offline the add is queued like any other stop.
  async function planIdeaToNeighborhood(id, collectionId, timeStr, trigger) {
    if (!id || !collectionId || planInFlight.has(id)) return;
    const item = (state.timeline || []).find((it) => itemId(it) === id && isSaveForLaterItem(it));
    const collection = collectionForItem(collectionId);
    if (!item || !collection) { showToast("This idea is no longer available.", "alert"); return; }
    if (ideaPlacements(item).some((p) => String(p.collection.id) === String(collectionId))) { showToast("Already in this neighborhood."); route("collection", collectionId, true); return; }
    const address = String(val(locationById(val(item, "start_location_id", "venue_location_id")) || {}, "local_address", "formatted_address") || "");
    const scheduledTime = /^\d{2}:\d{2}$/.test(String(timeStr || "")) ? timeStr : null;
    const body = { title: String(val(item, "title") || "Idea"), scheduledTime, timezone: val(collection, "start_timezone", "startTimezone") || tripDefaultTimezone() || "UTC", addressSnapshot: address || null, placeType: null, linkedTripItemId: id, notes: null, status: "planned" };
    const base = `/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(collectionId)}/stops`;
    planInFlight.add(id);
    if (trigger) trigger.disabled = true;
    try {
      await api(base, { method: "POST", body: JSON.stringify(body) });
      await loadTripDetails();
      showToast(`${body.title} added to ${collection.title || "the neighborhood"}.`);
      route("collection", collectionId, true);
    } catch (error) {
      if (!navigator.onLine) {
        const tempId = `local-${crypto.randomUUID()}`;
        const position = collectionStopsFor(collectionId).length;
        state.collectionStops = [...(state.collectionStops || []), { id: tempId, collection_item_id: collectionId, position, version: 1, __local: true, ...toStopRow(body) }];
        queuePendingMutation({ kind: "collection", op: "add-stop", tripId: state.trip.id, collectionId, tempId, body });
        showToast("Saved on this phone. It will sync when you reconnect.");
        route("collection", collectionId, true);
        return;
      }
      showToast(error?.message || "Could not add to that neighborhood. Try again.", "alert");
      if (trigger && document.contains(trigger)) trigger.disabled = false;
    } finally { planInFlight.delete(id); }
  }
  // Return a planned idea to Save for Later (spec §10): delete its linking stops
  // and, if it was scheduled as a general day plan, clear the day — never delete
  // the idea itself. Atomic-ish: each removal is versioned; failures surface.
  async function returnIdeaToSaveForLater(id) {
    if (!id || planInFlight.has(id)) return;
    const item = (state.timeline || []).find((it) => itemId(it) === id);
    if (!item) { showToast("This idea is no longer available.", "alert"); return; }
    const placements = ideaPlacements(item);
    const dated = (Number(val(item, "starts_at_utc", "startsAtUtc")) || null) != null;
    if (!placements.length && !dated) { showToast("This idea is already in your ideas."); return; }
    planInFlight.add(id);
    try {
      for (const p of placements) {
        const version = Number(val(p.stop, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/collections/${encodeURIComponent(p.collection.id)}/stops/${encodeURIComponent(p.stop.id)}`, { method: "DELETE", body: JSON.stringify({ version }) });
      }
      if (dated) {
        const body = { kind: "activity", status: "planned", title: String(val(item, "title") || "Idea"), startsAtUtc: null, endsAtUtc: null, timezone: null, locationId: val(item, "start_location_id", "venue_location_id") || null, activityType: val(item, "activity_type", "activityType") || null, notes: val(item, "activity_notes", "notes") || null, confidence: "estimated", version: Number(val(item, "version")) || 1 };
        await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/activities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      await loadTripDetails();
      state.saveLaterFilter = "ideas";
      showToast(`${val(item, "title") || "Idea"} returned to your ideas.`);
      route("save-later", null, true);
    } catch (error) {
      showToast(error?.message || "Could not return this idea. Try again.", "alert");
      await loadTripDetails().catch(() => {});
      render();
    } finally { planInFlight.delete(id); }
  }
  function confirmDeleteIdea(id) {
    const item = (state.timeline || []).find((it) => itemId(it) === id && isSaveForLaterItem(it));
    if (!item) return;
    if (state.sheet === "idea") { state.sheet = null; state.ideaMenu = null; render(); }
    openConfirmDialog({
      title: "Delete this idea?",
      body: `“${val(item, "title") || "Idea"}” will be removed from Save for Later. Any neighborhood it was placed in stays. This cannot be undone.`,
      onConfirm: async () => {
        const version = Number(val(item, "version")) || 1;
        await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/activities/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ version }) });
        await loadTripDetails();
        showToast("Idea deleted.");
        route("save-later", null, true);
      },
    });
  }

  function addBookingScreen() {
    if (!state.trip) return noTripQuickAdd("booking", "Add Booking");
    const bookable = Object.entries(MANUAL_BOOKING_TYPES).filter(([type]) => !BOOKING_PICKER_HIDDEN.has(type));
    // Same row language as the Day Plan screen: full-width list rows with a
    // round icon, title, hint and chevron (not the old tone-coloured 2-col grid).
    const typeRow = ([type, config]) => `<button type="button" class="day-plan-row" data-action="add-type" data-type="${esc(type)}" data-manual-label="${esc(config.label)}" aria-label="Add ${esc(config.label)}"><span class="day-plan-row__icon">${icon(config.icon,24)}</span><span class="day-plan-row__copy"><strong>${esc(config.label)}</strong><small>${esc(config.hint)}</small></span>${icon("chevron",18)}</button>`;
    // One flat list — no category headers (Getting there / around / Stay / …);
    // rows keep their definition order.
    const groupedCategories = `<div class="day-plan-list ds-grouped-card ds-grouped-card--list">${bookable.map(typeRow).join("")}</div>`;
    const secondary = (ic,title,copy,action) => `<button type="button" class="manual-add-secondary" data-action="${action}"><span>${icon(ic,20)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${icon("chevron",18)}</button>`;
    return focusedTaskPage(`Add a booking`, `<section class="day-plan-intro"><span>ADD A BOOKING</span><h1>Add a booking</h1><p>For travel you've already reserved. To plan what to see and do, use Day Plan.</p></section><div class="manual-add-groups">${groupedCategories}</div><section class="manual-add-other" aria-labelledby="manual-add-other-title"><h2 id="manual-add-other-title">Already have a confirmation?</h2>${secondary("document","Upload a file","Review a ticket or confirmation","open-upload-booking")}${secondary("mail","Forward an email","Send it to go@tripto.to","open-forward-booking")}</section>`, "v2-add-booking manual-add-page day-plan-page");
  }
  function manualBookingSheet() {
    const options = Object.entries(MANUAL_BOOKING_TYPES).filter(([type]) => !BOOKING_PICKER_HIDDEN.has(type));
    const rows = options.map(([type, config]) => sheetActionRow("add-type", config.icon, config.label, ` data-type="${esc(type)}" data-manual-label="${esc(config.label)}"`)).join("");
    return bottomSheet("manual-booking", "Add new booking", `<div data-manual-category-list>${sheetActionList(rows)}</div>`);
  }
  function documentSheet() {
    const travelers = state.travelers
        .map(
          (traveler) =>
            `<label class="traveler-pill"><input type="checkbox" name="documentTraveler" value="${esc(traveler.id)}"><span>${esc(traveler.display_name || "Traveler")}</span></label>`,
        )
        .join(""),
      form = `<form class="sheet-form document-form" id="document-form">${travelers ? `<div class="sheet-field"><label>Assign to traveler</label><div class="traveler-pills">${travelers}</div></div>` : ""}<div class="sheet-field"><label for="document-file">File</label><label class="document-file-picker" for="document-file">${icon("document",24)}<span><strong>Choose a file</strong><small>PDF, image, or Wallet pass · up to 10 MB</small></span></label><input class="sr-only" id="document-file" name="documentFile" type="file" accept="application/pdf,image/*,.pkpass" required><div class="document-file-meta" role="status">No file selected</div><div class="document-verify-state">Verification starts after you choose a file.</div></div><div class="sheet-submit">${primaryCta("Save on This Phone", "save-document", "download")}</div></form>`;
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
    const rows = shown.map((trip) => sheetActionRow("select-trip", "trips", trip.title, ` data-id="${esc(trip.id)}"${String(trip.id) === String(state.trip?.id) ? ' aria-current="true"' : ""}`, formatTripDates(trip))).join("");
    return bottomSheet("trip", "Choose trip", sheetActionList(rows));
  }
  function bookingEmailTripSheet() {
    const email = state.bookingEmails.find((row) => String(row.id) === String(state.bookingEmailSelectionId));
    const rows = state.trips.map((trip) => sheetActionRow("assign-booking-email", "trips", trip.title || "Untitled trip", ` data-email-id="${esc(email?.id || "")}" data-trip-id="${esc(trip.id)}"`, formatTripDates(trip))).join("");
    const empty = `<p class="sheet-note">Create a trip before assigning this confirmation.</p><button type="button" class="mobile-primary-action" data-action="create-trip">Create trip</button>`;
    return bottomSheet("booking-email-trip", "Choose trip", `<p class="sheet-note booking-email-trip-note">${esc(email?.subject || "Booking confirmation")}</p>${rows ? sheetActionList(rows) : empty}`);
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
    const rowLink = (ic, title, sub, href) => sheetActionLink(ic, title, sub, href);
    const rowAct = (ic, title, sub, action) => sheetActionRow(action, ic, title, "", sub);
    return bottomSheet(
      "help",
      "Help, privacy & terms",
      `${sheetActionList(`${rowAct("info", "How tripto.to works", "A quick tour of the basics", "open-first-run-how")}${rowAct("mail", "Booking email", "Forward confirmations to go@tripto.to", "booking-email-info")}${rowLink("shield", "Privacy Policy", "How your trip data is handled", "/privacy")}${rowLink("document", "Terms of Service", "The agreement for using tripto.to", "/terms")}${hasTrip ? rowAct("download", "Download support bundle", "Diagnostics for this trip — no private details", "export-support") : ""}`)}<p class="sheet-note">tripto.to Product V2</p>`,
    );
  }

  function skeletonRows(count = 4) {
    return `<div class="skeleton-list">${Array.from({ length: count }, () => `<div class="skeleton-list-row"><i></i><span><b></b><small></small></span></div>`).join("")}</div>`;
  }
  function loadingSkeleton(screen = state.screen) {
    return `<div class="thinking-stage" data-loading-screen="${esc(screen)}">${thinkingPanel("Getting things ready…")}</div>`;
  }
  function loadingScreen() {
    return `<div class="phone-app"><section class="thinking-stage thinking-stage--startup"><div class="loading-mark">tripto<span>.</span>to</div>${thinkingPanel("Opening your trips…")}</section></div>`;
  }
  function errorScreen() {
    const rejected = state.sessionRejected;
    return `<div class="phone-app"><section class="screen">${topbar()}<main class="error-state"><div class="empty-mobile-icon">${icon(rejected ? "user" : "warning", 31)}</div><h1>${rejected ? "Reconnect your account" : "Trip data could not load"}</h1><p>${esc(state.error || "An unexpected error occurred.")}</p><p class="recovery-safe">Saved trip data on this phone remains safe.</p>${state.requestId ? `<code>Request ID: ${esc(state.requestId)}</code>` : ""}${primaryCta(rejected ? "Reconnect with Google" : "Try Again", rejected ? "restart-google-sign-in" : "retry", rejected ? "user" : "refresh")}</main></section></div>`;
  }
  function googleAuthRecoveryScreen() {
    const pending = state.googleAuthHandoffStatus === "pending";
    return `<div class="phone-app"><section class="screen screen--navless google-auth-recovery">${topbar()}<main class="error-state" role="status" aria-live="polite"><div class="empty-mobile-icon">${icon(pending ? "refresh" : "warning", 31)}</div><h1>${pending ? "Finish signing in" : "Sign-in link expired"}</h1><p>${esc(state.googleAuthHandoffMessage || (pending ? "The secure sign-in handoff was interrupted." : "Please start Google sign-in again."))}</p><p class="recovery-safe">Your trips, offline files, and unsynced changes remain on this phone.</p>${primaryCta(pending ? "Try Again" : "Sign in again", pending ? "retry-google-sign-in" : "restart-google-sign-in", pending ? "refresh" : "user")}</main></section></div>`;
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
  function setSeoMeta(selector, content) {
    const node = document.head?.querySelector(selector);
    if (node && content) node.setAttribute("content", content);
  }
  function seoPageTitle() {
    const entity = routeEntityForId(state.screen, state.selectedId);
    const name = entity ? routeEntityLabel(state.screen, entity) : "";
    const labels = {
      home: "Travel planning on one calm timeline",
      trips: "Trips",
      timeline: state.trip?.title || "Trip timeline",
      planning: "Trip planning",
      collection: name || "Neighborhood plan",
      "save-later": "Save for Later",
      bookings: "Bookings",
      account: "Account",
      checklist: "To-do",
      travelers: "Travelers",
      documents: "Travel documents",
      health: "Trip health",
      "trip-options": "Trip options",
      "add-trip": "Add to trip",
      "add-booking": "Add a booking",
      "day-plan": "Day plan",
      "add-to-plan": name ? `Add ${name} to your plan` : "Add to plan",
      flight: name || "Flight details",
      hotel: name || "Stay details",
      train: name || "Train details",
      plan: name || "Plan details",
      traveler: name || "Traveler details",
    };
    return `${labels[state.screen] || "Travel planning"} · tripto.to`;
  }
  function updateSeoMeta() {
    if (!document.head) return;
    const privateRoute = state.screen !== "home" || Boolean(state.trip);
    const description = privateRoute
      ? "A private trip timeline for your bookings, plans, and travel details."
      : "tripto.to is a calm, private travel companion for organizing bookings and plans on one timeline.";
    document.title = seoPageTitle();
    setSeoMeta('meta[name="description"]', description);
    setSeoMeta('meta[name="robots"]', privateRoute ? "noindex, nofollow" : "index, follow");
    setSeoMeta('meta[property="og:title"]', document.title);
    setSeoMeta('meta[property="og:description"]', description);
    setSeoMeta('meta[property="og:url"]', `${location.origin}${location.pathname}`);
    setSeoMeta('meta[name="twitter:title"]', document.title);
    setSeoMeta('meta[name="twitter:description"]', description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${location.origin}${location.pathname}`;
  }
  function transitionRender() {
    // Route changes render immediately. The old route-enter/route-exit classes
    // had no CSS behind them, so the previous setTimeout was pure navigation
    // latency with no visible transition — removed for snappier taps.
    clearTimeout(routeTimer);
    render();
  }
  function sheetContent() {
    let html = "";
    if (state.sheet === "navigation") html += navigationSheet();
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
    if (state.sheet === "member-actions") html += collabMemberSheet();
    if (state.sheet === "currency-picker") html += currencyPickerSheet();
    if (state.sheet === "collection-stop") html += collectionStopSheet();
    if (state.sheet === "idea") html += ideaSheet();
    return html;
  }
  function renderToast() {
    const app = document.getElementById("app");
    if (!app) return;
    app.querySelector(".toast-mobile")?.remove();
    app.insertAdjacentHTML("beforeend", toast());
  }
  function render() {
    if (!app) return;
    updateSeoMeta();
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
    if (state.error) {
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
        case "add-trip":
          html = addToTripScreen();
          break;
        case "add-booking":
          html = addBookingScreen();
          break;
        case "day-plan": html = dayPlanScreen(); break;
        case "day-plan-form": html = dayPlanFormScreen(); break;
        case "save-later": html = saveLaterScreen(); break;
        case "add-to-plan": html = addToPlanScreen(); break;
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
        case "planning": html = planningScreen(); break;
        case "collection": html = collectionScreen(); break;
        case "collection-form": html = collectionFormScreen(); break;
        case "stop-form": html = stopFormScreen(); break;
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
    html = decorateScreen(html);
    html += sheetContent();
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
    const app = document.getElementById("app");
    const background = app?.querySelector(".phone-app");
    const canKeepPage = (!state.sheet || (name === "navigation" && state.sheet === "driver")) && name !== "driver" && background &&
      (name === "navigation" || (!state.loading && !state.googleAuthHandoffStatus && !state.error));
    if (!state.sheet || state.sheet === "driver")
      sheetReturnFocus = focusKeyFor(opener || document.activeElement);
    state.sheet = name;
    state.routeMotion = "";
    if (!canKeepPage) { render(); return; }
    const content = sheetContent();
    if (!content) { render(); return; }
    // Opening an overlay does not change the underlying page. Preserve its
    // DOM, scroll position, draft inputs and listeners instead of rebuilding it.
    document.documentElement.classList.remove("place-search-open");
    document.documentElement.classList.add("sheet-open");
    document.documentElement.classList.remove("fixed-screen");
    background.setAttribute("inert", "");
    background.setAttribute("aria-hidden", "true");
    background.querySelector('[data-action="open-navigation"]')?.setAttribute("aria-expanded", String(name === "navigation"));
    app.insertAdjacentHTML("beforeend", content);
    if (name === "trip-setup-ready") ensureStay22().catch(() => {});
    bindDynamic();
  }
  // Re-render only the date-range picker overlay in place, leaving the
  // underlying task page's live DOM (and any half-typed fields on it) intact.
  // Month navigation and day selection only affect the picker, so a full
  // render() — which rebuilds the whole screen from state — is both wasteful
  // and lossy for forms without draft persistence (day-plan / collection).
  function refreshDateRangeSheet() {
    const existing = document.querySelector(".full-screen-picker.date-range-screen");
    if (!existing) { render(); return; }
    const tmp = document.createElement("div");
    tmp.innerHTML = dateRangeSheet();
    const next = tmp.firstElementChild;
    if (!next) { render(); return; }
    existing.replaceWith(next);
    const focusTarget = state.dateRange?.focusDate
      ? next.querySelector(`[data-date="${state.dateRange.focusDate}"]`)
      : null;
    (focusTarget || next.querySelector(".range-days")) ?.focus?.();
  }
  function closeSheet() {
    // The navigation menu can open above any form. Closing it must not
    // rebuild the form or drop text that the user has not saved yet.
    if (state.sheet === "navigation") { closeSheetKeepPage(); return; }
    const sheet = document.querySelector(".bottom-sheet,.full-screen-picker"),
      backdrop = document.querySelector(".sheet-backdrop"),
      finish = () => {
        state.sheet = null;
        state.dateRange = null;
        state.tripSetupPreview = null;
        state.moveBooking = null;
        state.memberMenu = null;
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
  // Close an overlay while leaving the underlying task page's live DOM intact
  // (no render()). Used when the page carries state that lives only on its DOM
  // inputs — e.g. a date just applied to the day-plan / collection form, which
  // a full re-render would rebuild from stale state and drop.
  function closeSheetKeepPage() {
    const app = document.getElementById("app"),
      background = app?.querySelector(".phone-app");
    app?.querySelectorAll(".bottom-sheet,.full-screen-picker,.sheet-backdrop")
      .forEach((el) => el.remove());
    document.documentElement.classList.remove("sheet-open");
    if (background) {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
      background.querySelector('[data-action="open-navigation"]')?.setAttribute("aria-expanded", "false");
    }
    state.sheet = null;
    if (background?.querySelector(".driver-screen")) state.sheet = "driver";
    state.dateRange = null;
    state.memberMenu = null;
    restoreSheetFocus();
  }
  function setupSheet() {
    const sheet = document.querySelector(".bottom-sheet,.full-screen-picker");
    if (!sheet) return;
    const first =
      sheet.querySelector(
        '.full-screen-picker__back,.range-picker__summary,.sheet-option,input,select,button:not([data-action="close-sheet"])',
      ) || sheet;
    requestAnimationFrame(() => first.focus());
    if (!sheet.classList.contains("bottom-sheet") || sheet.dataset.dragBound) return;
    sheet.dataset.dragBound = "1";
    sheet.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button,a,input,select,textarea") ||
          !event.target.closest("[data-sheet-drag]") || sheet.scrollTop > 0)
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
    requestAnimationFrame(() => {
      if(document.activeElement!==focused)return;
      const scroller=focused.closest(".sheet-scroll,main");
      if(!scroller)return;
      const field=focused.getBoundingClientRect(),area=scroller.getBoundingClientRect(),padding=16;
      const delta=field.bottom>area.bottom-padding?field.bottom-area.bottom+padding:field.top<area.top+padding?field.top-area.top-padding:0;
      // Scroll only the form's content. scrollIntoView also scrolls the iOS
      // layout viewport, which can pull the header under Safari's toolbar.
      if(delta)scroller.scrollBy({top:delta,behavior:"auto"});
    });
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
    // Use the visible area for the app frame, including the software keyboard.
    // Pinch zoom keeps its native behavior instead of relaying out the page.
    if (!viewport || Math.abs(viewport.scale - 1) < 0.01) {
      document.documentElement.style.setProperty(
        "--app-viewport-height", `${Math.round(viewport?.height || window.innerHeight)}px`,
      );
      // iOS Safari can offset the visual viewport below the layout viewport
      // (top address bar, toolbar animation). The pinned frame is anchored to
      // the layout top, so without this compensation its header renders behind
      // the browser chrome. Shift the frame down by the offset so it always
      // tracks the visible area.
      document.documentElement.style.setProperty(
        "--app-viewport-offset", `${Math.max(0, Math.round(viewport?.offsetTop || 0))}px`,
      );

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
            type = String(manualBookingConfig(nativeForm.dataset.kind)?.documentType || "other"),
            picker = manualFiles.closest(".manual-attachments__picker"),
            submit = formSubmitButton(nativeForm);
          if (!files.length) return;
          const finishActivity = beginActivity("Preparing your files…");
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
            finishActivity();
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
      checklistAddForm.addEventListener("input", () => {
        const submit = checklistAddForm.querySelector('button[type="submit"]');
        if (submit) submit.disabled = !String(checklistAddForm.elements.title?.value || "").trim();
      });
      checklistAddForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = checklistAddForm.elements.title;
        const title = String(input?.value || "").trim();
        if (!title) { input?.focus(); return; }
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
    const collectionForm = document.getElementById("collection-form");
    if (collectionForm && !collectionForm.dataset.bound) {
      collectionForm.dataset.bound = "1";
      bindMeaningfulChanges(collectionForm);
      bindDateRangeControls(collectionForm);
      collectionForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validateFocusedForm(collectionForm)) return;
        saveCollectionForm(collectionForm);
      });
    }
    const stopForm = document.getElementById("stop-form");
    if (stopForm && !stopForm.dataset.bound) {
      stopForm.dataset.bound = "1";
      bindMeaningfulChanges(stopForm);
      stopForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validateFocusedForm(stopForm)) return;
        saveStopForm(stopForm);
      });
    }
    const dayPlanForm = document.getElementById("day-plan-form");
    if (dayPlanForm && !dayPlanForm.dataset.bound) {
      dayPlanForm.dataset.bound = "1";
      bindMeaningfulChanges(dayPlanForm);
      bindDateRangeControls(dayPlanForm);
      dayPlanForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validateFocusedForm(dayPlanForm)) return;
        saveDayPlanForm(dayPlanForm);
      });
      const dpFiles = dayPlanForm.querySelector("[data-manual-attachments]");
      if (dpFiles) {
        refreshManualAttachmentPanel(dayPlanForm, true)
          .then((record) => { if (record?.files?.length) formHasMeaningfulChanges = true; })
          .catch(() => {});
        dpFiles.addEventListener("change", async () => {
          const files = Array.from(dpFiles.files || []),
            picker = dpFiles.closest(".manual-attachments__picker"),
            submit = formSubmitButton(dayPlanForm);
          if (!files.length) return;
          const finishActivity = beginActivity("Preparing your files…");
          picker?.classList.add("is-busy");
          dpFiles.disabled = true;
          if (submit) submit.disabled = true;
          try {
            await stageManualAttachments(dayPlanForm.dataset.attachmentScope, files, { documentType: "ticket", kind: "activity", tripId: state.trip?.id || null, travelerIds: [] });
            formHasMeaningfulChanges = true;
            await refreshManualAttachmentPanel(dayPlanForm);
          } catch (error) {
            showFormSubmissionError(dayPlanForm, error?.message || "The selected files could not be prepared. Your plan details are still here.");
          } finally {
            dpFiles.disabled = false;
            dpFiles.value = "";
            finishActivity();
            picker?.classList.remove("is-busy");
            if (submit && dayPlanForm.getAttribute("aria-busy") !== "true") submit.disabled = false;
          }
        });
      }
    }
    setupSheet();
  }
  function resolveEventLocalDateTime(localValue, timeZone) {
    if (!localValue || !timeZone) throw new Error("Local time and time zone are required.");
    const match = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) throw new Error("Enter a valid local date and time.");
    try { dateFormatter("en-US", { timeZone }).format(new Date()); } catch (_) { throw new Error("Use a valid time zone, for example Europe/Rome."); }
    const target = Date.UTC(+match[1], +match[2]-1, +match[3], +match[4], +match[5]), offsets = new Set();
    for (let h=-36; h<=36; h+=3) { const instant=target+h*3600000, parts=dateFormatter("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant)), row={}; parts.forEach((part)=>{if(part.type!=="literal")row[part.type]=part.value;}); offsets.add(Math.round((Date.UTC(+row.year,+row.month-1,+row.day,+row.hour,+row.minute)-instant)/60000)); }
    const wanted=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`, candidates=[...offsets].map((offset)=>target-offset*60000).filter((instant)=>{ const parts=dateFormatter("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant)), row={}; parts.forEach((part)=>{if(part.type!=="literal")row[part.type]=part.value;}); return `${row.year}-${row.month}-${row.day}T${row.hour}:${row.minute}`===wanted; });
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
    const finishActivity = beginActivity("Saving your changes…");
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
        await saveLocalDocument(form.elements.documentFile.files?.[0],fd.get("documentType")||"other",selectedTravelerIds(fd),fd.get("relatedBooking")||null);
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
      finishActivity();
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
    const finishActivity = beginActivity("Reading your document…");
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
    } finally { finishActivity(); const target=liveForm(); if(document.contains(target)) setFormSaving(target,false); }
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
  function toggleCompletedChecklist() {
    if (!state.trip) return;
    const expanded = state.expandedChecklistTripId !== state.trip.id;
    state.expandedChecklistTripId = expanded ? state.trip.id : null;
    // Change only visibility so opening/closing completed tasks preserves
    // text in both the add field and an in-progress inline editor.
    const list = document.getElementById("checklist-completed");
    const toggle = document.getElementById("checklist-completed-toggle");
    if (list) list.hidden = !expanded;
    if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
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
    renderChecklist();
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
      renderChecklist();
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
        type = form.elements.documentType?.value || "other",
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
    "add-collection", "edit-collection", "delete-collection",
    "collection-add-place", "edit-stop", "delete-stop", "stop-move", "stop-status",
    "open-day-plan", "day-plan-type", "add-save-later", "schedule-save-later",
    "idea-add-to-plan", "plan-general", "plan-add-neighborhood",
    "plan-create-neighborhood", "idea-return", "edit-idea", "delete-idea",
  ]);
  function canManageTripRecord(trip) {
    if (!trip) return false;
    if (String(trip.id) === String(state.trip?.id)) return canManageCurrentTrip();
    const role = trip.role ? String(trip.role).toLowerCase() : null;
    return role !== "editor" && role !== "viewer";
  }
  const OWNER_ONLY_ACTIONS = new Set(["edit-trip", "delete-trip"]);
  async function handleAction(action, target, inputMethod = "pointer") {
    const finishActivity = beginActivity(actionActivityLabel(action));
    try { return await handleActionTask(action, target, inputMethod); }
    finally { finishActivity(); }
  }
  async function handleActionTask(action, target, inputMethod = "pointer") {
    if (VIEWER_BLOCKED_ACTIONS.has(action) && viewOnlyBlocked()) return;
    if (OWNER_ONLY_ACTIONS.has(action)) {
      const ownerTripId = target?.dataset?.id;
      const ownerTrip = ownerTripId ? state.trips.find((row) => String(row.id) === String(ownerTripId)) : null;
      if (!(ownerTrip ? canManageTripRecord(ownerTrip) : canManageCurrentTrip())) {
        showToast("Only the trip owner can change trip details.", "alert");
        return;
      }
    }
    switch (action) {
      case "open-navigation":
        openSheet("navigation", target);
        break;
      case "view-only-hint":
        showToast("You have view-only access to this trip.", "status");
        break;
      case "back":
        goBackFromCurrentScreen();
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
        history.replaceState(routeHistoryState("account", null, routeHistoryIndex()), "", routeUrl("account"));
        await loadApp();
        showToast("Please continue with Google again.");
        break;
      case "open-add":
        if (state.sheet) closeSheetKeepPage();
        state.error = null;
        state.googleAuthHandoffStatus = null;
        if (state.screen === "trips" || !state.trip) {
          if (formHasMeaningfulChanges && DIRTY_TASK_SCREENS.has(state.screen)) {
            requestDiscardChanges(() => handleActionTask("open-add", target, inputMethod));
            break;
          }
          state.editingEntity = null;
          route("form", "trip");
        } else {
          // The ubiquitous "+" opens the Add-to-trip hub (Add a booking, Day
          // Plan, Save for Later). Create-trip lives only on /trips and Account.
          route("add-trip");
        }
        break;
      case "open-add-booking":
        closeSheet();
        route("add-booking");
        break;
      case "open-day-plan":
        closeSheet();
        state.dayPlanContext = null;
        route("day-plan");
        break;
      case "open-save-later":
        closeSheet();
        route("save-later");
        break;
      case "day-plan-type": {
        const dpType = target.dataset.type || "";
        if (dpType === "neighborhood") {
          state.editingEntity = null;
          route("collection-form", "new:neighborhood");
        } else if (dayPlanType(dpType)) {
          state.editingEntity = null;
          state.dayPlanContext = null;
          route("day-plan-form", `new:${dpType}`);
        }
        break;
      }
      case "add-save-later": {
        const bucket = SAVE_LATER_TYPE_MAP[target.dataset.type || ""];
        state.editingEntity = null;
        state.dayPlanContext = "save-later";
        route("day-plan-form", `new:${bucket ? bucket.activityType : "idea"}`);
        break;
      }
      case "schedule-save-later":
        closeSheet();
        state.editingEntity = null;
        state.dayPlanContext = null;
        route("day-plan-form", target.dataset.id);
        break;
      case "save-later-filter":
        state.saveLaterFilter = target.dataset.filter === "planned" ? "planned" : "ideas";
        render();
        break;
      case "open-idea":
        state.ideaMenu = target.dataset.id;
        openSheet("idea", target);
        break;
      case "idea-add-to-plan":
        if (!tripDateDays().length) { showToast("Add your trip's dates first to plan ideas onto days.", "alert"); break; }
        closeSheet();
        state.ideaMenu = null;
        state.addToPlanDay = "";
        state.addToPlanTime = "";
        route("add-to-plan", target.dataset.id);
        break;
      case "plan-set-time":
        state.addToPlanTime = /^\d{2}:\d{2}$/.test(String(target.value || "")) ? target.value : "";
        break;
      case "plan-pick-day": {
        const timeInput = document.getElementById("plan-time");
        if (timeInput) state.addToPlanTime = /^\d{2}:\d{2}$/.test(String(timeInput.value || "")) ? timeInput.value : "";
        state.addToPlanDay = target.dataset.key || "";
        render();
        break;
      }
      case "plan-general": {
        const timeInput = document.getElementById("plan-time");
        const chosenTime = timeInput && /^\d{2}:\d{2}$/.test(String(timeInput.value || "")) ? timeInput.value : (state.addToPlanTime || "");
        await planIdeaToDay(target.dataset.id, state.addToPlanDay || (tripDateDays()[0] || ""), chosenTime, target);
        break;
      }
      case "plan-add-neighborhood": {
        const timeInput = document.getElementById("plan-time");
        const chosenTime = timeInput && /^\d{2}:\d{2}$/.test(String(timeInput.value || "")) ? timeInput.value : (state.addToPlanTime || "");
        await planIdeaToNeighborhood(target.dataset.id, target.dataset.collection, chosenTime, target);
        break;
      }
      case "plan-create-neighborhood":
        state.pendingPlanIdea = target.dataset.id;
        state.editingEntity = null;
        formHasMeaningfulChanges = false;
        route("collection-form", "new:neighborhood");
        break;
      case "idea-return":
        closeSheet();
        state.ideaMenu = null;
        await returnIdeaToSaveForLater(target.dataset.id);
        break;
      case "edit-idea":
        closeSheet();
        state.ideaMenu = null;
        state.editingEntity = null;
        state.dayPlanContext = "save-later";
        route("day-plan-form", target.dataset.id);
        break;
      case "delete-idea":
        if (state.sheet === "navigation") closeSheetKeepPage();
        confirmDeleteIdea(target.dataset.id);
        break;
      case "toggle-checklist":
        await toggleChecklistItem(target.dataset.id);
        break;
      case "edit-checklist":
        startEditChecklistItem(target.dataset.id);
        break;
      case "toggle-completed-checklist":
        toggleCompletedChecklist();
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
      case "open-member-actions":
        state.memberMenu = target.dataset.id || null;
        openSheet("member-actions", target);
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
        state.memberMenu = null;
        state.sheet = null;
        render();
        restoreSheetFocus();
        await updateMemberRole(target.dataset.id, target.dataset.role);
        break;
      case "member-remove":
        state.memberMenu = null;
        state.sheet = null;
        render();
        restoreSheetFocus();
        await removeMember(target.dataset.id, target.dataset.name);
        break;
      case "member-transfer":
        state.memberMenu = null;
        state.sheet = null;
        render();
        restoreSheetFocus();
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
        const min = String(target.dataset.min || ""), max = String(target.dataset.max || "");
        const seed = start || end || (min && new Date().toISOString().slice(0, 10) < min ? min : "") || new Date().toISOString().slice(0, 10);
        const clampedSeed = min && seed < min ? min : max && seed > max ? max : seed;
        state.dateRange = {
          startName,
          endName,
          formId: form.id || "",
          start,
          end,
          min,
          max,
          focusDate: clampedSeed,
          month: rangeMonthStart(clampedSeed),
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
          refreshDateRangeSheet();
        }
        break;
      case "range-month":
        if (state.dateRange) {
          state.dateRange.month = shiftRangeMonth(state.dateRange.month, Number(target.dataset.offset) || 0);
          state.dateRange.focusDate = state.dateRange.month;
          refreshDateRangeSheet();
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
          refreshDateRangeSheet();
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
        const range = state.dateRange, rangeForm = (range && range.formId && document.getElementById(range.formId)) || document.getElementById("native-form");
        if (!range || !range.start || (!range.end && !range.allowSingle) || !rangeForm) break;
        rangeForm.elements[range.startName].value = range.start;
        rangeForm.elements[range.endName].value = range.end || "";
        if (rangeForm.elements.datesSkipped) rangeForm.elements.datesSkipped.value = "";
        rangeForm.elements[range.startName].dispatchEvent(new Event("input", { bubbles:true }));
        rangeForm.elements[range.endName].dispatchEvent(new Event("input", { bubbles:true }));
        syncDateRangeField(rangeForm, range.startName, range.endName);
        saveQuickDraft(rangeForm);
        formHasMeaningfulChanges = true;
        if (rangeForm.id === "native-form") closeSheet();
        else closeSheetKeepPage();
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
      case "delete-trip": {
        closeSheet();
        const delId = target.dataset.id;
        if (delId) {
          const delTrip = state.trips.find((row) => String(row.id) === String(delId));
          confirmDeleteTrip(delTrip || state.trip, "trips");
        } else {
          confirmDeleteTrip();
        }
        break;
      }
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
        if (state.sheet === "navigation") closeSheetKeepPage();
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
      case "open-planning":
        closeSheet();
        route("planning");
        break;
      case "add-collection": {
        const type = target.dataset.collectionType;
        if (!collectionConfig(type)) break;
        state.editingEntity = null;
        formHasMeaningfulChanges = false;
        closeSheet();
        route("collection-form", `new:${type}`);
        break;
      }
      case "open-collection": {
        closeSheet();
        route("collection", target.dataset.id);
        break;
      }
      case "edit-collection": {
        if (state.sheet === "navigation") closeSheetKeepPage();
        state.editingEntity = { kind: "collection", id: target.dataset.id };
        formHasMeaningfulChanges = false;
        route("collection-form", target.dataset.id);
        break;
      }
      case "delete-collection":
        confirmDeleteCollection(target.dataset.id);
        break;
      case "collection-add-place": {
        state.editingEntity = null;
        formHasMeaningfulChanges = false;
        route("stop-form", target.dataset.id);
        break;
      }
      case "stop-menu": {
        state.stopMenu = { collectionId: target.dataset.collection, stopId: target.dataset.id };
        openSheet("collection-stop", target);
        break;
      }
      case "edit-stop": {
        state.stopMenu = null;
        closeSheet();
        state.editingEntity = { kind: "stop", id: target.dataset.id, collectionId: target.dataset.collection };
        formHasMeaningfulChanges = false;
        route("stop-form", target.dataset.collection);
        break;
      }
      case "delete-stop":
        confirmDeleteStop(target.dataset.collection, target.dataset.id);
        break;
      case "stop-move":
        await moveStop(target.dataset.collection, target.dataset.id, target.dataset.dir);
        break;
      case "stop-status":
        await setStopStatus(target.dataset.collection, target.dataset.id, target.dataset.status);
        break;
      case "manual-attachment-remove": {
        const form = target.closest("form") || document.getElementById("native-form");
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
        const form = target.closest("form") || document.getElementById("native-form");
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
        openTimelineItemDetail(target.dataset.id);
        break;
      }
      case "booking-detail": {
        openTimelineItemDetail(target.dataset.id);
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
        closeSheet();
        openTimelineItemDetail(target.dataset.id);
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
        if(await requestConfirmation({ title: "Remove local data?", body: "Remove locally stored documents and cached trip data from this phone? Your server trip will not be deleted.", confirmLabel: "Remove" })) {
          try { await clearLocalDeviceData(); showToast("Local files and cached trip data were removed from this phone."); render(); }
          catch (error) { showToast(error.message,"alert"); }
        }
        break;
      }
      case "delete-account": {
        try {
          const preview=await api("/api/v1/account/deletion-preview");
          const trips=Number(val(preview?.deletion||preview,"ownedTrips","owned_trips")||0);
          if(!await requestConfirmation({ title: "Delete your account?", body: `Permanently delete your account and ${trips} server trip${trips===1?"":"s"}? This cannot be undone.`, confirmLabel: "Delete account", confirmationText: "DELETE" })) break;
          await api("/api/v1/account",{method:"DELETE",body:JSON.stringify({confirm:"DELETE"})});
          await clearLocalDeviceData();
          localStorage.removeItem("tripto_token"); state.token=""; state.trip=null; state.trips=[];
          await loadApp(); showToast("Your account and server data were deleted.");
        } catch (error) { showToast(error.message,"alert"); }
        break;
      }
      case "sign-out": {
        const pending=pendingMutations().filter((x)=>x.status!=="done").length+Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
        if(pending&&!await requestConfirmation({ title: "Sign out with pending changes?", body: `${pending} change${pending===1?" is":"s are"} still pending. The changes and local documents will stay on this phone.`, confirmLabel: "Sign out", danger: false }))break;
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
            // Keyboard shrinks the scroller; make sure the whole editor
            // (including Save/Cancel) is scrolled above the keyboard.
            const form = field.closest("[data-note-form]");
            requestAnimationFrame(() =>
              (form || field).scrollIntoView({ block: "center", behavior: "auto" }),
            );
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
        if (state.sheet === "navigation") closeSheetKeepPage();
        const text = bookingShareText(record);
        if (navigator.share) {
          try { await navigator.share({ title: bookingRecordTitle(record), text }); }
          catch (error) { if (error?.name !== "AbortError") throw error; }
        }
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
  // Swipe-to-delete on trip rows + long-press-to-delete on the featured trip
  // cards. Both funnel into the existing owner-gated delete-trip action.
  let swipeState = null, openSwipeRow = null, lpTimer = null, lpCard = null, lpStart = null, suppressClick = false;
  function closeSwipeRow(except) {
    if (openSwipeRow && openSwipeRow !== except) { openSwipeRow.classList.remove("is-open"); openSwipeRow = null; }
  }
  function cancelLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpCard = null; lpStart = null; }
  app.addEventListener("touchstart", (event) => {
    // A fresh gesture must never inherit a stale click-suppression flag. iOS
    // Safari often omits the synthetic click after a long-press, which would
    // otherwise leave suppressClick stuck true and swallow the NEXT real tap
    // anywhere (back/close buttons included). Clearing here bounds suppression
    // to the single gesture that set it.
    suppressClick = false;
    if (event.touches.length !== 1) { swipeState = null; cancelLongPress(); return; }
    const t = event.touches[0];
    const handle = event.target.closest?.("[data-swipe-handle]");
    const wrap = handle?.closest("[data-swipe-row]");
    // Close any other open row, but never the one being tapped (e.g. its
    // revealed Delete button lives inside the same wrap and needs the click).
    const targetWrap = event.target.closest?.("[data-swipe-row]");
    if (openSwipeRow && targetWrap !== openSwipeRow) closeSwipeRow(targetWrap || null);
    if (wrap && handle) {
      swipeState = { wrap, row: handle, startX: t.clientX, startY: t.clientY, base: wrap.classList.contains("is-open") ? -96 : 0, decided: false, horizontal: false, dx: wrap.classList.contains("is-open") ? -96 : 0 };
    }
    const card = event.target.closest?.("[data-longpress-trip]");
    if (card) {
      lpCard = card; lpStart = { x: t.clientX, y: t.clientY };
      lpTimer = setTimeout(() => {
        lpTimer = null; suppressClick = true;
        try { navigator.vibrate?.(12); } catch (_) {}
        handleAction("delete-trip", card, "pointer").catch((error) => showToast(error?.message || String(error), "alert"));
      }, 550);
    }
  }, { passive: true });
  app.addEventListener("touchmove", (event) => {
    if (event.touches.length === 1 && lpTimer && lpStart) {
      const t = event.touches[0];
      if (Math.abs(t.clientX - lpStart.x) > 10 || Math.abs(t.clientY - lpStart.y) > 10) cancelLongPress();
    }
    if (!swipeState || event.touches.length !== 1) return;
    const t = event.touches[0], dx = t.clientX - swipeState.startX, dy = t.clientY - swipeState.startY;
    if (!swipeState.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeState.decided = true;
      swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      if (swipeState.horizontal) { swipeState.wrap.classList.add("is-swiping"); cancelLongPress(); }
      else { swipeState = null; return; }
    }
    if (!swipeState.horizontal) return;
    event.preventDefault();
    let x = Math.max(-112, Math.min(0, swipeState.base + dx));
    swipeState.dx = x;
    swipeState.row.style.transform = `translateX(${x}px)`;
  }, { passive: false });
  const endSwipe = () => {
    cancelLongPress();
    if (!swipeState) return;
    const s = swipeState; swipeState = null;
    s.wrap.classList.remove("is-swiping");
    s.row.style.transform = "";
    if (!s.horizontal) return;
    const open = s.dx < -48;
    s.wrap.classList.toggle("is-open", open);
    if (open) openSwipeRow = s.wrap;
    else if (openSwipeRow === s.wrap) openSwipeRow = null;
  };
  app.addEventListener("touchend", endSwipe, { passive: true });
  app.addEventListener("touchcancel", endSwipe, { passive: true });
  app.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
    const swipeHandle = event.target.closest?.("[data-swipe-handle]");
    if (swipeHandle) {
      const wrap = swipeHandle.closest("[data-swipe-row]");
      if (wrap && wrap.classList.contains("is-open")) { event.preventDefault(); event.stopPropagation(); closeSwipeRow(null); return; }
    }
    const target = event.target.closest("[data-screen],[data-action]");
    if (!target) return;
    if (target.dataset.screen) {
      if (target.tagName === "A") {
        // Retain real link behavior for a new tab / copy link. Plain taps use
        // the app router and its unsaved-change guard without a page reload.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
      }
      if (state.sheet === "navigation") {
        closeSheetKeepPage();
        const leavingRecovery = Boolean(state.error || state.googleAuthHandoffStatus);
        // Explicit navigation leaves the recovery presentation; credentials
        // and saved trip data remain owned by the existing auth/load flows.
        state.error = null;
        state.googleAuthHandoffStatus = null;
        if (target.dataset.screen === state.screen && !leavingRecovery) return;
      }
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
    input.classList.toggle("is-long", String(input.value).length > 9);
    app.querySelectorAll(".currency-quick button").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.value) === amount));
    const result = app.querySelector(".currency-result__amount"), note = app.querySelector(".currency-rate-note"), rate = currency.rate == null ? NaN : Number(currency.rate);
    if (result) {
      const converted = Number.isFinite(rate) ? amount * rate : null;
      try { result.textContent = converted == null ? "—" : new Intl.NumberFormat(undefined, { style:"currency", currency:currency.to, maximumFractionDigits:2 }).format(converted); }
      catch (_) { result.textContent = converted == null ? "—" : `${converted.toFixed(2)} ${currency.to}`; }
      result.classList.toggle("is-long", result.textContent.length > 12);
    }
    if (note) note.textContent = Number.isFinite(rate) ? `1 ${currency.from} = ${rate.toFixed(rate < 1 ? 4 : 3)} ${currency.to}` : "Update to load this rate";
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
        routeHistoryState(state.screen, state.selectedId, routeHistoryIndex()),
        "",
        routeUrl(state.screen, state.selectedId),
      );
      requestDiscardChanges(() => history.back());
      return;
    }
    const resolvedId = next.screen === "timeline" ? null : resolveRouteId(next.screen, next.id);
    if (
      state.tripsLoaded &&
      requiresResolvedRouteEntity(next.screen, next.id) &&
      !resolvedId
    ) {
      const fallback = missingEntityDestination(next.screen);
      state.screen = fallback.screen;
      state.selectedId = fallback.id;
      state.sheet = null;
      history.replaceState(
        routeHistoryState(fallback.screen, fallback.id, routeHistoryIndex()),
        "",
        routeUrl(fallback.screen, fallback.id),
      );
      transitionRender();
      maybeLoadScreenData();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
      return;
    }
    const nextId = next.screen === "timeline" ? null : resolvedId || next.id;
    if (next.screen === "timeline") applyRouteTripSelection();
    scrollPositions.set(state.screen, window.scrollY);
    if (
      next.screen !== "flight" ||
      String(next.id || "") !== String(state.selectedId || "")
    )
      state.flightDetailsOpen = false;
    if (!state.routeMotion) state.routeMotion = "back";
    state.screen = next.screen;
    state.selectedId = nextId;
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
    await flushCollectionsQueue();
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
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
  window.addEventListener("resize", syncVisualViewport);
  // The app frame is pinned and content scrolls inside <main>, so the window
  // itself must never scroll. iOS Safari still scrolls the LAYOUT viewport to
  // reveal a focused field (even with overflow:hidden), which drags the pinned
  // header up behind the top browser chrome. A one-shot reset misses the tail of
  // that animation, so keep the window snapped to 0 continuously while a field is
  // focused / the keyboard is up — that's the only time iOS forces this scroll.
  window.addEventListener("scroll", () => {
    if ((fieldFocused || keyboardOpen) && window.pageYOffset !== 0) window.scrollTo(0, 0);
  }, { passive: true });
  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.(KEYBOARD_FIELD_SELECTOR)) {
      fieldFocused = true;
      applyKeyboardState();
      setTimeout(keepFocusedFieldVisible, 80);
      // Undo any layout-viewport scroll iOS performs to reveal the field, which
      // would otherwise pull the pinned header behind the top browser chrome.
      setTimeout(() => { if (window.pageYOffset > 0) window.scrollTo(0, 0); }, 100);
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
  if (startupRoute.redirect || location.hash || history.state?.tripto !== true)
    history.replaceState(
      routeHistoryState(startupRoute.screen, startupRoute.id, 0),
      "",
      routeUrl(startupRoute.screen, startupRoute.id),
    );
  resumeGoogleRedirectSession();
})();
