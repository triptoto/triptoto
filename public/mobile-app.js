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

  const ICONS = {
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    home: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V21h14V10.5"></path><path d="M9 21v-6h6v6"></path>',
    trips:
      '<rect x="4" y="7" width="16" height="13" rx="2"></rect><path d="M9 7V5h6v2"></path><path d="M8 11v5M16 11v5"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    ticket:
      '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"></path><path d="M9 8v8"></path>',
    plane: '<path d="m2 16 20-8-3-3-8 3-4-4-2 1 3 5-4 2-2-1-1 1 3 3Z"></path>',
    chevron: '<path d="m9 18 6-6-6-6"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    qr: '<rect x="3" y="3" width="6" height="6"></rect><rect x="15" y="3" width="6" height="6"></rect><rect x="3" y="15" width="6" height="6"></rect><path d="M15 15h3v3h-3zM18 18h3v3h-3zM18 12h3v3h-3zM12 18h3v3h-3z"></path>',
    hotel:
      '<path d="M4 21V8l8-4 8 4v13"></path><path d="M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3"></path>',
    train:
      '<rect x="5" y="3" width="14" height="15" rx="3"></rect><path d="M8 7h8M8 13h.01M16 13h.01M8 18l-2 3M16 18l2 3"></path>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path>',
    restaurant:
      '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 2-2 6 0 8v10"></path>',
    document:
      '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5M9 13h6M9 17h6"></path>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path>',
    clock:
      '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    night:
      '<path d="M16.8 17.4A7.5 7.5 0 0 1 7.2 7.2a7.5 7.5 0 1 0 9.6 10.2Z"></path><path d="M16.5 4.5v3M15 6h3M20 9v2M19 10h2"></path>',
    day:
      '<path d="M5 16h14"></path><path d="M7 16a5 5 0 0 1 10 0"></path><path d="M12 4v3M4.9 8.9 7 11M19.1 8.9 17 11M3 20h18"></path>',
    terminal:
      '<path d="M4 20h16M6 20v-6h12v6M9 14V9h6v5M10 9V6h4v3M8 17h2M14 17h2"></path>',
    gate:
      '<path d="M6 21V7h12v14M9 21v-8h6v8M5 7h14M8 4h8v3M12 16h.01"></path>',
    seat:
      '<path d="M8 4v8a4 4 0 0 0 4 4h5"></path><path d="M8 9h5a3 3 0 0 1 3 3v4M6 20h12M9 16l-1 4M16 16l1 4"></path>',
    chevronDown: '<path d="m6 9 6 6 6-6"></path>',
    chevronUp: '<path d="m6 15 6-6 6 6"></path>',
    back: '<path d="m15 18-6-6 6-6"></path>',
    share:
      '<path d="M12 16V3M8 7l4-4 4 4"></path><path d="M5 12v8h14v-8"></path>',
    luggage:
      '<rect x="6" y="6" width="12" height="15" rx="2"></rect><path d="M9 6V4h6v2M9 10v7M15 10v7"></path>',
    navigation: '<path d="m21 3-8 18-2-8-8-2 18-8Z"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
    warning:
      '<path d="M12 3 2.5 20h19L12 3Z"></path><path d="M12 9v5M12 17h.01"></path>',
    download:
      '<path d="M12 3v12M7 10l5 5 5-5"></path><path d="M4 19h16"></path>',
    car: '<path d="m5 11 2-5h10l2 5"></path><rect x="3" y="10" width="18" height="8" rx="2"></rect><path d="M6 18v2M18 18v2M7 14h.01M17 14h.01"></path>',
    phone:
      '<path d="M8 3H5a2 2 0 0 0-2 2c0 9 7 16 16 16a2 2 0 0 0 2-2v-3l-5-1-2 3c-4-2-6-4-8-8l3-2-1-5Z"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>',
    copy: '<rect x="8" y="8" width="11" height="13" rx="2"></rect><path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    passport:
      '<rect x="5" y="3" width="14" height="18" rx="2"></rect><circle cx="12" cy="11" r="3"></circle><path d="M9 11h6M12 8c1 2 1 4 0 6M8 17h8"></path>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"></path><path d="M9 3v15M15 6v15"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    shield:
      '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"></path><path d="m9 12 2 2 4-5"></path>',
    refresh:
      '<path d="M20 11a8 8 0 1 0 2 5"></path><path d="M20 4v7h-7"></path>',
  };
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
    imports: [],
    importReview: null,
    bookingFilter: "all",
    formDraft: null,
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
    return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="${extra}">${ICONS[name] || ""}</svg>`;
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
    const raw = location.hash.replace(/^#/, "") || "home";
    const [screen, id] = raw.split(":");
    return { screen: screen || "home", id: id ? decodeURIComponent(id) : null };
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
    const hash = "#" + screen + (id ? ":" + encodeURIComponent(id) : "");
    state.routeMotion =
      kind === "tab" ? "tab" : kind === "back" ? "back" : "forward";
    if (replace) history.replaceState(null, "", hash);
    else if (location.hash !== hash) history.pushState(null, "", hash);
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
      checksum: await sha256Blob(file),
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
        state.trips[0] ||
        null;
      if (state.trip)
        localStorage.setItem("tripto_selected_trip", state.trip.id);
      await loadTripDetails();
      state.tripsLoaded = true;
    } catch (error) {
      state.tripsLoaded = false;
      state.error = error instanceof Error ? error.message : String(error);
      state.requestId = error?.requestId || null;
    } finally {
      state.loading = false;
      render();
    }
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
      ["home", "home", "Home"],
      ["trips", "trips", "Trip"],
      ["add", "plus", "Add"],
      ["bookings", "ticket", "Bookings"],
      ["account", "user", "Account"],
    ];
    return `<nav class="bottom-nav" aria-label="Primary navigation">${rows.map(([screen, ic, label]) => (screen === "add" ? `<button class="nav-item nav-add" data-action="open-add" aria-label="Add trip item"><span>${icon(ic, 27)}</span><small>${label}</small></button>` : `<button class="nav-item ${active === screen ? "active" : ""}" data-screen="${screen}" ${active === screen ? 'aria-current="page"' : ""}>${icon(ic, 23)}<span>${label}</span></button>`)).join("")}</nav>`;
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
    return Boolean(
      state.tripsLoaded &&
        !state.loading &&
        !state.error &&
        state.screen === "home" &&
        !state.trip &&
        state.trips.length === 0,
    );
  }
  function syncFirstRunPresentation(active) {
    document.documentElement.classList.toggle("first-run-open", active);
    document.documentElement.classList.toggle(
      "first-run-reduced-motion",
      active && LOCAL_QA_MODE && QA_STATE === "empty-reduced-motion",
    );
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", active ? "#141948" : "#ffffff");
  }
  function firstRunProductPreview() {
    return `<section class="first-run-preview" aria-label="Example trip product preview"><div class="first-run-preview__layer" aria-hidden="true"></div><header class="first-run-preview__header"><span class="first-run-preview__badge">Preview</span><span class="first-run-preview__ready">${icon("check", 14)} Offline ready</span></header><div class="first-run-preview__route"><span><strong>TLV</strong><small>Aug 20</small></span><span class="first-run-preview__journey" aria-hidden="true"><i></i>${icon("plane", 24)}<i></i></span><span><strong>FCO</strong><small>Aug 26</small></span></div><div class="first-run-preview__progress" aria-hidden="true"><i class="is-complete"></i><span></span><i class="is-current"></i><span></span><i></i></div><footer class="first-run-preview__footer"><span>${icon("calendar", 18)}<span><strong>3 plans organized</strong><small>In travel order</small></span></span><span class="first-run-preview__pass" aria-hidden="true">${icon("ticket", 20)}</span></footer></section>`;
  }
  function firstRunScreen() {
    const offline = state.offline
      ? `<span class="first-run-offline" role="status">${icon("info", 14)} Offline</span>`
      : "";
    return `<div class="phone-app"><section class="first-run-screen screen--navless" aria-labelledby="first-run-title"><div class="first-run-aurora" aria-hidden="true"></div><div class="first-run-orbit" aria-hidden="true"><span class="first-run-orbit__track"></span><span class="first-run-orbit__plane">${icon("plane", 46)}</span></div><div class="first-run-clouds" aria-hidden="true"><i></i><i></i><i></i></div><header class="first-run-brand-row"><div class="first-run-brand" role="img" aria-label="tripto.to">tripto<span>.</span>to</div>${offline}</header><main class="first-run-main"><section class="first-run-hero"><h1 id="first-run-title"><span>Your trip.</span><span>Ready before</span><span>you need it.</span></h1><p><span>Organize everything in one place.</span><span>Travel calm, prepared and offline-ready.</span></p></section><div class="first-run-actions"><button class="first-run-primary" data-action="create-trip">${icon("plus", 18)}<span>Create my first trip</span>${icon("chevron", 19)}</button><button class="first-run-secondary" data-action="open-first-run-how">${icon("info", 18)}<span>See how it works</span></button></div>${firstRunProductPreview()}<section class="first-run-benefits" aria-label="tripto.to benefits"><article><span>${icon("calendar", 18)}</span><strong>Timeline</strong><small>Your trip, in order.</small></article><article><span>${icon("download", 18)}</span><strong>Offline Ready</strong><small>Plans and documents anywhere.</small></article><article><span>${icon("shield", 18)}</span><strong>Smart Essentials</strong><small>Only what still needs attention.</small></article></section></main></section></div>`;
  }
  function timelineScreen() {
    if (!state.trip)
      return `<div class="phone-app"><section class="screen timeline-screen">${appBar("Trip")}<main class="timeline-page timeline-page--empty"><div class="timeline-empty"><span class="timeline-empty__icon">${icon("calendar", 28)}</span><h1>No trip selected</h1><p>Create or select a trip first.</p>${primaryCta("Create a Trip", "create-trip", "plus")}</div></main>${bottomNav("trips")}</section></div>`;
    const now = Date.now(),
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
      : `<div class="timeline-empty"><span class="timeline-empty__icon">${icon("calendar", 28)}</span><h1>No plans yet</h1><p>Add your first flight, stay, train, or activity.</p>${primaryCta("Add to trip", "open-add", "plus")}</div>`;
    return `<div class="phone-app"><section class="screen timeline-screen">${appBar(state.trip.title || "Trip", formatTripDates(state.trip))}${mobileAlert()}<main class="timeline-page ${groups.length ? "timeline-page--journey" : "timeline-page--empty"}">${content}</main>${bottomNav("trips")}</section></div>`;
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
    return focusedTaskPage("Import Booking", `<section class="form-intro"><span>${icon("mail",28)}</span><h1>Paste a booking confirmation</h1><p>No AI guessing. You review every field before it is added.</p></section><form class="mobile-form import-form" id="import-form" novalidate><label><span>Forwarded email</span><textarea name="body" rows="12" required placeholder="Paste the full airline, hotel, train, or activity confirmation here"></textarea></label><div class="form-save-bar"><button class="mobile-primary-action" type="submit">${icon("document",19)} Preview Booking</button></div></form><button class="mobile-secondary-action import-history-action" data-screen="import-history">${icon("clock",19)} Import History</button>`, "import-task");
  }
  function importReviewScreen() {
    const candidates = state.importReview?.candidates || (PREVIEW_MODE ? [{id:"candidate-1",type:"flight",title:"LY 383 · TLV → FCO",confidence:"low",warnings:["Timezone missing","Date is ambiguous"]}] : []);
    return focusedTaskPage("Import Review", `<form id="import-review-form" class="import-review-form"><section class="review-summary"><span>${icon("warning",25)}</span><div><strong>${candidates.some((c)=>String(c.confidence).toLowerCase() === "low") ? "Needs confirmation" : "Ready to import"}</strong><small>Nothing is added until you confirm.</small></div></section>${candidates.map((c)=>{ const warnings=c.warnings||[], payload=c.payload||{}; return `<section class="review-card"><header><span class="review-type">${icon(transportIcon(val(c,"type")||"flight"),19)} ${esc(statusText(val(c,"type")||"Booking"))}</span><span class="travel-state ${String(c.confidence).toLowerCase()==="low"?"travel-state--attention":""}">${String(c.confidence).toLowerCase()==="low"?"Needs confirmation":"Ready to import"}</span></header><h2>${esc(val(c,"title") || statusText(val(c,"type")||"Booking"))}</h2>${warnings.length?`<div class="review-warnings">${warnings.map((w)=>`<p>${icon("warning",15)} ${esc(w)}</p>`).join("")}</div>`:""}<div class="review-fields">${warnings.some((w)=>/timezone/i.test(w))?`<label><span>Timezone</span><input type="text" name="candidate-timezone" value="${esc(payload.departureTimezone||payload.timezone||"")}" placeholder="Europe/Rome"></label>`:""}${warnings.some((w)=>/date|time/i.test(w))?`<label><span>Travel date and time</span><input type="datetime-local" name="candidate-date" value="${esc(payload.localDateTime||payload.departureLocalDatetime||"")}"></label>`:""}</div><button type="button" class="mobile-primary-action" data-action="confirm-import" data-id="${esc(c.id)}">Confirm and Import</button></section>`; }).join("") || `<section class="mobile-empty"><h1>No booking candidates</h1><p>This format could not be imported safely.</p></section>`}</form>`, "import-review-task");
  }
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
    return `<div class="phone-app"><section class="screen mobile-v1-screen">${appBar("Account")}<main class="account-section mobile-page"><div class="account-card"><div class="account-profile"><div class="avatar">${esc(initials)}</div><div><strong>${esc(name)}</strong><div class="account-meta">${mode === "account" ? "Signed in" : "Using this device without an account"}</div></div></div></div><div class="section-label">Your trip</div>${row("user","Travelers",`${state.travelers.length} traveler${state.travelers.length===1?"":"s"}`,"travelers")}${row("document","Documents",`${state.localDocs.length} saved on this phone`,"documents")}${row("download","Offline storage",`${state.localDocs.length} files · ${Math.max(0.1,bytes/1048576).toFixed(1)} MB`,"ready")}${row("refresh","Pending changes",pending?`${pending} waiting for review or sync`:"Everything is synced","sync")}<div class="section-label">Tools</div>${row("mail","Import booking","Paste a forwarded confirmation","import")}${row("check","Smart Essentials",`${state.checklist.filter((x)=>!x.completed).length} incomplete`,"checklist")}${row("shield","Trip Health","Review what needs attention","health")}${row("trips","Switch trip",`${state.trips.length} trip${state.trips.length===1?"":"s"} available`,"","switch-trip")}<div class="section-label">Privacy & help</div>${row("share","Export trip","Download your trip data","","export-trip")}${row("info","Help & support","Beta support bundle","","support")}<button class="simple-row simple-row--danger" data-action="remove-local-data"><span class="row-icon">${icon("close",22)}</span><span class="row-copy"><strong>Remove local data</strong><span>${pending?"Pending changes must be reviewed first":"Deletes files stored on this phone"}</span></span>${icon("chevron",22)}</button><p class="app-version">tripto.to Mobile UI v1</p><a class="legacy-link" href="/legacy.html">Advanced beta tools</a></main>${bottomNav("account")}</section></div>`;
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
      } = options,
      base = `name="${name}" id="form-${name}" ${required ? "required" : ""} ${attrs}`;
    let control;
    if (type === "textarea")
      control = `<textarea ${base} rows="4" placeholder="${esc(placeholder)}"></textarea>`;
    else if (type === "select") control = `<select ${base}>${choices}</select>`;
    else
      control = `<input type="${type}" ${base} autocomplete="off" placeholder="${esc(placeholder)}">`;
    return `<label class="form-field form-field--${name} ${wide ? "form-field--wide" : ""}" for="form-${name}"><span>${esc(label)}${required ? " <b aria-hidden=\"true\">*</b>" : ""}</span>${control}${helper ? `<small class="field-helper">${esc(helper)}</small>` : ""}</label>`;
  }
  function tripDateField(name, label) {
    const id = `form-${name}`,
      statusId = `${id}-status`;
    return `<label class="form-field trip-date-field form-field--${name}" for="${id}"><span>${esc(label)} <b aria-hidden="true">*</b></span><span class="trip-date-control"><input class="trip-date-input" type="date" name="${esc(name)}" id="${id}" required autocomplete="off" aria-describedby="${statusId}" data-date-label="${esc(label)}"><span class="trip-date-shell" aria-hidden="true"><span class="trip-date-icon">${icon("calendar", 20)}</span><span class="trip-date-value">Select date</span></span></span><span class="sr-only trip-date-status" id="${statusId}" aria-live="polite">${esc(label)} is not selected.</span></label>`;
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
    const configs = {
        trip: { title:"Create Trip", lead:"Trip basics", fields:[["title","Trip name","text",true,true],["startsOn","Start date","date",true,false],["endsOn","End date","date",true,false]] },
        traveler: { title:"Add Traveler", lead:"Traveler", fields:[["displayName","Name","text",true,true],["travelerType","Traveler type","select",true,true]] },
        checklist: { title:"Add Essential", lead:"Travel essential", fields:[["title","Item","text",true,true],["category","Group","select-checklist",true,true],["priority","Priority","select-priority",true,true]] },
      }, cfg = configs[kind] || configs.trip;
    const mappedFields = cfg.fields.map(([name,label,type,required,wide]) => { let choices=""; if(type==="select")choices='<option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option>'; if(type==="select-checklist")choices='<option value="documents">Documents</option><option value="before_you_leave">Before You Leave</option><option value="packing">Packing</option>'; if(type==="select-priority")choices='<option value="medium">Normal</option><option value="high">Important</option><option value="critical">Critical</option>'; return kind === "trip" && type === "date" ? tripDateField(name, label) : quickField(name,label,{type:type.startsWith("select")?"select":type,required,wide,choices}); });
    const fields = kind === "trip"
      ? `<div class="form-fields trip-create-fields">${mappedFields[0]}<fieldset class="trip-date-range"><legend>Trip dates</legend><div class="form-fields form-fields--date-time">${mappedFields.slice(1).join("")}</div></fieldset></div>`
      : `<div class="form-fields">${mappedFields.join("")}</div>`;
    return focusedTaskPage(cfg.title, `<form class="mobile-form premium-form" id="native-form" data-kind="${esc(kind)}" novalidate><section class="form-section"><header><span>${esc(cfg.lead)}</span><h1>${esc(cfg.title)}</h1></header>${fields}</section><div class="form-save-bar"><button type="submit" class="mobile-primary-action">Save ${esc(statusText(kind))}</button></div></form>`, "form-screen");
  }
  function mobileFormScreen() {
    const kind = String(state.selectedId || "trip");
    if (!QUICK_ADD_KINDS.has(kind)) return basicMobileForm(kind);
    const titles = {flight:"Add Flight",hotel:"Add Hotel",train:"Add Train",activity:"Add Activity",reservation:"Add Reservation",document:"Add Document"}, title=titles[kind];
    if (!state.trip) return noTripQuickAdd(kind, title);
    const localDocumentOptions = `<option value="">No related document</option>${state.localDocs.map((document) => `<option value="${esc(document.id)}">${esc(document.name || statusText(document.type || "Document"))}</option>`).join("")}`;
    let primary="", more="", note="", list="", extraClass="";
    if (kind === "flight") {
      list = quickLocationList("flight");
      primary = `${quickField("flightNumber","Flight number",{required:true,placeholder:"LY 383",helper:"Airline code and number together."})}${quickField("fromLocation","Origin airport",{required:true,placeholder:"TLV — Ben Gurion Airport",attrs:'list="quick-flight-locations" data-location-role="departure"'})}${quickField("toLocation","Destination airport",{required:true,placeholder:"FCO — Rome Fiumicino",attrs:'list="quick-flight-locations" data-location-role="arrival"'})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("departureTimezone","Departure timezone",{required:true,placeholder:"Asia/Jerusalem",attrs:'data-timezone-role="departure"',helper:"Required when the origin airport does not supply a reliable timezone."})}`;
      more = quickMore(kind,"More flight details",`<div class="form-fields">${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}${quickField("arrivalTimezone","Arrival timezone",{placeholder:"Europe/Rome",attrs:'data-timezone-role="arrival"'})}${quickField("carrierName","Marketing airline",{})}${quickField("operatingAirlineCode","Operating airline",{})}${quickField("departureTerminal","Terminal",{wide:false})}${quickField("departureGate","Gate",{wide:false})}${quickField("boardingTime","Boarding time",{type:"time",wide:false})}${quickField("gateCloseTime","Gate closes",{type:"time",wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("cabin","Cabin",{wide:false})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickField("bookingReference","PNR",{wide:false})}${quickField("ticketNumber","Ticket number",{})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Departure uses the event-local timezone. Arrival stays unavailable until you add it.";
    } else if (kind === "hotel") {
      primary = `${quickField("propertyName","Hotel name",{required:true,placeholder:"Hotel name"})}<div class="form-fields form-fields--date-time">${quickField("checkInDate","Check-in date",{type:"date",required:true,wide:false})}${quickField("checkOutDate","Check-out date",{type:"date",required:true,wide:false})}</div>${quickDateSuggestions(kind)}`;
      more = quickMore(kind,"More stay details",`<div class="form-fields">${quickField("address","Address or location",{})}${quickField("checkInFrom","Check-in from",{type:"time",wide:false})}${quickField("checkInUntil","Check-in until",{type:"time",wide:false})}${quickField("checkOutBy","Check-out by",{type:"time",wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("roomName","Room name or type",{})}${quickField("bookingStatus","Booking status",{})}${quickTravelerField()}${quickField("phone","Hotel phone",{type:"tel",wide:false})}${quickField("email","Hotel email",{type:"email",wide:false})}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Check-in and check-out times remain unavailable unless you enter them.";
    } else if (kind === "train") {
      list = quickLocationList("train");
      primary = `${quickField("fromLocation","Origin station",{required:true,placeholder:"Roma Termini",attrs:'list="quick-train-locations" data-location-role="departure"'})}${quickField("toLocation","Destination station",{required:true,placeholder:"Firenze S. M. Novella",attrs:'list="quick-train-locations" data-location-role="arrival"'})}<div class="form-fields form-fields--date-time">${quickField("departureDate","Departure date",{type:"date",required:true,wide:false})}${quickField("departureLocalTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("serviceNumber","Train or service number",{placeholder:"Optional"})}${quickField("departureTimezone","Departure timezone",{required:true,placeholder:"Europe/Rome",attrs:'data-timezone-role="departure"',helper:"Required when the station does not supply a reliable timezone."})}`;
      more = quickMore(kind,"More train details",`<div class="form-fields">${quickField("carrierName","Operator",{})}${quickField("arrivalDate","Arrival date",{type:"date",wide:false})}${quickField("arrivalLocalTime","Arrival local time",{type:"time",wide:false})}${quickField("arrivalTimezone","Arrival timezone",{placeholder:"Europe/Rome"})}${quickField("platform","Platform",{wide:false})}${quickField("coach","Coach",{wide:false})}${quickField("seat","Seat",{wide:false})}${quickField("bookingReference","Booking reference",{wide:false})}${quickField("checkedBags","Checked bags",{type:"number",wide:false,attrs:'min="0" max="20" inputmode="numeric"'})}${quickTravelerField()}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "Departure uses the event-local timezone. Platform, arrival, coach, and seat are never guessed.";
    } else if (kind === "activity") {
      primary = `${quickField("title","Activity name",{required:true,placeholder:"Vatican Museums"})}${quickField("activityDate","Date",{type:"date",required:true})}${quickDateSuggestions(kind)}<fieldset class="time-mode form-field--wide"><legend>Time</legend><div class="time-mode-control"><label><input type="radio" name="timeMode" value="specific" checked><span>Has a specific time</span></label><label><input type="radio" name="timeMode" value="unset"><span>Time not set yet</span></label></div></fieldset><div class="form-fields form-fields--activity-time">${quickField("activityTime","Local time",{type:"time",required:true,wide:false})}${quickField("timezone","Timezone",{required:true,wide:false,placeholder:"Europe/Rome"})}</div>${quickField("location","Location",{placeholder:"Optional",attrs:'list="quick-activity-locations" data-location-role="activity"'})}`;
      list = quickLocationList("activity");
      more = quickMore(kind,"More details",`<div class="form-fields">${quickField("activityType","Activity type",{})}${quickField("endTime","End time",{type:"time",wide:false})}${quickField("reservationWindow","Reservation window",{wide:false})}${quickField("confirmationNumber","Confirmation number",{})}${quickField("provider","Provider or contact",{})}${quickTravelerField()}${quickField("relatedDocument","Document or ticket",{type:"select",choices:localDocumentOptions})}${quickField("notes","Notes",{type:"textarea"})}</div>`);
      note = "A date is always required. Choose Time not set yet explicitly if the booking has no confirmed time.";
    } else if (kind === "reservation") {
      primary = `${quickField("title","Reservation name",{required:true,placeholder:"Dinner at Roscioli"})}<div class="form-fields form-fields--date-time">${quickField("reservationDate","Date",{type:"date",required:true,wide:false})}${quickField("reservationTime","Local time",{type:"time",required:true,wide:false})}</div>${quickDateSuggestions(kind)}${quickField("timezone","Timezone",{required:true,placeholder:"Europe/Rome"})}${quickField("location","Location",{placeholder:"Optional",attrs:'list="quick-reservation-locations" data-location-role="reservation"'})}`;
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
  function addSheet() {
    const options = [
      ["plane", "Flight", "Add a flight reservation", "flight"],
      ["hotel", "Hotel", "Add a hotel stay", "hotel"],
      ["train", "Train", "Add a train journey", "train"],
      ["star", "Activity", "Add a tour or activity", "activity"],
      ["restaurant", "Reservation", "Add a restaurant booking", "reservation"],
      ["document", "Document", "Save an offline travel file", "document"],
    ];
    return bottomSheet(
      "add",
      "Add to trip",
      `<button class="sheet-import-action" data-screen="import"><span class="info-icon">${icon("mail", 22)}</span><span><strong>Import booking</strong><small>Paste a forwarded booking confirmation</small></span>${icon("chevron", 22, "chevron")}</button><div class="sheet-manual-label">Or add manually</div><div class="sheet-options-group">${options
        .map(
          ([ic, title, sub, type]) =>
            `<button class="sheet-option sheet-option--${type}" data-action="add-type" data-type="${type}"><span class="info-icon">${icon(ic, 22)}</span><span><strong>${title}</strong><small>${sub}</small></span>${icon("chevron", 22, "chevron")}</button>`,
        )
        .join("")}</div>`,
    );
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
      ["calendar", "Add your bookings"],
      ["download", "Keep documents ready offline"],
      ["shield", "See what matters next"],
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
    return `<div class="phone-app"><section class="screen">${topbar()}<div class="error-state"><div class="empty-mobile-icon">${icon("warning", 31)}</div><h1>Trip data could not load</h1><p>${esc(state.error || "An unexpected error occurred.")}</p><p class="recovery-safe">Saved trip data on this phone remains safe.</p>${state.requestId ? `<code>Request ID: ${esc(state.requestId)}</code>` : ""}${primaryCta("Try Again", "retry", "refresh")}<a class="legacy-link" href="/legacy.html">Open advanced beta tools</a></div>${bottomNav("home")}</section></div>`;
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
          html = homeScreen();
      }
    html = decorateScreen(html);
    if (state.sheet === "add") html += addSheet();
    if (state.sheet === "document") html += documentSheet();
    if (state.sheet === "trips") html += tripSwitchSheet();
    if (state.sheet === "first-run-how") html += firstRunHowSheet();
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
        '.sheet-option,input,select,button:not([data-action="close-sheet"])',
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
    const field = control.closest("label") || control.parentElement,
      id = `${control.id || control.name || "field"}-error`,
      error = document.createElement("span");
    error.className = "field-error";
    error.id = id;
    error.setAttribute("role", "alert");
    error.textContent = message;
    field?.append(error);
    control.setAttribute("aria-invalid", "true");
    const describedBy = [control.dataset.dateLabel ? `${control.id}-status` : "", id]
      .filter(Boolean)
      .join(" ");
    control.setAttribute("aria-describedby", describedBy);
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
    requestAnimationFrame(() => control.focus({ preventScroll: true }));
  }
  function validateFocusedForm(form) {
    clearFieldErrors(form);
    const kind = form.dataset.kind;
    if (kind === "trip") {
      const result = tripRules?.validateManualTrip({
        title: form.elements.title?.value,
        startsOn: form.elements.startsOn?.value,
        endsOn: form.elements.endsOn?.value,
      });
      if (!result?.valid) {
        const field = result?.field || "title";
        showFieldError(form, form.elements[field], result?.message || "Complete the required trip details.");
        return false;
      }
    }
    if (kind === "hotel") {
      const checkIn = form.elements.checkInDate,
        checkOut = form.elements.checkOutDate;
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
  function syncTripDateControl(input, announce = false) {
    if (!input?.classList?.contains("trip-date-input")) return;
    const shellValue = input.parentElement?.querySelector(".trip-date-value"),
      status = document.getElementById(`${input.id}-status`),
      readable = input.value ? formatDateOnly(input.value) : "Select date",
      label = input.dataset.dateLabel || "Date";
    if (shellValue) {
      shellValue.textContent = readable;
      shellValue.classList.toggle("is-selected", Boolean(input.value));
    }
    if (status) status.textContent = input.value
      ? `${label} selected: ${readable}.`
      : `${label} is not selected.`;
    if (announce && status) status.setAttribute("data-announced", String(Date.now()));
  }
  function bindTripDateControls(form) {
    form.querySelectorAll(".trip-date-input").forEach((input) => {
      syncTripDateControl(input);
      input.addEventListener("input", () => syncTripDateControl(input, true));
      input.addEventListener("change", () => syncTripDateControl(input, true));
      input.addEventListener("pointerdown", (event) => {
        if (typeof input.showPicker !== "function") return;
        event.preventDefault();
        input.focus({ preventScroll: true });
        try { input.showPicker(); } catch (_) {}
      });
      input.addEventListener("keydown", (event) => {
        if (typeof input.showPicker !== "function" || !["Enter", " ", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        try { input.showPicker(); } catch (_) {}
      });
    });
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
      bindTripDateControls(nativeForm);
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
          const values=tripRules.validateManualTrip({title:fd.get("title"),startsOn:fd.get("startsOn"),endsOn:fd.get("endsOn")}).values;
          const trip={id:"preview-created-trip",title:values.title,lifecycle_state:"upcoming",starts_on:values.startsOn,ends_on:values.endsOn};
          Object.assign(state,{trips:[trip],trip,timeline:[],checklist:[],brain:null,impacts:[],transport:[],stays:[],locations:[],travelers:[],connections:[],health:null,bookingDetails:[],contacts:[],syncStatus:null,localDocs:[],tripsLoaded:true});
        }
        clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(`${statusText(kind)} saved in preview.`); route(kind==="document"?"documents":kind==="trip"&&isFirstTripCreation?"home":kind==="trip"?"trips":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"bookings",null,true); return;
      }
      if (kind === "trip") {
        const values=tripRules.validateManualTrip({title:fd.get("title"),startsOn:fd.get("startsOn"),endsOn:fd.get("endsOn")}).values;
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
        const result=await api(`/api/v1/trips/${tripId}/transport`,{method:"POST",body:JSON.stringify({transportType:kind,title,carrierName:fd.get("carrierName")||null,serviceNumber:kind==="flight"?flight.number:(fd.get("serviceNumber")||null),marketingAirlineCode:flight?.code||null,marketingFlightNumber:flight?.number||null,operatingAirlineCode:fd.get("operatingAirlineCode")||null,departureTerminal:fd.get("departureTerminal")||null,departureGate:fd.get("departureGate")||null,boardingTimeUtc:boarding,gateCloseTimeUtc:gateClose,departureLocationId:from.id,arrivalLocationId:to.id,scheduledDepartureUtc:dep,scheduledArrivalUtc:arr,departureTimezone:depTz,arrivalTimezone:arrTz||null,bookingReference:fd.get("bookingReference")||null,travelerIds:travelers})});
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
      } else if (kind === "traveler") await api(`/api/v1/trips/${tripId}/travelers`,{method:"POST",body:JSON.stringify({displayName:fd.get("displayName"),travelerType:fd.get("travelerType")})});
      else if (kind === "checklist") { location.href=legacyUrl("add","checklist"); return; }
      await loadTripDetails(); clearQuickDraft(kind); formHasMeaningfulChanges=false; showToast(`${statusText(kind)} saved.`); route(kind==="document"?"documents":kind==="trip"&&isFirstTripCreation?"home":kind==="trip"?"trips":kind==="traveler"?"travelers":kind==="checklist"?"checklist":"bookings",null,true);
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
    try { if (PREVIEW_MODE) state.importReview={candidates:[{id:"candidate-1",type:"flight",title:"LY 383 · TLV → FCO",confidence:"low",warnings:["Timezone missing","Date is ambiguous"]}]}; else state.importReview=await api(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/imports/forwarded-email/preview`,{method:"POST",body:JSON.stringify({body:new FormData(form).get("body")})}); formHasMeaningfulChanges=false; route("import-review"); } catch(error){ showFormSubmissionError(form,error.message); } finally { if(document.contains(form)) setFormSaving(form,false); }
  }
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
  function legacyUrl(action, type = "") {
    return `/legacy.html?action=${encodeURIComponent(action)}${type ? `&type=${encodeURIComponent(type)}` : ""}`;
  }
  async function handleAction(action, target, inputMethod = "pointer") {
    switch (action) {
      case "back":
        {
          const goBack = () => {
            formHasMeaningfulChanges = false;
            state.routeMotion = "back";
            if (history.length > 1) history.back();
            else route("home", null, false, "back");
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
      case "open-first-run-how":
        openSheet("first-run-how", target);
        break;
      case "finish-first-run-how":
        closeSheet();
        break;
      case "close-sheet":
        closeSheet();
        break;
      case "create-trip":
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
        else route("home", null, true);
        break;
      }
      case "add-type": {
        const type = target.dataset.type;
        route("form", type);
        break;
      }
      case "open-form":
        if (target.dataset.id) location.href = `${legacyUrl("edit", target.dataset.form || "trip")}&id=${encodeURIComponent(target.dataset.id)}`;
        else route("form", target.dataset.form || "trip");
        break;
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
      case "confirm-import": showToast(PREVIEW_MODE?"Import confirmed in preview.":"Review the confirmed fields before import."); break;
      case "sync-retry": if(PREVIEW_MODE){state.syncStatus={pendingOperations:0,openConflicts:0};render();showToast("Pending changes synced in preview.");}else await loadApp(); break;
      case "sync-review": showToast("Conflict remains visible until you choose a safe resolution in advanced beta tools."); break;
      case "export-trip": if(PREVIEW_MODE)showToast("Trip export is available outside preview mode."); else window.open(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/export/json`,`_blank`,`noopener`); break;
      case "support": if(PREVIEW_MODE)showToast("Support bundle is available outside preview mode."); else window.open(`/api/v1/trips/${encodeURIComponent(state.trip.id)}/support`,`_blank`,`noopener`); break;
      case "remove-local-data": {
        const pending=pendingMutations().filter((x)=>x.status!=="done").length+Number(val(state.syncStatus,"pendingOperations","pending_operations")||0);
        if(pending){showToast("Review pending changes before removing local data.","alert");break;}
        if(confirm("Remove locally stored documents and cached trip data from this phone? Your server trip will not be deleted.")) showToast("Local-data removal is available in advanced beta tools.");
        break;
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
  window.addEventListener("hashchange", () => {
    const next = parseRoute();
    if (
      formHasMeaningfulChanges &&
      DIRTY_TASK_SCREENS.has(state.screen) &&
      next.screen !== state.screen
    ) {
      history.pushState(
        null,
        "",
        `#${state.screen}${state.selectedId ? `:${encodeURIComponent(state.selectedId)}` : ""}`,
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
  window.addEventListener("online", () => {
    state.offline = false;
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
  if (!location.hash) history.replaceState(null, "", "#home");
  loadApp();
})();
