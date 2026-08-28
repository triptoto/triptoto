(function () {
  "use strict";

  const API = "";
  const CACHE_PREFIX = "tripto_cache_v3:";
  const LOCAL_DOC_DB = "tripto-local-docs-v1";
  const PENDING_KEY = "tripto_pending_mutations_v1";
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
    if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    if (moduleLoaders[src]) return moduleLoaders[src];
    moduleLoaders[src] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve(globalThis[globalName]);
      el.onerror = () => {
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
    loadModule("/smart-import.js?v=product-v2-conf2", "TriptoSmartImport");
  // Warm the airport-timezone table in the background once the app is idle, so
  // the quick-add form has it ready without blocking first paint.
  (globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 1200)))(() =>
    ensureAirportTimezones().catch(() => {}),
  );
  let googleRedirectMarker = googleAuth?.redirectMarker(location) || null;

  const ICON_NAMES = Object.freeze({
    user: "user", home: "house", trips: "suitcase", plus: "plus",
    ticket: "ticket", plane: "airplane", chevron: "caret-right",
    check: "check", qr: "qr-code", hotel: "buildings", train: "train",
    star: "star", restaurant: "fork-knife", document: "file-text",
    pin: "map-pin", calendar: "calendar-blank", clock: "clock",
    night: "moon-stars", day: "sun-horizon", terminal: "air-traffic-control",
    gate: "door", seat: "armchair", chevronDown: "caret-down",
    chevronUp: "caret-up", back: "caret-left", share: "share-network",
    luggage: "suitcase", navigation: "navigation-arrow", info: "info",
    warning: "warning", download: "download-simple", car: "car",
    phone: "phone", mail: "envelope-simple", copy: "copy",
    passport: "identification-card", map: "map-trifold", close: "x",
    shield: "shield-check", refresh: "arrows-clockwise",
    edit: "pencil-simple", trash: "trash",
  });
  const INLINE_SVG = Object.freeze({
    edit: '<path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152a15.86,15.86,0,0,0-4.69,11.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM51.31,160,144,67.31,160.68,84,68,176.68ZM48,179.31,76.69,208H48Zm48,25.38L79.31,188,172,95.31,188.68,112Z"/>',
    trash: '<path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>',
    "plane-solid": { vb: "0 0 24 24", path: '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' },
    "car-solid": { vb: "0 0 24 24", path: '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>' },
    "hotel-solid": { vb: "0 0 24 24", path: '<path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/>' },
    "restaurant-solid": { vb: "0 0 24 24", path: '<path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/>' },
    "wx-sun": { vb: "0 0 24 24", path: '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="4.6"/><line x1="12" y1="19.4" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="4.6" y2="12"/><line x1="19.4" y1="12" x2="21.5" y2="12"/><line x1="5.2" y1="5.2" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="18.8" y2="18.8"/><line x1="5.2" y1="18.8" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="18.8" y2="5.2"/></g>' },
    "wx-moon": { vb: "0 0 24 24", path: '<path d="M20 14.6A8 8 0 0 1 9.4 4 6.6 6.6 0 1 0 20 14.6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    "wx-cloud": { vb: "0 0 24 24", path: '<path d="M17 18.5H7a4 4 0 0 1-.5-7.97 5.6 5.6 0 0 1 10.75-.6A3.75 3.75 0 0 1 17 18.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    "wx-cloud-sun": { vb: "0 0 24 24", path: '<g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"><circle cx="8" cy="7.5" r="2.9"/><line x1="8" y1="1.6" x2="8" y2="3"/><line x1="2.1" y1="7.5" x2="3.5" y2="7.5"/><line x1="3.8" y1="3.3" x2="4.8" y2="4.3"/><line x1="12.2" y1="3.3" x2="11.2" y2="4.3"/></g><path d="M18 20H10a3.6 3.6 0 0 1-.45-7.16 5 5 0 0 1 9.6-.55A3.35 3.35 0 0 1 18 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    "wx-cloud-rain": { vb: "0 0 24 24", path: '<path d="M17 15H7a4 4 0 0 1-.5-7.97 5.6 5.6 0 0 1 10.75-.6A3.75 3.75 0 0 1 17 15Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="18" x2="8" y2="21"/><line x1="13" y1="18" x2="12" y2="21"/><line x1="17" y1="18" x2="16" y2="21"/></g>' },
    "wx-cloud-snow": { vb: "0 0 24 24", path: '<path d="M17 15H7a4 4 0 0 1-.5-7.97 5.6 5.6 0 0 1 10.75-.6A3.75 3.75 0 0 1 17 15Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g fill="currentColor"><circle cx="9" cy="19.3" r="1.05"/><circle cx="13" cy="19.3" r="1.05"/><circle cx="17" cy="19.3" r="1.05"/></g>' },
    "wx-fog": { vb: "0 0 24 24", path: '<path d="M17 13H7a4 4 0 0 1-.5-7.97 5.6 5.6 0 0 1 10.75-.6A3.75 3.75 0 0 1 17 13Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="17" x2="16" y2="17"/><line x1="8" y1="20.5" x2="18" y2="20.5"/></g>' },
    "wx-storm": { vb: "0 0 24 24", path: '<path d="M17 14H7a4 4 0 0 1-.5-7.97 5.6 5.6 0 0 1 10.75-.6A3.75 3.75 0 0 1 17 14Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12.5 16l-3 3.6h2.4L11 23" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' },
    // Destination-flavored marks for the Trips list (solid, read well at 27px).
    "dest-mountain": { vb: "0 0 24 24", path: '<path d="M14 4l9 16H5L14 4z"/><path d="M7 12l6 8H1L7 12z"/>' },
    "dest-beach": { vb: "0 0 24 24", path: '<circle cx="12" cy="7.6" r="3.4"/><path d="M2.5 15c1.6 0 1.6 1.7 3.2 1.7S7.3 15 8.9 15s1.6 1.7 3.2 1.7S13.7 15 15.3 15s1.6 1.7 3.2 1.7 1.6-1.7 3.2-1.7v2.4c-1.6 0-1.6 1.7-3.2 1.7s-1.6-1.7-3.2-1.7-1.6 1.7-3.2 1.7S8.5 17.4 6.9 17.4 5.3 19.1 3.7 19.1 2.5 17.4 2.5 17.4z"/>' },
    "dest-monument": { vb: "0 0 24 24", path: '<path d="M12 3L2.5 7.5h19L12 3z"/><path d="M3.6 9h16.8v1.7H3.6z"/><path d="M5 11.4h2.1v7.1H5zM10.9 11.4H13v7.1h-2.1zM16.9 11.4H19v7.1h-2.1z"/><path d="M3.2 19.2h17.6V21H3.2z"/>' },
  });
  const state = {
    token: localStorage.getItem("tripto_token") || "",
    loading: true,
    offline: !navigator.onLine,
    screen: parseRoute().screen,
    selectedId: parseRoute().id,
    sheet: null,
    toast: "",
    toastKind: "status",
    error: null,
    requestId: null,
    sessionRejected: false,
    routeMotion: "forward",
    refreshingOffline: false,
    flightDetailsOpen: false,
    trips: [],
    trip: null,
    timeline: [],
    checklist: [],
    brain: null,
    impacts: [],
    transport: [],
    stays: [],
    locations: [],
    weather: null,
    weatherRefreshing: false,
    travelers: [],
    connections: [],
    health: null,
    bookingDetails: [],
    contacts: [],
    syncStatus: null,
    localDocs: [],
    account: null,
    importReview: null,
    importLocalDocumentId: null,
    importUploadRequest: null,
    imports: [],
    bookingEmails: [],
    bookingEmailSelectionId: null,
    bookingFilter: "all",
    importMode: "upload",
    manualLabel: null,
    editingEntity: null,
    formDraft: null,
    dateRange: null,
    tripsLoaded: false,
    googleAuthHandoffStatus: null,
    googleAuthHandoffMessage: "",
    theme: "harbor",
  };
  const THEMES = [
    { id: "harbor", name: "Harbor", note: "Dark navy & amber", chips: ["#0d1626", "#182338", "#f5ae41"] },
  ];
  function themeCanvasColor() {
    return "#080e1a";
  }
  function applyTheme() {
    document.documentElement.classList.add("theme-harbor");
    document.documentElement.classList.remove("theme-classic");
    state.theme = "harbor";
    try { localStorage.setItem("tripto_theme", "harbor"); } catch (_error) {}
    if (!document.documentElement.classList.contains("first-run-open")) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", themeCanvasColor());
    }
  }
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
    flight: { label: "Flight", icon: "plane", base: "flight", cta: "Add Flight", documentType: "ticket" },
    hotel: { label: "Hotel / Stay", shortLabel: "Stay", icon: "hotel", base: "hotel", cta: "Add Stay", documentType: "hotel_confirmation" },
    train: { label: "Train", icon: "train", base: "train", cta: "Add Train", documentType: "ticket" },
    "car-rental": { label: "Car Rental", icon: "car", base: "transport", subtype: "car", cta: "Add Car Rental", documentType: "reservation" },
    transfer: { label: "Transfer", icon: "navigation", base: "transport", subtype: "transfer", cta: "Add Transfer", documentType: "reservation" },
    cruise: { label: "Cruise", icon: "trips", base: "activity", subtype: "cruise", cta: "Add Cruise", documentType: "ticket" },
    ferry: { label: "Ferry", icon: "navigation", base: "train", subtype: "ferry", cta: "Add Ferry", documentType: "ticket" },
    restaurant: { label: "Restaurant", icon: "restaurant", base: "reservation", subtype: "restaurant", cta: "Add Restaurant", documentType: "reservation" },
    activity: { label: "Activity / Event", shortLabel: "Activity", icon: "star", base: "activity", subtype: "activity", cta: "Add Activity", documentType: "ticket" },
    other: { label: "Other", icon: "calendar", base: "reservation", subtype: "other", cta: "Add to Trip", documentType: "other" },
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
  function reserveManualAttachmentWindow() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) return null;
    try {
      popup.opener = null;
      popup.document.title = "Opening travel document";
      popup.document.body.textContent = "Opening travel document…";
    } catch (_) {}
    return popup;
  }
  async function openManualAttachment(scope, id, reservedWindow = null) {
    try {
      const record = await listManualAttachments(scope),
        file = (record?.files || []).find((row) => String(row.id) === String(id));
      if (!file?.blob) throw new Error("This local file is unavailable. Choose it again.");
      const url = URL.createObjectURL(file.blob);
      if (reservedWindow && !reservedWindow.closed) {
        reservedWindow.location.replace(url);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name || "travel-document";
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      try { reservedWindow?.close(); } catch (_) {}
      throw error;
    }
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
  function icon(name, size = 24, extra = "") {
    const px = Number(size) || 24;
    if (INLINE_SVG[name]) {
      const entry = INLINE_SVG[name],
        vb = typeof entry === "object" ? entry.vb : "0 0 256 256",
        path = typeof entry === "object" ? entry.path : entry;
      return `<svg aria-hidden="true" class="ph-svg${extra ? ` ${extra}` : ""}" width="${px}" height="${px}" viewBox="${vb}" fill="currentColor" style="--icon-size:${px}px">${path}</svg>`;
    }
    const glyph = ICON_NAMES[name] || "circle";
    return `<i aria-hidden="true" class="ph ph-${glyph}${extra ? ` ${extra}` : ""}" style="--icon-size:${px}px"></i>`;
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
    if (kind === "hotel") return "hotel";
    const subtype = String(val(entity || {}, "reservation_type", "activity_type", "type") || "").toLowerCase();
    if (subtype === "restaurant") return "restaurant";
    if (subtype === "transfer") return "transfer";
    if (["car_rental", "car"].includes(subtype)) return "car-rental";
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
    return `<button class="icon-button" data-action="manage-booking" data-kind="${esc(kind)}" data-id="${esc(id)}" aria-label="Edit or delete">${icon("edit", 23)}</button>`;
  }
  function bookingHeaderActions(kind, id) {
    return `<button class="icon-button" data-action="share-booking" data-kind="${esc(kind)}" data-id="${esc(id)}" aria-label="Share">${icon("share", 23)}</button>${bookingMenuButton(kind, id)}`;
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
    return bottomSheet("manage-booking", "Manage booking", `<div class="sheet-options-group sheet-options-group--v2"><button class="sheet-option" data-action="edit-booking" data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"><span class="info-icon">${icon("edit", 22)}</span><span><strong>Edit</strong><small>Update the details of this booking</small></span>${icon("chevron", 22)}</button><button class="sheet-option sheet-option--danger" data-action="delete-booking" data-kind="${esc(menu.kind)}" data-id="${esc(menu.id)}"><span class="info-icon">${icon("trash", 22)}</span><span><strong>Delete</strong><small>Remove this booking from the trip</small></span>${icon("chevron", 22)}</button></div>`);
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
  function cacheKey(path) {
    return CACHE_PREFIX + path;
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
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      render();
    }, 3600);
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
  // Map WMO weather codes (what Open-Meteo returns) to a short label + icon.
  function weatherFromCode(code, isDay) {
    const c = Number(code);
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
  let weatherInFlight = null;
  // Fetch destination weather in the background and re-render when it lands.
  // apiGet already caches per-path in localStorage, so it degrades gracefully
  // offline. Skips the network when we already have fresh data for this place.
  async function ensureWeather(force) {
    if (PREVIEW_MODE) return;
    const target = tripWeatherLocation();
    if (!target) {
      if (state.weather) { state.weather = null; render(); }
      return;
    }
    const key = target.query
      ? `q:${target.query}`
      : `c:${target.lat.toFixed(4)},${target.lon.toFixed(4)}`;
    const fresh =
      !force &&
      state.weather &&
      state.weather.key === key &&
      Date.now() - Number(state.weather.fetchedAt || 0) < 30 * 60 * 1000;
    if (fresh) return;
    if (weatherInFlight === key) return;
    weatherInFlight = key;
    const path = target.query
      ? `/api/v1/weather?q=${encodeURIComponent(target.query)}`
      : `/api/v1/weather?lat=${target.lat.toFixed(4)}&lon=${target.lon.toFixed(4)}`;
    try {
      const data = await apiGet(path);
      const wx = data?.weather;
      if (!wx || wx.temperatureC == null) return;
      const view = weatherFromCode(wx.weatherCode, wx.isDay);
      state.weather = {
        key,
        place: wx.place || target.place,
        tempC: Number(wx.temperatureC),
        label: view.label,
        iconName: view.iconName,
        daily: Array.isArray(wx.daily)
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
                };
              })
          : [],
        fetchedAt: Number(wx.fetchedAt) || Date.now(),
      };
      if (state.screen === "timeline") render();
    } catch (_error) {
      // Weather is non-essential; leave any previous value in place.
    } finally {
      weatherInFlight = null;
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
    return `<button class="primary-cta" data-action="${action}" ${attrs}><span class="cta-left">${icon(iconName, 24)}<span>${esc(label)}</span></span>${icon("chevron", 25)}</button>`;
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
      try {
        const payload = await response.json();
        message = payload.error?.message || message;
      } catch (_) {}
      throw Object.assign(new Error(message), {
        requestId,
        status: response.status,
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
    const response = await fetch(`${API}${path}`, {
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
    const url = URL.createObjectURL(row.blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
      if (QA_STATE === "email-inbox") {
        state.account = { mode: "account", user: { display_name: "Arthur", primary_email: "travelinkme@gmail.com" } };
        state.bookingEmails = [
          { id:"preview-email-1", import_id:"preview-import-1", trip_id:null, subject:"Your flight confirmation", status:"needs_trip", import_status:"needs_confirmation", candidate_count:1, candidate_type:"flight", received_at:Date.now()-120000 },
          { id:"preview-email-2", import_id:"preview-import-2", trip_id:"preview-trip", trip_title:"Rome 2026", subject:"Hotel Artemide reservation", status:"needs_confirmation", import_status:"needs_confirmation", candidate_count:1, candidate_type:"hotel", received_at:Date.now()-3600000 },
        ];
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
      if (state.account?.mode === "account") {
        if (!state.trip) {
          state.screen = "form";
          state.selectedId = "trip";
          history.replaceState(null, "", routeUrl("form", "trip"));
        } else if (["trips", "bookings"].includes(state.screen)) {
          state.screen = "timeline";
          state.selectedId = null;
          history.replaceState(null, "", routeUrl("timeline"));
        }
      }
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
    ];
  }
  function applyTripDetails(results) {
    const take = (index, key, fallback) =>
      results[index] && results[index].status === "fulfilled"
        ? (results[index].value?.[key] ?? fallback)
        : fallback;
    state.timeline = take(0, "items", []);
    state.checklist = take(1, "items", []);
    state.brain = take(2, "brain", null);
    state.impacts = take(3, "impacts", []);
    state.transport = take(4, "transport", []);
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
      state.transport = [];
      state.stays = [];
      state.locations = [];
      state.travelers = [];
      state.connections = [];
      state.health = null;
      state.bookingDetails = [];
      state.contacts = [];
      state.syncStatus = null;
      state.localDocs = [];
      return;
    }
    const tripId = state.trip.id;
    const results = await Promise.allSettled(tripDetailPaths().map(apiGet));
    // Drop the response if the user switched trips while it was in flight, so a
    // slow request can never overwrite the newly-opened trip's data.
    if (state.trip?.id !== tripId) return;
    applyTripDetails(results);
    state.localDocs = await listLocalDocs(tripId);
    if (state.trip?.id !== tripId) return;
    void ensureWeather();
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
    state.loading = true;
    render();
    try {
      await loadTripDetails();
    } finally {
      state.loading = false;
    }
    routeAfter();
  }

  function previewData() {
    const departure = Date.now() + 5 * 3600000,
      arrival = departure + 3.5 * 3600000;
    return {
      account: { mode: "guest" },
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
        { id: "termini", type: "station", display_name: "Roma Termini", station_code: "ROM", formatted_address: "Piazza dei Cinquecento, Rome", timezone: "Europe/Rome" },
        { id: "florence", type: "station", display_name: "Firenze S. M. Novella", station_code: "FIR", timezone: "Europe/Rome" },
        { id: "vatican", type: "venue", display_name: "Vatican Museums", formatted_address: "Viale Vaticano, Rome", timezone: "Europe/Rome" },
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
          id: "train", trip_item_id: "train", type: "transport", transport_type: "train", title: "Frecciarossa 9512", status: "confirmed", booking_status: "confirmed", carrier_name: "Trenitalia", service_number: "9512", departure_location_id: "termini", arrival_location_id: "florence", scheduled_departure_utc: departure + 3 * 86400000, scheduled_arrival_utc: departure + 3 * 86400000 + 5700000, departure_timezone: "Europe/Rome", arrival_timezone: "Europe/Rome", departure_platform: "8", booking_reference: "TRN48291", traveler_ids: "traveler,traveler-2",
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
          id: "activity",
          type: "activity",
          status: "confirmed",
          title: "Vatican Museums",
          subtitle: "Entrance reservation",
          starts_at_utc: departure + 86400000 + 4 * 3600000,
          start_timezone: "Europe/Rome",
          confidence: "confirmed",
          start_location_id: "vatican",
          confirmation_number: "VAT-29184",
        },
        { id: "train", type: "transport", status: "confirmed", title: "Train to Florence", subtitle: "Frecciarossa 9512", starts_at_utc: departure + 3 * 86400000, ends_at_utc: departure + 3 * 86400000 + 5700000, start_timezone: "Europe/Rome", end_timezone: "Europe/Rome", confidence: "confirmed" },
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
    return `<header class="app-header"><button class="brand" data-screen="home" aria-label="tripto.to Home">tripto<span class="brand-dot">.</span>to</button><div class="connection-state">${state.offline ? `<span class="offline-state" role="status">${icon("info", 16)} Offline</span>` : ""}<button class="header-icon" data-screen="account" aria-label="Account">${icon("user", 31)}</button></div></header>`;
  }
  function appBar(title, subtitle = "", dark = false, right = "") {
    return `<header class="app-bar ${dark ? "app-bar--dark" : ""}"><button class="icon-button" data-action="back" aria-label="Back">${icon("back", 25)}</button><div class="app-bar-title"><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div><div class="app-bar-actions">${right || ""}</div></header>`;
  }
  function bottomNav(active) {
    const rows = [
      ["trips", "trips", "Trips"],
      ["add", "plus", "Add"],
      ["account", "user", "Account"],
    ];
    const normalized = active === "account" ? "account" : "trips";
    return `<nav class="bottom-nav bottom-nav--v2" aria-label="Primary navigation">${rows.map(([screen, ic, label]) => (screen === "add" ? `<button class="nav-item nav-add" data-action="open-add" aria-label="Add"><span>${icon(ic, 24)}</span></button>` : `<button class="nav-item ${normalized === screen ? "active" : ""}" data-screen="${screen}" ${normalized === screen ? 'aria-current="page"' : ""}>${icon(ic, 23)}<span>${label}</span></button>`)).join("")}</nav>`;
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
    return `<section class="next-action-card ${view.setup ? "next-action-card--setup" : ""}"><span class="ticket-chip ${view.setup ? "ticket-chip--setup" : ""}">${icon(view.icon, 18)} ${esc(view.label)}</span><h2>${esc(view.title)}</h2><p>${esc(view.copy)}</p><div class="next-action-actions"><button class="secondary-cta ${view.setup ? "next-action-primary" : ""}" data-action="open-add">${icon("plus", 19)} Add booking</button><button class="secondary-cta" data-screen="trips">${icon("trips", 19)} Timeline</button></div></section>`;
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

  function flightPass(flight, detailVariant = false) {
    const route = flightRoute(flight),
      detail = primaryFlightDetail(flight),
      departure = flightDeparture(flight),
      arrival = flightArrival(flight),
      departureZone = val(flight, "departure_timezone", "start_timezone"),
      arrivalZone = val(flight, "arrival_timezone", "end_timezone"),
      terminal = val(flight, "departure_terminal"),
      gate = val(flight, "departure_gate", "gate"),
      seat = val(detail, "seat"),
      cabin = val(detail, "cabin_class"),
      status = statusText(
        val(flight, "booking_status", "status") || "scheduled",
      ),
      confirmed = status === "Confirmed",
      document = boardingDocumentFor(flight),
      duration =
        departure && arrival ? durationLabel(arrival - departure) : "",
      action = document ? "boarding-pass" : "add-boarding-pass",
      actionLabel = document ? "Open Boarding Pass" : "Add Boarding Pass",
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

    const routeMarkup = `<div class="flight-pass__route"><div class="flight-pass__airport"><div class="flight-pass__airport-code">${esc(fromCode)}</div><span class="flight-pass__airport-name">${esc(route.fromName)}</span></div><div class="flight-pass__route-center"><div class="flight-pass__route-line">${icon("plane", 22)}</div>${duration ? `<span class="flight-pass__duration">${icon("clock", 14)} ${esc(duration)}</span>` : ""}</div><div class="flight-pass__airport flight-pass__airport--right"><div class="flight-pass__airport-code">${esc(toCode)}</div><span class="flight-pass__airport-name">${esc(route.toName)}</span></div></div>`;
    const header = `<div class="flight-pass__header"><span class="flight-pass__pill">${icon("plane", 22)} ${esc(displayedFlightNumber)}</span><div class="flight-pass__status ${confirmed ? "is-confirmed" : ""}"${detailVariant ? ` role="status" aria-label="${esc(status)}. Scheduled booking data is never presented as live."` : ""}><strong>${confirmed ? checkDot() : ""}${esc(status)}</strong><small>Scheduled data</small></div>${detailVariant ? `<span class="flight-pass__status-chevron" aria-hidden="true">${icon("chevron", 22)}</span>` : ""}</div>`;
    const primaryAction = primaryCta(
      actionLabel,
      action,
      "qr",
      `data-id="${esc(actionId)}"`,
    );

    if (!detailVariant) {
      return `<section class="flight-pass flight-pass--home" aria-label="Next scheduled flight"><i class="flight-pass__notch flight-pass__notch--left" aria-hidden="true"></i><i class="flight-pass__notch flight-pass__notch--right" aria-hidden="true"></i><div class="flight-pass__inner">${header}${routeMarkup}<div class="flight-pass__divider"></div><div class="flight-pass__facts"><div class="flight-pass__fact"><span>Departure</span><strong>${esc(formatTime(departure, departureZone))}</strong>${departureDay ? `<small>${esc(departureDay)}</small>` : ""}</div><div class="flight-pass__fact"><span>Terminal</span><strong>${esc(terminal || "—")}</strong>${terminal ? "<small>Departure</small>" : ""}</div><div class="flight-pass__fact"><span>Seat</span><strong>${esc(seat || "—")}</strong>${cabin ? `<small>${esc(cabin)}</small>` : ""}</div></div><div class="flight-pass__actions flight-pass__actions--single">${primaryAction}</div></div></section>`;
    }

    return `<section class="flight-pass flight-pass--detail" aria-label="Scheduled flight details"><i class="flight-pass__notch flight-pass__notch--left" aria-hidden="true"></i><i class="flight-pass__notch flight-pass__notch--right" aria-hidden="true"></i><div class="flight-pass__inner">${header}${routeMarkup}<div class="flight-pass__divider"></div><div class="flight-pass__times" aria-label="Scheduled departure and arrival in event-local time"><div class="flight-pass__time"><span class="flight-pass__event-icon">${icon("night", 25)}</span><span class="flight-pass__time-copy"><span>Departs</span><strong>${esc(formatTime(departure, departureZone))}</strong>${departureDay ? `<small>${esc(departureDay)} · Local time</small>` : ""}</span></div><div class="flight-pass__time-separator"></div><div class="flight-pass__time flight-pass__time--right"><span class="flight-pass__time-copy"><span>Arrives</span><strong>${esc(formatTime(arrival, arrivalZone))}</strong>${arrivalDay ? `<small>${esc(arrivalDay)} · Local time</small>` : ""}</span><span class="flight-pass__event-icon flight-pass__event-icon--day">${icon("day", 25)}</span></div></div><div class="flight-pass__divider flight-pass__divider--facts"></div><div class="flight-pass__facts"><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("terminal", 23)}</span><span class="flight-pass__fact-copy"><span>Terminal</span><strong>${esc(terminal || "—")}</strong><small>${terminal ? "Departure" : "Not assigned"}</small></span></div><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("gate", 23)}</span><span class="flight-pass__fact-copy"><span>Gate</span><strong>${esc(gate || "—")}</strong><small>${gate ? "Departure" : "Not assigned"}</small></span></div><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("seat", 23)}</span><span class="flight-pass__fact-copy"><span>Seat</span><strong>${esc(seat || "—")}</strong>${seat ? (cabin ? `<small>${esc(cabin)}</small>` : "") : "<small>Not assigned</small>"}</span></div></div><div class="flight-pass__actions">${primaryAction}<button class="flight-pass__secondary" data-action="directions-flight" data-id="${esc(itemId(flight))}">${icon("navigation", 18)}<span>Directions</span></button></div></div></section>`;
  }

  function flightTicket(flight) {
    return flightPass(flight, false);
  }
  function genericNextCard(item) {
    const type = timelineType(item),
      starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
      zone = val(item, "start_timezone", "startTimezone");
    return `<section class="next-action-card"><span class="ticket-chip">${icon(timelineIcon(type), 18)} What’s next</span><h2>${esc(item.title || "Next plan")}</h2><p>${esc(item.subtitle || statusText(item.status))}</p><div class="next-action-time">${esc(formatTime(starts, zone))}</div><p>${esc(formatDateTime(starts, zone))}</p><div class="next-action-actions"><button class="secondary-cta" data-action="timeline-detail" data-id="${esc(itemId(item))}">${icon("info", 19)} Details</button><button class="secondary-cta" data-action="directions-item" data-id="${esc(itemId(item))}">${icon("navigation", 19)} Directions</button></div></section>`;
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
    return `<div class="empty-mobile"><div class="empty-mobile-icon">${icon("trips", 31)}</div><h1>Your first trip starts here</h1><p>Create a trip, then add transport, stays and documents.</p>${primaryCta("Create a Trip", "create-trip", "plus")}</div>`;
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
        !["tour"].includes(state.screen),
    );
  }
  function syncFirstRunPresentation(active) {
    document.documentElement.classList.toggle("first-run-open", active);
    document.documentElement.classList.toggle(
      "first-run-reduced-motion",
      active && LOCAL_QA_MODE && QA_STATE === "empty-reduced-motion",
    );
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", active ? "#0a1020" : themeCanvasColor(state.theme));
  }
  function firstRunProductPreview() {
    const previewRows = [
      ["plane-solid", "Thu, Aug 28 · 09:20", "Tel Aviv → Rome", "LY 383 · Terminal 3"],
      ["car-solid", "14:10", "Airport transfer", "FCO → Hotel Artemide"],
      ["hotel-solid", "15:00", "Hotel Artemide", "Check-in · 4 nights"],
      ["restaurant-solid", "20:00", "Roscioli", "Dinner reservation"],
    ];
    return `<section class="first-run-preview" aria-label="Example trip timeline">${previewRows.map(([iconName, time, title, detail]) => `<div class="first-run-preview__event"><span class="first-run-preview__marker">${icon(iconName, 22)}</span><span class="first-run-preview__copy"><small>${esc(time)}</small><strong>${esc(title)}</strong><span>${esc(detail)}</span></span></div>`).join("")}</section>`;
  }
  function firstRunScreen() {
    const offline = state.offline
      ? `<span class="first-run-offline" role="status">${icon("info", 14)} Offline</span>`
      : "";
    const googleAction = PREVIEW_MODE
      ? `<button class="first-run-google-preview" data-action="preview-google" aria-label="Sign in with Google"><img src="/assets/google-g.svg" alt=""><span>Sign in with Google</span></button>`
      : `<div id="google-signin-button" aria-label="Sign in with Google"></div>`;
    const entryAction = state.account?.mode === "account"
      ? `<button class="first-run-google-preview" data-action="enter-app" aria-label="Continue to your trips"><span>Continue to your trips</span></button>`
      : googleAction;
    return `<div class="phone-app"><section class="first-run-screen welcome-v2 screen--navless" aria-labelledby="first-run-title"><header class="first-run-brand-row"><div class="first-run-brand" role="img" aria-label="tripto.to">tripto<span>.</span>to</div>${offline}</header><main class="first-run-main"><section class="first-run-hero"><span class="first-run-kicker">Quiet Journey</span><h1 id="first-run-title">All your trip.<br><span class="first-run-title__muted">One calm timeline.</span></h1><p>We turn your bookings into a single, easy-to-follow journey.</p></section>${firstRunProductPreview()}<div class="first-run-actions welcome-v2__actions"><span class="first-run-actions__fade" aria-hidden="true"></span><div class="first-run-google">${entryAction}</div><p class="signin-error" role="alert" hidden></p><button class="first-run-secondary" data-action="open-first-run-how"><span>Take a tour</span>${icon("chevron", 18)}</button></div><footer class="welcome-v2__footer"><a href="/privacy">Privacy</a><span aria-hidden="true"></span><a href="/terms">Terms</a></footer></main></section></div>`;
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
    const content = groups.length
      ? groups
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
                    subtitle =
                      item.subtitle ||
                      (transport
                        ? `${locationLabel(val(transport, "departure_location_id"))} → ${locationLabel(val(transport, "arrival_location_id"))}`
                        : statusText(item.status)),
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
                    aria = [eventTime, title, subtitle, exception?.label]
                      .filter(Boolean)
                      .join(". ");
                  return `<button type="button" class="journey-event journey-event--${phase}${exception ? ` journey-event--${esc(exception.tone)}` : ""}" data-action="timeline-detail" data-id="${esc(itemId(item))}" aria-label="${esc(aria)}"${active || next ? ' aria-current="step"' : ""}><span class="journey-time">${esc(eventTime)}</span><span class="journey-track" aria-hidden="true"><span class="journey-marker">${icon(timelineIcon(type), 24)}</span></span><span class="journey-content"><span class="journey-copy">${flags ? `<span class="timeline-flags">${flags}</span>` : ""}<strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><span class="journey-chevron" aria-hidden="true">${icon("chevron", 19)}</span></span></button>`;
                })
                .join("")}</div></section>`,
          )
          .join("")
      : `<div class="timeline-empty">${emptySetup ? '<span class="timeline-empty__eyebrow">Start building</span>' : ""}<span class="timeline-empty__icon">${icon(emptySetup ? "plus" : "calendar", 30)}</span><h1>No plans yet</h1><p>Add your first flight, stay, train, or activity.</p>${emptySetup ? `<div class="timeline-empty__actions"><button class="primary-cta timeline-empty__add" data-action="open-add-booking"><span>Add booking</span>${icon("plus",18)}</button><button class="text-action timeline-empty__skip" data-screen="trips">Skip for now</button></div>` : primaryCta("Add booking", "open-add", "plus")}</div>`;
    const headerAction = `<div class="trip-v2-actions">${emptySetup
      ? ""
      : `<button class="icon-button" data-screen="documents" aria-label="Tickets and documents">${icon("document",18)}</button>`}<button class="icon-button" data-action="edit-trip" aria-label="Edit trip details">${icon("edit",18)}</button></div>`;
    const header = `<header class="trip-v2-header"><button class="trip-v2-selector" data-action="switch-trip" aria-label="Switch trip"><strong>${esc(state.trip.title || "Trip")}</strong>${icon("chevronDown",15)}<small>${esc(formatTripDates(state.trip))}</small></button>${headerAction}</header>`;
    return `<div class="phone-app"><section class="screen timeline-screen">${header}${mobileAlert()}<main class="timeline-page ${groups.length ? "timeline-page--journey" : "timeline-page--empty"}">${emptySetup ? "" : timelineContextCard()}${content}</main>${bottomNav("timeline")}</section></div>`;
  }

  function timelineContextCard() {
    if (isEmptyTripSetup()) return "";
    const next = nextItem();
    if (next) {
      const starts = Number(val(next,"starts_at_utc","startsAtUtc")) || null,
        zone = val(next,"start_timezone","startTimezone"),
        active = starts != null && starts <= Date.now() && Number(val(next,"ends_at_utc","endsAtUtc") || starts) > Date.now();
      if (active || (starts != null && starts - Date.now() <= 6 * 60 * 60 * 1000))
        return `<section class="timeline-context timeline-context--next"><span>${active ? "Now" : "Next"}</span><h2>${esc(next.title || "Next plan")}</h2><p>${esc(starts ? `${formatTime(starts,zone)} · ${next.subtitle || statusText(next.status)}` : next.subtitle || "Time unavailable")}</p><button data-action="timeline-detail" data-id="${esc(itemId(next))}">Open${icon("chevron",17)}</button></section>`;
    }
    const wx = state.weather;
    if (wx && wx.tempC != null) {
      const days = Array.isArray(wx.daily) ? wx.daily.slice(0, 5) : [];
      const strip = days
        .map(
          (day, i) =>
            `<div class="timeline-context__wx-day"><span>${esc(i === 0 ? "Today" : day.weekday || "")}</span>${icon(day.iconName, 20)}<strong>${esc(day.hi)}°</strong></div>`,
        )
        .join("");
      return `<section class="timeline-context timeline-context--weather"><button class="timeline-context__wx-now timeline-context__wx-refresh${state.weatherRefreshing ? " is-refreshing" : ""}" data-action="refresh-weather" aria-label="Refresh weather"${state.weatherRefreshing ? " disabled" : ""}>${icon("refresh", 22)}</button><div class="timeline-context__wx-forecast">${strip}</div></section>`;
    }
    const start = val(state.trip,"starts_on","startsOn");
    if (start) {
      const days = Math.ceil((new Date(`${start}T00:00:00`).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 14)
        return `<section class="timeline-context timeline-context--prepare"><span>${days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} to go`}</span><h2>Before you go</h2><p>Keep tickets and confirmations available on this device.</p><button data-screen="documents">Review documents${icon("chevron",17)}</button></section>`;
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
      };
    } catch (_) {
      return { key: "unavailable", weekday: "Date", date: "Unavailable" };
    }
  }

  function timelineException(item) {
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
        flight: "plane",
        plane: "plane",
        air: "plane",
        train: "train",
        rail: "train",
        ferry: "navigation",
        boat: "navigation",
        ship: "navigation",
        cruise: "navigation",
        bus: "car",
        coach: "car",
        shuttle: "car",
        car: "car",
        car_rental: "car",
        taxi: "car",
        transfer: "car",
        transport: "car",
        hotel: "hotel",
        stay: "hotel",
        lodging: "hotel",
        accommodation: "hotel",
        activity: "star",
        attraction: "star",
        tour: "star",
        event: "star",
        reservation: "restaurant",
        restaurant: "restaurant",
        dining: "restaurant",
        ticket: "ticket",
        generic_ticket: "ticket",
        document: "document",
      }[String(type || "").toLowerCase()] || "calendar"
    );
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
        ? `<section class="flight-more flight-more--pass"><button type="button" class="flight-more__toggle" id="${disclosureButtonId}" data-action="toggle-flight-details" aria-expanded="${state.flightDetailsOpen}" aria-controls="${disclosureId}"><span>Flight details</span><span class="flight-more__chevron" aria-hidden="true">${icon(state.flightDetailsOpen ? "chevronUp" : "chevronDown", 18)}</span></button><div class="flight-more-content${state.flightDetailsOpen ? " is-open" : ""}" id="${disclosureId}" role="region" aria-labelledby="${disclosureButtonId}"${state.flightDetailsOpen ? "" : " hidden"}><dl>${disclosureRows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></div></section>`
        : "";
    return `<div class="phone-app"><section class="screen dark-detail flight-detail-screen">${appBar("Flight Detail", "", true, bookingHeaderActions("flight", itemId(flight)))}<main class="detail-content ${state.flightDetailsOpen ? "detail-content--expanded" : ""}"><div class="flight-detail-stack ${state.flightDetailsOpen ? "is-expanded" : ""}">${flightPass(flight, true)}${doc ? "" : `<div class="missing-document-state flight-pass__missing" role="status">${icon("warning", 18)} No checksum-verified boarding pass is stored on this phone.</div>`}${disclosure}</div>${linkedBookingDocumentRows(flight)}</main>${bottomNav("bookings")}</section></div>`;
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
    const contactRows = `${val(contact, "phone") ? `<a class="hotel-info-row" href="tel:${esc(contact.phone)}" aria-label="Call hotel at ${esc(contact.phone)}"><span class="hotel-info-row__icon">${icon("phone", 20)}</span><span>${esc(contact.phone)}</span>${icon("chevron", 18)}</a>` : ""}${val(contact, "email") ? `<a class="hotel-info-row" href="mailto:${encodeURIComponent(contact.email)}" aria-label="Email hotel at ${esc(contact.email)}"><span class="hotel-info-row__icon">${icon("mail", 20)}</span><span>${esc(contact.email)}</span>${icon("chevron", 18)}</a>` : ""}${confirmation ? `<button class="hotel-info-row" data-action="copy" data-value="${esc(confirmation)}" aria-label="Copy hotel confirmation number ${esc(confirmation)}"><span class="hotel-info-row__icon">${icon("copy", 20)}</span><span><small>Confirmation</small><strong>${esc(confirmation)}</strong></span>${icon("copy", 18)}</button>` : ""}`,
      statusIcon =
        statusTone === "confirmed"
          ? icon("check", 14)
          : statusTone === "cancelled"
            ? icon("close", 14)
            : statusTone === "attention"
              ? icon("warning", 14)
              : icon("info", 14);
    return `<div class="phone-app"><section class="screen hotel-detail-screen">${appBar("Hotel", "", false, bookingHeaderActions("hotel", itemId(stay)))}<div class="hotel-hero ${imageUrl ? "hotel-hero--image" : "hotel-hero--fallback"}" role="img" aria-label="${imageUrl ? "Hotel property image" : "Hotel image unavailable; showing a generic local hotel-room fallback"}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="" class="hotel-hero-image" loading="lazy" decoding="async">` : ""}<span class="hotel-hero-scrim" aria-hidden="true"></span>${state.offline ? `<span class="hotel-offline-badge" role="status">${icon("info", 15)} Offline · saved details</span>` : ""}</div><main class="hotel-sheet"><header class="hotel-heading"><div class="hotel-title-row"><h1>${esc(val(stay, "property_name", "title") || "Stay")}</h1><span class="hotel-status hotel-status--${statusTone}">${statusIcon}<span>${esc(statusLabel)}</span></span></div>${roomName ? `<p>${esc(roomName)}</p>` : ""}</header><section class="hotel-stats" aria-label="Stay dates"><div><span>Check-in</span><strong>${esc(formatTripBoundDate(val(stay, "check_in_date"), state.trip))}</strong><small>${esc(val(stay, "check_in_from") || "Time unavailable")}</small></div><div><span>Check-out</span><strong>${esc(formatTripBoundDate(val(stay, "check_out_date"), state.trip))}</strong><small>${esc(val(stay, "check_out_by") || "Time unavailable")}</small></div><div><span>Nights</span><strong>${esc(nights(stay))}</strong></div></section><div class="hotel-actions"><button class="hotel-action hotel-action--primary" data-action="directions-hotel" data-id="${esc(itemId(stay))}"${directionsDisabled ? " disabled" : ""}>${icon("navigation", 18)}<span>Directions</span></button><button class="hotel-action" data-action="show-driver" data-id="${esc(itemId(stay))}"${driverDisabled ? " disabled" : ""}>${icon("car", 18)}<span>Show to Driver</span></button></div><section class="hotel-location" aria-label="Hotel location"><button class="hotel-address-row" data-action="directions-hotel" data-id="${esc(itemId(stay))}"${directionsDisabled ? " disabled" : ""} aria-label="${address ? `Open directions to ${esc(address)}` : "Hotel address unavailable"}"><span class="hotel-address-row__icon">${icon("pin", 21)}</span><span>${esc(address || "Location unavailable")}</span>${directionsDisabled ? "" : icon("chevron", 18)}</button>${hasCoordinates ? `<button class="hotel-map-panel" data-action="directions-hotel" data-id="${esc(itemId(stay))}" aria-label="Open hotel location in Maps"><span class="hotel-map-panel__marker">${icon("pin", 22)}</span><span class="hotel-map-panel__copy"><strong>Saved location</strong><small>Open in Maps</small></span></button>` : ""}</section>${contactRows ? `<section class="hotel-contact-list" aria-label="Hotel contact and confirmation">${contactRows}</section>` : ""}${linkedBookingDocumentRows(stay)}</main>${bottomNav("bookings")}</section></div>`;
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
        return `<button class="document-row" data-action="open-document" data-id="${esc(document.id)}"><span class="document-row__icon ${document.type === "hotel_confirmation" ? "purple" : document.type === "boarding_pass" ? "green" : ""}">${icon(document.type === "boarding_pass" ? "qr" : document.type === "hotel_confirmation" ? "hotel" : "document", 24)}</span><span class="document-row__copy"><strong>${esc(document.name || docTypeLabel(document.type))}</strong><small>${esc(travelerNames || document.subtitle || docTypeLabel(document.type))}</small><span class="document-row__status ${integrity === "verified" ? "is-ready" : "is-warning"}">${integrity === "verified" ? icon("check", 14) : icon("warning", 14)} ${esc(status)}</span></span>${icon("chevron", 20, "chevron")}</button>`;
      })
      .join("");
    const verified = state.localDocs.filter((document) => document.integrity === "verified").length;
    return mobilePage("Documents", `<header class="screen-intro"><span class="screen-intro__icon">${icon("document", 26)}</span><div><h1>Your travel documents</h1><p>${verified} of ${state.localDocs.length} ready offline on this phone</p></div></header><section class="mobile-group"><h2>Saved documents</h2><div class="document-list">${rows || `<div class="mobile-empty mobile-empty--compact"><span class="mobile-empty__icon">${icon("document", 30)}</span><h1>No offline documents</h1><p>Add a ticket, boarding pass, or confirmation.</p></div>`}</div></section><button class="mobile-primary-action" data-action="document-sheet">${icon("plus", 20)} Add Document</button>`, "bookings");
  }

  function mobilePage(title, body, active = "trips", right = "", extraClass = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen ${esc(extraClass)}">${appBar(title, "", false, right)}${mobileAlert()}<main class="mobile-page">${body}</main>${bottomNav(active)}</section></div>`;
  }
  function focusedTaskPage(title, body, className = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen focused-task ${esc(className)}">${appBar(title)}${mobileAlert()}<main class="focused-page">${body}</main></section></div>`;
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
    return ({ Current: "navigation", Upcoming: "calendar", Past: "clock", Cancelled: "close" })[label] || "trips";
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
  function tripListScreen() {
    if (!state.trips.length) return mobilePage("Trips", `<section class="mobile-empty"><span class="mobile-empty__icon">${icon("luggage", 30)}</span><h1>No trips yet</h1><p>Create your first trip and keep everything in one place.</p>${primaryCta("Create trip", "create-trip", "plus")}</section>`, "trips");
    const filter = state.tripFilter || null,
      pageTitle = filter === "upcoming" ? "Upcoming trips" : filter === "past" ? "Past trips" : "Trips",
      visibleGroups = filter === "upcoming" ? ["Current", "Upcoming"] : filter === "past" ? ["Past"] : null;
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
      return `<section class="mobile-group trip-group"><h2>${label}</h2><div class="mobile-list">${trips.map((trip) => `<button class="trip-row ${label === "Current" ? "is-current" : ""}" data-action="open-trip" data-id="${esc(trip.id)}"><span class="trip-row__mark">${icon(bucketMarkIcon(label), 22)}</span><span class="trip-row__copy"><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small></span>${icon("chevron", 18, "chevron")}</button>`).join("")}</div></section>`;
    }).join("");
    const body = content || `<section class="mobile-empty mobile-empty--compact"><span class="mobile-empty__icon">${icon(filter === "past" ? "clock" : "trips", 30)}</span><h1>No ${filter === "past" ? "past" : "upcoming"} trips</h1><p>${filter === "past" ? "Completed trips will appear here." : "Trips you have coming up will appear here."}</p></section>`;
    return mobilePage(pageTitle, body, "trips", "", "trips-bg-screen");
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
    return mobilePage("Bookings", `<div class="segmented-control" role="group" aria-label="Filter bookings">${filters.map(([key,label]) => `<button data-action="filter-bookings" data-filter="${key}" class="${state.bookingFilter === key ? "is-active" : ""}" aria-pressed="${state.bookingFilter === key}">${label}</button>`).join("")}</div><section class="mobile-group booking-trip-group"><h2>${esc(state.trip?.title || "Current trip")}</h2><div class="travel-list">${list || `<section class="mobile-empty mobile-empty--compact"><h1>No bookings here</h1><p>Add transport, a stay, or a plan.</p></section>`}</div></section><button class="mobile-secondary-action" data-action="open-add">${icon("plus", 20)} Add booking</button>`, "bookings", `<button class="icon-button" data-action="open-add" aria-label="Add booking">${icon("plus", 23)}</button>`);
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
    const facts = [
      [ferry ? "Pier / berth" : "Platform", val(train, "departure_platform", "platform")],
      [ferry ? "Cabin" : "Coach", val(detail, "coach")],
      ["Seat", val(detail, "seat")],
      ["Booking", val(train, "booking_reference")],
    ].filter(([, value]) => value);
    return mobilePage(
      ferry ? "Ferry Detail" : "Train Detail",
      `<section class="journey-pass journey-pass--train"><header><span>${icon(transportIconName, 20)} ${esc(val(train, "carrier_name") || (ferry ? "Ferry" : "Train"))}</span><strong>${statusText(val(train, "booking_status", "status") || "confirmed")}</strong><small>Scheduled data</small></header><div class="journey-route"><div><strong>${esc(val(from, "station_code", "iata_code") || "—")}</strong><span>${esc(val(from, "display_name") || "Origin unavailable")}</span></div><span class="journey-route__line">${icon(transportIconName, 25)}</span><div><strong>${esc(val(to, "station_code", "iata_code") || "—")}</strong><span>${esc(val(to, "display_name") || "Destination unavailable")}</span></div></div><div class="journey-times"><div><span>Departs</span><strong>${esc(formatTime(dep, val(train, "departure_timezone")))}</strong><small>${esc(formatDay(dep, val(train, "departure_timezone")))}</small></div><div><span>Arrives</span><strong>${esc(formatTime(arr, val(train, "arrival_timezone")))}</strong><small>${esc(formatDay(arr, val(train, "arrival_timezone")))}</small></div></div><dl class="journey-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${doc ? primaryCta("Open Ticket", "open-document", "ticket", `data-id="${esc(doc.id)}"`) : `<div class="inline-recovery">${icon("warning", 18)}<span><strong>Ticket not saved offline</strong><small>Add a verified ticket before travel.</small></span></div><button class="mobile-secondary-action" data-action="add-document">${icon("plus", 18)} Add ticket</button>`}<button class="mobile-secondary-action" data-action="directions-item" data-id="${esc(itemId(train))}">${icon("navigation", 18)} Directions to ${ferry ? "port" : "station"}</button></section>${linkedBookingDocumentRows(train)}`,
      "bookings",
      bookingHeaderActions(kind, itemId(train)),
    );
  }
  function selectedPlan() {
    const wanted = String(state.selectedId || "");
    return (
      state.timeline.find((row) => itemId(row) === wanted) ||
      state.transport.find((row) => itemId(row) === wanted) ||
      null
    );
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
    const primary = [
      doc
        ? primaryCta(
            "Open Ticket",
            "open-document",
            "ticket",
            `data-id="${esc(doc.id)}"`,
          )
        : "",
      location
        ? primaryCta(
            "Directions",
            "directions-item",
            "navigation",
            `data-id="${esc(itemId(item))}"`,
          )
        : "",
      !doc && !location && val(contact, "phone")
        ? primaryCta(
            "Call",
            "call",
            "phone",
            `data-value="${esc(contact.phone)}"`,
          )
        : "",
    ].join("");
    const confirmation = val(
        item,
        "booking_reference",
        "confirmation_number",
        "reservation_reference",
        "reference",
      ),
      notes = val(
        item,
        "activity_notes",
        "reservation_notes",
        "notes",
      ),
      kind =
        transportKind ||
        val(item, "activity_type", "reservation_type", "type") ||
        "Plan",
      title = val(item, "carrier_name", "title") || statusText(kind),
      locationName = val(
        location,
        "display_name",
        "formatted_address",
      ),
      endLocationName = val(
        endLocation,
        "display_name",
        "formatted_address",
      );
    return mobilePage(
      `${statusText(kind)} Detail`,
      `<section class="plan-hero"><span class="plan-hero__icon">${icon(timelineIcon(timelineType(item)), 28)}</span><span>${esc(statusText(kind))}</span><h1>${esc(title)}</h1><p>${esc(formatDateTime(startsAt, timezone))}</p></section><section class="detail-list">${locationName ? `<div class="detail-row detail-row--static"><span>${icon("pin", 20)}</span><span><small>${endLocationName ? "From" : "Location"}</small><strong>${esc(locationName)}</strong></span></div>` : ""}${endLocationName ? `<div class="detail-row detail-row--static"><span>${icon("navigation", 20)}</span><span><small>To</small><strong>${esc(endLocationName)}</strong></span></div>` : ""}${confirmation ? `<button class="detail-row" data-action="copy" data-value="${esc(confirmation)}"><span>${icon("copy", 20)}</span><span><small>Confirmation</small><strong>${esc(confirmation)}</strong></span>${icon("copy", 18)}</button>` : ""}${val(contact, "phone") ? `<button class="detail-row" data-action="call" data-value="${esc(contact.phone)}"><span>${icon("phone", 20)}</span><span><small>Contact</small><strong>${esc(val(contact, "display_name") || contact.phone)}</strong></span>${icon("chevron", 18)}</button>` : ""}</section>${primary}${linkedBookingDocumentRows(item)}${notes ? `<details class="mobile-disclosure"><summary>Notes ${icon("chevronDown", 18)}</summary><p>${esc(notes)}</p></details>` : ""}`,
      "bookings",
      bookingHeaderActions(transportKind || String(val(item, "type") || "plan"), itemId(item)),
    );
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
    return `<div class="phone-app"><section class="screen ready-screen">${appBar("Ready Offline", "", false, `<button class="icon-button" data-action="offline-info" aria-label="Offline information">${icon("info", 23)}</button>`)}<section class="offline-summary ${allReady ? "offline-summary--ready" : "offline-summary--attention"}"><span class="offline-summary-icon">${icon(allReady ? "check" : "warning", 27)}</span><span class="offline-summary-copy"><strong>${ready} of ${rows.length} ready</strong><span>${allReady ? "Your essentials are saved on this phone." : `${rows.length - ready} item${rows.length - ready === 1 ? "" : "s"} need attention before offline use.`}</span></span></section><main class="list-stack ready-list">${rows.map((row) => `<div class="info-card ${row.ready ? "" : "needs-attention"}"><span class="info-icon">${icon(row.icon, 22)}</span><span class="info-copy"><strong>${esc(row.title)}</strong><span>${esc(row.subtitle)}</span></span><span class="info-status ${row.ready ? "" : "warning"}" aria-label="${row.ready ? "Ready" : esc(row.status)}">${row.ready ? checkDot() : `${esc(row.status)} ${icon("warning", 17)}`}</span></div>`).join("")}</main><div class="download-action">${allReady ? `<button class="secondary-cta offline-refresh ${state.refreshingOffline ? "is-loading" : ""}" data-action="refresh-data" ${state.refreshingOffline ? "disabled aria-busy=\"true\"" : ""}>${icon("refresh", 20)} ${state.refreshingOffline ? "Refreshing…" : "Refresh Offline Data"}</button>` : primaryCta("Download Missing Items", "fix-offline", "download")}</div>${bottomNav("trips")}</section></div>`;
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
    return `<div class="phone-app"><section class="screen">${appBar("Trip Health", "", false, `<button class="icon-button" data-action="health-info" aria-label="Trip Health information">${icon("info", 23)}</button>`)}<div class="health-summary"><div class="health-shield ${shieldClass} ${setup ? "setup" : ""}">${icon(issues.length ? "warning" : setup ? "plus" : top.kind === "good" ? "check" : "info", 34)}</div><h1>${esc(top.title)}</h1><p>${esc(top.subtitle)}</p></div><main class="list-stack">${rows}${setup ? "" : `<button class="secondary-cta" data-action="recalculate-health">${icon("refresh", 20)} Recalculate Trip Health</button>`}</main>${bottomNav("home")}</section></div>`;
  }
  function checklistScreen() {
    const groups = [["Documents", "documents"], ["Before You Leave", "before_you_leave"], ["Packing", "packing"]],
      rows = state.checklist || [];
    const content = groups.map(([label,key]) => {
      const items = rows.filter((item) => String(val(item,"category","group") || "packing").toLowerCase().replace(/\s+/g,"_") === key);
      if (!items.length) return "";
      return `<section class="mobile-group checklist-group"><h2>${label}</h2><div class="mobile-list">${items.map((item) => { const traveler = state.travelers.find((t)=>String(t.id)===String(val(item,"traveler_id"))); const completed = Boolean(val(item,"completed")); return `<label class="checklist-row ${completed ? "is-complete" : ""}"><input type="checkbox" data-action="toggle-checklist" data-id="${esc(item.id)}" data-version="${esc(item.version || 1)}" ${completed ? "checked" : ""}><span class="checklist-box">${icon("check",18)}</span><span class="checklist-copy"><strong>${esc(val(item,"title") || "Travel item")}</strong>${traveler ? `<small>${esc(traveler.display_name)}</small>` : ""}${val(item,"due_at_utc") ? `<small>Due ${esc(formatDateTime(Number(item.due_at_utc),val(item,"timezone")))}</small>` : ""}</span>${["critical","high"].includes(String(val(item,"priority"))) ? `<em>${esc(statusText(item.priority))}</em>` : ""}${val(item,"completion_source") === "system" ? `<span class="auto-badge">Automatic</span>` : ""}</label>`; }).join("")}</div></section>`;
    }).join("");
    return mobilePage("Smart Essentials", `<section class="essentials-summary"><span>${icon("check",26)}</span><div><strong>${rows.filter((x)=>x.completed).length} of ${rows.length} complete</strong><small>Highest-priority travel essentials</small></div></section>${content || `<section class="mobile-empty"><h1>No essentials yet</h1><p>Add only what matters for this trip.</p></section>`}<button class="mobile-secondary-action" data-action="open-form" data-form="checklist">${icon("plus",19)} Add essential</button>`, "trips");
  }
  function travelerDocumentSummary(traveler) {
    const docs = state.localDocs.filter((d)=>d.integrity==="verified" && d.travelerIds?.includes(String(traveler.id))).length;
    return docs ? `${docs} verified document${docs===1?"":"s"}` : "No verified documents";
  }
  function travelersScreen() {
    const rows = state.travelers.map((traveler)=>{ const assigned = bookingRows().filter(({item})=>String(val(item,"traveler_ids")||"").split(",").includes(String(traveler.id))).length; return `<button class="travel-row traveler-row" data-screen="traveler" data-id="${esc(traveler.id)}"><span class="traveler-avatar">${esc(String(val(traveler,"display_name")||"T").slice(0,1).toUpperCase())}</span><span class="travel-row__body"><strong>${esc(val(traveler,"display_name") || "Traveler")}</strong><small>${esc(statusText(val(traveler,"traveler_type") || "Traveler"))} · ${assigned} booking${assigned===1?"":"s"}</small><em>${esc(travelerDocumentSummary(traveler))}</em></span>${icon("chevron",20)}</button>`; }).join("");
    return mobilePage("Travelers", `<div class="travel-list">${rows || `<section class="mobile-empty"><h1>No travelers yet</h1><p>Add a traveler to assign bookings and documents correctly.</p></section>`}</div><button class="mobile-secondary-action" data-action="open-form" data-form="traveler">${icon("plus",19)} Add traveler</button>`, "account");
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
      ? `<section class="forward-booking-address"><span>${icon("mail",24)}</span><div><strong>go@tripto.to</strong><small>Forward from your verified Google email. If more than one trip could match, we will ask you to choose.</small></div></section><label><span>Paste confirmation for immediate review</span><textarea name="body" rows="7" placeholder="Paste the forwarded confirmation email"></textarea></label>`
      : `<label class="smart-import-file"><span>Booking document</span><input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.eml,.docx,.ics,.pkpass,application/pdf,image/*,text/plain,message/rfc822,text/calendar"><small>Best accuracy: the original PDF, .eml, .ics, or .pkpass. Photos and screenshots are read with OCR and may need corrections. · 10 MB max</small></label>`;
    return focusedTaskPage(forward ? "Forward Confirmation" : "Upload Booking", `<section class="form-intro smart-import-intro"><span>${icon(forward ? "mail" : "document",28)}</span><h1>${forward ? "Forward a confirmation" : "Upload a booking"}</h1><p>${forward ? "Only verified senders are accepted. We extract possible booking details, then you choose the trip and confirm before anything is added." : "Recognition stays on this phone. Review every field before saving."}</p></section><form class="mobile-form import-form" id="import-form" novalidate>${control}<p class="form-error" hidden></p><div class="form-save-bar"><button class="mobile-primary-action" type="submit">${icon(forward ? "mail" : "document",19)} Review recognized fields</button></div></form>${forward?`<button class="mobile-secondary-action import-history-action" data-screen="booking-email-inbox">${icon("mail",19)} Open Email Inbox</button>`:`<button class="mobile-secondary-action import-history-action" data-screen="import-history">${icon("clock",19)} Import History</button>`}`, "import-task");
  }
  function importReviewScreen() {
    const candidates = state.importReview?.candidates || [];
    const duplicate=Boolean(state.importReview?.duplicate);
    const emptyWarnings=(!candidates.length&&Array.isArray(state.importReview?.warnings))?state.importReview.warnings:[];
    const emptyBlock=`<section class="mobile-empty"><h1>No booking candidates</h1><p>This format could not be imported safely. Add the booking manually instead.</p>${emptyWarnings.length?`<div class="review-warnings">${emptyWarnings.map((w)=>`<p>${icon("warning",15)} ${esc(w)}</p>`).join("")}</div>`:""}</section>`;
    return focusedTaskPage("Import Review", `<form id="import-review-form" class="import-review-form"><section class="review-summary ${duplicate?"review-summary--duplicate":""}"><span>${icon(duplicate?"warning":"check",25)}</span><div><strong>${duplicate?"Possible duplicate":"Review before adding"}</strong><small>${duplicate?"This document was imported before. Review the existing import or add another copy intentionally.":"Nothing is added until you confirm."}</small></div></section>${candidates.map((c)=>reviewCandidate(c,duplicate)).join("") || emptyBlock}</form>`, "import-review-task");
  }

  function reviewCandidate(c,duplicate){const payload=c.payload||{},type=val(c,"candidate_type","type")||"reservation",warnings=payload.warnings||c.warnings||[],confidence=Number(c.confidence||0),ignored=new Set(["warnings","fieldMeta","documentKind","filename","checksum"]),fields=new Map(Object.entries(payload).filter(([key,value])=>!ignored.has(key)&&(typeof value==="string"||typeof value==="number")));for(const key of reviewRequiredFields(type))if(!fields.has(key))fields.set(key,"");const control=([key,value])=>{const date=key.endsWith("LocalDatetime"),tz=key.toLowerCase().includes("timezone");return `<label><span>${esc(statusText(key.replace(/([A-Z])/g," $1")))}</span><input type="${date?"datetime-local":"text"}" name="field-${esc(c.id)}-${esc(key)}" value="${esc(value)}" data-field-name="${esc(key)}" ${tz?'placeholder="Europe/Rome"':""}></label>`;};return `<section class="review-card"><header><span class="review-type">${icon(transportIcon(type),19)} ${esc(statusText(type))}</span><span class="travel-state ${confidence<.7?"travel-state--attention":""}">${confidence<.7?"Check carefully":"Recognized"}</span></header>${warnings.length?`<div class="review-warnings">${warnings.map((w)=>`<p>${icon("warning",15)} ${esc(w)}</p>`).join("")}</div>`:""}<label><span>Booking type</span><select name="field-${esc(c.id)}-candidateType">${["flight","hotel","train","car","transfer","ferry","activity","restaurant","reservation","generic_ticket"].map(x=>`<option value="${x}" ${x===type?"selected":""}>${esc(statusText(x))}</option>`).join("")}</select></label><div class="review-fields">${[...fields].map(control).join("")}</div><div class="review-actions">${duplicate?`<button type="button" class="mobile-secondary-action" data-action="add-duplicate-import" data-id="${esc(c.id)}">Add anyway</button>`:`<button type="button" class="mobile-primary-action" data-action="confirm-import" data-id="${esc(c.id)}">Confirm and Import</button>`}<button type="button" class="text-action" data-action="reject-import" data-id="${esc(c.id)}">Reject</button></div></section>`;}
  function reviewRequiredFields(type){if(type==="flight")return["airlineCode","flightNumber","departureIata","arrivalIata","departureLocalDatetime","departureTimezone","arrivalLocalDatetime","arrivalTimezone"];if(type==="hotel")return["propertyName","checkInDate","checkOutDate"];return["title"];}
  function importHistoryScreen() {
    const rows = (state.imports || []).map((row)=>`<button class="travel-row" data-action="review-import" data-id="${esc(row.id)}"><span class="travel-row__icon">${icon(timelineIcon(row.candidate_type),20)}</span><span class="travel-row__body"><strong>${esc(row.subject || statusText(row.candidate_type || "Booking"))}</strong><small>${esc(row.created_at ? formatDateTime(Number(row.created_at)) : "Date unavailable")}</small><em class="travel-state ${row.status==="imported"?"":"travel-state--attention"}">${esc(row.status==="imported"?"Imported":"Needs confirmation")}</em></span>${icon("chevron",18)}</button>`).join("");
    return mobilePage("Import History", `<div class="travel-list">${rows || `<section class="mobile-empty"><h1>No imports yet</h1><p>Forwarded bookings you review will appear here.</p></section>`}</div><button class="mobile-secondary-action" data-screen="import">${icon("plus",19)} Import booking</button>`, "account");
  }
  function bookingEmailDisplayStatus(row) {
    const importStatus=String(val(row,"import_status")||""), status=String(row.status||"");
    if (["completed","partial"].includes(importStatus)) return importStatus === "completed" ? "Added" : "Partly added";
    if (status === "needs_trip") return "Choose trip";
    if (status === "needs_confirmation" || importStatus === "needs_confirmation") return "Review details";
    if (status === "rejected") return "Dismissed";
    return "Couldn’t read";
  }
  function bookingEmailInboxScreen() {
    const signedIn=state.account?.mode === "account";
    const rows=(state.bookingEmails||[]).map((row)=>{
      const status=bookingEmailDisplayStatus(row), needsTrip=row.status==="needs_trip", reviewable=Boolean(row.import_id)&&["needs_trip","needs_confirmation"].includes(String(row.status)), done=["completed","partial"].includes(String(val(row,"import_status")||""));
      const action=needsTrip?"choose-booking-email-trip":reviewable?"review-booking-email":!done&&row.status!=="rejected"?"dismiss-booking-email":"", actionLabel=needsTrip?"Choose trip":reviewable?"Review":"Dismiss";
      return `<article class="booking-email-row"><span class="booking-email-row__icon">${icon(timelineIcon(row.candidate_type||"reservation"),20)}</span><div class="booking-email-row__body"><strong>${esc(row.subject||"Booking confirmation")}</strong><small>${esc(row.trip_title?`${row.trip_title} · ${row.received_at?formatDateTime(Number(row.received_at)):"Date unavailable"}`:(row.received_at?formatDateTime(Number(row.received_at)):"Date unavailable"))}</small><em class="travel-state ${done?"":"travel-state--attention"}">${esc(status)}</em></div>${action?`<button type="button" class="booking-email-row__action" data-action="${action}" data-id="${esc(row.id)}">${esc(actionLabel)} ${action==="dismiss-booking-email"?"":icon("chevron",17)}</button>`:""}</article>`;
    }).join("");
    const content=!signedIn?`<section class="mobile-empty booking-email-empty"><span>${icon("mail",30)}</span><h1>Sign in to use booking email</h1><p>Google verifies which email address is allowed to send confirmations.</p><button class="mobile-primary-action" data-screen="account">Sign in with Google</button></section>`:rows||`<section class="mobile-empty booking-email-empty"><span>${icon("mail",30)}</span><h1>No forwarded confirmations</h1><p>Forward a booking email from your verified Google address. It will appear here for review.</p></section>`;
    return mobilePage("Email Inbox", `<section class="booking-email-address"><small>Forward confirmations to</small><strong>go@tripto.to</strong><p>We never add a booking until you choose its trip and confirm the extracted details.</p></section><div class="booking-email-list">${content}</div>${signedIn?`<button class="mobile-secondary-action" data-action="refresh-booking-email-inbox">${icon("refresh",18)} Refresh inbox</button>`:""}`, "account");
  }
  async function openBookingEmailReview(email) {
    if (!email?.import_id || !email?.trip_id) throw new Error("Choose a trip before reviewing this confirmation.");
    const trip=state.trips.find((row)=>String(row.id)===String(email.trip_id));
    if (!trip) throw new Error("The assigned trip is unavailable.");
    state.trip=trip;
    localStorage.setItem("tripto_selected_trip",trip.id);
    if (PREVIEW_MODE) {
      state.importReview={import:{id:email.import_id,trip_id:trip.id,status:"needs_confirmation"},candidates:[{id:"preview-email-candidate",candidate_type:email.candidate_type||"flight",confidence:.82,payload:{airlineCode:"LY",flightNumber:"383",departureIata:"TLV",arrivalIata:"FCO",warnings:["Confirm event-local dates and times."]}}]};
    } else {
      await loadTripDetails();
      state.importReview=await api(`/api/v1/trips/${encodeURIComponent(trip.id)}/imports/${encodeURIComponent(email.import_id)}`);
    }
    route("import-review",email.import_id);
  }
  function syncScreen() {
    const pending = Number(val(state.syncStatus,"pendingOperations","pending_operations")||0) + pendingMutations().filter((x)=>x.status!=="done").length, conflicts = Number(val(state.syncStatus,"openConflicts","open_conflicts")||0), last = val(state.syncStatus,"lastSuccessfulSyncAt","last_successful_sync_at");
    return focusedTaskPage("Pending Changes", `<section class="sync-summary ${conflicts?"has-conflict":""}"><span>${icon(conflicts?"warning":"refresh",27)}</span><div><strong>${conflicts ? `${conflicts} change${conflicts===1?"":"s"} need review` : pending ? `${pending} change${pending===1?"":"s"} waiting` : "Everything is synced"}</strong><small>${last ? `Last synced ${ageLabel(Number(last))}` : "Last sync time unavailable"}</small></div></section>${conflicts ? `<section class="recovery-card"><h2>Changes requiring review</h2><p>A newer saved version exists. Nothing was overwritten.</p><button class="mobile-primary-action" data-action="sync-review">Review Conflict</button></section>` : ""}${pending ? `<section class="recovery-card"><h2>Pending local changes</h2><p>Your changes remain safely on this phone until sync succeeds.</p><button class="mobile-secondary-action" data-action="sync-retry">${icon("refresh",19)} Retry</button></section>` : ""}`, "sync-task");
  }
  function accountScreen() {
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
    const upcoming = state.trips.filter((trip)=>!["completed","archived","cancelled"].includes(String(val(trip,"lifecycle_state","lifecycleState")||"upcoming"))).length,
      past = state.trips.length - upcoming,
      identityEmail = state.account?.user?.primary_email || identity?.email || "Google identity";
    const themePicker = "";
    const pendingEmails=(state.bookingEmails||[]).filter((row)=>["needs_trip","needs_confirmation"].includes(String(row.status))).length;
    return `<div class="phone-app"><section class="screen mobile-v1-screen account-v2">${appBar("Account")}<main class="account-section mobile-page"><div class="account-card"><div class="account-profile"><div class="avatar">${esc(initials)}</div><div class="account-profile__id"><strong>${esc(name)}</strong><div class="account-meta">${mode === "account" ? esc(identityEmail) : "Sign in to keep your trips"}</div></div>${mode === "account" ? `<button class="account-signout-btn" data-action="sign-out">Sign out</button>` : ""}</div></div>${authBlock}<div class="section-label">My trips</div>${row("trips","Upcoming trips",`${upcoming} trip${upcoming===1?"":"s"}`,"","open-upcoming-trips")}${row("clock","Past trips",`${past} trip${past===1?"":"s"}`,"","open-past-trips")}${row("trips","Switch trip",`${state.trips.length} available`,"","switch-trip")}${themePicker}<div class="section-label">Booking email</div>${row("mail","Email Inbox",mode === "account" ? pendingEmails?`${pendingEmails} waiting for review`:"Forward to go@tripto.to" : "Sign in to verify a sender","booking-email-inbox")}<div class="section-label">Preferences</div>${row("refresh","Pending changes",pending?`${pending} waiting for review or sync`:"Everything is synced","sync")}${row("info","Take the tour","How tripto.to works","","open-first-run-how")}${row("info","Help, privacy & terms","Support and legal information","","open-help")} <div class="account-footer-brand"><button class="account-brand" data-screen="home" aria-label="Open welcome screen">tripto<span>.</span>to</button><p class="app-version">Product V2</p></div></main>${bottomNav("account")}</section></div>`;
  }

  let googleScriptPromise=null,googleRedirectExchangePromise=null;
  function loadGoogleIdentityScript(){if(globalThis.google?.accounts?.id)return Promise.resolve();if(googleScriptPromise)return googleScriptPromise;googleScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client?hl=en";script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error("Google sign-in could not load."));document.head.appendChild(script);});return googleScriptPromise;}
  async function setupGoogleSignIn(){const container=document.getElementById("google-signin-button");if(!container||container.dataset.ready)return;container.dataset.ready="1";try{if(!googleAuth)throw new Error("Google sign-in could not load.");const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||"";const challenge=await api("/api/v1/auth/google/challenge",{method:"POST",body:"{}"});await loadGoogleIdentityScript();const initializeOptions=googleAuth.buildInitializeOptions(challenge,navigator,location.origin);if(initializeOptions.ux_mode==="popup")initializeOptions.callback=async response=>{try{const result=await api("/api/v1/auth/google",{method:"POST",body:JSON.stringify({credential:response.credential,challengeId:challenge.challengeId,nonce:challenge.nonce,timezone:timezone||null})});state.token=result.session.token;localStorage.setItem("tripto_token",state.token);await loadApp();showToast("Signed in with Google.");}catch(error){const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error.message;}}};globalThis.google.accounts.id.initialize(initializeOptions);globalThis.google.accounts.id.renderButton(container,googleAuth.buildButtonOptions(challenge,navigator,location.origin));container.dataset.rendered="1";}catch(error){const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error?.status>=500?"Google sign-in is not configured for this environment yet.":error.message;}}}
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
      if(result?.ok)showToast("Signed in with Google.");
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
      popup = document.createElement("div");
    popup.className = "place-suggestions";
    popup.id = listId;
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-label", input.dataset.placeLabel || "Places");
    popup.hidden = true;
    input.insertAdjacentElement("afterend", popup);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");
    let results = [], active = -1, request = 0, timer = 0;
    const snapshot = selectedPlaceForInput(input);
    if (snapshot) input.dataset.selectedValue = input.value;
    const close = () => {
      popup.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const open = () => {
      popup.hidden = false;
      input.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => popup.scrollIntoView({ block:"nearest" }));
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
      input.dataset.selectedValue = value;
      input.dataset.placeId = place.id;
      hidden.value = JSON.stringify(place);
      hidden.dispatchEvent(new Event("input", { bubbles:true }));
      setManualTimezoneFallback(form, input, false);
      syncQuickTimezone(form, input);
      input.dispatchEvent(new Event("change", { bubbles:true }));
      close();
      input.focus({ preventScroll:true });
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
        const secondary = place.type === "airport"
          ? [place.cityName, place.countryName].filter(Boolean).join(" · ")
          : [place.region, place.countryName].filter(Boolean).join(" · ");
        return `<button type="button" class="place-option" id="${listId}-${index}" role="option" aria-selected="false" data-place-index="${index}"><span class="place-option__kind" aria-hidden="true">${icon(place.type === "airport" ? "plane" : "pin", 19)}</span><span class="place-option__copy"><strong>${esc(place.name)}</strong><small>${esc(secondary || place.displayName)}</small></span>${place.iata ? `<b class="place-option__code">${esc(place.iata)}</b>` : `<em class="place-option__type">City</em>`}</button>`;
      }).join("");
      open();
    };
    const search = async () => {
      const query = input.value.trim(), ownRequest = ++request;
      if (query.length < 2) { close(); return; }
      popup.innerHTML = `<div class="place-loading" role="status"><span class="button-spinner" aria-hidden="true"></span>Searching saved places…</div>`;
      open();
      try {
        const places = await ensurePlacesProvider(), offlineRows = await places.provider.searchPlaces(query, { types, preferredType, limit:8 }),
          rows = [...savedPlaceResults(query, types), ...offlineRows].filter((place, index, all) => all.findIndex((row) => row.id === place.id || (row.iata && row.iata === place.iata)) === index).slice(0, 8);
        if (ownRequest === request) renderResults(rows);
      } catch (_) {
        if (ownRequest !== request) return;
        popup.innerHTML = `<div class="place-empty place-empty--error" role="status"><strong>Place search is unavailable</strong><span>You can retry or continue by entering the location yourself.</span><div><button type="button" data-place-retry>Try again</button><button type="button" data-place-manual>Enter manually</button></div></div>`;
        open();
      }
    };
    const queueSearch = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(search, 70);
    };
    input.addEventListener("input", () => {
      if (input.dataset.selectedValue !== input.value) {
        const hidden = form.elements[`${input.name}Place`];
        if (hidden) hidden.value = "";
        delete input.dataset.placeId;
        delete input.dataset.selectedValue;
      }
      queueSearch();
    });
    input.addEventListener("focus", queueSearch);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (popup.hidden) queueSearch();
        else setActive(active + (event.key === "ArrowDown" ? 1 : -1));
        event.preventDefault();
      } else if (event.key === "Enter" && !popup.hidden && active >= 0 && results[active]) {
        event.preventDefault();
        choose(results[active]);
      }
    });
    input.addEventListener("blur", () => window.setTimeout(() => {
      if (!popup.contains(document.activeElement)) close();
    }, 100));
    popup.addEventListener("pointerdown", (event) => event.preventDefault());
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
        if (hidden) hidden.value = "";
        setManualTimezoneFallback(form, input, true);
        close();
        input.focus();
      }
    });
  }
  function dateRangeField(startName, endName, label, startLabel, endLabel, startValue = "", endValue = "") {
    const fieldId = `range-${startName}-${endName}`;
    return `<fieldset class="date-range-field form-field--wide" id="${fieldId}"><legend>${esc(label)}</legend><input class="date-range-input" type="hidden" name="${esc(startName)}" id="form-${esc(startName)}"${startValue ? ` value="${esc(startValue)}"` : ""}><input class="date-range-input" type="hidden" name="${esc(endName)}" id="form-${esc(endName)}"${endValue ? ` value="${esc(endValue)}"` : ""}><button class="date-range-trigger" type="button" data-action="open-date-range" data-start-name="${esc(startName)}" data-end-name="${esc(endName)}" data-range-title="${esc(label)}" data-start-label="${esc(startLabel)}" data-end-label="${esc(endLabel)}" aria-label="${esc(label)}. Choose ${esc(startLabel.toLowerCase())} and ${esc(endLabel.toLowerCase())}" aria-describedby="${fieldId}-status"><span class="date-range-trigger__icon">${icon("calendar", 21)}</span><span class="date-range-trigger__copy"><small>Select dates</small><strong>Choose dates</strong></span>${icon("chevron", 18)}</button><span class="sr-only" id="${fieldId}-status" aria-live="polite">No date range selected.</span></fieldset>`;
  }
  function syncDateRangeField(form, startName, endName) {
    const start = form?.elements[startName], end = form?.elements[endName];
    if (!start || !end) return;
    const field = start.closest(".date-range-field"), trigger = field?.querySelector(".date-range-trigger"), status = field?.querySelector('[aria-live="polite"]');
    if (!trigger) return;
    const copy = trigger.querySelector(".date-range-trigger__copy");
    if (start.value && end.value) {
      copy.innerHTML = `<small>Selected dates</small><strong>${esc(formatDateOnly(start.value))} – ${esc(formatDateOnly(end.value))}</strong>`;
      trigger.classList.add("is-selected");
      trigger.setAttribute("aria-label", `${field.querySelector("legend")?.textContent || "Dates"}. ${formatDateOnly(start.value)} to ${formatDateOnly(end.value)}`);
      if (status) status.textContent = `Selected range: ${formatDateOnly(start.value)} to ${formatDateOnly(end.value)}.`;
    } else {
      const startLabel = trigger.dataset.startLabel || "Start date", endLabel = trigger.dataset.endLabel || "End date";
      copy.innerHTML = `<small>Select dates</small><strong>Choose dates</strong>`;
      trigger.classList.remove("is-selected");
      trigger.setAttribute("aria-label", `${field.querySelector("legend")?.textContent || "Dates"}. Choose ${startLabel.toLowerCase()} and ${endLabel.toLowerCase()}`);
      if (status) status.textContent = "No date range selected.";
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
      return `<div class="date-suggestions" aria-label="Date suggestions"><button type="button" data-action="apply-trip-dates" data-start="${esc(start)}" data-end="${esc(end)}">Use trip dates</button></div>`;
    const target = kind === "activity" || kind === "reservation" ? `${kind}Date` : "departureDate",
      chips = [["Use trip start date", start], ["Use trip end date", end]].filter(([, value]) => value);
    return chips.length ? `<div class="date-suggestions" aria-label="Date suggestions">${chips.map(([label, value]) => `<button type="button" data-action="apply-date-suggestion" data-field="${target}" data-value="${esc(value)}">${esc(label)}</button>`).join("")}</div>` : "";
  }
  function noTripQuickAdd(kind, title) {
    return focusedTaskPage(title, `<section class="quick-no-trip"><span>${icon("trips", 30)}</span><h1>Choose a trip first</h1><p>This ${esc(kind)} needs a trip so it cannot become an orphan booking.</p><div class="quick-trip-list">${state.trips.map((trip) => `<button type="button" data-action="select-trip-for-add" data-id="${esc(trip.id)}"><span><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small></span>${icon("chevron", 19)}</button>`).join("")}</div><button class="mobile-primary-action" type="button" data-action="create-trip">Create trip</button></section>`, "form-screen quick-add-screen");
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
    const fields = kind === "trip"
      ? `<div class="form-fields trip-create-fields">${mappedFields[0]}<input type="hidden" name="destinationPlace" value="">${dateRangeField("startsOn", "endsOn", "Travel dates", "Start date", "End date", tripStart, tripEnd)}${mappedFields[3]}</div>`
      : `<div class="form-fields">${mappedFields.join("")}</div>`;
    const editAttrs=editingTraveler?` data-edit-id="${esc(editingTraveler.id)}" data-edit-version="${esc(editingTraveler.version||1)}"`:editingTrip?` data-edit-id="${esc(editingTrip.id)}" data-edit-version="${esc(val(editingTrip,"version")||1)}"`:"";
    const deleteBar=editingTrip?`<button type="button" class="trip-delete-text" data-action="delete-trip">Delete this trip</button>`:"";
    const submitLabel=kind==="trip"?(editingTrip?"Save changes":"Create trip"):editingTraveler?"Save changes":`Save ${esc(statusText(kind))}`;
    const heading=kind==="trip"?(editingTrip?"Edit trip details":"Where are you going?"):esc(cfg.title);
    const subhead=kind==="trip"?(editingTrip?"<p>Update the name or dates, or delete the trip.</p>":"<p>Keep it simple. Add the details later.</p>"):"";
    return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form" id="native-form" data-kind="${esc(kind)}"${editAttrs} novalidate><section class="form-section"><header><span>${esc(cfg.lead)}</span><h1>${heading}</h1>${subhead}</header>${fields}</section><div class="form-save-bar"><button type="submit" class="mobile-primary-action">${submitLabel}</button>${deleteBar}</div></form>`, "form-screen");
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
        contact = directItemContact(entity, kind === "car-rental" ? "rental_car" : "driver") || {},
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
      contactType = kind === "restaurant" ? "other" : kind === "cruise" || kind === "activity" ? "tour_operator" : "other",
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
    return `<section class="manual-route-card" aria-label="${esc(from.label || "From")} to ${esc(to.label || "To")}"><div class="manual-route-card__field">${quickField(fromName, from.label || "From", { required: from.required !== false, placeholder: from.placeholder || "Enter location", attrs: `${placeAttrs} data-location-role="departure" data-place-label="${esc(from.aria || from.label || "Departure locations")}"` })}${fromPlace}</div><span class="manual-route-card__line" aria-hidden="true">${icon(kind === "flight" ? "plane" : kind === "ferry" || kind === "cruise" ? "navigation" : kind === "train" ? "train" : "chevron", 20)}</span><div class="manual-route-card__field">${quickField(toName, to.label || "To", { required: to.required !== false, placeholder: to.placeholder || "Enter location", attrs: `${toAttrs} data-location-role="arrival" data-place-label="${esc(to.aria || to.label || "Arrival locations")}"` })}${toPlace}</div></section>`;
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
    return `<section class="manual-attachments" aria-labelledby="manual-attachments-title"><header><span>${icon("document", 21)}</span><div><h2 id="manual-attachments-title">Tickets &amp; Documents</h2><p>Optional · Stored on this device</p></div></header><div class="manual-attachments__controls"><label class="manual-attachments__picker" for="form-manualAttachments">${icon("plus", 19)}<span>Add files</span><input class="sr-only" id="form-manualAttachments" name="manualAttachments" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pkpass" multiple data-manual-attachments data-scope="${esc(key)}"></label><label class="form-field manual-attachments__type" for="form-manualDocumentType"><span>Suggested type <small>Optional</small></span><select id="form-manualDocumentType" name="manualDocumentType" aria-label="Suggested document type">${options.map(([value, label]) => `<option value="${value}"${value === suggested ? " selected" : ""}>${label}</option>`).join("")}</select></label></div><div class="manual-attachments__list" data-manual-attachment-list data-scope="${esc(key)}" aria-live="polite">${manualAttachmentRows(scope)}</div></section>`;
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
    const editId = editingRecord ? itemId(editingRecord.entity) : "", editVersion = editingRecord ? Number(val(editingRecord.entity, "version")) || 1 : 0;
    const title = kind === "document" ? "Add Document" : `${editingRecord ? "Edit" : "Add"} ${config?.shortLabel || config?.label || statusText(kind)}`;
    if (!state.trip) return noTripQuickAdd(kind, title);
    const editing = Boolean(editingRecord), dateDefault = editing ? "" : String(val(state.trip, "starts_on", "startsOn") || ""), attachmentScope = manualAttachmentScope(kind, editId);
    let primary="", moreContent="", note="", list="", dataLists="", extraClass="";
    if (kind === "flight") {
      list = quickLocationList("flight");
      dataLists = dataListMarkup("suggest-airlines",SUGGEST_LISTS.airlines)+dataListMarkup("suggest-cabin",SUGGEST_LISTS.cabin)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("carrierName","Airline",{required:true,placeholder:"Airline name",attrs:'list="suggest-airlines"'})}${quickField("flightNumber","Flight number",{required:true,placeholder:"LY 383",helper:"Use the airline code and number when known."})}${manualRouteCard(kind,{label:"From",placeholder:"Airport or code"},{label:"To",placeholder:"Airport or code"})}<input type="hidden" name="departureTimezone" id="form-departureTimezone" data-timezone-role="departure" value="${esc(formPrefill?.departureTimezone||"")}"><input type="hidden" name="arrivalTimezone" id="form-arrivalTimezone" data-timezone-role="arrival" value="${esc(formPrefill?.arrivalTimezone||"")}"><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="departure" hidden><span>Origin timezone <b aria-hidden="true">*</b></span><input type="text" name="departureTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="departureTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label><label class="form-field form-field--wide place-timezone-fallback" data-timezone-fallback-for="arrival" hidden><span>Arrival timezone</span><input type="text" name="arrivalTimezoneManual" autocomplete="off" list="suggest-timezones" placeholder="Europe/Rome" data-timezone-manual-for="arrivalTimezone"><small class="field-helper">Only needed when an airport cannot be recognized.</small></label><div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}`;
      moreContent = `<div class="form-fields"><div class="form-fields--date-time">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}</div>${quickField("operatingAirlineCode","Operating airline",{attrs:'list="suggest-airlines"'})}${quickField("departureTerminal","Terminal",{wide:false})}${quickField("departureGate","Gate",{wide:false})}${quickField("boardingTime","Boarding time",{type:"time",wide:false})}${quickField("gateCloseTime","Gate closes",{type:"time",wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("cabin","Cabin",{wide:false,attrs:'list="suggest-cabin"'})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickField("bookingReference","PNR",{wide:false})}${quickField("ticketNumber","Ticket number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Airport timezones are set from the selected airports. Scheduled information is never presented as live.";
    } else if (kind === "hotel") {
      dataLists = dataListMarkup("suggest-hotels",SUGGEST_LISTS.hotel) + quickLocationList("reservation");
      primary = `${quickField("propertyName","Property name",{required:true,placeholder:"Hotel or stay name",attrs:'list="suggest-hotels"'})}${quickField("location","City / location",{required:true,placeholder:"Search city or airport",attrs:'data-place-types="city,airport" data-place-preferred="city" data-place-label="Hotel cities and airports"'})}<input type="hidden" name="locationPlace" value="">${dateRangeField("checkInDate", "checkOutDate", "Stay dates", "Check-in", "Check-out", formPrefill?.checkInDate||"", formPrefill?.checkOutDate||"")}`;
      moreContent = `<div class="form-fields">${quickField("streetAddress","Address",{placeholder:"Street address",optional:true})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("checkInFrom","Check-in from",{type:"time",wide:false})}${quickField("checkInUntil","Check-in until",{type:"time",wide:false})}${quickField("checkOutBy","Check-out by",{type:"time",wide:false})}${quickField("roomName","Room name or type",{})}${quickField("bookingStatus","Booking status",{})}${quickTravelerField()}${quickField("phone","Hotel phone",{type:"tel",wide:false})}${quickField("email","Hotel email",{type:"email",wide:false})}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Use the single calendar to choose check-in and check-out dates.";
    } else if (["train","ferry"].includes(kind)) {
      const ferry = kind === "ferry";
      list = quickLocationList("train");
      dataLists = dataListMarkup("suggest-rail",SUGGEST_LISTS.rail)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${manualRouteCard(kind,{label:ferry?"Departure port":"From station",placeholder:ferry?"Departure port":"Station",list:"quick-train-locations"},{label:ferry?"Arrival port":"To station",placeholder:ferry?"Arrival port":"Station",list:"quick-train-locations"})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickField("carrierName",ferry?"Ferry operator":"Train operator",{attrs:'list="suggest-rail"',optional:true})}${quickField("serviceNumber",ferry?"Sailing number":"Train / service number",{optional:true})}${quickField("departureTimezone","Departure timezone",{required:true,placeholder:"Europe/Rome",attrs:'data-timezone-role="departure" list="suggest-timezones"',helper:`Use the ${ferry?"port":"station"} local timezone.`})}`;
      moreContent = `<div class="form-fields"><div class="form-fields--date-time">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}</div>${quickField("arrivalTimezone","Arrival timezone",{placeholder:"Europe/Rome",attrs:'list="suggest-timezones"'})}${quickField("platform",ferry?"Pier / berth":"Platform",{wide:false})}${quickField("coach","Coach / cabin",{wide:false})}${quickField("seat","Seat",{wide:false})}${ferry ? quickField("vehicle","Vehicle",{optional:true,placeholder:"Vehicle or registration"}) : ""}${quickField("bookingReference","Booking reference",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = `${ferry ? "Ports" : "Stations"} remain manual or use saved trip locations; the app does not pretend the city index is a station directory.`;
    } else if (kind === "car-rental") {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-carrental",SUGGEST_LISTS.carRental)+dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Rental company",{required:true,placeholder:"Company",attrs:'list="suggest-carrental"'})}${manualRouteCard(kind,{name:"location",label:"Pickup location",placeholder:"Airport, city, or address",list:"quick-reservation-locations"},{name:"endLocation",label:"Drop-off location",placeholder:"Airport, city, or address",list:"quick-reservation-locations"})}${dateRangeField("reservationDate", "endDate", "Rental dates", "Pickup", "Drop-off", formPrefill?.reservationDate||dateDefault, formPrefill?.endDate||"")}<div class="form-fields form-fields--date-time">${quickField("reservationTime","Pickup time",{type:"time",required:true,wide:false})}${quickField("endTime","Drop-off time",{type:"time",required:true,wide:false})}</div>${quickField("timezone","Pickup timezone",{required:true,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"'})}<input type="hidden" name="transportType" value="car">`;
      moreContent = `<div class="form-fields">${quickField("endTimezone","Drop-off timezone",{placeholder:"Europe/Rome",attrs:'list="suggest-timezones"',helper:"Only needed when drop-off uses a different timezone."})}${quickField("vehicle","Vehicle / class",{})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("driver","Driver name",{})}${quickField("phone","Rental phone",{type:"tel"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Pickup and drop-off are kept together as one rental booking.";
    } else if (kind === "transfer") {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Provider / driver",{optional:true,placeholder:"Optional"})}${manualRouteCard(kind,{name:"location",label:"From",placeholder:"Pickup location",list:"quick-reservation-locations"},{name:"endLocation",label:"To",placeholder:"Destination",list:"quick-reservation-locations"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate","Pickup date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime","Pickup time",{type:"time",required:true,wide:false})}</div>${quickField("timezone","Pickup timezone",{required:true,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"'})}<input type="hidden" name="transportType" value="transfer">`;
      moreContent = `<div class="form-fields">${quickField("endTimezone","Arrival timezone",{placeholder:"Europe/Rome",attrs:'list="suggest-timezones"',helper:"Only needed when the destination uses a different timezone."})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("phone","Driver / provider phone",{type:"tel"})}${quickField("vehicle","Vehicle",{optional:true})}${quickField("driver","Driver name",{optional:true})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Only confirmed pickup details are shown in the Timeline.";
    } else if (kind === "cruise") {
      list = quickLocationList("activity");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("provider","Cruise line",{required:true,placeholder:"Cruise line"})}${quickField("ship","Ship",{optional:true,placeholder:"Ship name"})}${manualRouteCard(kind,{name:"location",label:"Departure port",placeholder:"Port",list:"quick-activity-locations"},{name:"endLocation",label:"Arrival / return port",placeholder:"Port",list:"quick-activity-locations"})}<div class="form-fields form-fields--date-time">${quickField("activityDate","Departure date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("activityTime","Departure time",{type:"time",optional:true,wide:false})}</div>${quickField("endDate","Return / arrival date",{type:"date",required:true})}${quickField("timezone","Departure timezone",{optional:true,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"',helper:"Needed only when you add a departure or arrival time."})}<input type="hidden" name="timeMode" value="specific"><input type="hidden" name="activityType" value="cruise">`;
      moreContent = `<div class="form-fields">${quickField("title","Cruise name",{optional:true,placeholder:"Optional itinerary name"})}${quickField("endTime","Arrival time",{type:"time",wide:false,optional:true})}${quickField("confirmationNumber","Booking reference",{})}${quickField("cabin","Cabin",{optional:true})}${quickField("deck","Deck",{optional:true})}${quickField("embarkation","Embarkation details",{optional:true,placeholder:"Terminal, pier, or check-in point"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Port names stay manual until a dedicated port directory is available.";
    } else if (kind === "restaurant") {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Restaurant name",{required:true,placeholder:"Restaurant"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate","Reservation date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime","Local time",{type:"time",required:true,wide:false})}</div>${quickField("guests","Guests",{type:"number",required:true,wide:false,attrs:'min="1" max="99" inputmode="numeric"'})}${quickField("location","City / location",{optional:true,placeholder:"City or saved trip location",attrs:'list="quick-reservation-locations"'})}${quickField("timezone","Timezone",{required:true,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"'})}<input type="hidden" name="reservationType" value="restaurant">`;
      moreContent = `<div class="form-fields">${quickField("streetAddress","Street address",{optional:true,placeholder:"Restaurant address"})}${quickField("phone","Restaurant phone",{type:"tel",optional:true})}${quickField("confirmationNumber","Confirmation number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Guest count and confirmation stay with this reservation.";
    } else if (kind === "activity") {
      list = quickLocationList("activity");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Activity name",{required:true,placeholder:"Vatican Museums"})}${quickField("activityType","Type",{type:"select",required:true,choices:'<option value="activity">Activity</option><option value="tour">Tour</option><option value="concert">Concert</option><option value="theatre">Theatre</option><option value="museum">Museum</option><option value="attraction">Attraction</option><option value="sports">Sports</option><option value="meeting">Meeting</option><option value="show">Show</option><option value="other">Other</option>'})}${quickField("activityDate","Date",{type:"date",required:true,value:dateDefault})}<input type="hidden" name="timeMode" value="specific"><div class="form-fields form-fields--activity-time">${quickField("activityTime","Local time",{type:"time",required:true,wide:false})}${quickField("timezone","Timezone",{required:true,wide:false,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"'})}</div>${quickField("location","Venue",{required:true,placeholder:"Venue or saved trip location",attrs:'list="quick-activity-locations"'})}`;
      moreContent = `<div class="form-fields">${quickField("endTime","End time",{type:"time",wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("provider","Provider or contact",{})}${quickField("seatSection","Seat / section",{optional:true})}${quickField("streetAddress","Address",{optional:true,placeholder:"Venue address"})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Use the venue's local time. Nothing is presented as live.";
    } else if (["other","reservation"].includes(kind)) {
      list = quickLocationList("reservation");
      dataLists = dataListMarkup("suggest-timezones",timezoneOptions());
      primary = `${quickField("title","Booking title",{required:true,placeholder:"What did you book?"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate","Date",{type:"date",required:true,wide:false,value:dateDefault})}${quickField("reservationTime","Local time",{type:"time",optional:true,wide:false})}</div>${quickField("location","Location",{optional:true,placeholder:"Optional",attrs:'list="quick-reservation-locations"'})}${quickField("timezone","Timezone",{optional:true,placeholder:"Europe/Rome",attrs:'list="suggest-timezones"',helper:"Needed only when you add a time."})}<input type="hidden" name="reservationType" value="other">`;
      moreContent = `<div class="form-fields"><div class="form-fields--date-time">${quickField("endDate","End date",{type:"date",wide:false})}${quickField("endTime","End time",{type:"time",wide:false})}</div>${quickField("confirmationNumber","Confirmation number",{})}${quickField("contact","Contact",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`;
      note = "Add only the details you know; nothing is guessed.";
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
    const form = `<form class="mobile-form premium-form quick-add-form manual-booking-form${extraClass}" id="native-form" data-kind="${esc(kind)}" data-base-kind="${esc(baseKind)}" data-client-request-id="${esc(manualBookingDraftId(kind, editId))}" data-attachment-scope="${esc(attachmentScope.draftId)}"${editAttrs} novalidate>${quickTripContext()}<header class="manual-form-heading"><span>Manual booking</span><h1>${heading}</h1><p>Start with the essentials. Add anything else only when you need it.</p></header><section class="form-section manual-essentials" aria-labelledby="manual-essentials-title"><h2 id="manual-essentials-title">Essentials</h2><div class="quick-primary-fields">${primary}</div>${list}${dataLists}</section>${attachments}${quickMore(kind,"More Details",moreContent)}${note ? `<p class="form-note">${esc(note)}</p>` : ""}<div class="form-save-bar"><button type="submit" class="mobile-primary-action">${submitLabel}</button></div></form>`;
    return focusedTaskPage(title, form, `form-screen quick-add-screen quick-add-screen--${kind}`);
  }
  function driverScreen() {
    const stay = selectedStay(),
      location = stay
        ? locationById(val(stay, "property_location_id", "start_location_id"))
        : null,
      name = val(stay, "property_name", "title") || "Destination",
      localName = val(location, "local_name") || "",
      address =
        val(location, "local_address", "formatted_address") ||
        "Address unavailable";
    return `<div class="phone-app"><section class="driver-screen"><div class="driver-top"><button class="icon-button" data-action="close-driver" aria-label="Close" style="color:#fff">${icon("close", 26)}</button><strong>Show to Driver</strong><span></span></div><div class="driver-label">${icon("car", 34)} <span>Please drive to</span></div><h1 class="driver-name">${esc(name)}</h1><p class="driver-local">${esc(localName)}</p><div class="driver-rule"></div><div class="driver-address">${icon("pin", 30)}<span>${esc(address)}</span></div><div class="driver-cta">${primaryCta("Navigate", "directions-hotel", "navigation", `data-id="${esc(itemId(stay || {}))}"`)}</div></section></div>`;
  }
  function bottomSheet(id, title, content) {
    return `<div class="sheet-backdrop" data-action="close-sheet" aria-hidden="true"></div><section class="bottom-sheet bottom-sheet--${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1"><div class="sheet-handle" data-sheet-drag aria-hidden="true"></div><div class="sheet-title-row" data-sheet-drag><h2 id="${id}-title">${esc(title)}</h2><button class="icon-button" data-action="close-sheet" aria-label="Close ${esc(title)}">${icon("close", 22)}</button></div><div class="sheet-scroll">${content}</div></section>`;
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
    const summary = range.start ? range.end ? `${formatDateOnly(range.start)} – ${formatDateOnly(range.end)}` : `${formatDateOnly(range.start)} · now choose ${range.endLabel.toLowerCase()}` : `Choose ${range.startLabel.toLowerCase()}`;
    return bottomSheet("date-range", range.title, `<div class="range-picker"><div class="range-picker__summary" role="status" tabindex="-1"><small>${esc(range.startLabel)} → ${esc(range.endLabel)}</small><strong>${esc(summary)}</strong></div><div class="range-month"><button type="button" class="icon-button" data-action="range-month" data-offset="-1" aria-label="Previous month">${icon("back", 20)}</button><strong>${esc(new Intl.DateTimeFormat(undefined, {month:"long",year:"numeric",timeZone:"UTC"}).format(monthStart))}</strong><button type="button" class="icon-button" data-action="range-month" data-offset="1" aria-label="Next month">${icon("chevron", 20)}</button></div><div class="range-weekdays" aria-hidden="true">${["S","M","T","W","T","F","S"].map((day)=>`<span>${day}</span>`).join("")}</div><div class="range-days" role="grid" aria-label="${esc(range.title)}">${cells.join("")}</div><button type="button" class="mobile-primary-action range-picker__apply" data-action="apply-date-range"${range.start && range.end ? "" : " disabled"}>Use these dates</button></div>`);
  }
  function addSheet() {
    return bottomSheet(
      "add",
      "What would you like to do?",
      `<div class="sheet-options-group sheet-options-group--v2"><button class="sheet-option" data-action="open-add-booking"><span class="info-icon">${icon("plus",22)}</span><span><strong>Add Booking</strong><small>Add something to ${esc(state.trip?.title || "your trip")}</small></span>${icon("chevron",22)}</button><button class="sheet-option" data-action="create-trip"><span class="info-icon">${icon("plane",22)}</span><span><strong>Create New Trip</strong><small>Start planning another trip</small></span>${icon("chevron",22)}</button></div>`,
    );
  }
  function addBookingScreen() {
    if (!state.trip) return noTripQuickAdd("booking", "Add Booking");
    const choice = (ic,title,copy,action) => `<button class="v2-choice" data-action="${action}"><span>${icon(ic,23)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${icon("chevron",20)}</button>`;
    return focusedTaskPage(`Add to ${state.trip.title || "trip"}`, `<section class="v2-task-intro"><span>Add Booking</span><h1>How would you like<br>to add it?</h1><p>Everything you add appears in the Timeline.</p></section><div class="v2-choice-list">${choice("document","Upload Booking","Choose a ticket or confirmation file","open-upload-booking")}${choice("mail","Forward Confirmation Email","Send it to go@tripto.to","open-forward-booking")}${choice("plus","Add Manually","Enter only the confirmed details","open-manual-booking")}</div>`, "v2-add-booking");
  }
  function manualBookingSheet() {
    const options = Object.entries(MANUAL_BOOKING_TYPES);
    return bottomSheet("manual-booking","Add Manually",`<label class="manual-category-search" for="manual-category-search"><span class="sr-only">Search booking categories</span>${icon("search",18)}<input id="manual-category-search" type="search" inputmode="search" autocomplete="off" placeholder="Search categories" data-manual-category-search></label><div class="sheet-options-group manual-v2-options" data-manual-category-list>${options.map(([type,config])=>`<button type="button" class="sheet-option" data-action="add-type" data-type="${esc(type)}" data-manual-label="${esc(config.label)}" data-manual-category="${esc(config.label.toLowerCase())}"><span class="info-icon">${icon(config.icon,21)}</span><span><strong>${esc(config.label)}</strong></span>${icon("chevron",20)}</button>`).join("")}</div><p class="manual-category-empty" data-manual-category-empty hidden>No matching category.</p>`);
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
    return bottomSheet(
      "trip",
      "Choose trip",
      state.trips
        .map(
          (trip) =>
            `<button class="sheet-option" data-action="select-trip" data-id="${esc(trip.id)}"><span class="info-icon">${icon("trips", 22)}</span><span><strong>${esc(trip.title)}</strong><small>${esc(formatTripDates(trip))}</small></span>${String(trip.id) === String(state.trip?.id) ? checkDot("status-dot-check--selected") : icon("chevron", 22, "chevron")}</button>`,
        )
        .join(""),
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
      `<div class="sheet-options-group sheet-options-group--v2">${rowAct("info", "How tripto.to works", "A quick tour of the basics", "open-first-run-how")}${rowAct("mail", "Email Inbox", "Forward confirmations to go@tripto.to", "booking-email-info")}${rowLink("shield", "Privacy Policy", "How your trip data is handled", "/privacy")}${rowLink("document", "Terms of Service", "The agreement for using tripto.to", "/terms")}${hasTrip ? rowAct("download", "Download support bundle", "Diagnostics for this trip — no private details", "export-support") : ""}</div><p class="sheet-note">tripto.to Product V2</p>`,
    );
  }

  function skeletonRows(count = 4) {
    return `<div class="skeleton-list">${Array.from({ length: count }, () => `<div class="skeleton-list-row"><i></i><span><b></b><small></small></span></div>`).join("")}</div>`;
  }
  function loadingSkeleton(screen = state.screen) {
    const common = `<div class="skeleton-appbar"><i></i><b></b><i></i></div>`,
      listing = ["trips", "bookings", "documents", "travelers", "import-history", "booking-email-inbox"].includes(screen),
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
    return `<div class="phone-app"><div class="app-loading">${loadingSkeleton()}</div></div>`;
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
    return state.toast
      ? `<div class="toast-mobile toast-mobile--${role}" role="${role}" aria-live="${role === "alert" ? "assertive" : "polite"}">${esc(state.toast)}</div>`
      : "";
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
    const firstRun = shouldShowFirstRun();
    const showWelcome = firstRun || state.screen === "home";
    syncFirstRunPresentation(showWelcome);
    document.documentElement.classList.toggle(
      "sheet-open",
      Boolean(state.sheet && state.sheet !== "driver"),
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
        case "travelers": html = travelersScreen(); break;
        case "traveler": html = travelerScreen(); break;
        case "import": html = importScreen(); break;
        case "import-review": html = importReviewScreen(); break;
        case "import-history": html = importHistoryScreen(); break;
        case "booking-email-inbox": html = bookingEmailInboxScreen(); break;
        case "sync": html = syncScreen(); break;
        case "form": html = mobileFormScreen(); break;
        default:
          html = state.trip ? timelineScreen() : firstRunScreen();
      }
    html = decorateScreen(html);
    if (state.sheet === "add") html += addSheet();
    if (state.sheet === "document") html += documentSheet();
    if (state.sheet === "trips") html += tripSwitchSheet();
    if (state.sheet === "first-run-how") html += firstRunHowSheet();
    if (state.sheet === "help") html += helpSheet();
    if (state.sheet === "manual-booking") html += manualBookingSheet();
    if (state.sheet === "manage-booking") html += manageBookingSheet();
    if (state.sheet === "date-range") html += dateRangeSheet();
    if (state.sheet === "booking-email-trip") html += bookingEmailTripSheet();
    app.innerHTML = html + toast();
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
    const sheet = document.querySelector(".bottom-sheet"),
      backdrop = document.querySelector(".sheet-backdrop"),
      finish = () => {
        state.sheet = null;
        state.dateRange = null;
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
    const sheet = document.querySelector(".bottom-sheet");
    if (!sheet) return;
    const first =
      sheet.querySelector(
        '.range-picker__summary,.sheet-option,input,select,button:not([data-action="close-sheet"])',
      ) || sheet;
    requestAnimationFrame(() => first.focus());
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
          "Select a known airport or enter its IANA timezone.",
        );
        return false;
      }
      if (!arrivalTimezone) {
        setManualTimezoneFallback(form, form.elements.toLocation, true);
        showFieldError(
          form,
          form.elements.arrivalTimezoneManual || form.elements.toLocation,
          "Select a known airport or enter its IANA timezone.",
        );
        return false;
      }
      form.elements.departureTimezone.value = departureTimezone;
      form.elements.arrivalTimezone.value = arrivalTimezone;
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
      !form.elements.activityTime?.value
    ) {
      showFieldError(
        form,
        form.elements.activityTime,
        "Add the local time or choose Time not set yet.",
      );
      return false;
    }
    if (kind === "car-rental") {
      if (!form.elements.reservationDate?.value || !form.elements.endDate?.value) {
        showFieldError(form, form.elements.reservationDate || form.elements.endDate, "Choose pickup and drop-off dates from one calendar.");
        return false;
      }
      const start = `${form.elements.reservationDate?.value || ""}T${form.elements.reservationTime?.value || ""}`,
        end = `${form.elements.endDate?.value || ""}T${form.elements.endTime?.value || ""}`;
      if (start && end && end < start) {
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
        showFieldError(form, form.elements.timezone, "Add the event's IANA timezone when a local time is provided.");
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
      if (supportsFormDraft(form.dataset.kind)) saveQuickDraft(form);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
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
      role = input.dataset.locationRole,
      locationKind = kind === "flight" ? "flight" : kind === "train" ? "train" : "activity",
      selectedPlace = selectedPlaceForInput(input),
      timezone = String(selectedPlace?.timezone || timezoneForLocationInput(input.value, locationKind) || ""),
      timezoneName = role === "arrival" ? "arrivalTimezone" : kind === "activity" || kind === "reservation" ? "timezone" : "departureTimezone",
      control = form.elements[timezoneName],
      field = input.closest(".form-field");
    if (!control) return;
    form.querySelector(`[data-timezone-status="${CSS.escape(role || "location")}"]`)?.remove();
    field?.querySelector(".timezone-derived")?.remove();
    if (timezone) {
      control.value = timezone;
      control.dataset.derived = "true";
      if (field && kind !== "flight") {
        field.classList.add("is-derived-timezone");
        field.insertAdjacentHTML(
          "afterend",
          `<p class="timezone-derived" data-timezone-status="${esc(role || "location")}">${icon("check", 15)} ${esc(timezone)} from the selected ${kind === "train" ? "station" : "location"}</p>`,
        );
      }
    } else {
      if (control.dataset.derived === "true") control.value = "";
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
    if (form.dataset.kind === "activity") {
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
  function setFormSaving(form, saving, label = "Saving…") {
    if (!form) return;
    const submit = form.querySelector('button[type="submit"]');
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
      focused.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
  }
  function syncVisualViewport() {
    const viewport = window.visualViewport,
      obscured = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
    document.documentElement.style.setProperty(
      "--keyboard-offset",
      `${Math.round(obscured)}px`,
    );
    document.documentElement.classList.toggle("keyboard-open", obscured > 80);
    if (obscured > 80) keepFocusedFieldVisible();
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
      bindDateRangeControls(nativeForm);
      syncQuickConditionalFields(nativeForm);
      nativeForm
        .querySelectorAll("[data-place-types]")
        .forEach((input) => bindPlaceAutocomplete(nativeForm, input));
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
            submit = nativeForm.querySelector('button[type="submit"]');
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
        if (!validateFocusedForm(nativeForm)) return;
        saveNativeForm(nativeForm);
      });
    }
    const importReviewForm = document.getElementById("import-review-form");
    if (importReviewForm && !importReviewForm.dataset.bound) {
      importReviewForm.dataset.bound = "1";
      bindMeaningfulChanges(importReviewForm);
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
    const manualCategorySearch = document.querySelector("[data-manual-category-search]");
    if (manualCategorySearch && !manualCategorySearch.dataset.bound) {
      manualCategorySearch.dataset.bound = "1";
      const filter = () => {
        const query = normalizedLocationInput(manualCategorySearch.value),
          rows = [...document.querySelectorAll("[data-manual-category]")];
        let visible = 0;
        rows.forEach((row) => {
          const match = !query || normalizedLocationInput(row.dataset.manualCategory).includes(query);
          row.hidden = !match;
          if (match) visible += 1;
        });
        const empty = document.querySelector("[data-manual-category-empty]");
        if (empty) empty.hidden = visible > 0;
      };
      manualCategorySearch.addEventListener("input", filter);
    }
    document.querySelectorAll('input[data-action="toggle-checklist"]').forEach((input) => input.addEventListener("change", () => toggleChecklistItem(input)));
    setupSheet();
  }
  function resolveEventLocalDateTime(localValue, timeZone) {
    if (!localValue || !timeZone) throw new Error("Local time and IANA timezone are required.");
    const match = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) throw new Error("Enter a valid local date and time.");
    try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); } catch (_) { throw new Error("Use a valid IANA timezone, for example Europe/Rome."); }
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
      } else if (kind === "transfer") {
        await saveScopedContact("driver", String(fd.get("driver") || fd.get("title") || "Transfer"), {
          phone:fd.get("phone"), notes:buildManualDetailNotes([["Driver", fd.get("driver")], ["Vehicle", fd.get("vehicle")]], userNotes),
        });
      } else if (kind === "cruise") {
        await saveScopedContact("tour_operator", String(fd.get("provider") || "Cruise line"));
      } else if (kind === "restaurant") {
        await saveScopedContact("other", String(fd.get("title") || "Restaurant"), { phone:fd.get("phone") });
      } else if (kind === "activity" && fd.get("provider")) {
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
      manualTransportCreateOptions=(body)=>({method:"POST",headers:manualCreateHeaders,body:JSON.stringify(body)}),
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
          const trip={id:"preview-created-trip",title:values.title,destination:fd.get("destination"),lifecycle_state:"upcoming",starts_on:values.startsOn,ends_on:values.endsOn};
          Object.assign(state,{trips:[trip],trip,timeline:[],checklist:[],brain:null,impacts:[],transport:[],stays:[],locations:[],travelers:[],connections:[],health:null,bookingDetails:[],contacts:[],syncStatus:null,localDocs:[],tripsLoaded:true});
        }
        clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(`${statusText(kind)} saved in preview.`); route(kind==="document"?"documents":kind==="trip"?"add-booking":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"timeline",null,true); return;
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
        const result=await api("/api/v1/trips",{method:"POST",body:JSON.stringify({title:values.title,startsOn:values.startsOn,endsOn:values.endsOn,lifecycleState:"upcoming"})}); state.trips.unshift(result.trip); state.trip=result.trip; state.tripsLoaded=true; localStorage.setItem("tripto_selected_trip",result.trip.id);
        const destinationPlace=parsePlaceSnapshot(fd.get("destinationPlace"));
        if(destinationPlace) await createLocationFromPlace(destinationPlace,"city");
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
        }
      } else if (["activity","reservation"].includes(baseKind)) {
        const dateName=baseKind==="activity"?"activityDate":"reservationDate", timeName=baseKind==="activity"?"activityTime":"reservationTime",
          explicitDate=String(baseKind==="activity"?fd.get("activityDate"):fd.get("reservationDate")||""),
          explicitTime=String(baseKind==="activity"?fd.get("activityTime"):fd.get("reservationTime")||""), timezone=String(fd.get("timezone")||""),
          local=explicitDate&&explicitTime?`${explicitDate}T${explicitTime}`:"", ms=local?resolveEventLocalDateTime(local,timezone):null,
          locationName=String(fd.get("location")||""), existingLocationId=String(val(existingBookingEntity,"start_location_id","venue_location_id")||"");
        let location=null;
        if (["restaurant","activity"].includes(kind) && (locationName || fd.get("streetAddress"))) {
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
      clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(saveWarning||(editId?`${manualBookingConfig(kind)?.label || statusText(kind)} updated.`:`${manualBookingConfig(kind)?.label || state.manualLabel || statusText(kind)} saved.`),saveWarning?"alert":"status"); state.manualLabel=null; state.editingEntity=null; formPrefill=null; route(kind==="document"?"documents":kind==="trip"?"add-booking":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"timeline",null,true);
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
    setFormSaving(form, true, "Preparing preview…");
    try {
      const fd=new FormData(form),file=form.elements.document?.files?.[0],pasted=String(fd.get("body")||"").trim();
      if(!file&&!pasted)throw new Error("Choose a booking document or paste a confirmation email.");
      if(file){
        if(!globalThis.TriptoSmartImport){try{await ensureSmartImport();}catch{throw new Error("Local document recognition is unavailable. Reload and try again.");}}
        if(!globalThis.TriptoSmartImport)throw new Error("Local document recognition is unavailable. Reload and try again.");
        const local=await saveLocalDocument(file,"other",[]),result=await globalThis.TriptoSmartImport.recognizeFile(file);
        state.importLocalDocumentId=local.id;
        const fmtWarnings=importFormatWarnings(file,result.kind);
        if(!result.candidates.length){state.importReview={candidates:[],localOnly:true,warnings:[...fmtWarnings,...result.warnings]};formHasMeaningfulChanges=false;route("import-review");return;}
        const candidate=result.candidates[0];
        if(fmtWarnings.length)candidate.warnings=[...fmtWarnings,...(candidate.warnings||[])];
        const safeFields=Object.fromEntries(Object.entries(candidate.fields).filter(([key])=>key!=="barcodeValue")),requestBody={checksum:result.checksum,filename:file.name,documentKind:result.kind,candidate:{type:candidate.type,confidence:candidate.confidence,fields:safeFields,warnings:candidate.warnings}};
        state.importUploadRequest=requestBody;
        if(PREVIEW_MODE)state.importReview={duplicate:false,import:{id:"preview-upload"},candidates:[{id:"candidate-1",candidate_type:candidate.type,payload:{...Object.fromEntries(Object.entries(candidate.fields).map(([k,v])=>[k,v.value])),fieldMeta:Object.fromEntries(Object.entries(candidate.fields).map(([k,v])=>[k,{confidence:v.confidence,source:v.source}])),warnings:candidate.warnings},confidence:candidate.confidence}]};
        else if(!navigator.onLine){queuePendingMutation({kind:"smart-import-preview",tripId:state.trip.id,path:`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,body:requestBody});showToast("Document saved on this phone. Recognition will sync when you reconnect.");route("import-history");return;}
        else state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,{method:"POST",body:JSON.stringify(requestBody)});
      } else if(PREVIEW_MODE)state.importReview={import:{id:"preview-email"},candidates:[{id:"candidate-1",candidate_type:"flight",payload:{title:"Example booking",warnings:["Timezone missing","Date is ambiguous"]},confidence:.55}]};
      else state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/forwarded-email/preview`,{method:"POST",body:JSON.stringify({body:pasted})});
      formHasMeaningfulChanges=false;route("import-review");
    } catch(error){ showFormSubmissionError(form,error.message); } finally { if(document.contains(form)) setFormSaving(form,false); }
  }

  function reviewedImportPayload(candidateId){const form=document.getElementById("import-review-form"),payload={};for(const input of form?.querySelectorAll(`[name^="field-${CSS.escape(candidateId)}-"]`)||[]){const key=input.dataset.fieldName||input.name.slice(`field-${candidateId}-`.length);payload[key]=input.value||null;}const type=form?.querySelector(`[name="field-${CSS.escape(candidateId)}-candidateType"]`)?.value;if(type)payload.candidateType=type;if(payload.departureLocalDatetime&&payload.departureTimezone)payload.scheduledDepartureUtc=resolveEventLocalDateTime(payload.departureLocalDatetime,payload.departureTimezone);if(payload.arrivalLocalDatetime&&payload.arrivalTimezone)payload.scheduledArrivalUtc=resolveEventLocalDateTime(payload.arrivalLocalDatetime,payload.arrivalTimezone);delete payload.departureLocalDatetime;delete payload.arrivalLocalDatetime;return payload;}
  async function resolveImport(candidateId,action){if(PREVIEW_MODE){showToast(action==="confirm"?"Import confirmed in preview.":"Import rejected in preview.");route("bookings");return;}const importId=state.importReview?.import?.id;if(!importId)throw new Error("Import is unavailable.");const result=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/${encodeURIComponent(importId)}/resolve`,{method:"POST",body:JSON.stringify({candidateId,action,payload:action==="confirm"?reviewedImportPayload(candidateId):undefined})});if(action==="confirm"&&state.importLocalDocumentId&&result.entityId)await linkLocalDocument(state.importLocalDocumentId,result.entityId);await loadTripDetails();showToast(action==="confirm"?"Booking imported.":"Import rejected.");route(action==="confirm"?"bookings":"import-history");}
  async function toggleChecklistItem(input) {
    const item=state.checklist.find((row)=>String(row.id)===String(input.dataset.id)); if(!item)return;
    if(PREVIEW_MODE){item.completed=input.checked;render();return;}
    try{await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/checklist/${encodeURIComponent(item.id)}`,{method:"PATCH",body:JSON.stringify({version:Number(item.version),completed:input.checked})});await loadTripDetails();render();}catch(error){input.checked=!input.checked;showToast("The checklist change was not saved. Review the latest version.","alert");}
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
  async function handleAction(action, target, inputMethod = "pointer") {
    switch (action) {
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
          openSheet("add", target);
        }
        break;
      case "open-add-booking":
        closeSheet();
        route("add-booking");
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
        };
        openSheet("date-range", target);
        break;
      }
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
          if (!state.dateRange.start || state.dateRange.end) {
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
      case "apply-date-range": {
        const range = state.dateRange, rangeForm = document.getElementById("native-form");
        if (!range || !range.start || !range.end || !rangeForm) break;
        rangeForm.elements[range.startName].value = range.start;
        rangeForm.elements[range.endName].value = range.end;
        rangeForm.elements[range.startName].dispatchEvent(new Event("input", { bubbles:true }));
        rangeForm.elements[range.endName].dispatchEvent(new Event("input", { bubbles:true }));
        syncDateRangeField(rangeForm, range.startName, range.endName);
        saveQuickDraft(rangeForm);
        formHasMeaningfulChanges = true;
        closeSheet();
        break;
      }
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
        confirmDeleteTrip();
        break;
      case "manage-booking":
        state.manageBooking = { kind: target.dataset.kind, id: target.dataset.id };
        openSheet("manage-booking", target);
        break;
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
      case "manual-attachment-open": {
        const reservedWindow = reserveManualAttachmentWindow();
        try {
          await openManualAttachment(target.dataset.scope, target.dataset.id, reservedWindow);
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
      case "filter-bookings": state.bookingFilter=target.dataset.filter||"all"; render(); break;
      case "document-sheet":
      case "add-document":
        route("form", "document");
        break;
      case "add-boarding-pass":
        route("form", "document");
        break;
      case "open-document":
      case "boarding-pass":
        await openLocalDocument(target.dataset.id);
        break;
      case "remove-document":
        await removeLocalDocument(target.dataset.id);
        break;
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
          let assigned;
          if (PREVIEW_MODE) assigned={emailId,tripId,importId:state.bookingEmails.find((row)=>String(row.id)===String(emailId))?.import_id||"preview-import"};
          else assigned=await api(`/api/v1/booking-emails/${encodeURIComponent(emailId)}/assign`,{method:"POST",body:JSON.stringify({tripId})});
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
      case "confirm-import": try{await resolveImport(target.dataset.id,"confirm");}catch(error){showToast(error.message,"alert");} break;
      case "reject-import": try{await resolveImport(target.dataset.id,"reject");}catch(error){showToast(error.message,"alert");} break;
      case "add-duplicate-import": {
        try{if(PREVIEW_MODE){state.importReview.duplicate=false;render();break;}const response=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/upload/preview`,{method:"POST",body:JSON.stringify({...state.importUploadRequest,duplicateDisposition:"add_anyway"})});state.importReview=response;render();showToast("A separate review was created.");}catch(error){showToast(error.message,"alert");}break;
      }
      case "sync-retry": if(PREVIEW_MODE){state.syncStatus={pendingOperations:0,openConflicts:0};render();showToast("Pending changes synced in preview.");}else await loadApp(); break;
      case "sync-review": showToast("Conflict remains visible until you choose a safe resolution in advanced beta tools."); break;
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
      case "set-theme":
        applyTheme();
        render();
        break;
      case "open-help":
        openSheet("help", target);
        break;
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
        if(confirm("Remove locally stored documents and cached trip data from this phone? Your server trip will not be deleted.")) showToast("Local-data removal is available in advanced beta tools.");
        break;
      }
      case "sign-out": {
        const pending=pendingMutations().filter((x)=>x.status!=="done").length+Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
        if(pending&&!confirm(`${pending} change${pending===1?" is":"s are"} still pending. Sign out anyway? The changes and local documents will stay on this phone.`))break;
        try{const result=await api("/api/v1/auth/signout",{method:"POST",body:"{}"});globalThis.google?.accounts?.id?.disableAutoSelect?.();state.token=result.session.token;localStorage.setItem("tripto_token",state.token);await loadApp();showToast("Signed out. Local documents remain on this phone.");}catch(error){showToast(error.message,"alert");}break;
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
          if (state.screen === "timeline") render();
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
  window.addEventListener(
    "pointerdown",
    () => {
      document.documentElement.dataset.inputMethod = "pointer";
    },
    { capture: true },
  );
  window.addEventListener("popstate", () => {
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
  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.("input,select,textarea"))
      setTimeout(keepFocusedFieldVisible, 80);
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
    const sheet = document.querySelector(".bottom-sheet"),
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
  applyTheme(state.theme);
  if ("serviceWorker" in navigator && !PREVIEW_MODE)
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {}),
    );
  window.TriptoMobileApp = {
    reload: loadApp,
    show: route,
    getState: () => state,
  };
  if (location.hash) {
    const legacy = parseRoute();
    history.replaceState(null, "", routeUrl(legacy.screen, legacy.id));
  }
  resumeGoogleRedirectSession();
})();
