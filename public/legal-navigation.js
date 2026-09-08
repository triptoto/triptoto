// Public legal pages stay standalone and readable without an app session.
// Their navigation uses the same four destinations as the authenticated shell.
(() => {
  const menu = document.getElementById("legal-navigation");
  const opener = document.querySelector("[data-open-navigation]");
  if (!menu || !opener) return;
  opener.addEventListener("click", () => {
    menu.showModal();
    opener.setAttribute("aria-expanded", "true");
  });
  menu.querySelector("[data-close-navigation]").addEventListener("click", () => menu.close());
  menu.addEventListener("close", () => {
    opener.setAttribute("aria-expanded", "false");
    opener.focus();
  });
  menu.addEventListener("click", event => {
    const bounds = menu.getBoundingClientRect();
    if (event.target === menu && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) menu.close();
  });
})();
