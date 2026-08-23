(function (global) {
  "use strict";

  const STATIC_PATHS = Object.freeze({
    home: "/home",
    timeline: "/timeline",
    trips: "/trips",
    "add-booking": "/bookings/add",
    bookings: "/bookings",
    documents: "/documents",
    ready: "/ready-offline",
    health: "/trip-health",
    account: "/account",
    checklist: "/before-you-go",
    travelers: "/travelers",
    import: "/bookings/import",
    "import-history": "/bookings/import/history",
    sync: "/pending-changes",
  });

  const DETAIL_PATHS = Object.freeze({
    flight: "/flights",
    hotel: "/hotels",
    train: "/trains",
    plan: "/plans",
    traveler: "/travelers",
    "import-review": "/bookings/import/review",
  });

  const EXACT_ROUTES = new Map(
    Object.entries(STATIC_PATHS).map(([screen, path]) => [path, { screen }]),
  );

  function safelyDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function normalizePath(pathname) {
    const value = String(pathname || "/").replace(/\/{2,}/g, "/");
    if (value === "/") return value;
    return value.replace(/\/$/, "") || "/";
  }

  function parseLegacyHash(hash) {
    const raw = String(hash || "").replace(/^#/, "");
    if (!raw) return null;
    const separator = raw.indexOf(":");
    return {
      screen: separator < 0 ? raw : raw.slice(0, separator),
      id: separator < 0 ? null : safelyDecode(raw.slice(separator + 1)),
      legacy: true,
    };
  }

  function parsePath(pathname) {
    const path = normalizePath(pathname);
    if (["/", "/app", "/index.html"].includes(path))
      return { screen: "home", id: null };

    if (path === "/trips/new") return { screen: "form", id: "trip" };
    if (path === "/travelers/new")
      return { screen: "form", id: "traveler" };
    if (path === "/before-you-go/new")
      return { screen: "form", id: "checklist" };
    if (path === "/bookings/new") return { screen: "form", id: null };
    if (path.startsWith("/bookings/new/"))
      return {
        screen: "form",
        id: safelyDecode(path.slice("/bookings/new/".length)),
      };

    const exact = EXACT_ROUTES.get(path);
    if (exact) return { screen: exact.screen, id: null };

    for (const [screen, base] of Object.entries(DETAIL_PATHS)) {
      if (!path.startsWith(`${base}/`)) continue;
      const id = safelyDecode(path.slice(base.length + 1));
      if (id) return { screen, id };
    }

    return { screen: "home", id: null };
  }

  function parse(locationLike = global.location) {
    const legacy = parseLegacyHash(locationLike?.hash);
    return legacy || parsePath(locationLike?.pathname);
  }

  function pathFor(screen, id = null) {
    const normalizedScreen = String(screen || "timeline");
    const normalizedId = id == null || id === "" ? null : String(id);

    if (normalizedScreen === "form") {
      if (normalizedId === "trip") return "/trips/new";
      if (normalizedId === "traveler") return "/travelers/new";
      if (normalizedId === "checklist") return "/before-you-go/new";
      return normalizedId
        ? `/bookings/new/${encodeURIComponent(normalizedId)}`
        : "/bookings/new";
    }

    const detailBase = DETAIL_PATHS[normalizedScreen];
    if (detailBase)
      return normalizedId
        ? `${detailBase}/${encodeURIComponent(normalizedId)}`
        : detailBase;

    return STATIC_PATHS[normalizedScreen] || "/timeline";
  }

  function urlFor(screen, id = null, search = global.location?.search || "") {
    const query = search && String(search).startsWith("?") ? String(search) : "";
    return `${pathFor(screen, id)}${query}`;
  }

  global.TriptoRoutes = Object.freeze({
    parse,
    parsePath,
    pathFor,
    urlFor,
    screens: Object.freeze({ ...STATIC_PATHS, ...DETAIL_PATHS }),
  });
})(globalThis);
