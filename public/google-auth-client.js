(function (root) {
  "use strict";

  const IOS_DEVICE = /iPad|iPhone|iPod/i;
  const APPLE_WEBKIT = /AppleWebKit/i;
  function isAppleMobileWebKit(navigatorLike = {}) {
    const userAgent = String(navigatorLike.userAgent || "");
    const platform = String(navigatorLike.platform || "");
    const touchPoints = Number(navigatorLike.maxTouchPoints || 0);
    const appleMobileDevice =
      IOS_DEVICE.test(userAgent) ||
      (platform === "MacIntel" && touchPoints > 1);
    return appleMobileDevice && APPLE_WEBKIT.test(userAgent);
  }

  function supportsGoogleFedCmButton(navigatorLike = {}) {
    if (isAppleMobileWebKit(navigatorLike)) return false;
    const userAgent = String(navigatorLike.userAgent || "");
    if (/Edg\/(?:\d+)|OPR\/(?:\d+)|SamsungBrowser\/(?:\d+)/i.test(userAgent))
      return false;
    const match = userAgent.match(/Chrome\/(\d+)/i);
    if (!match) return false;
    const minimum = /Android/i.test(userAgent) ? 128 : 125;
    return Number(match[1]) >= minimum;
  }

  function checkedRedirect(challenge, origin) {
    const redirect = challenge?.redirect;
    if (!redirect?.loginUri || !redirect?.state)
      throw new Error("Google redirect sign-in is unavailable.");
    const appOrigin = new URL(String(origin)).origin;
    const loginUri = new URL(String(redirect.loginUri), appOrigin);
    if (
      loginUri.origin !== appOrigin ||
      loginUri.pathname !== "/api/v1/auth/google/callback" ||
      loginUri.search ||
      loginUri.hash
    )
      throw new Error("Google redirect sign-in is not configured safely.");
    if (!challenge?.challengeId || String(redirect.state) !== String(challenge.challengeId))
      throw new Error("Google redirect sign-in state is invalid.");
    return { loginUri: loginUri.href, state: String(redirect.state) };
  }

  function buildInitializeOptions(challenge, navigatorLike, origin) {
    if (!challenge?.clientId || !challenge?.nonce)
      throw new Error("Google sign-in challenge is incomplete.");
    const options = {
      client_id: String(challenge.clientId),
      nonce: String(challenge.nonce),
    };
    if (isAppleMobileWebKit(navigatorLike)) {
      const redirect = checkedRedirect(challenge, origin);
      return {
        ...options,
        ux_mode: "redirect",
        login_uri: redirect.loginUri,
      };
    }
    options.ux_mode = "popup";
    if (supportsGoogleFedCmButton(navigatorLike))
      options.use_fedcm_for_button = true;
    return options;
  }

  function buildButtonOptions(challenge, navigatorLike, origin) {
    const options = {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: "400",
      locale: "en",
    };
    if (isAppleMobileWebKit(navigatorLike))
      options.state = checkedRedirect(challenge, origin).state;
    return options;
  }

  function redirectMarker(locationLike) {
    const values = new URLSearchParams(String(locationLike?.search || ""));
    const status = values.get("google_auth");
    return status === "complete" || status === "error" ? status : null;
  }

  function classifyExchangeFailure(status, payload) {
    const normalizedStatus = Number(status || 0);
    const code = String(payload?.error?.code || "");
    const terminal =
      (normalizedStatus === 400 && code === "GOOGLE_REDIRECT_INVALID") ||
      (normalizedStatus === 401 && code === "GOOGLE_SIGN_IN_FAILED");
    return Object.freeze({ code, terminal, retryable: !terminal });
  }

  function clearRedirectMarker(locationLike, historyLike) {
    const url = new URL(
      `${locationLike?.pathname || "/"}${locationLike?.search || ""}${locationLike?.hash || ""}`,
      locationLike?.origin || "https://tripto.to",
    );
    url.searchParams.delete("google_auth");
    url.searchParams.delete("code");
    const query = url.searchParams.toString();
    historyLike?.replaceState?.(
      null,
      "",
      `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
    );
  }

  root.TriptoGoogleAuth = Object.freeze({
    isAppleMobileWebKit,
    supportsGoogleFedCmButton,
    buildInitializeOptions,
    buildButtonOptions,
    redirectMarker,
    classifyExchangeFailure,
    clearRedirectMarker,
  });
})(globalThis);
