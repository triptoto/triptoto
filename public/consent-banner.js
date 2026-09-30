/* tripto.to — GDPR opt-in analytics consent banner.
 *
 * Consent Mode v2 defaults every signal to "denied" in the inline gtag snippet
 * (see index.html <head>). This banner is the only path that flips
 * analytics_storage to "granted", and only after an explicit click. The choice
 * is persisted in localStorage under tripto_consent_v1 ("granted" | "denied");
 * the inline snippet restores a prior "granted" on subsequent loads, so the
 * banner shows exactly once until the user clears storage.
 *
 * Served from origin, so it is allowed by CSP script-src 'self' (no hash). The
 * injected <style> is allowed by style-src 'unsafe-inline'.
 */
(function () {
  "use strict";
  var KEY = "tripto_consent_v1";

  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    /* storage blocked (private mode / disabled) — fall through and show once */
  }
  // A decision already exists: the inline snippet already applied "granted";
  // "denied" needs nothing. Either way, do not prompt again.
  if (stored === "granted" || stored === "denied") return;

  function persist(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* ignore — banner still dismisses for this session */
    }
  }

  function updateConsent(granted) {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: granted ? "granted" : "denied",
      });
    }
  }

  function build() {
    if (document.getElementById("tripto-consent")) return;

    var style = document.createElement("style");
    style.textContent =
      "#tripto-consent{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483000;max-width:520px;margin:0 auto;background:#12212b;color:#f3f6f8;border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.42);padding:16px 18px;font-family:'Noto Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;animation:tripto-consent-in .28s cubic-bezier(.22,1,.36,1) both}" +
      "@keyframes tripto-consent-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}" +
      "#tripto-consent p{margin:0 0 12px}" +
      "#tripto-consent a{color:#fbc840;text-decoration:underline}" +
      "#tripto-consent .tc-row{display:flex;gap:10px;justify-content:flex-end}" +
      "#tripto-consent button{min-height:40px;padding:0 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:0;font-family:inherit}" +
      "#tripto-consent .tc-decline{background:transparent;color:#f3f6f8;border:1px solid rgba(255,255,255,.24)}" +
      "#tripto-consent .tc-accept{background:#fbc840;color:#05152d}" +
      "@media (prefers-reduced-motion:reduce){#tripto-consent{animation:none}}";
    document.head.appendChild(style);

    var box = document.createElement("div");
    box.id = "tripto-consent";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-live", "polite");
    box.setAttribute("aria-label", "Analytics cookie consent");
    box.innerHTML =
      '<p>tripto uses privacy-friendly analytics to understand how the app is used. ' +
      'May we enable analytics cookies? <a href="/cookies">Learn more</a>.</p>' +
      '<div class="tc-row">' +
      '<button type="button" class="tc-decline">Decline</button>' +
      '<button type="button" class="tc-accept">Accept</button>' +
      "</div>";
    document.body.appendChild(box);

    box.querySelector(".tc-accept").addEventListener("click", function () {
      persist("granted");
      updateConsent(true);
      box.remove();
    });
    box.querySelector(".tc-decline").addEventListener("click", function () {
      persist("denied");
      updateConsent(false);
      box.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
