import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/google-auth-client.js", "utf8");
const app = readFileSync("public/mobile-app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const headers = readFileSync("public/_headers", "utf8");
const sw = readFileSync("public/sw.js", "utf8");
const workerIndex = readFileSync("apps/worker/src/index.ts", "utf8");
const context = { URL, URLSearchParams };
runInNewContext(source, context);
const auth = context.TriptoGoogleAuth;

const challenge = {
  challengeId: "opaque-challenge-id",
  clientId: "client.apps.googleusercontent.com",
  nonce: "challenge-nonce",
  redirect: {
    loginUri: "https://tripto.to/api/v1/auth/google/callback",
    state: "opaque-challenge-id",
  },
};
const iosEdge = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 EdgiOS/138.0",
  platform: "iPhone",
  maxTouchPoints: 5,
};
const ipadDesktop = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};
const chrome = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
};
const firefox = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

for (const navigatorLike of [iosEdge, ipadDesktop]) {
  const options = auth.buildInitializeOptions(
    challenge,
    navigatorLike,
    "https://tripto.to",
  );
  assert.equal(options.ux_mode, "redirect");
  assert.equal(
    options.login_uri,
    "https://tripto.to/api/v1/auth/google/callback",
  );
  assert.equal("callback" in options, false);
  assert.equal("use_fedcm_for_button" in options, false);
  assert.equal("locale" in options, false);
  assert.equal(
    auth.buildButtonOptions(challenge, navigatorLike, "https://tripto.to")
      .state,
    "opaque-challenge-id",
  );
}

const chromeOptions = auth.buildInitializeOptions(
  challenge,
  chrome,
  "https://tripto.to",
);
assert.equal(chromeOptions.ux_mode, "popup");
assert.equal(chromeOptions.use_fedcm_for_button, true);
assert.equal("login_uri" in chromeOptions, false);
assert.equal("locale" in chromeOptions, false);
const firefoxOptions = auth.buildInitializeOptions(
  challenge,
  firefox,
  "https://tripto.to",
);
assert.equal(firefoxOptions.ux_mode, "popup");
assert.equal("use_fedcm_for_button" in firefoxOptions, false);

const buttonOptions = auth.buildButtonOptions(
  challenge,
  chrome,
  "https://tripto.to",
);
assert.equal(buttonOptions.type, "standard");
assert.equal(buttonOptions.theme, "outline");
assert.equal(buttonOptions.size, "large");
assert.equal(buttonOptions.text, "continue_with");
assert.equal(buttonOptions.shape, "rectangular");
assert.equal(buttonOptions.logo_alignment, "left");
assert.equal(buttonOptions.width, "400");
assert.equal(buttonOptions.locale, "en");
assert.equal("state" in buttonOptions, false);

assert.throws(() =>
  auth.buildInitializeOptions(
    {
      ...challenge,
      redirect: {
        ...challenge.redirect,
        loginUri: "https://attacker.example/callback",
      },
    },
    iosEdge,
    "https://tripto.to",
  ),
);

let cleaned = "";
const markerLocation = {
  origin: "https://tripto.to",
  pathname: "/account",
  search: "?google_auth=complete&source=google",
  hash: "#profile",
};
assert.equal(auth.redirectMarker(markerLocation), "complete");
auth.clearRedirectMarker(markerLocation, {
  replaceState(_state, _title, url) { cleaned = url; },
});
assert.equal(cleaned, "/account?source=google#profile");

assert.deepEqual(
  { ...auth.classifyExchangeFailure(400, { error: { code: "GOOGLE_REDIRECT_INVALID" } }) },
  { code: "GOOGLE_REDIRECT_INVALID", terminal: true, retryable: false },
);
assert.deepEqual(
  { ...auth.classifyExchangeFailure(401, { error: { code: "GOOGLE_SIGN_IN_FAILED" } }) },
  { code: "GOOGLE_SIGN_IN_FAILED", terminal: true, retryable: false },
);
for (const [status, code] of [
  [0, ""],
  [429, "RATE_LIMITED"],
  [500, "INTERNAL_ERROR"],
  [503, "GOOGLE_AUTH_DISABLED"],
]) {
  const failure = auth.classifyExchangeFailure(status, { error: { code } });
  assert.equal(failure.terminal, false);
  assert.equal(failure.retryable, true);
}

assert.ok(
  index.indexOf("/google-auth-client.js") < index.indexOf("/mobile-app.min.js"),
);
assert.ok(sw.includes("/google-auth-client.js"));
assert.ok(headers.includes("Cross-Origin-Opener-Policy: same-origin-allow-popups"));
assert.ok(app.includes('initializeOptions.ux_mode==="popup"'));
assert.ok(app.includes('fetch("/api/v1/auth/google/exchange"'));
assert.ok(app.includes('fetch("/api/v1/auth/google/exchange/ack"'));
assert.ok(workerIndex.includes("return await googleSignInRedirect(request,env)"));
assert.ok(app.includes('credentials:"same-origin"'));
assert.ok(app.includes('authorization:`Bearer ${token}`'));
assert.ok(app.includes('return{ok:false,pending:true'));
assert.ok(app.includes('if(result?.pending||result?.terminal)'));
assert.ok(app.includes('if (googleRedirectMarker === "complete")'));
assert.ok(app.includes('code: "AUTH_REQUIRED"'));
assert.ok(app.includes('"Reconnect with Google"'));
assert.ok(app.includes('rejected ? "restart-google-sign-in" : "retry"'));
const exchangeStart = app.indexOf("async function exchangeGoogleRedirectSession()");
const exchangeEnd = app.indexOf("async function resumeGoogleRedirectSession()", exchangeStart);
const exchangeSource = app.slice(exchangeStart, exchangeEnd);
const storeAt = exchangeSource.indexOf('localStorage.setItem("tripto_token",token)');
const clearAt = exchangeSource.indexOf("clearGoogleRedirectMarker()", storeAt);
const ackAt = exchangeSource.indexOf("acknowledgeGoogleRedirectSession(token)", clearAt);
assert.ok(storeAt >= 0 && clearAt > storeAt && ackAt > clearAt);
const interruptedFetch = exchangeSource.slice(exchangeSource.lastIndexOf("}catch(_){"));
assert.ok(interruptedFetch.includes("pending:true"));
assert.equal(interruptedFetch.includes("clearGoogleRedirectMarker"), false);
assert.ok(!app.includes("use_fedcm_for_prompt"));
assert.ok(!source.includes("client_secret"));
assert.ok(!app.includes("console.log(response.credential)"));
assert.ok(!app.includes("google_session="));

// Exercise the real app load + Google completion handlers with isolated API
// fixtures. Cover both popup and full-page iPhone redirect navigation.
const appAuthSource = `const POST_AUTH_DESTINATION_KEY="tripto_post_auth_destination_v1";
${app.slice(app.indexOf("async function loadApp()"), app.indexOf("function selectRelevantTrip("))}
${app.slice(app.indexOf("function rememberPostAuthDestination("), app.indexOf("function quickField("))}
`;
function authHarness({ trips = [], storage = new Map(), mobile = false, screen = "home" } = {}) {
  const local = new Map();
  const state = { screen, trips: [], trip: null, account: { mode: "guest" } };
  const container = { dataset: { postAuthScreen: "trips" }, getBoundingClientRect: () => ({ width: 360 }) };
  const calls = [];
  let initializeOptions, renderedOptions;
  const ctx = {
    state, PREVIEW_MODE: false, googleRedirectMarker: mobile ? "complete" : null,
    googleAuth: auth, navigator: { ...(mobile ? iosEdge : chrome), onLine: true },
    location: { origin: "https://tripto.to", pathname: "/", search: "?google_auth=complete" },
    history: { replaceState() {} },
    document: { getElementById: () => container, querySelector: () => null },
    sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    isSignedIn: () => state.account?.mode === "account",
    hydrateAppFromCache: () => false,
    selectRelevantTrip: rows => rows[0] || null,
    loadTripDetails: async () => {},
    render() {}, maybeLoadScreenData() {}, showToast() {},
    route: (screen, id, replace) => { state.screen = screen; state.selectedId = id; calls.push([screen, id, replace]); },
    loadCollaboration: async () => calls.push(["load-collaboration"]),
    loadJoinPreview: async token => calls.push(["load-join", token]),
    apiGet: async path => path === "/api/v1/trips" ? { trips } : path === "/api/v1/account" ? { account: { mode: "account" } } : {},
    api: async path => path.endsWith("/challenge") ? challenge : { session: { token: "test-session" } },
    fetch: async () => ({ ok: true, json: async () => ({ session: { token: "test-session" } }) }),
    google: { accounts: { id: {
      initialize: options => { initializeOptions = options; },
      renderButton: (_container, options) => { renderedOptions = options; },
    } } },
  };
  runInNewContext(appAuthSource, ctx);
  return { ctx, state, storage, calls, container,
    get initialized() { return initializeOptions; },
    get button() { return renderedOptions; },
  };
}
assert.ok(app.includes('id="google-signin-button" data-post-auth-screen="trips"'));
assert.match(app, /case "enter-app":\s*route\("trips"\)/);
for (const tripCount of [0, 1, 3]) {
  const trips = Array.from({ length: tripCount }, (_, i) => ({ id: `trip-${i}` }));
  for (const mobile of [false, true]) {
    const h = authHarness({ trips, mobile, screen: "timeline" });
    // Abandoned sharing/invitation intents must not override a fresh welcome click.
    h.ctx.rememberPostAuthDestination("collaboration", "old-trip");
    h.storage.set("tripto_join_token", "old-invite");
    await h.ctx.setupGoogleSignIn();
    h.button.click_listener();
    assert.equal(h.storage.has("tripto_join_token"), false);
    let result = h;
    if (mobile) {
      // A new JavaScript context represents the return from Google's redirect.
      result = authHarness({ trips, mobile, storage: h.storage });
      await result.ctx.resumeGoogleRedirectSession();
    } else {
      await h.initialized.callback({ credential: "test-credential" });
    }
    assert.equal(result.state.screen, "trips", `${mobile ? "redirect" : "popup"}, ${tripCount} trips`);
    assert.equal(result.storage.has("tripto_post_auth_destination_v1"), false);
    await result.ctx.loadApp();
    assert.equal(result.state.screen, "trips", "Reloading an empty Trips page must not open creation");
  }
}
// A redirect that predates the new marker still leaves welcome for Trips.
{
  const h = authHarness({ mobile: true });
  await h.ctx.resumeGoogleRedirectSession();
  assert.equal(h.state.screen, "trips");
}
// Intentional invitation and Plan Together sign-ins keep their own destinations.
for (const mobile of [false, true]) {
  const h = authHarness({ trips: [{ id: "shared-trip" }], mobile, screen: "account" });
  h.container.dataset = {};
  h.ctx.rememberPostAuthDestination("collaboration", "shared-trip");
  await h.ctx.setupGoogleSignIn();
  h.button.click_listener();
  if (mobile) await h.ctx.resumeGoogleRedirectSession();
  else await h.initialized.callback({ credential: "test-credential" });
  assert.equal(h.state.screen, "collaboration");
}
{
  const h = authHarness({ mobile: true });
  h.storage.set("tripto_join_token", "active-invite");
  await h.ctx.resumeGoogleRedirectSession();
  assert.equal(h.state.screen, "join");
  assert.equal(h.state.selectedId, "active-invite");
}
for (const screen of ["account", "join"]) {
  const h = authHarness({ screen });
  h.ctx.rememberPostAuthDestination("trips");
  h.container.dataset = {};
  await h.ctx.setupGoogleSignIn();
  h.button.click_listener();
  await h.initialized.callback({ credential: "test-credential" });
  assert.equal(h.state.screen, screen, "A new sign-in supersedes an abandoned welcome click");
}
{
  const h = authHarness();
  await h.ctx.setupGoogleSignIn();
  h.button.click_listener();
  h.ctx.api = async () => { throw new Error("Sign-in failed"); };
  await h.initialized.callback({ credential: "invalid-credential" });
  assert.equal(h.state.screen, "home", "Failed sign-in must stay on welcome");
  assert.equal(h.state.account.mode, "guest");
}
for (const screen of ["home", "trips", "account", "join", "form"]) {
  const h = authHarness({ screen });
  await h.ctx.loadApp();
  assert.equal(h.state.screen, screen, "An empty account must preserve explicit navigation");
}

console.log("Google auth frontend and welcome-to-Trips navigation contracts passed.");
