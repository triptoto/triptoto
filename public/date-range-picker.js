(function () {
  "use strict";

  const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const SHORT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const FULL = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  let active = null, month = null, draftStart = "", draftEnd = "";

  const pad = (value) => String(value).padStart(2, "0");
  const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parse = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const label = (value) => {
    const date = parse(value);
    return date ? SHORT.format(date) : "";
  };
  const emit = (input) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  function dialog() {
    let node = document.getElementById("date-range-dialog");
    if (node) return node;
    node = document.createElement("dialog");
    node.id = "date-range-dialog";
    node.className = "date-range-dialog";
    node.setAttribute("aria-labelledby", "date-range-title");
    node.innerHTML = `<form method="dialog" class="date-range-sheet">
      <header class="date-range-head"><div><small id="date-range-context">Dates</small><h2 id="date-range-title">Choose dates</h2></div><button class="date-range-close" value="cancel" aria-label="Close date picker">×</button></header>
      <div class="date-range-selection" aria-live="polite"><span data-range-start-label>Start date</span><i aria-hidden="true">→</i><span data-range-end-label>End date</span></div>
      <div class="date-range-month"><button type="button" data-range-prev aria-label="Previous month">‹</button><strong data-range-month-label></strong><button type="button" data-range-next aria-label="Next month">›</button></div>
      <div class="date-range-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
      <div class="date-range-grid" role="grid" aria-label="Calendar"></div>
      <p class="date-range-help" data-range-help>Choose the start date.</p>
      <footer class="date-range-actions"><button type="button" data-range-clear>Clear</button><button type="button" class="date-range-apply" data-range-apply disabled>Use dates</button></footer>
    </form>`;
    document.body.append(node);
    node.querySelector("[data-range-prev]").addEventListener("click", () => { month.setMonth(month.getMonth() - 1); render(); });
    node.querySelector("[data-range-next]").addEventListener("click", () => { month.setMonth(month.getMonth() + 1); render(); });
    node.querySelector("[data-range-clear]").addEventListener("click", () => {
      draftStart = ""; draftEnd = ""; render();
    });
    node.querySelector("[data-range-apply]").addEventListener("click", apply);
    node.addEventListener("click", (event) => {
      if (event.target === node) node.close("cancel");
      const day = event.target.closest("[data-range-day]");
      if (day) choose(day.dataset.rangeDay);
    });
    node.addEventListener("close", () => active?.querySelector(".date-range-trigger")?.focus());
    return node;
  }

  function choose(value) {
    if (!draftStart || draftEnd) {
      draftStart = value;
      draftEnd = "";
    } else if (value < draftStart) {
      draftStart = value;
    } else {
      draftEnd = value;
    }
    render();
  }

  function render() {
    const node = dialog(), year = month.getFullYear(), monthIndex = month.getMonth();
    node.querySelector("[data-range-month-label]").textContent = MONTH.format(month);
    node.querySelector("[data-range-start-label]").textContent = draftStart ? label(draftStart) : "Start date";
    node.querySelector("[data-range-end-label]").textContent = draftEnd ? label(draftEnd) : "End date";
    node.querySelector("[data-range-help]").textContent = !draftStart ? "Choose the start date." : !draftEnd ? "Now choose the end date." : `${label(draftStart)} to ${label(draftEnd)}`;
    node.querySelector("[data-range-apply]").disabled = !(draftStart && draftEnd);
    const first = new Date(year, monthIndex, 1), last = new Date(year, monthIndex + 1, 0);
    let html = "";
    for (let index = 0; index < first.getDay(); index++) html += '<span class="date-range-blank"></span>';
    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(year, monthIndex, day), value = ymd(date);
      const selected = value === draftStart || value === draftEnd;
      const within = draftStart && draftEnd && value > draftStart && value < draftEnd;
      html += `<button type="button" role="gridcell" data-range-day="${value}" class="${selected ? "is-selected " : ""}${within ? "is-within" : ""}" aria-label="${FULL.format(date)}"${selected ? ' aria-selected="true"' : ""}>${day}</button>`;
    }
    node.querySelector(".date-range-grid").innerHTML = html;
  }

  function apply() {
    if (!active || !draftStart || !draftEnd) return;
    const start = active.querySelector("[data-range-start]"), end = active.querySelector("[data-range-end]");
    start.value = draftStart; end.value = draftEnd; emit(start); emit(end);
    update(active);
    dialog().close("apply");
  }

  function update(container) {
    const start = container.querySelector("[data-range-start]")?.value || "";
    const end = container.querySelector("[data-range-end]")?.value || "";
    const value = container.querySelector(".date-range-trigger__value");
    const hint = container.querySelector(".date-range-trigger__hint");
    setText(value, start && end ? `${label(start)} – ${label(end)}` : "Choose dates");
    setText(hint, start && end ? `${container.dataset.startLabel || "Start"} → ${container.dataset.endLabel || "End"}` : "Tap start, then end");
  }

  function enhance(root) {
    root.querySelectorAll?.("[data-date-range]").forEach((container) => {
      if (container.dataset.rangeReady) { update(container); return; }
      container.dataset.rangeReady = "true";
      const start = container.querySelector("[data-range-start]"), end = container.querySelector("[data-range-end]");
      const trigger = container.querySelector(".date-range-trigger");
      if (!start || !end || !trigger) return;
      trigger.addEventListener("click", () => {
        active = container; draftStart = start.value || ""; draftEnd = end.value || "";
        const initial = parse(draftStart) || new Date();
        month = new Date(initial.getFullYear(), initial.getMonth(), 1);
        const node = dialog();
        node.querySelector("#date-range-context").textContent = container.dataset.rangeLabel || "Dates";
        render(); node.showModal();
      });
      start.addEventListener("input", () => update(container));
      end.addEventListener("input", () => update(container));
      const form = container.closest("form");
      if (form && !form.dataset.rangeResetReady) {
        form.dataset.rangeResetReady = "true";
        form.addEventListener("reset", () => setTimeout(() => enhance(form), 0));
      }
      update(container);
    });
  }

  const observer = new MutationObserver(() => enhance(document));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { enhance(document); observer.observe(document.body, { childList: true, subtree: true }); });
  else { enhance(document); observer.observe(document.body, { childList: true, subtree: true }); }
  window.TriptoDateRangePicker = { enhance, update };
})();
