const concepts = Object.freeze({
  1: {
    name: "Signal Rail",
    eyebrow: "Everything in one place",
    title: "Your trip,<br>in order.",
    lede: "Flights, stays, and documents line up in one clear thread.",
    visual: `<div class="signal-rail">
      <div class="signal-node" data-index="01">Flight</div>
      <div class="signal-node" data-index="02">Stay</div>
      <div class="signal-node" data-index="03">Ready</div>
    </div>`,
  },
  2: {
    name: "Split Passport",
    eyebrow: "Tripto keeps pace",
    title: "Ready before<br>you need it.",
    lede: "Add the booking. We sort what comes next.",
    visual: `<div class="passport-chips">
      <div class="passport-chip"><b>FLIGHT</b><span>Times</span></div>
      <div class="passport-chip"><b>STAY</b><span>Check-in</span></div>
      <div class="passport-chip"><b>DOCS</b><span>Offline</span></div>
    </div>`,
  },
  3: {
    name: "Journey Manifest",
    eyebrow: "Your travel manifest",
    title: "Every booking.<br>One calm plan.",
    lede: "See the details you need, in travel order.",
    visual: `<div class="manifest">
      <div class="manifest-row"><em>01</em><strong>Flights</strong><span>Times</span></div>
      <div class="manifest-row"><em>02</em><strong>Stays</strong><span>Check-in</span></div>
      <div class="manifest-row"><em>03</em><strong>Documents</strong><span>Offline</span></div>
    </div>`,
  },
  4: {
    name: "Night Route",
    eyebrow: "Your next move",
    title: "Know what<br>happens next.",
    lede: "Your trip stays readable from departure to arrival.",
    visual: `<div class="night-route">
      <div class="night-stop"><strong>Flight</strong><span>DEPART</span></div>
      <div class="night-stop"><strong>Stay</strong><span>CHECK IN</span></div>
      <div class="night-stop"><strong>Ready</strong><span>GO</span></div>
    </div>`,
  },
  5: {
    name: "Boarding Slip",
    eyebrow: "One travel thread",
    title: "From booking<br>to boarding.",
    lede: "Keep the route, times, and documents close.",
    visual: `<div class="slip-route">
      <strong>TLV</strong><span>DIRECT</span><strong>FCO</strong>
    </div>`,
  },
  6: {
    name: "Crimson Route",
    eyebrow: "Built around your trip",
    title: "One route.<br>Every detail.",
    lede: "Tripto keeps each booking tied to the journey.",
    visual: `<div class="crimson-route">
      <div class="crimson-stop" data-index="01"><strong>Depart</strong><span>Flight details</span></div>
      <div class="crimson-stop" data-index="02"><strong>Stay</strong><span>Check-in ready</span></div>
      <div class="crimson-stop" data-index="03"><strong>Next</strong><span>What matters now</span></div>
    </div>`,
  },
  7: {
    name: "Departure Ticket",
    eyebrow: "Your trip, packed",
    title: "Travel details<br>within reach.",
    lede: "Open the right booking without hunting through email.",
    visual: `<div class="ticket-facts">
      <div class="ticket-fact"><b>01</b><span>Booking times</span></div>
      <div class="ticket-fact"><b>02</b><span>Stay details</span></div>
      <div class="ticket-fact"><b>03</b><span>Documents offline</span></div>
    </div>`,
  },
  8: {
    name: "Editorial Split",
    eyebrow: "Travel, edited down",
    title: "Less searching.<br>More going.",
    lede: "One place for the facts that move your trip forward.",
    visual: `<div class="editorial-words">
      <div class="editorial-word"><small>01</small><strong>Add</strong></div>
      <div class="editorial-word"><small>02</small><strong>Organize</strong></div>
      <div class="editorial-word"><small>03</small><strong>Go</strong></div>
    </div>`,
  },
  9: {
    name: "Departure Board",
    eyebrow: "Your journey now",
    title: "A clear view<br>of the day.",
    lede: "See the next booking, then the rest of the trip.",
    visual: `<div class="departure-board">
      <div class="board-row"><time>08:40</time><strong>Boarding</strong><span>GATE</span></div>
      <div class="board-row"><time>09:20</time><strong>Flight</strong><span>TLV–FCO</span></div>
      <div class="board-row"><time>15:00</time><strong>Check-in</strong><span>ROME</span></div>
    </div>`,
  },
  10: {
    name: "Signal Bands",
    eyebrow: "Everything in travel order",
    title: "Your whole trip.<br>One clean view.",
    lede: "Bookings become a timeline you can use at a glance.",
    visual: `<div>
      <div class="signal-band"><b>01</b><strong>Add bookings</strong><span>START</span></div>
      <div class="signal-band"><b>02</b><strong>Keep documents</strong><span>READY</span></div>
      <div class="signal-band"><b>03</b><strong>See what is next</strong><span>GO</span></div>
    </div>`,
  },
  11: {
    name: "Gate Sequence",
    eyebrow: "Your trip in motion",
    title: "Every move.<br>Right on time.",
    lede: "Bookings become one sequence you can follow at a glance.",
    visual: `<div class="gate-sequence">
      <div class="gate-row gate-row-active"><b>NOW</b><strong>Flight</strong><span>09:20</span></div>
      <div class="gate-row"><b>02</b><strong>Transfer</strong><span>14:10</span></div>
      <div class="gate-row"><b>03</b><strong>Check-in</strong><span>15:00</span></div>
      <div class="gate-row"><b>04</b><strong>Documents</strong><span>READY</span></div>
    </div>`,
  },
  12: {
    name: "Route Matrix",
    eyebrow: "One clear travel system",
    title: "Add it once.<br>Follow the trip.",
    lede: "The essential details stay close from departure to arrival.",
    visual: `<div class="route-matrix">
      <div class="matrix-cell"><b>01</b><strong>Flight</strong><span>Times + route</span></div>
      <div class="matrix-cell"><b>02</b><strong>Stay</strong><span>Check-in</span></div>
      <div class="matrix-cell"><b>03</b><strong>Docs</strong><span>Ready offline</span></div>
      <div class="matrix-cell matrix-cell-next"><b>NEXT</b><strong>Know what matters</strong><span>At a glance</span></div>
    </div>`,
  },
});

const conceptNumber = Number(document.body.dataset.concept || 1);
const concept = concepts[conceptNumber] || concepts[1];

document.title = `${String(conceptNumber).padStart(2, "0")} · ${concept.name} · tripto.to`;

document.querySelector("#app").innerHTML = `
  <main class="welcome concept-${conceptNumber}" aria-labelledby="welcome-title">
    <section class="canvas">
      <header class="brandbar">
        <a class="brand" href="index.html" aria-label="Back to all welcome concepts">
          <span>tripto</span><span class="brand-dot">.</span><span>to</span>
        </a>
        <span class="concept-tag">${String(conceptNumber).padStart(2, "0")} / 12</span>
      </header>

      <section class="story">
        <div class="hero">
          <p class="eyebrow">${concept.eyebrow}</p>
          <h1 id="welcome-title">${concept.title}</h1>
          <p class="lede">${concept.lede}</p>
        </div>
        <div class="visual">${concept.visual}</div>
      </section>

      <footer class="access">
        <button class="google-button" type="button" data-action="google">
          <span class="google-mark" aria-hidden="true">G</span>
          <span>Continue with Google</span>
        </button>
        <button class="tour-button" type="button" data-action="tour">
          <span>Take a tour</span><span aria-hidden="true">›</span>
        </button>
        <nav class="legal" aria-label="Legal">
          <a href="https://tripto.to/privacy">Privacy</a><i aria-hidden="true"></i><a href="https://tripto.to/terms">Terms</a>
        </nav>
      </footer>
    </section>
  </main>
  <dialog id="tour-dialog" aria-labelledby="tour-title">
    <section class="tour-sheet">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 id="tour-title">How tripto works</h2>
      <ol>
        <li><div><strong>Add your bookings</strong><p>Upload, forward, or enter them.</p></div></li>
        <li><div><strong>Keep documents ready</strong><p>Open saved files when you are offline.</p></div></li>
        <li><div><strong>See what comes next</strong><p>Follow one timeline through the trip.</p></div></li>
      </ol>
      <button class="sheet-close" type="button" data-action="close-tour">Got it</button>
    </section>
  </dialog>
  <div class="toast" role="status" aria-live="polite"></div>
`;

const dialog = document.querySelector("#tour-dialog");
const toast = document.querySelector(".toast");
let toastTimer = 0;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "google") showToast("Design preview. The live app uses Google’s secure sign-in button.");
  if (action === "tour") dialog.showModal();
  if (action === "close-tour") dialog.close();
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
