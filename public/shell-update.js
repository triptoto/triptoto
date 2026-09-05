(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  let refreshingForNewShell = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshingForNewShell) return;
    refreshingForNewShell = true;
    window.location.reload();
  });
})();
