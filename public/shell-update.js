(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  // The first install claims the page too; that is not a new version, so only
  // reload when a previous worker was already in control.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshingForNewShell = false;
  function hasUnsavedChanges() {
    try { return Boolean(window.TriptoMobileApp && window.TriptoMobileApp.hasUnsavedChanges && window.TriptoMobileApp.hasUnsavedChanges()); } catch (e) { return false; }
  }
  function reloadWhenSafe() {
    // Never wipe a form the user is filling in; retry once it is saved or discarded.
    if (hasUnsavedChanges()) { setTimeout(reloadWhenSafe, 3000); return; }
    window.location.reload();
  }
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController || refreshingForNewShell) return;
    refreshingForNewShell = true;
    reloadWhenSafe();
  });

  // Force the browser to re-check /sw.js and activate any waiting worker. iOS
  // PWAs restore from a snapshot without a fresh navigation, so without an
  // explicit update() the browser never notices a new deploy and the shell
  // stays stale until the app is uninstalled. Running this on open and on every
  // return to the foreground makes new versions land automatically.
  function checkForUpdate() {
    try {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg) return;
        if (reg.waiting) reg.waiting.postMessage("skipWaiting");
        reg.update().catch(function () {});
      }).catch(function () {});
    } catch (e) {}
  }

  checkForUpdate();
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) checkForUpdate();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
