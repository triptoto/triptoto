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
  index.indexOf("/google-auth-client.js") < index.indexOf("/mobile-app.js"),
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

console.log("Google auth frontend contracts passed.");
