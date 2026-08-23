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

  const ICON_NAMES = Object.freeze({
    user: "user", home: "house", trips: "suitcase-rolling", plus: "plus",
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
    importReview: null,
    bookingFilter: "all",
    importMode: "upload",
    manualLabel: null,
    editingEntity: null,
    formDraft: null,
    dateRange: null,
    tripsLoaded: false,
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
    discardReturnFocus = null;
  const scrollPositions = new Map();
  const DIRTY_TASK_SCREENS = new Set(["form", "import", "import-review"]);
  const QUICK_ADD_KINDS = new Set([
    "flight",
    "hotel",
    "train",
    "activity",
    "reservation",
    "document",
  ]);
  function icon(name, size = 24, extra = "") {
    const glyph = ICON_NAMES[name] || "circle";
    return `<i aria-hidden="true" class="ph ph-${glyph}${extra ? ` ${extra}` : ""}" style="--icon-size:${Number(size) || 24}px"></i>`;
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
    const normalized = String(kind || "unknown"),
      scope = normalized === "trip" ? "new-trip" : state.trip?.id || "no-trip";
    return `tripto_quick_add_draft:${scope}:${normalized}`;
  }
  function clearQuickDraft(kind = state.selectedId) {
    if (!supportsFormDraft(kind)) return;
    try {
      sessionStorage.removeItem(quickDraftKey(kind));
    } catch (_) {}
  }
  function clearActiveFormDraft() {
    if (state.screen === "form") clearQuickDraft(state.selectedId);
  }
  function supportsFormDraft(kind) {
    const normalized = String(kind || "");
    return normalized === "trip" || QUICK_ADD_KINDS.has(normalized);
  }
  function closeDiscardDialog(discard = false) {
    const backdrop = document.querySelector(".discard-dialog-backdrop"),
      continuation = discardDialogOpen;
    if (!backdrop) return;
    backdrop.remove();
    discardDialogOpen = false;
    if (discard) {
      clearActiveFormDraft();
      formHasMeaningfulChanges = false;
      if (typeof continuation === "function") continuation();
      return;
    }
    discardReturnFocus?.focus?.();
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
    return type === "flight"
      ? "plane"
      : type === "train"
        ? "train"
        : type === "car"
          ? "car"
          : "trips";
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
    if (start && end)
      return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
    return formatDateOnly(start || end);
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
  function checkDot() {
    return `<span class="status-dot-check">${icon("check", 14)}</span>`;
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
  async function refreshSessionIfNeeded() {
    if (!state.token || !navigator.onLine || PREVIEW_MODE) return;
    const exp = sessionExpiry(state.token);
    if (!exp || exp - Date.now() > 14 * 86400000) return;
    if (sessionRefreshPromise) return sessionRefreshPromise;
    sessionRefreshPromise = (async () => {
      const response = await fetch(`${API}/api/v1/session/refresh`, {
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
    const response = await fetch(`${API}/api/v1/session/guest`, {
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
    const response = await fetch(`${API}${path}`, {
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
        { requestId },
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
  function openLocalDocDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(
          new Error("Local document storage is unavailable on this device."),
        );
        return;
      }
      const request = indexedDB.open(LOCAL_DOC_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("docs")) {
          const store = db.createObjectStore("docs", { keyPath: "id" });
          store.createIndex("tripId", "tripId", { unique: false });
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
  async function loadApp() {
    state.loading = true;
    state.tripsLoaded = false;
    state.error = null;
    state.requestId = null;
    render();
    if (PREVIEW_MODE) {
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
      return;
    }
    try {
      const [tripsResult, accountResult] = await Promise.all([
        apiGet("/api/v1/trips"),
        apiGet("/api/v1/account"),
      ]);
      state.trips = tripsResult?.trips || [];
      state.account = accountResult?.account || null;
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
        } else if (["home", "trips", "bookings"].includes(state.screen)) {
          state.screen = "timeline";
          state.selectedId = null;
          history.replaceState(null, "", routeUrl("timeline"));
        }
      }
    } catch (error) {
      state.tripsLoaded = false;
      state.error = error instanceof Error ? error.message : String(error);
      state.requestId = error?.requestId || null;
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
    const id = encodeURIComponent(state.trip.id);
    const paths = [
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
    const results = await Promise.allSettled(paths.map(apiGet));
    const take = (index, key, fallback) =>
      results[index].status === "fulfilled"
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
      results[12].status === "fulfilled" ? results[12].value : null,
    );
    const activityDetails = take(13, "activities", []),
      activityById = new Map(activityDetails.map((item) => [String(item.id), item]));
    state.timeline = state.timeline.map((item) => activityById.has(String(item.id)) ? { ...item, ...activityById.get(String(item.id)) } : item);
    state.localDocs = await listLocalDocs(state.trip.id);
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
    return `<header class="app-bar ${dark ? "app-bar--dark" : ""}"><button class="icon-button" data-action="back" aria-label="Back">${icon("back", 25)}</button><div class="app-bar-title"><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div><div>${right || ""}</div></header>`;
  }
  function bottomNav(active) {
    const rows = [
      ["timeline", "clock", "Trip"],
      ["add", "plus", "Add"],
      ["account", "user", "Account"],
    ];
    const normalized = active === "account" ? "account" : "timeline";
    return `<nav class="bottom-nav bottom-nav--v2" aria-label="Primary navigation">${rows.map(([screen, ic, label]) => (screen === "add" ? `<button class="nav-item nav-add" data-action="open-add" aria-label="Add"><span>${icon(ic, 27)}</span><small>${label}</small></button>` : `<button class="nav-item ${normalized === screen ? "active" : ""}" data-screen="${screen}" ${normalized === screen ? 'aria-current="page"' : ""}>${icon(ic, 23)}<span>${label}</span></button>`)).join("")}</nav>`;
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

    const routeMarkup = `<div class="flight-pass__route"><div class="flight-pass__airport"><div class="flight-pass__airport-code">${esc(fromCode)}</div><span class="flight-pass__airport-name">${esc(route.fromName)}</span></div><div class="flight-pass__route-center"><div class="flight-pass__route-line">${icon("plane", 25)}</div>${duration ? `<span class="flight-pass__duration">${icon("clock", 14)} ${esc(duration)}</span>` : ""}</div><div class="flight-pass__airport flight-pass__airport--right"><div class="flight-pass__airport-code">${esc(toCode)}</div><span class="flight-pass__airport-name">${esc(route.toName)}</span></div></div>`;
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

    return `<section class="flight-pass flight-pass--detail" aria-label="Scheduled flight details"><i class="flight-pass__notch flight-pass__notch--left" aria-hidden="true"></i><i class="flight-pass__notch flight-pass__notch--right" aria-hidden="true"></i><div class="flight-pass__inner">${header}${routeMarkup}<div class="flight-pass__divider"></div><div class="flight-pass__times" aria-label="Scheduled departure and arrival in event-local time"><div class="flight-pass__time"><span class="flight-pass__event-icon">${icon("night", 30)}</span><span class="flight-pass__time-copy"><span>Departs</span><strong>${esc(formatTime(departure, departureZone))}</strong>${departureDay ? `<small>${esc(departureDay)} · Local time</small>` : ""}</span></div><div class="flight-pass__time-separator"></div><div class="flight-pass__time flight-pass__time--right"><span class="flight-pass__time-copy"><span>Arrives</span><strong>${esc(formatTime(arrival, arrivalZone))}</strong>${arrivalDay ? `<small>${esc(arrivalDay)} · Local time</small>` : ""}</span><span class="flight-pass__event-icon flight-pass__event-icon--day">${icon("day", 30)}</span></div></div><div class="flight-pass__divider flight-pass__divider--facts"></div><div class="flight-pass__facts"><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("terminal", 27)}</span><span class="flight-pass__fact-copy"><span>Terminal</span><strong>${esc(terminal || "—")}</strong><small>${terminal ? "Departure" : "Not assigned"}</small></span></div><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("gate", 27)}</span><span class="flight-pass__fact-copy"><span>Gate</span><strong>${esc(gate || "—")}</strong><small>${gate ? "Departure" : "Not assigned"}</small></span></div><div class="flight-pass__fact"><span class="flight-pass__fact-icon">${icon("seat", 27)}</span><span class="flight-pass__fact-copy"><span>Seat</span><strong>${esc(seat || "—")}</strong>${seat ? (cabin ? `<small>${esc(cabin)}</small>` : "") : "<small>Not assigned</small>"}</span></div></div><div class="flight-pass__actions">${primaryAction}<button class="flight-pass__secondary" data-action="directions-flight" data-id="${esc(itemId(flight))}">${icon("navigation", 18)}<span>Directions</span></button></div></div></section>`;
  }

  function flightTicket(flight) {
    return flightPass(flight, false);
  }
  function genericNextCard(item) {
    const type = timelineType(item),
      starts = Number(val(item, "starts_at_utc", "startsAtUtc")) || null,
      zone = val(item, "start_timezone", "startTimezone");
    return `<section class="next-action-card"><span class="ticket-chip">${icon(type === "hotel" ? "hotel" : type === "train" ? "train" : type === "activity" ? "star" : "clock", 18)} What’s next</span><h2>${esc(item.title || "Next plan")}</h2><p>${esc(item.subtitle || statusText(item.status))}</p><div class="next-action-time">${esc(formatTime(starts, zone))}</div><p>${esc(formatDateTime(starts, zone))}</p><div class="next-action-actions"><button class="secondary-cta" data-action="timeline-detail" data-id="${esc(itemId(item))}">${icon("info", 19)} Details</button><button class="secondary-cta" data-action="directions-item" data-id="${esc(itemId(item))}">${icon("navigation", 19)} Directions</button></div></section>`;
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
        return `<button class="simple-row" data-action="timeline-detail" data-id="${esc(itemId(item))}"><span class="row-icon">${icon(type === "flight" ? "plane" : type === "train" ? "train" : type === "hotel" ? "hotel" : type === "activity" ? "star" : "calendar", 22)}</span><span class="row-copy"><strong>${esc(item.title || "Plan")}</strong><span>${esc(routeText)}</span></span><span class="row-date">${esc(formatTime(starts, zone))}<br>${esc(formatDay(starts, zone))}</span></button>`;
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
    if (theme) theme.setAttribute("content", "#FFFFFF");
  }
  function firstRunProductPreview() {
    const previewRows = [
      ["plane", "THU, AUG 28 · 09:20", "Tel Aviv → Rome", "LY 383 · Terminal 3"],
      ["car", "14:10", "Airport transfer", "FCO → Hotel Artemide"],
      ["hotel", "15:00", "Hotel Artemide", "Check-in · 4 nights"],
      ["restaurant", "20:00", "Roscioli", "Dinner reservation"],
    ];
    return `<section class="first-run-preview" aria-label="Example trip timeline">${previewRows.map(([iconName, time, title, detail]) => `<div class="first-run-preview__event"><span class="first-run-preview__marker">${icon(iconName, 23)}</span><span class="first-run-preview__copy"><small>${esc(time)}</small><strong>${esc(title)}</strong><span>${esc(detail)}</span></span></div>`).join("")}</section>`;
  }
  function firstRunScreen() {
    const offline = state.offline
      ? `<span class="first-run-offline" role="status">${icon("info", 14)} Offline</span>`
      : "";
    const googleAction = PREVIEW_MODE
      ? `<button class="first-run-google-preview" data-action="preview-google" aria-label="Continue with Google"><img src="/assets/google-g.svg" alt=""><span>Continue with Google</span></button>`
      : `<div id="google-signin-button" aria-label="Continue with Google"></div>`;
    return `<div class="phone-app"><section class="first-run-screen welcome-v2 screen--navless" aria-labelledby="first-run-title"><header class="first-run-brand-row"><div class="first-run-brand" role="img" aria-label="tripto.to">tripto<span>.</span>to</div>${offline}</header><main class="first-run-main"><section class="first-run-hero"><span class="first-run-kicker">Quiet Journey</span><h1 id="first-run-title">All your trip.<br>One calm timeline.</h1><p>We turn your bookings into a single, easy-to-follow journey.</p></section>${firstRunProductPreview()}<div class="first-run-actions welcome-v2__actions"><div class="first-run-google">${googleAction}</div><p class="signin-error" role="alert" hidden></p><button class="first-run-secondary" data-action="open-first-run-how"><span>Take a tour</span>${icon("chevron", 18)}</button></div><footer class="welcome-v2__footer"><a href="/privacy.html">Privacy</a><span aria-hidden="true"></span><a href="/terms.html">Terms</a></footer></main></section></div>`;
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
                    next = !active && itemId(item) === highlightedNextId,
                    past = !active && !next && starts != null && starts < now,
                    phase = active
                      ? "active"
                      : next
                        ? "next"
                        : past
                          ? "past"
                          : "future",
                    eventTime = starts != null
                      ? formatTime(starts, zone)
                      : "Time unavailable",
                    flags = `${active ? '<span class="timeline-flag timeline-flag--now">Now</span>' : ""}${next ? '<span class="timeline-flag timeline-flag--next">Next</span>' : ""}${exception ? `<span class="timeline-flag timeline-flag--${esc(exception.tone)}">${esc(exception.label)}</span>` : ""}`,
                    title = item.title || "Trip item",
                    aria = [eventTime, title, subtitle, exception?.label]
                      .filter(Boolean)
                      .join(". ");
                  return `<button type="button" class="journey-event journey-event--${phase}${exception ? ` journey-event--${esc(exception.tone)}` : ""}" data-action="timeline-detail" data-id="${esc(itemId(item))}" aria-label="${esc(aria)}"${active || next ? ' aria-current="step"' : ""}><span class="journey-time">${esc(eventTime)}</span><span class="journey-track" aria-hidden="true"><span class="journey-marker">${icon(timelineIcon(type), 19)}</span></span><span class="journey-content"><span class="journey-copy">${flags ? `<span class="timeline-flags">${flags}</span>` : ""}<strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><span class="journey-chevron" aria-hidden="true">${icon("chevron", 19)}</span></span></button>`;
                })
                .join("")}</div></section>`,
          )
          .join("")
      : `<div class="timeline-empty">${emptySetup ? '<span class="timeline-empty__eyebrow">Start building</span>' : ""}<span class="timeline-empty__icon">${icon(emptySetup ? "plus" : "calendar", 30)}</span><h1>No plans yet</h1><p>Add your first flight, stay, train, or activity.</p>${emptySetup ? `<button class="primary-cta timeline-empty__add" data-action="open-add"><span>Add booking</span>${icon("plus",18)}</button>` : primaryCta("Add booking", "open-add", "plus")}</div>`;
    const headerAction = emptySetup
      ? `<button class="icon-button" data-screen="account" aria-label="Account">${icon("user",22)}</button>`
      : `<button class="icon-button" data-screen="documents" aria-label="Tickets and documents">${icon("document",22)}</button>`;
    const header = `<header class="trip-v2-header"><button class="trip-v2-selector" data-action="switch-trip" aria-label="Switch trip"><strong>${esc(state.trip.title || "Trip")}</strong>${icon("chevronDown",18)}<small>${esc(formatTripDates(state.trip))}</small></button>${headerAction}</header>`;
    return `<div class="phone-app"><section class="screen timeline-screen">${header}${mobileAlert()}<main class="timeline-page ${groups.length ? "timeline-page--journey" : "timeline-page--empty"}">${emptySetup ? "" : timelineContextCard()}${content}</main>${bottomNav("timeline")}</section></div>`;
  }

  function timelineContextCard() {
    if (isEmptyTripSetup()) return "";
    const issues = activeHealthIssues();
    if (issues.length) {
      const issue = issues[0];
      return `<section class="timeline-context timeline-context--attention"><span>Needs Attention</span><h2>${esc(issue.title || "Review your trip")}</h2><p>${esc(issue.explanation || "One trip detail needs your review.")}</p><button data-screen="health">Review${icon("chevron",17)}</button></section>`;
    }
    const next = nextItem();
    if (next) {
      const starts = Number(val(next,"starts_at_utc","startsAtUtc")) || null,
        zone = val(next,"start_timezone","startTimezone"),
        active = starts != null && starts <= Date.now() && Number(val(next,"ends_at_utc","endsAtUtc") || starts) > Date.now();
      if (active || (starts != null && starts - Date.now() <= 6 * 60 * 60 * 1000))
        return `<section class="timeline-context timeline-context--next"><span>${active ? "Now" : "Next"}</span><h2>${esc(next.title || "Next plan")}</h2><p>${esc(starts ? `${formatTime(starts,zone)} · ${next.subtitle || statusText(next.status)}` : next.subtitle || "Time unavailable")}</p><button data-action="timeline-detail" data-id="${esc(itemId(next))}">Open${icon("chevron",17)}</button></section>`;
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
        train: "train",
        hotel: "hotel",
        stay: "hotel",
        car: "car",
        transfer: "car",
        activity: "star",
        reservation: "restaurant",
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
    return `<div class="phone-app"><section class="screen dark-detail flight-detail-screen">${appBar("Flight Detail", "", true, `<button class="icon-button" data-action="share-flight" aria-label="Share flight">${icon("share", 23)}</button>`)}<main class="detail-content ${state.flightDetailsOpen ? "detail-content--expanded" : ""}"><div class="flight-detail-stack ${state.flightDetailsOpen ? "is-expanded" : ""}">${flightPass(flight, true)}${doc ? "" : `<div class="missing-document-state flight-pass__missing" role="status">${icon("warning", 18)} No checksum-verified boarding pass is stored on this phone.</div>`}${disclosure}</div></main>${bottomNav("bookings")}</section></div>`;
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
    return `<div class="phone-app"><section class="screen hotel-detail-screen">${appBar("Hotel")}<div class="hotel-hero ${imageUrl ? "hotel-hero--image" : "hotel-hero--fallback"}" role="img" aria-label="${imageUrl ? "Hotel property image" : "Hotel image unavailable; showing a generic local hotel-room fallback"}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="" class="hotel-hero-image">` : ""}<span class="hotel-hero-scrim" aria-hidden="true"></span>${state.offline ? `<span class="hotel-offline-badge" role="status">${icon("info", 15)} Offline · saved details</span>` : ""}</div><main class="hotel-sheet"><header class="hotel-heading"><div class="hotel-title-row"><h1>${esc(val(stay, "property_name", "title") || "Stay")}</h1><span class="hotel-status hotel-status--${statusTone}">${statusIcon}<span>${esc(statusLabel)}</span></span></div>${roomName ? `<p>${esc(roomName)}</p>` : ""}</header><section class="hotel-stats" aria-label="Stay dates"><div><span>Check-in</span><strong>${esc(formatTripBoundDate(val(stay, "check_in_date"), state.trip))}</strong><small>${esc(val(stay, "check_in_from") || "Time unavailable")}</small></div><div><span>Check-out</span><strong>${esc(formatTripBoundDate(val(stay, "check_out_date"), state.trip))}</strong><small>${esc(val(stay, "check_out_by") || "Time unavailable")}</small></div><div><span>Nights</span><strong>${esc(nights(stay))}</strong></div></section><div class="hotel-actions"><button class="hotel-action hotel-action--primary" data-action="directions-hotel" data-id="${esc(itemId(stay))}"${directionsDisabled ? " disabled" : ""}>${icon("navigation", 18)}<span>Directions</span></button><button class="hotel-action" data-action="show-driver" data-id="${esc(itemId(stay))}"${driverDisabled ? " disabled" : ""}>${icon("car", 18)}<span>Show to Driver</span></button></div><section class="hotel-location" aria-label="Hotel location"><button class="hotel-address-row" data-action="directions-hotel" data-id="${esc(itemId(stay))}"${directionsDisabled ? " disabled" : ""} aria-label="${address ? `Open directions to ${esc(address)}` : "Hotel address unavailable"}"><span class="hotel-address-row__icon">${icon("pin", 21)}</span><span>${esc(address || "Location unavailable")}</span>${directionsDisabled ? "" : icon("chevron", 18)}</button>${hasCoordinates ? `<button class="hotel-map-panel" data-action="directions-hotel" data-id="${esc(itemId(stay))}" aria-label="Open hotel location in Maps"><span class="hotel-map-panel__marker">${icon("pin", 22)}</span><span class="hotel-map-panel__copy"><strong>Saved location</strong><small>Open in Maps</small></span></button>` : `<div class="hotel-map-panel hotel-map-panel--unavailable" role="status"><span class="hotel-map-panel__marker">${icon("map", 22)}</span><span class="hotel-map-panel__copy"><strong>Map unavailable</strong><small>No saved coordinates</small></span></div>`}</section>${contactRows ? `<section class="hotel-contact-list" aria-label="Hotel contact and confirmation">${contactRows}</section>` : ""}</main>${bottomNav("bookings")}</section></div>`;
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

  function mobilePage(title, body, active = "trips", right = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen">${appBar(title, "", false, right)}${mobileAlert()}<main class="mobile-page">${body}</main>${bottomNav(active)}</section></div>`;
  }
  function focusedTaskPage(title, body, className = "") {
    return `<div class="phone-app"><section class="screen mobile-v1-screen focused-task ${esc(className)}">${appBar(title)}${mobileAlert()}<main class="focused-page">${body}</main></section></div>`;
  }
  function lifecycleLabel(value) {
    const key = String(value || "upcoming").toLowerCase();
    return ({ upcoming: "Upcoming", active: "Current", during: "Current", completed: "Past", past: "Past", cancelled: "Cancelled", draft: "Draft" })[key] || statusText(key);
  }
  function tripListScreen() {
    if (!state.trips.length) return mobilePage("Trips", `<section class="mobile-empty"><span class="mobile-empty__icon">${icon("luggage", 30)}</span><h1>No trips yet</h1><p>Create your first trip and keep everything in one place.</p>${primaryCta("Create trip", "create-trip", "plus")}</section>`, "trips", `<button class="icon-button" data-action="create-trip" aria-label="Create trip">${icon("plus", 23)}</button>`);
    const groups = [
      ["Current", (t) => String(t.id) === String(state.trip?.id)],
      ["Upcoming", (t) => String(t.id) !== String(state.trip?.id) && ["upcoming", "draft"].includes(String(t.lifecycle_state || t.lifecycleState))],
      ["Past", (t) => ["completed", "past"].includes(String(t.lifecycle_state || t.lifecycleState))],
      ["Cancelled", (t) => String(t.lifecycle_state || t.lifecycleState) === "cancelled"],
    ];
    const content = groups.map(([label, test]) => {
      const trips = state.trips.filter(test);
      if (!trips.length) return "";
      return `<section class="mobile-group"><h2>${label}</h2><div class="mobile-list">${trips.map((trip) => `<button class="trip-row ${String(trip.id) === String(state.trip?.id) ? "is-current" : ""}" data-action="open-trip" data-id="${esc(trip.id)}"><span class="trip-row__mark">${icon("trips", 22)}</span><span class="trip-row__copy"><strong>${esc(trip.title || "Untitled trip")}</strong><small>${esc(formatTripDates(trip))}</small><span>${esc(lifecycleLabel(trip.lifecycle_state || trip.lifecycleState))}</span></span>${icon("chevron", 21, "chevron")}</button>`).join("")}</div></section>`;
    }).join("");
    return mobilePage("Trips", `${content}<button class="mobile-secondary-action" data-action="create-trip">${icon("plus", 20)} Create trip</button>`, "trips", `<button class="icon-button" data-action="create-trip" aria-label="Create trip">${icon("plus", 23)}</button>`);
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
      rows = bookingRows().filter((row) => state.bookingFilter === "all" || (state.bookingFilter === "transport" && ["flight", "train", "car"].includes(row.kind)) || (state.bookingFilter === "stays" && row.kind === "hotel") || (state.bookingFilter === "plans" && !["flight", "train", "car", "hotel"].includes(row.kind)));
    const list = rows.map(({ kind, item, at }) => {
      const transport = ["flight", "train", "car"].includes(kind),
        zone = val(item, "departure_timezone", "start_timezone"),
        title = kind === "flight" ? `${flightNumber(item)} · ${flightRoute(item).fromCode} → ${flightRoute(item).toCode}` : kind === "train" ? val(item, "title", "service_number") || "Train" : kind === "hotel" ? val(item, "property_name", "title") || "Stay" : val(item, "title") || statusText(kind),
        subtitle = kind === "hotel" ? `${formatDateOnly(val(item, "check_in_date"))} – ${formatDateOnly(val(item, "check_out_date"))}` : transport ? formatDateTime(at, zone) : `${formatDateTime(at, zone)}${val(item, "subtitle") ? ` · ${val(item, "subtitle")}` : ""}`,
        status = meaningfulBookingStatus(item);
      return `<button class="travel-row" data-action="booking-detail" data-kind="${esc(kind)}" data-id="${esc(itemId(item))}"><span class="travel-row__icon">${icon(transportIcon(kind), 22)}</span><span class="travel-row__body"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small>${status ? `<em class="travel-state travel-state--attention">${esc(status)}</em>` : ""}</span>${icon("chevron", 20, "chevron")}</button>`;
    }).join("");
    return mobilePage("Bookings", `<div class="segmented-control" role="group" aria-label="Filter bookings">${filters.map(([key,label]) => `<button data-action="filter-bookings" data-filter="${key}" class="${state.bookingFilter === key ? "is-active" : ""}" aria-pressed="${state.bookingFilter === key}">${label}</button>`).join("")}</div><section class="mobile-group booking-trip-group"><h2>${esc(state.trip?.title || "Current trip")}</h2><div class="travel-list">${list || `<section class="mobile-empty mobile-empty--compact"><h1>No bookings here</h1><p>Add transport, a stay, or a plan.</p></section>`}</div></section><button class="mobile-secondary-action" data-action="open-add">${icon("plus", 20)} Add booking</button>`, "bookings", `<button class="icon-button" data-action="open-add" aria-label="Add booking">${icon("plus", 23)}</button>`);
  }
  function selectedTrain() { return state.transport.find((row) => itemId(row) === String(state.selectedId) && String(val(row, "transport_type")) === "train") || state.transport.find((row) => String(val(row, "transport_type")) === "train"); }
  function trainScreen() {
    const train = selectedTrain();
    if (!train) return missingDetailScreen("Train unavailable", "No train booking is available.");
    const from = locationById(val(train, "departure_location_id", "start_location_id")), to = locationById(val(train, "arrival_location_id", "end_location_id")), dep = Number(val(train, "scheduled_departure_utc", "starts_at_utc")) || null, arr = Number(val(train, "scheduled_arrival_utc", "ends_at_utc")) || null, detail = detailFor(train) || {}, doc = state.localDocs.find((d) => d.integrity === "verified" && d.type === "ticket" && (!d.travelerIds?.length || d.travelerIds.some((id) => String(val(train,"traveler_ids")||"").split(",").includes(id))));
    const facts = [["Platform", val(train, "departure_platform", "platform")], ["Coach", val(detail, "coach")], ["Seat", val(detail, "seat")], ["Booking", val(train, "booking_reference")]].filter(([,v]) => v);
    return mobilePage("Train Detail", `<section class="journey-pass journey-pass--train"><header><span>${icon("train", 20)} ${esc(val(train,"carrier_name") || "Train")}</span><strong>${statusText(val(train,"booking_status","status") || "confirmed")}</strong><small>Scheduled data</small></header><div class="journey-route"><div><strong>${esc(val(from,"station_code","iata_code") || "—")}</strong><span>${esc(val(from,"display_name") || "Origin unavailable")}</span></div><span class="journey-route__line">${icon("train", 25)}</span><div><strong>${esc(val(to,"station_code","iata_code") || "—")}</strong><span>${esc(val(to,"display_name") || "Destination unavailable")}</span></div></div><div class="journey-times"><div><span>Departs</span><strong>${esc(formatTime(dep,val(train,"departure_timezone")))}</strong><small>${esc(formatDay(dep,val(train,"departure_timezone")))}</small></div><div><span>Arrives</span><strong>${esc(formatTime(arr,val(train,"arrival_timezone")))}</strong><small>${esc(formatDay(arr,val(train,"arrival_timezone")))}</small></div></div><dl class="journey-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${doc ? primaryCta("Open Ticket","open-document","ticket",`data-id="${esc(doc.id)}"`) : `<div class="inline-recovery">${icon("warning",18)}<span><strong>Ticket not saved offline</strong><small>Add a verified ticket before travel.</small></span></div><button class="mobile-secondary-action" data-action="add-document">${icon("plus",18)} Add ticket</button>`}<button class="mobile-secondary-action" data-action="directions-item" data-id="${esc(itemId(train))}">${icon("navigation",18)} Directions to station</button></section>`, "bookings");
  }
  function selectedPlan() { return state.timeline.find((row) => itemId(row) === String(state.selectedId)) || null; }
  function planScreen() {
    const item = selectedPlan();
    if (!item) return missingDetailScreen("Plan unavailable", "This plan is not available.");
    const location = locationById(val(item,"start_location_id")), contact = contactFor(item), doc = state.localDocs.find((d)=>d.integrity==="verified" && ["reservation","voucher","ticket","qr_code"].includes(d.type));
    const primary = doc ? `<button class="primary-cta" data-action="open-document" data-id="${esc(doc.id)}">${icon("ticket",19)} Open Ticket</button>` : location ? `<button class="primary-cta" data-action="directions-item" data-id="${esc(itemId(item))}">${icon("navigation",19)} Directions</button>` : val(contact,"phone") ? `<button class="primary-cta" data-action="call" data-value="${esc(contact.phone)}">${icon("phone",19)} Call</button>` : "";
    const confirmation = val(item,"confirmation_number","reservation_reference"), notes = val(item,"activity_notes","reservation_notes","notes"), kind = val(item,"activity_type","reservation_type","type") || "Plan";
    return mobilePage(statusText(val(item,"type") || "Plan"), `<section class="plan-hero"><span class="plan-hero__icon">${icon(transportIcon(val(item,"type") || "activity"),28)}</span><span>${esc(statusText(kind))}</span><h1>${esc(val(item,"title") || "Plan")}</h1><p>${esc(formatDateTime(Number(val(item,"starts_at_utc"))||null,val(item,"start_timezone")))}</p></section><section class="detail-list">${location ? `<button class="detail-row" data-action="directions-item" data-id="${esc(itemId(item))}"><span>${icon("pin",20)}</span><span><small>Location</small><strong>${esc(val(location,"display_name") || val(location,"formatted_address"))}</strong></span>${icon("chevron",18)}</button>` : ""}${confirmation ? `<button class="detail-row" data-action="copy" data-value="${esc(confirmation)}"><span>${icon("copy",20)}</span><span><small>Confirmation</small><strong>${esc(confirmation)}</strong></span>${icon("copy",18)}</button>` : ""}${val(contact,"phone") ? `<button class="detail-row" data-action="call" data-value="${esc(contact.phone)}"><span>${icon("phone",20)}</span><span><small>Contact</small><strong>${esc(val(contact,"display_name") || contact.phone)}</strong></span>${icon("chevron",18)}</button>` : ""}</section>${primary}${notes ? `<details class="mobile-disclosure"><summary>Notes ${icon("chevronDown",18)}</summary><p>${esc(notes)}</p></details>` : ""}`, "bookings");
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
    return mobilePage("Traveler", `<section class="traveler-profile"><span class="traveler-avatar traveler-avatar--large">${esc(String(val(traveler,"display_name")||"T").slice(0,1).toUpperCase())}</span><h1>${esc(val(traveler,"display_name")||"Traveler")}</h1><p>${esc(statusText(val(traveler,"traveler_type")||"Traveler"))}</p><button class="text-action" data-action="open-form" data-form="traveler" data-id="${esc(traveler.id)}">Edit traveler</button></section><section class="mobile-group"><h2>Assignments</h2><div class="detail-list">${assigned.map(({kind,item})=>`<div class="detail-row"><span>${icon(transportIcon(kind),20)}</span><span><small>${esc(statusText(kind))}</small><strong>${esc(val(item,"title","property_name")||"Booking")}</strong></span></div>`).join("") || `<p class="muted-copy">No assigned bookings.</p>`}</div></section><section class="mobile-group"><h2>Travel details</h2><div class="fact-grid">${details.flatMap((d)=>[["Seat",val(d,"seat")],["Cabin",val(d,"cabin_class")],["Baggage",val(d,"checked_bags") != null ? `${d.checked_bags} checked` : null],["Ticket",val(d,"ticket_number")]]).filter(([,v])=>v).map(([k,v])=>`<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join("") || `<p class="muted-copy">No traveler-specific booking facts saved.</p>`}</div></section><section class="mobile-group"><h2>Documents</h2><div class="travel-list">${docs.map((d)=>`<button class="travel-row" data-action="open-document" data-id="${esc(d.id)}"><span class="travel-row__icon">${icon("document",20)}</span><span class="travel-row__body"><strong>${esc(d.name)}</strong><small>${d.integrity==="verified"?"Ready offline":statusText(d.integrity)}</small></span>${icon("chevron",18)}</button>`).join("") || `<p class="muted-copy">No traveler-specific documents.</p>`}</div></section><section class="mobile-group"><h2>Checklist</h2><div class="traveler-checklist">${checklist.map((item)=>`<div class="traveler-checklist__row ${val(item,"completed")?"is-complete":""}">${icon(val(item,"completed")?"check":"clock",18)}<span><strong>${esc(val(item,"title")||"Travel essential")}</strong><small>${esc(statusText(val(item,"category")||"packing"))}</small></span></div>`).join("") || `<p class="muted-copy">No traveler-specific essentials.</p>`}</div></section>`, "account");
  }
  function importScreen() {
    // No AI guessing. You review every field before it is added.
    const forward = state.importMode === "forward";
    const control = forward
      ? `<section class="forward-booking-address"><span>${icon("mail",24)}</span><div><strong>bookings@tripto.to</strong><small>Forward from your verified Google email. If more than one trip could match, we will ask you to choose.</small></div></section><label><span>Paste confirmation for immediate review</span><textarea name="body" rows="7" placeholder="Paste the forwarded confirmation email"></textarea></label>`
      : `<label class="smart-import-file"><span>Booking document</span><input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.eml,.docx,.ics,.pkpass,application/pdf,image/*,text/plain,message/rfc822,text/calendar"><small>PDF, image, TXT, EML, DOCX, ICS, or PKPASS · 10 MB max</small></label>`;
    return focusedTaskPage(forward ? "Forward Confirmation" : "Upload Booking", `<section class="form-intro smart-import-intro"><span>${icon(forward ? "mail" : "document",28)}</span><h1>${forward ? "Forward a confirmation" : "Upload a booking"}</h1><p>${forward ? "Only verified senders are accepted. Review uncertain fields before adding anything." : "Recognition stays on this phone. Review every field before saving."}</p></section><form class="mobile-form import-form" id="import-form" novalidate>${control}<p class="form-error" hidden></p><div class="form-save-bar"><button class="mobile-primary-action" type="submit">${icon(forward ? "mail" : "document",19)} Review recognized fields</button></div></form><button class="mobile-secondary-action import-history-action" data-screen="import-history">${icon("clock",19)} Import History</button>`, "import-task");
  }
  function importReviewScreen() {
    const candidates = state.importReview?.candidates || [];
    const duplicate=Boolean(state.importReview?.duplicate);
    return focusedTaskPage("Import Review", `<form id="import-review-form" class="import-review-form"><section class="review-summary ${duplicate?"review-summary--duplicate":""}"><span>${icon(duplicate?"warning":"check",25)}</span><div><strong>${duplicate?"Possible duplicate":"Review before adding"}</strong><small>${duplicate?"This document was imported before. Review the existing import or add another copy intentionally.":"Nothing is added until you confirm."}</small></div></section>${candidates.map((c)=>reviewCandidate(c,duplicate)).join("") || `<section class="mobile-empty"><h1>No booking candidates</h1><p>This format could not be imported safely. Add the booking manually instead.</p></section>`}</form>`, "import-review-task");
  }

  function reviewCandidate(c,duplicate){const payload=c.payload||{},type=val(c,"candidate_type","type")||"reservation",warnings=payload.warnings||c.warnings||[],confidence=Number(c.confidence||0),ignored=new Set(["warnings","fieldMeta","documentKind","filename","checksum"]),fields=new Map(Object.entries(payload).filter(([key,value])=>!ignored.has(key)&&(typeof value==="string"||typeof value==="number")));for(const key of reviewRequiredFields(type))if(!fields.has(key))fields.set(key,"");const control=([key,value])=>{const date=key.endsWith("LocalDatetime"),tz=key.toLowerCase().includes("timezone");return `<label><span>${esc(statusText(key.replace(/([A-Z])/g," $1")))}</span><input type="${date?"datetime-local":"text"}" name="field-${esc(c.id)}-${esc(key)}" value="${esc(value)}" data-field-name="${esc(key)}" ${tz?'placeholder="Europe/Rome"':""}></label>`;};return `<section class="review-card"><header><span class="review-type">${icon(transportIcon(type),19)} ${esc(statusText(type))}</span><span class="travel-state ${confidence<.7?"travel-state--attention":""}">${confidence<.7?"Check carefully":"Recognized"}</span></header>${warnings.length?`<div class="review-warnings">${warnings.map((w)=>`<p>${icon("warning",15)} ${esc(w)}</p>`).join("")}</div>`:""}<label><span>Booking type</span><select name="field-${esc(c.id)}-candidateType">${["flight","hotel","train","car","transfer","ferry","activity","restaurant","reservation","generic_ticket"].map(x=>`<option value="${x}" ${x===type?"selected":""}>${esc(statusText(x))}</option>`).join("")}</select></label><div class="review-fields">${[...fields].map(control).join("")}</div><div class="review-actions">${duplicate?`<button type="button" class="mobile-secondary-action" data-action="add-duplicate-import" data-id="${esc(c.id)}">Add anyway</button>`:`<button type="button" class="mobile-primary-action" data-action="confirm-import" data-id="${esc(c.id)}">Confirm and Import</button>`}<button type="button" class="text-action" data-action="reject-import" data-id="${esc(c.id)}">Reject</button></div></section>`;}
  function reviewRequiredFields(type){if(type==="flight")return["airlineCode","flightNumber","departureIata","arrivalIata","departureLocalDatetime","departureTimezone","arrivalLocalDatetime","arrivalTimezone"];if(type==="hotel")return["propertyName","checkInDate","checkOutDate"];return["title"];}
  function importHistoryScreen() {
    const rows = (state.imports || []).map((row)=>`<button class="travel-row" data-action="review-import" data-id="${esc(row.id)}"><span class="travel-row__icon">${icon(row.candidate_type==="hotel"?"hotel":row.candidate_type==="train"?"train":"plane",20)}</span><span class="travel-row__body"><strong>${esc(row.subject || statusText(row.candidate_type || "Booking"))}</strong><small>${esc(row.created_at ? formatDateTime(Number(row.created_at)) : "Date unavailable")}</small><em class="travel-state ${row.status==="imported"?"":"travel-state--attention"}">${esc(row.status==="imported"?"Imported":"Needs confirmation")}</em></span>${icon("chevron",18)}</button>`).join("");
    return mobilePage("Import History", `<div class="travel-list">${rows || `<section class="mobile-empty"><h1>No imports yet</h1><p>Forwarded bookings you review will appear here.</p></section>`}</div><button class="mobile-secondary-action" data-screen="import">${icon("plus",19)} Import booking</button>`, "account");
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
    const authBlock=mode==="guest"&&google?`<section class="account-signin"><h2>Keep your trips across devices</h2><p>Continue with Google to attach this phone's trips to your verified account.</p><div id="google-signin-button" data-client-id="${esc(google.clientId)}"></div><p class="signin-error" role="alert" hidden></p></section>`:mode==="account"?`<section class="account-signin account-signin--active"><div><strong>${identity?"Google account connected":"Account connected"}</strong><small>${esc(state.account?.user?.primary_email||identity?.email||"")}</small></div><button class="mobile-secondary-action" data-action="sign-out">Sign out</button></section>`:"";
    const upcoming = state.trips.filter((trip)=>!["completed","archived","cancelled"].includes(String(val(trip,"lifecycle_state","lifecycleState")||"upcoming"))).length,
      past = state.trips.length - upcoming,
      identityEmail = state.account?.user?.primary_email || identity?.email || "Google identity";
    return `<div class="phone-app"><section class="screen mobile-v1-screen account-v2">${appBar("Account")}<main class="account-section mobile-page"><div class="account-card"><div class="account-profile"><div class="avatar">${esc(initials)}</div><div><strong>${esc(name)}</strong><div class="account-meta">${mode === "account" ? esc(identityEmail) : "Sign in to keep your trips"}</div></div></div></div>${authBlock}<div class="section-label">My trips</div>${row("trips","Upcoming trips",`${upcoming} trip${upcoming===1?"":"s"}`,"timeline")}${row("clock","Past trips",`${past} trip${past===1?"":"s"}`,"trips")}${row("trips","Switch trip",`${state.trips.length} available`,"","switch-trip")}<div class="section-label">Booking email</div>${row("mail","bookings@tripto.to",mode === "account" ? "Forward from your verified Google email" : "Sign in to verify a sender","","booking-email-info")}<div class="section-label">Preferences</div>${row("refresh","Pending changes",pending?`${pending} waiting for review or sync`:"Everything is synced","sync")}${row("info","Take the tour","How tripto.to works","","open-first-run-how")}${row("info","Help, privacy & terms","Support and legal information","","support")} ${mode === "account" ? `<button class="simple-row simple-row--danger" data-action="sign-out"><span class="row-icon">${icon("back",22)}</span><span class="row-copy"><strong>Sign out</strong><span>Unsynced changes stay protected</span></span>${icon("chevron",22)}</button>` : ""}<p class="app-version">tripto.to Product V2</p></main>${bottomNav("account")}</section></div>`;
  }

  let googleScriptPromise=null;
  function loadGoogleIdentityScript(){if(globalThis.google?.accounts?.id)return Promise.resolve();if(googleScriptPromise)return googleScriptPromise;googleScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error("Google sign-in could not load."));document.head.appendChild(script);});return googleScriptPromise;}
  async function setupGoogleSignIn(){const container=document.getElementById("google-signin-button");if(!container||container.dataset.ready)return;container.dataset.ready="1";try{const challenge=await api("/api/v1/auth/google/challenge",{method:"POST",body:"{}"});await loadGoogleIdentityScript();globalThis.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,use_fedcm_for_prompt:true,callback:async response=>{try{const result=await api("/api/v1/auth/google",{method:"POST",body:JSON.stringify({credential:response.credential,challengeId:challenge.challengeId,nonce:challenge.nonce,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null})});state.token=result.session.token;localStorage.setItem("tripto_token",state.token);await loadApp();showToast("Signed in with Google.");}catch(error){const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error.message;}}}});globalThis.google.accounts.id.renderButton(container,{type:"standard",theme:"outline",size:"large",shape:"pill",text:"continue_with",width:Math.min(350,container.clientWidth||350)});}catch(error){const node=document.querySelector(".signin-error");if(node){node.hidden=false;node.textContent=error?.status>=500?"Google sign-in is not configured for this environment yet.":error.message;}}}
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
      } = options,
      base = `name="${name}" id="form-${name}" ${required ? "required" : ""} ${attrs}`;
    let control;
    if (type === "textarea")
      control = `<textarea ${base} rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
    else if (type === "select") control = `<select ${base}>${choices}</select>`;
    else
      control = `<input type="${type}" ${base} autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
    return `<label class="form-field form-field--${name} ${wide ? "form-field--wide" : ""}" for="form-${name}"><span>${esc(label)}${required ? " <b aria-hidden=\"true\">*</b>" : ""}</span>${control}${helper ? `<small class="field-helper">${esc(helper)}</small>` : ""}</label>`;
  }
  function dateRangeField(startName, endName, label, startLabel, endLabel) {
    const fieldId = `range-${startName}-${endName}`;
    return `<fieldset class="date-range-field form-field--wide" id="${fieldId}"><legend>${esc(label)}</legend><input class="date-range-input" type="hidden" name="${esc(startName)}" id="form-${esc(startName)}"><input class="date-range-input" type="hidden" name="${esc(endName)}" id="form-${esc(endName)}"><button class="date-range-trigger" type="button" data-action="open-date-range" data-start-name="${esc(startName)}" data-end-name="${esc(endName)}" data-range-title="${esc(label)}" data-start-label="${esc(startLabel)}" data-end-label="${esc(endLabel)}" aria-label="${esc(label)}. Choose ${esc(startLabel.toLowerCase())} and ${esc(endLabel.toLowerCase())}" aria-describedby="${fieldId}-status"><span class="date-range-trigger__icon">${icon("calendar", 21)}</span><span class="date-range-trigger__copy"><small>Select dates</small><strong>Choose ${esc(startLabel.toLowerCase())} and ${esc(endLabel.toLowerCase())}</strong></span>${icon("chevron", 18)}</button><span class="sr-only" id="${fieldId}-status" aria-live="polite">No date range selected.</span></fieldset>`;
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
      copy.innerHTML = `<small>Select dates</small><strong>Choose ${esc(startLabel.toLowerCase())} and ${esc(endLabel.toLowerCase())}</strong>`;
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
  function quickTravelerField() {
    if (!state.travelers.length) return "";
    const one = state.travelers.length === 1;
    return `<fieldset class="quick-travelers form-field--wide"><legend>Travelers</legend><p>${one ? "Preselected for this booking. You can change it." : "Choose only the travelers on this booking."}</p><div class="traveler-pills">${state.travelers.map((traveler) => `<label class="traveler-pill"><input type="checkbox" name="travelerIds" value="${esc(traveler.id)}" ${one ? "checked" : ""}><span>${esc(traveler.display_name || "Traveler")}</span></label>`).join("")}</div></fieldset>`;
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
    const configs = {
        trip: { title:"Create Trip", lead:"New trip", fields:[["destination","Where are you going?","text",true,true],["startsOn","Start date","date",true,false],["endsOn","End date","date",true,false],["title","Trip name · Optional","text",false,true]] },
        traveler: { title:editingTraveler?"Edit Traveler":"Add Traveler", lead:"Traveler", fields:[["displayName","Name","text",true,true],["travelerType","Traveler type","select",true,true]] },
        checklist: { title:"Add Essential", lead:"Travel essential", fields:[["title","Item","text",true,true],["category","Group","select-checklist",true,true],["priority","Priority","select-priority",true,true]] },
      }, cfg = configs[kind] || configs.trip;
    const mappedFields = cfg.fields.map(([name,label,type,required,wide]) => { let choices=""; const current=name==="displayName"?val(editingTraveler||{},"display_name"):name==="travelerType"?val(editingTraveler||{},"traveler_type"):""; if(type==="select")choices=['adult','child','infant'].map((option)=>`<option value="${option}" ${current===option?"selected":""}>${statusText(option)}</option>`).join(""); if(type==="select-checklist")choices='<option value="documents">Documents</option><option value="before_you_leave">Before You Leave</option><option value="packing">Packing</option>'; if(type==="select-priority")choices='<option value="medium">Normal</option><option value="high">Important</option><option value="critical">Critical</option>'; return kind === "trip" && type === "date" ? "" : quickField(name,label,{type:type.startsWith("select")?"select":type,required,wide,choices,value:current}); });
    const fields = kind === "trip"
      ? `<div class="form-fields trip-create-fields">${mappedFields[0]}${dateRangeField("startsOn", "endsOn", "Travel dates", "Start date", "End date")}${mappedFields[3]}</div>`
      : `<div class="form-fields">${mappedFields.join("")}</div>`;
    const editAttrs=editingTraveler?` data-edit-id="${esc(editingTraveler.id)}" data-edit-version="${esc(editingTraveler.version||1)}"`:"";
    return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form" id="native-form" data-kind="${esc(kind)}"${editAttrs} novalidate><section class="form-section"><header><span>${esc(cfg.lead)}</span><h1>${kind === "trip" ? "Where are you going?" : esc(cfg.title)}</h1>${kind === "trip" ? "<p>Keep it simple. Add the details later.</p>" : ""}</header>${fields}</section><div class="form-save-bar"><button type="submit" class="mobile-primary-action">${kind === "trip" ? "Create trip" : editingTraveler?"Save changes":`Save ${esc(statusText(kind))}`}</button></div></form>`, "form-screen");
  }
  function mobileFormScreen() {
    const kind = String(state.selectedId || "trip");
    if (!QUICK_ADD_KINDS.has(kind)) return basicMobileForm(kind);
    const titles = {flight:"Add Flight",hotel:"Add Hotel",train:"Add Train",activity:"Add Activity",reservation:"Add Reservation",document:"Add Document"}, title=state.manualLabel || titles[kind];
    if (!state.trip) return noTripQuickAdd(kind, title);
    const localDocumentOptions = `<option value="">No related document</option>${state.localDocs.map((document) => `<option value="${esc(document.id)}">${esc(document.name || statusText(document.type || "Document"))}</option>`).join("")}`;
    let primary="", more="", note="", list="", extraClass="";
    if (kind === "flight") {
      list = quickLocationList("flight");
      primary = `${quickField("flightNumber","Flight number",{required:true,placeholder:"LY 383",helper:"Airline code and number together."})}${quickField("fromLocation","Origin airport",{required:true,placeholder:"TLV — Ben Gurion Airport",attrs:'list="quick-flight-locations" data-location-role="departure"'})}${quickField("toLocation","Destination airport",{required:true,placeholder:"FCO — Rome Fiumicino",attrs:'list="quick-flight-locations" data-location-role="arrival"'})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("departureTimezone","Departure timezone",{required:true,placeholder:"Asia/Jerusalem",attrs:'data-timezone-role="departure"',helper:"Required when the origin airport does not supply a reliable timezone."})}`;
      more = quickMore(kind,"More flight details",`<div class="form-fields">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}${quickField("arrivalTimezone","Arrival timezone",{placeholder:"Europe/Rome",attrs:'data-timezone-role="arrival"'})}${quickField("carrierName","Marketing airline",{})}${quickField("operatingAirlineCode","Operating airline",{})}${quickField("departureTerminal","Terminal",{wide:false})}${quickField("departureGate","Gate",{wide:false})}${quickField("boardingTime","Boarding time",{type:"time",wide:false})}${quickField("gateCloseTime","Gate closes",{type:"time",wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("cabin","Cabin",{wide:false})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickField("bookingReference","PNR",{wide:false})}${quickField("ticketNumber","Ticket number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Departure uses the event-local timezone. Arrival stays unavailable until you add it.";
    } else if (kind === "hotel") {
      primary = `${quickField("propertyName","Hotel name",{required:true,placeholder:"Hotel name"})}${dateRangeField("checkInDate", "checkOutDate", "Stay dates", "Check-in", "Check-out")}${quickDateSuggestions(kind)}`;
      more = quickMore(kind,"More stay details",`<div class="form-fields">${quickField("address","Address or location",{})}${quickField("checkInFrom","Check-in from",{type:"time",wide:false})}${quickField("checkInUntil","Check-in until",{type:"time",wide:false})}${quickField("checkOutBy","Check-out by",{type:"time",wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("roomName","Room name or type",{})}${quickField("bookingStatus","Booking status",{})}${quickTravelerField()}${quickField("phone","Hotel phone",{type:"tel",wide:false})}${quickField("email","Hotel email",{type:"email",wide:false})}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Check-in and check-out times remain unavailable unless you enter them.";
    } else if (kind === "train") {
      const ferry = state.manualLabel === "Ferry",
        originLabel = ferry ? "Departure port" : "Origin station",
        destinationLabel = ferry ? "Arrival port" : "Destination station",
        serviceLabel = ferry ? "Ferry or sailing number" : "Train or service number";
      list = quickLocationList("train");
      primary = `${quickField("fromLocation",originLabel,{required:true,placeholder:ferry?"Port of Civitavecchia":"Roma Termini",attrs:'list="quick-train-locations" data-location-role="departure"'})}${quickField("toLocation",destinationLabel,{required:true,placeholder:ferry?"Port of Olbia":"Firenze S. M. Novella",attrs:'list="quick-train-locations" data-location-role="arrival"'})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("serviceNumber",serviceLabel,{placeholder:"Optional"})}${quickField("departureTimezone","Departure timezone",{required:true,placeholder:"Europe/Rome",attrs:'data-timezone-role="departure"',helper:`Required when the ${ferry?"port":"station"} does not supply a reliable timezone.`})}`;
      more = quickMore(kind,"More train details",`<div class="form-fields">${quickField("carrierName","Operator",{})}${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}${quickField("arrivalTimezone","Arrival timezone",{placeholder:"Europe/Rome"})}${quickField("platform","Platform",{wide:false})}${quickField("coach","Coach",{wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("bookingReference","Booking reference",{wide:false})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Departure uses the event-local timezone. Platform, arrival, coach, and seat are never guessed.";
    } else if (kind === "activity") {
      const cruise = state.manualLabel === "Cruise";
      primary = `${quickField("title",cruise?"Cruise name":"Activity name",{required:true,placeholder:cruise?"Mediterranean cruise":"Vatican Museums"})}${quickField("activityDate",cruise?"Departure date":"Date",{type:"date",required:true})}${quickDateSuggestions(kind)}<fieldset class="time-mode form-field--wide"><legend>Time</legend><div class="time-mode-control"><label><input type="radio" name="timeMode" value="specific" checked><span>Has a specific time</span></label><label><input type="radio" name="timeMode" value="unset"><span>Time not set yet</span></label></div></fieldset><div class="form-fields form-fields--activity-time">${quickField("activityTime","Local time",{type:"time",required:true,wide:false})}${quickField("timezone","Timezone",{required:true,wide:false,placeholder:"Europe/Rome"})}</div>${quickField("location",cruise?"Departure port":"Location",{placeholder:"Optional",attrs:'list="quick-activity-locations" data-location-role="activity"'})}<input type="hidden" name="activityType" value="${cruise?"cruise":"activity"}">`;
      list = quickLocationList("activity");
      more = quickMore(kind,"More details",`<div class="form-fields">${quickField("activityType","Activity type",{})}${quickField("endTime","End time",{type:"time",wide:false})}${quickField("reservationWindow","Reservation window",{wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("provider","Provider or contact",{})}${quickTravelerField()}${quickField("relatedDocument","Document or ticket",{type:"select",choices:localDocumentOptions})}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "A date is always required. Choose Time not set yet explicitly if the booking has no confirmed time.";
    } else if (kind === "reservation") {
      const reservationLabels = {"Car Rental":["Rental company or vehicle","Pickup date","Pickup time","Pickup location","car_rental"],"Transfer":["Transfer","Pickup date","Pickup time","Pickup location","transfer"],"Restaurant":["Restaurant name","Reservation date","Reservation time","Location","restaurant"],"Other":["Booking name","Date","Local time","Location","other"]}, labels=reservationLabels[state.manualLabel]||["Reservation name","Date","Local time","Location","reservation"];
      primary = `${quickField("title",labels[0],{required:true,placeholder:labels[0]})}<div class="form-fields form-fields--date-time">${quickField("reservationDate",labels[1],{type:"date",required:true,wide:false})}${quickField("reservationTime",labels[2],{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("timezone","Timezone",{required:true,placeholder:"Europe/Rome"})}${quickField("location",labels[3],{placeholder:"Optional",attrs:'list="quick-reservation-locations" data-location-role="reservation"'})}<input type="hidden" name="reservationType" value="${esc(labels[4])}">`;
      list = quickLocationList("reservation");
      more = quickMore(kind,"More details",`<div class="form-fields">${quickField("reservationType","Reservation type",{})}${quickField("endTime","End time or window",{type:"time"})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("provider","Provider",{})}${quickField("contact","Contact",{})}${quickTravelerField()}${quickField("relatedDocument","Document",{type:"select",choices:localDocumentOptions})}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Reservation time uses the event-local timezone and is required.";
    } else {
      const bookingOptions = bookingRows().map(({item}) => `<option value="${esc(itemId(item))}">${esc(val(item,"title","property_name")||"Booking")}</option>`).join(""),
        travelerSpecific = state.travelers.length ? quickTravelerField() : "";
      primary = `<div class="form-field form-field--wide quick-document-file"><span>File <b aria-hidden="true">*</b></span><label class="document-file-picker" for="form-documentFile">${icon("document",24)}<span><strong>Choose a file</strong><small>PDF, image, or Wallet pass · up to 10 MB</small></span></label><input class="sr-only" id="form-documentFile" name="documentFile" type="file" accept="application/pdf,image/*,.pkpass" required><div class="document-file-meta" role="status">No file selected</div><div class="document-verify-state">Ready offline appears only after checksum verification succeeds.</div></div>${quickField("documentType","Document type",{type:"select",required:true,choices:'<option value="boarding_pass">Boarding pass</option><option value="ticket">Ticket</option><option value="hotel_confirmation">Hotel confirmation</option><option value="reservation">Reservation</option><option value="voucher">Voucher</option><option value="qr_code">QR code</option><option value="passport_copy">Passport copy</option><option value="other">Other</option>'})}<div class="document-traveler-assignment">${travelerSpecific}</div>`;
      more = quickMore(kind,"More details",`<div class="form-fields">${quickField("relatedBooking","Related booking",{type:"select",choices:`<option value="">No related booking</option>${bookingOptions}`})}</div>`);
      note = "The file stays on this phone. It is not marked Ready until its checksum is verified.";
      extraClass = " document-quick-add";
    }
    const form = `<form class="mobile-form premium-form quick-add-form${extraClass}" id="native-form" data-kind="${esc(kind)}" novalidate>${quickTripContext()}<section class="form-section"><header><span>Quick add</span><h1>${esc(title)}</h1><p>Add the essentials now. Everything else can wait.</p></header><div class="quick-primary-fields">${primary}</div>${list}</section>${more}<p class="form-note">${esc(note)}</p><div class="form-save-bar"><button type="submit" class="mobile-primary-action">${kind === "document" ? "Save on This Phone" : `Save ${esc(statusText(kind))}`}</button></div></form>`;
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
      cells.push(`<button type="button" class="range-day${inMonth ? "" : " is-outside"}${inRange ? " is-between" : ""}${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}" data-action="select-range-day" data-date="${iso}" aria-label="${esc(label)}${isStart ? ", start date" : isEnd ? ", end date" : ""}" aria-pressed="${isStart || isEnd}"><span>${date.getUTCDate()}</span></button>`);
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
    return focusedTaskPage(`Add to ${state.trip.title || "trip"}`, `<section class="v2-task-intro"><span>Add Booking</span><h1>How would you like<br>to add it?</h1><p>Everything you add appears in the Timeline.</p></section><div class="v2-choice-list">${choice("document","Upload Booking","Choose a ticket or confirmation file","open-upload-booking")}${choice("mail","Forward Confirmation Email","Send it to bookings@tripto.to","open-forward-booking")}${choice("plus","Add Manually","Enter only the confirmed details","open-manual-booking")}</div>`, "v2-add-booking");
  }
  function manualBookingSheet() {
    const options = [
      ["plane","Flight","flight"],["hotel","Hotel / Stay","hotel"],["train","Train","train"],
      ["car","Car Rental","reservation"],["navigation","Transfer","reservation"],["trips","Cruise","activity"],
      ["navigation","Ferry","train"],["restaurant","Restaurant","reservation"],["star","Activity / Event","activity"],
      ["calendar","Other","reservation"],
    ];
    return bottomSheet("manual-booking","Add Manually",`<div class="sheet-options-group manual-v2-options">${options.map(([ic,title,type])=>`<button class="sheet-option" data-action="add-type" data-type="${type}" data-manual-label="${esc(title)}"><span class="info-icon">${icon(ic,21)}</span><span><strong>${esc(title)}</strong></span>${icon("chevron",20)}</button>`).join("")}</div>`);
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
            `<button class="sheet-option" data-action="select-trip" data-id="${esc(trip.id)}"><span class="info-icon">${icon("trips", 22)}</span><span><strong>${esc(trip.title)}</strong><small>${esc(formatTripDates(trip))}</small></span>${String(trip.id) === String(state.trip?.id) ? checkDot() : icon("chevron", 22, "chevron")}</button>`,
        )
        .join(""),
    );
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
    return `<div class="phone-app"><div class="app-loading">${loadingSkeleton()}</div></div>`;
  }
  function errorScreen() {
    return `<div class="phone-app"><section class="screen">${topbar()}<div class="error-state"><div class="empty-mobile-icon">${icon("warning", 31)}</div><h1>Trip data could not load</h1><p>${esc(state.error || "An unexpected error occurred.")}</p><p class="recovery-safe">Saved trip data on this phone remains safe.</p>${state.requestId ? `<code>Request ID: ${esc(state.requestId)}</code>` : ""}${primaryCta("Try Again", "retry", "refresh")}</div>${bottomNav("home")}</section></div>`;
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
    const current = app?.querySelector(".phone-app"),
      reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!current || reduced || state.loading) {
      render();
      return;
    }
    clearTimeout(routeTimer);
    const motion = state.routeMotion || "tab";
    current.classList.add("route-exit", `route-exit-${motion}`);
    routeTimer = setTimeout(render, motion === "tab" ? 70 : 90);
  }
  function render() {
    if (!app) return;
    const firstRun = shouldShowFirstRun();
    syncFirstRunPresentation(firstRun);
    document.documentElement.classList.toggle(
      "sheet-open",
      Boolean(state.sheet && state.sheet !== "driver"),
    );
    if (state.loading) {
      app.innerHTML = decorateScreen(loadingScreen());
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
          html = homeScreen();
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
    if (state.sheet === "manual-booking") html += manualBookingSheet();
    if (state.sheet === "date-range") html += dateRangeSheet();
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
    const kind = form.dataset.kind;
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
    if (kind === "hotel") {
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
    if (["flight", "train"].includes(kind)) {
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
          "Add arrival date, local time, and timezone together—or leave all three unavailable.",
        );
        return false;
      }
      if (kind === "flight" && !hasDate && !hasTime) {
        const flightOnly = [
          "operatingAirlineCode",
          "departureTerminal",
          "departureGate",
          "boardingTime",
          "gateCloseTime",
        ]
          .map((name) => form.elements[name])
          .find((control) => String(control?.value || "").trim());
        if (flightOnly) {
          showFieldError(
            form,
            flightOnly,
            "Add arrival details before saving this flight-only field, or leave it unavailable for now.",
          );
          return false;
        }
      }
    }
    if (
      kind === "activity" &&
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
        ? form.elements.arrivalTimezone ||
          form.elements.departureTimezone ||
          form.elements.timezone
        : arrivalError
          ? form.elements.arrivalTime
          : timeError
            ? form.elements.departureTime || form.elements.startsAt
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
      formHasMeaningfulChanges = [...form.elements].some((control) => {
        if (!control.name || control.disabled) return false;
        if (control.type === "file") return Boolean(control.files?.length);
        if (["checkbox", "radio"].includes(control.type))
          return control.checked !== control.defaultChecked;
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
  function syncQuickTimezone(form, input) {
    const kind = form.dataset.kind,
      role = input.dataset.locationRole,
      locationKind = kind === "flight" ? "flight" : kind === "train" ? "train" : "activity",
      location = knownLocationForInput(input.value, locationKind),
      timezone = String(val(location, "timezone") || ""),
      timezoneName = role === "arrival" ? "arrivalTimezone" : kind === "activity" || kind === "reservation" ? "timezone" : "departureTimezone",
      control = form.elements[timezoneName],
      field = control?.closest(".form-field");
    if (!control || !field) return;
    field.querySelector(".timezone-derived")?.remove();
    if (timezone) {
      control.value = timezone;
      control.dataset.derived = "true";
      field.classList.add("is-derived-timezone");
      field.insertAdjacentHTML(
        "afterend",
        `<p class="timezone-derived" data-timezone-status="${esc(role)}">${icon("check", 15)} ${esc(timezone)} from the selected ${kind === "train" ? "station" : kind === "flight" ? "airport" : "location"}</p>`,
      );
    } else {
      if (control.dataset.derived === "true") control.value = "";
      delete control.dataset.derived;
      field.classList.remove("is-derived-timezone");
    }
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
            verifyState.textContent =
              "Ready offline appears only after checksum verification succeeds.";
            return;
          }
          fileMeta.textContent = `${file.name} · ${
            file.size < 1048576
              ? `${Math.max(1, Math.round(file.size / 1024))} KB`
              : `${(file.size / 1048576).toFixed(1)} MB`
          }`;
          verifyState.textContent = "Ready to verify when saved on this phone.";
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
  function quickLocationParts(value, kind) {
    const known = knownLocationForInput(value, kind);
    if (known) return { known, name: String(val(known, "display_name", "local_name") || value), code: String(val(known, kind === "flight" ? "iata_code" : "station_code") || "") };
    const text = String(value || "").trim(), match = text.match(/^([A-Z0-9]{2,12})\s+[—-]\s+(.+)$/i);
    return { known: null, name: match ? match[2].trim() : text, code: match ? match[1].toUpperCase() : "" };
  }
  async function quickLocation(value, kind, timezone = "") {
    const parts = quickLocationParts(value, kind);
    if (parts.known) return parts.known;
    const type = kind === "flight" ? "airport" : kind === "train" ? "station" : kind === "hotel" ? "hotel" : kind === "reservation" ? "restaurant" : "attraction";
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
    if (!itemId || travelerIds.length !== 1) return;
    const values = {
      seat: fd.get("seat") || null,
      cabinClass: fd.get("cabin") || null,
      ticketNumber: fd.get("ticketNumber") || null,
      checkedBags: fd.get("checkedBags") === "" ? null : Number(fd.get("checkedBags")),
    };
    if (!Object.values(values).some((value) => value !== null && value !== "")) return;
    await api(`/api/v1/trips/${tripId}/booking-details`, { method: "PUT", body: JSON.stringify({ tripItemId: itemId, travelerId: travelerIds[0], ...values }) });
  }
  async function saveItemContact(tripId, itemId, type, displayName, fd) {
    const phone = String(fd.get("phone") || ""), email = String(fd.get("email") || ""), notes = String(fd.get("notes") || "");
    if (!displayName && !phone && !email && !notes) return;
    await api(`/api/v1/trips/${tripId}/contacts`, { method: "POST", body: JSON.stringify({ contactType: type, displayName: displayName || statusText(type), phone: phone || null, email: email || null, notes: notes || null, tripItemId: itemId }) });
  }
  async function saveNativeForm(form) {
    const kind=form.dataset.kind, fd=new FormData(form), tripId=encodeURIComponent(state.trip?.id || ""), isFirstTripCreation=kind==="trip"&&state.trips.length===0;
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
        const result=await api("/api/v1/trips",{method:"POST",body:JSON.stringify({title:values.title,startsOn:values.startsOn,endsOn:values.endsOn,lifecycleState:"upcoming"})}); state.trips.unshift(result.trip); state.trip=result.trip; state.tripsLoaded=true; localStorage.setItem("tripto_selected_trip",result.trip.id);
      } else if (kind === "hotel") {
        let locationId=null; if(fd.get("address")){ const location=await createMobileLocation("hotel",fd.get("propertyName"),{formattedAddress:fd.get("address")}); locationId=location.id; }
        const result=await api(`/api/v1/trips/${tripId}/stays`,{method:"POST",body:JSON.stringify({propertyName:fd.get("propertyName"),propertyLocationId:locationId,checkInDate:fd.get("checkInDate"),checkOutDate:fd.get("checkOutDate"),checkInFrom:fd.get("checkInFrom")||null,checkInUntil:fd.get("checkInUntil")||null,checkOutBy:fd.get("checkOutBy")||null,confirmationNumber:fd.get("confirmationNumber")||null,roomName:fd.get("roomName")||null,bookingStatus:fd.get("bookingStatus")||null,travelerIds:selectedTravelerIds(fd)})});
        await saveItemContact(tripId, result.stay?.id, "hotel", String(fd.get("propertyName")||""), fd);
      } else if (["flight","train"].includes(kind)) {
        const depTz=String(fd.get("departureTimezone")||""), arrTz=String(fd.get("arrivalTimezone")||""), dep=resolveEventLocalDateTime(localDateTime(fd,"departureDate","departureLocalTime"),depTz), arrivalLocal=localDateTime(fd,"arrivalDate","arrivalLocalTime"), arr=arrivalLocal ? resolveEventLocalDateTime(arrivalLocal,arrTz) : null;
        if(arr!=null&&arr<dep) throw new Error("Arrival cannot be before departure.");
        const from=await quickLocation(fd.get("fromLocation"),kind,depTz), to=await quickLocation(fd.get("toLocation"),kind,arrTz), travelers=selectedTravelerIds(fd), flight=kind==="flight"?parseFlightNumber(fd.get("flightNumber")):null;
        const boarding=fd.get("boardingTime")?resolveEventLocalDateTime(`${fd.get("departureDate")}T${fd.get("boardingTime")}`,depTz):null, gateClose=fd.get("gateCloseTime")?resolveEventLocalDateTime(`${fd.get("departureDate")}T${fd.get("gateCloseTime")}`,depTz):null;
        const title=flight?flight.raw:`${fd.get("carrierName")||"Train"}${fd.get("serviceNumber")?` ${fd.get("serviceNumber")}`:""}`;
        const transportType=kind==="train"&&state.manualLabel==="Ferry"?"ferry":kind;
        const result=await api(`/api/v1/trips/${tripId}/transport`,{method:"POST",body:JSON.stringify({transportType,title,carrierName:fd.get("carrierName")||null,serviceNumber:kind==="flight"?flight.number:(fd.get("serviceNumber")||null),marketingAirlineCode:flight?.code||null,marketingFlightNumber:flight?.number||null,operatingAirlineCode:fd.get("operatingAirlineCode")||null,departureTerminal:fd.get("departureTerminal")||null,departureGate:fd.get("departureGate")||null,boardingTimeUtc:boarding,gateCloseTimeUtc:gateClose,departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:depTz,arrivalTimezone:arrTz||null,bookingReference:fd.get("bookingReference")||null,travelerIds:travelers})});
        await saveTravelerFacts(tripId,result.item?.id,travelers,fd);
        if (kind === "train") {
          const structured = [
            fd.get("platform") ? `Platform: ${fd.get("platform")}` : "",
            fd.get("coach") ? `Coach: ${fd.get("coach")}` : "",
            fd.get("notes") || "",
          ].filter(Boolean).join("\n");
          fd.set("notes", structured);
        }
        await saveItemContact(tripId,result.item?.id,kind==="flight"?"airline":"other",String(fd.get("carrierName")||title),fd);
      } else if (["activity","reservation"].includes(kind)) {
        const dateName=kind==="activity"?"activityDate":"reservationDate", timeName=kind==="activity"?"activityTime":"reservationTime", unset=kind==="activity"&&fd.get("timeMode")==="unset", timezone=unset?"":String(fd.get("timezone")||""), local=unset?"":localDateTime(fd,dateName,timeName), ms=unset?null:resolveEventLocalDateTime(local,timezone), locationName=String(fd.get("location")||""), location=locationName ? await quickLocation(locationName,kind,timezone) : null;
        const end=fd.get("endTime")&&!unset?resolveEventLocalDateTime(`${fd.get(dateName)}T${fd.get("endTime")}`,timezone):null;
        if(ms!=null&&end!=null&&end<ms) throw new Error("End time cannot be before the start time.");
        const explicitDate=String(fd.get(dateName)||""), contactNote=fd.get("contact")?`Contact: ${fd.get("contact")}`:"", windowNote=fd.get("reservationWindow")?`Reservation window: ${fd.get("reservationWindow")}`:"", userNotes=String(fd.get("notes")||""), notes=[...(unset?[`Date: ${explicitDate}`,"Time not set yet"]:[]),windowNote,contactNote,userNotes].filter(Boolean).join(" · ")||null, travelers=selectedTravelerIds(fd);
        const result=await api(`/api/v1/trips/${tripId}/activities`,{method:"POST",body:JSON.stringify({kind,status:"confirmed",title:fd.get("title"),startsAtUtc:ms,endsAtUtc:end,timezone:timezone||null,locationId:location?.id||null,activityType:kind==="activity"?(fd.get("activityType")||null):null,reservationType:kind==="reservation"?(fd.get("reservationType")||"reservation"):null,reference:fd.get("confirmationNumber")||null,notes,confidence:"confirmed",travelerIds:travelers})});
        if(fd.get("provider") && result.item?.id) await api(`/api/v1/trips/${tripId}/contacts`,{method:"POST",body:JSON.stringify({contactType:"tour_operator",displayName:fd.get("provider"),notes:contactNote||null,tripItemId:result.item.id})});
        await linkLocalDocument(fd.get("relatedDocument"),result.item?.id);
      } else if (kind === "document") {
        await saveLocalDocument(form.elements.documentFile.files?.[0],fd.get("documentType"),selectedTravelerIds(fd),fd.get("relatedBooking")||null);
      } else if (kind === "traveler") {
        const editId=String(form.dataset.editId||"");
        await api(`/api/v1/trips/${tripId}/travelers${editId?`/${encodeURIComponent(editId)}`:""}`,{method:editId?"PATCH":"POST",body:JSON.stringify({displayName:fd.get("displayName"),travelerType:fd.get("travelerType"),...(editId?{version:Number(form.dataset.editVersion)}:{})})});
      } else if (kind === "checklist") {
        await api(`/api/v1/trips/${tripId}/checklist`,{method:"POST",body:JSON.stringify({title:fd.get("title"),category:fd.get("category"),priority:fd.get("priority")})});
      }
      await loadTripDetails(); clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(`${state.manualLabel || statusText(kind)} saved.`); state.manualLabel=null; route(kind==="document"?"documents":kind==="trip"?"add-booking":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"timeline",null,true);
    } catch (error) {
      const message = error?.status === 409
        ? "A newer saved version exists. Review it before trying again. Your entered data is still here."
        : error.message || "The change was not saved.";
      showFormSubmissionError(form,message);
    } finally {
      if (document.contains(form)) setFormSaving(form, false);
    }
  }
  async function previewImportForm(form) {
    if (form.getAttribute("aria-busy") === "true") return;
    setFormSaving(form, true, "Preparing preview…");
    try {
      const fd=new FormData(form),file=form.elements.document?.files?.[0],pasted=String(fd.get("body")||"").trim();
      if(!file&&!pasted)throw new Error("Choose a booking document or paste a confirmation email.");
      if(file){
        if(!globalThis.TriptoSmartImport)throw new Error("Local document recognition is unavailable. Reload and try again.");
        const local=await saveLocalDocument(file,"other",[]),result=await globalThis.TriptoSmartImport.recognizeFile(file);
        state.importLocalDocumentId=local.id;
        if(!result.candidates.length){state.importReview={candidates:[],localOnly:true,warnings:result.warnings};formHasMeaningfulChanges=false;route("import-review");return;}
        const candidate=result.candidates[0],safeFields=Object.fromEntries(Object.entries(candidate.fields).filter(([key])=>key!=="barcodeValue")),requestBody={checksum:result.checksum,filename:file.name,documentKind:result.kind,candidate:{type:candidate.type,confidence:candidate.confidence,fields:safeFields,warnings:candidate.warnings}};
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
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      "_blank",
      "noopener",
    );
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
      case "open-add":
        openSheet("add", target);
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
          render();
        }
        break;
      case "select-range-day":
        if (state.dateRange) {
          const selected = String(target.dataset.date || "");
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
        route("form", "trip");
        break;
      case "open-timeline":
        route("timeline");
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
        if (!PREVIEW_MODE) {
          state.loading = true;
          render();
          await loadTripDetails();
          state.loading = false;
        }
        route("form", kind, true);
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
        state.loading = true;
        render();
        await loadTripDetails();
        state.loading = false;
        if (state.screen === "form" && QUICK_ADD_KINDS.has(state.selectedId))
          route("form", state.selectedId, true);
        else route("timeline", null, true);
        break;
      }
      case "add-type": {
        const type = target.dataset.type;
        state.manualLabel = target.dataset.manualLabel || null;
        state.editingEntity = null;
        closeSheet();
        route("form", type);
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
        if(!trip)return; state.trip=trip; localStorage.setItem("tripto_selected_trip",trip.id); if(!PREVIEW_MODE){state.loading=true;render();await loadTripDetails();state.loading=false;} route("timeline"); break;
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
        else if (transport && String(val(transport, "transport_type")) === "train") route("train", id);
        else if (stay) route("hotel", id);
        else route("plan", id);
        break;
      }
      case "booking-detail": {
        const kind = target.dataset.kind,
          id = target.dataset.id;
        if (kind === "flight") route("flight", id);
        else if (kind === "hotel") route("hotel", id);
        else if (kind === "train") route("train", id);
        else route("plan", id);
        break;
      }
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
      case "export-trip": if(PREVIEW_MODE)showToast("Trip export is available outside preview mode."); else window.open(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/export/json`,`_blank`,`noopener`); break;
      case "support": if(PREVIEW_MODE)showToast("Support bundle is available outside preview mode."); else window.open(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/support`,`_blank`,`noopener`); break;
      case "booking-email-info":
        showToast("Forward booking confirmations to bookings@tripto.to from your verified Google email.");
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
    await flushSmartImportQueue();
    loadApp();
  });
  window.addEventListener("offline", () => {
    state.offline = true;
    render();
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
  loadApp();
})();
