import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [app, css, index, serviceWorker, routesSource, attachments] =
  await Promise.all([
    read("public/mobile-app.js"),
    read("public/mobile-app.css"),
    read("public/index.html"),
    read("public/sw.js"),
    read("public/mobile-routes.js"),
    read("public/manual-booking-attachments.js"),
  ]);

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing contract section: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing contract boundary: ${end}`);
  return source.slice(from, to);
}

function includesOneOf(source, values, message) {
  assert(values.some((value) => source.includes(value)), message);
}

function quickFieldContract(source, name, context) {
  const marker = `quickField("${name}"`;
  const from = source.indexOf(marker);
  assert.notEqual(from, -1, `${context} is missing the ${name} field`);
  const next = source.indexOf("quickField(", from + marker.length);
  return source.slice(from, next === -1 ? source.length : next);
}

function assertQuickField(source, name, { required = false, optional = false } = {}, context) {
  const call = quickFieldContract(source, name, context);
  assert.equal(
    /\brequired\s*:\s*true\b/.test(call),
    required,
    `${context} ${name} required/optional contract changed`,
  );
  if (optional) {
    assert(
      /\boptional\s*:\s*true\b/.test(call),
      `${context} ${name} must be visibly identified as optional`,
    );
  }
}

function assertFormFields(source, fields, context) {
  for (const [name, options] of Object.entries(fields)) {
    assertQuickField(source, name, options, context);
  }
}

function assertPersistedFields(source, fields, context) {
  for (const name of fields) {
    assert(
      new RegExp(`["']${name}["']`).test(source),
      `${context} renders ${name} but does not consume it during persistence`,
    );
  }
}

// The category registry is the single traveler-facing source of truth. Keeping
// the route key separate from the storage kind lets every category have its own
// focused URL and copy without multiplying backend entity types.
const registryMatch = app.match(
  /const MANUAL_BOOKING_TYPES\s*=\s*(Object\.freeze\(\{[\s\S]*?\}\));/,
);
assert(registryMatch, "manual booking category registry is missing");
const registry = JSON.parse(
  JSON.stringify(runInNewContext(registryMatch[1], Object.create(null))),
);
const expectedCategories = [
  ["flight", "Flight", "flight", null, "Add Flight"],
  ["train", "Train", "train", null, "Add Train"],
  ["ferry", "Ferry", "train", "ferry", "Add Ferry"],
  ["bus", "Bus / Coach", "transport", "bus", "Add Bus"],
  ["cruise", "Cruise", "activity", "cruise", "Add Cruise"],
  ["car-rental", "Car Rental", "transport", "car", "Add Car Rental"],
  ["transfer", "Transfer", "transport", "transfer", "Add Transfer"],
  ["taxi", "Taxi / Ride", "transport", "taxi", "Add Taxi"],
  ["parking", "Parking", "reservation", "parking", "Add Parking"],
  ["hotel", "Hotel / Stay", "hotel", null, "Add Stay"],
  ["restaurant", "Restaurant", "reservation", "restaurant", "Add Restaurant"],
  ["tour", "Tour / Excursion", "activity", "tour", "Add Tour"],
  ["activity", "Activity / Event", "activity", "activity", "Add Activity"],
  ["attraction", "Museum / Attraction", "activity", "attraction", "Add Attraction"],
  ["event", "Event / Show", "activity", "event", "Add Event"],
  ["insurance", "Travel Insurance", "reservation", "insurance", "Add Insurance"],
  ["other", "Other", "reservation", "other", "Add to Trip"],
];
assert.deepEqual(
  Object.keys(registry),
  expectedCategories.map(([key]) => key),
  "ADD NEW BOOKING must expose the approved expanded categories in order",
);
for (const [key, label, base, subtype, cta] of expectedCategories) {
  assert.equal(registry[key]?.label, label, `${key} label changed`);
  assert.equal(registry[key]?.base, base, `${key} storage kind changed`);
  assert.equal(registry[key]?.subtype || null, subtype, `${key} subtype changed`);
  assert.equal(registry[key]?.cta, cta, `${key} primary CTA changed`);
  assert(registry[key]?.icon, `${key} needs a category icon`);
  assert(registry[key]?.hint, `${key} needs concise traveler-facing helper copy`);
  assert(registry[key]?.group, `${key} needs a clear category group`);
  assert(registry[key]?.tone, `${key} needs a theme-token tone`);
  assert(registry[key]?.documentType, `${key} needs a contextual document type`);
}

const manualSheet = section(
  app,
  "function manualBookingSheet()",
  "function documentSheet()",
);
assert(
  manualSheet.includes("MANUAL_BOOKING_TYPES") &&
    manualSheet.includes("Object.entries"),
  "category sheet must render from the shared category registry",
);
for (const token of [
  "<button",
  'data-action="add-type"',
  "data-type=",
  "sheet-option",
]) {
  assert(manualSheet.includes(token), `manual category control missing ${token}`);
}
const addTypeAction = section(app, 'case "add-type":', 'case "open-form":');
assert(
  addTypeAction.includes("route(\"form\", type)") &&
    addTypeAction.includes("closeSheet()"),
  "a category must close the temporary sheet and open its purpose-built form",
);

// All traveler concepts have clean, shareable routes even when several use
// the same existing backend entity kind.
const routeContext = Object.create(null);
runInNewContext(routesSource, routeContext);
const router = routeContext.TriptoRoutes;
assert(router, "mobile route module did not initialize");
for (const [key] of expectedCategories) {
  const path = `/bookings/new/${key}`;
  assert.equal(router.pathFor("form", key), path, `${key} form path changed`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(router.parsePath(path))),
    { screen: "form", id: key },
    `${key} clean route does not round-trip`,
  );
}

const formScreen = section(
  app,
  "function mobileFormScreen()",
  "function driverScreen()",
);
for(const copy of ['Show to Driver','Please drive to','Destination','Show this screen to your driver.','Open directions'])assert(app.includes(copy),`driver handoff UX missing: ${copy}`);
assert(
  formScreen.includes("manualBookingConfig(kind)") &&
    formScreen.includes("bookingBaseKind(kind)"),
  "manual forms must resolve their traveler category separately from backend kind",
);
for (const branch of [
  'kind === "flight"',
  'kind === "hotel"',
  '["train","ferry"].includes(kind)',
  'kind === "car-rental"',
  '["transfer","bus","taxi"].includes(kind)',
  'kind === "cruise"',
  'kind === "restaurant"',
  '["activity","tour","attraction","event"].includes(kind)',
  '["other","reservation","parking","insurance"].includes(kind)',
]) {
  assert(formScreen.includes(branch), `purpose-built form branch missing: ${branch}`);
}
const formBranches = {
  flight: section(formScreen, 'if (kind === "flight") {', '} else if (kind === "hotel") {'),
  hotel: section(formScreen, '} else if (kind === "hotel") {', '} else if (["train","ferry"].includes(kind)) {'),
  rail: section(formScreen, '} else if (["train","ferry"].includes(kind)) {', '} else if (kind === "car-rental") {'),
  car: section(formScreen, '} else if (kind === "car-rental") {', '} else if (["transfer","bus","taxi"].includes(kind)) {'),
  transfer: section(formScreen, '} else if (["transfer","bus","taxi"].includes(kind)) {', '} else if (kind === "cruise") {'),
  cruise: section(formScreen, '} else if (kind === "cruise") {', '} else if (kind === "restaurant") {'),
  restaurant: section(formScreen, '} else if (kind === "restaurant") {', '} else if (["activity","tour","attraction","event"].includes(kind)) {'),
  activity: section(formScreen, '} else if (["activity","tour","attraction","event"].includes(kind)) {', '} else if (["other","reservation","parking","insurance"].includes(kind)) {'),
  other: section(formScreen, '} else if (["other","reservation","parking","insurance"].includes(kind)) {', '} else {'),
};

// Required/optional semantics are an acceptance boundary, not merely copy. A
// regression here can make a ten-second quick-add impossible or silently omit
// an essential booking fact.
assertFormFields(formBranches.flight, {
  carrierName: { required: true },
  flightNumber: { required: true },
  departureLocalTime: { required: true },
  arrivalDate: {},
  arrivalLocalTime: {},
  operatingAirlineCode: {},
  departureTerminal: {},
  departureGate: {},
  boardingTime: {},
  gateCloseTime: {},
  seat: {},
  cabin: {},
  checkedBags: {},
  bookingReference: {},
  ticketNumber: {},
  notes: {},
}, "flight form");
assert(formBranches.flight.includes("manualRouteCard(kind"), "flight must require a from/to route");
assert(
  formBranches.flight.includes('dateRangeField("departureDate", "returnDepartureDate"'),
  "flight must choose departure and optional return dates from one calendar",
);
assert(
  formBranches.flight.includes("{allowSingle:true}"),
  "the shared flight calendar must support one-way travel without requiring a return date",
);

assertFormFields(formBranches.hotel, {
  propertyName: { required: true },
  location: { optional: true },
  streetAddress: {},
  confirmationNumber: {},
  checkInFrom: {},
  checkInUntil: {},
  checkOutBy: {},
  roomName: {},
  phone: {},
  email: {},
  notes: {},
}, "hotel form");
assert(
  formBranches.hotel.includes('dateRangeField("checkInDate", "checkOutDate"'),
  "hotel check-in/check-out must use the one-calendar range control",
);

assertFormFields(formBranches.rail, {
  departureDate: { required: true },
  departureLocalTime: { required: true },
  carrierName: { optional: true },
  serviceNumber: { optional: true },
  arrivalDate: {},
  arrivalLocalTime: {},
  platform: {},
  coach: {},
  seat: {},
  bookingReference: {},
  vehicle: {},
  notes: {},
}, "train/ferry form");
assert(formBranches.rail.includes("manualRouteCard(kind"), "train and ferry must require a from/to route");

assertFormFields(formBranches.car, {
  title: { required: true },
  reservationTime: { required: true },
  endTime: { optional: true },
  vehicle: {},
  confirmationNumber: {},
  driver: {},
  phone: {},
  notes: {},
}, "car-rental form");
assert(formBranches.car.includes("manualRouteCard(kind"), "car rental must require pickup and drop-off");
assert(
  /dateRangeField\(\s*["']reservationDate["']\s*,\s*["']endDate["']/.test(formBranches.car),
  "car-rental pickup/drop-off dates must use one range calendar",
);

assertFormFields(formBranches.transfer, {
  title: { optional: true },
  reservationDate: { required: true },
  reservationTime: { required: true },
  confirmationNumber: {},
  phone: {},
  vehicle: {},
  driver: {},
  notes: {},
}, "transfer form");
assert(formBranches.transfer.includes("manualRouteCard(kind"), "transfer must require pickup and destination");

assertFormFields(formBranches.cruise, {
  provider: { required: true },
  ship: { optional: true },
  activityDate: { required: true },
  activityTime: { optional: true },
  endDate: { optional: true },
  endTime: {},
  title: { optional: true },
  confirmationNumber: {},
  cabin: {},
  deck: {},
  embarkation: {},
  notes: {},
}, "cruise form");
assert(formBranches.cruise.includes("manualRouteCard(kind"), "cruise must require departure and return ports");

assertFormFields(formBranches.restaurant, {
  title: { required: true },
  reservationDate: { required: true },
  reservationTime: { optional: true },
  guests: { optional: true },
  location: { optional: true },
  streetAddress: {},
  confirmationNumber: {},
  phone: {},
  notes: {},
}, "restaurant form");

assertFormFields(formBranches.activity, {
  title: { required: true },
  activityType: { optional: true },
  activityDate: { required: true },
  activityTime: { optional: true },
  location: { optional: true },
  endTime: {},
  confirmationNumber: {},
  provider: {},
  seatSection: {},
  streetAddress: {},
  notes: {},
}, "activity/event form");

assertFormFields(formBranches.other, {
  title: { required: true },
  reservationDate: { required: true },
  reservationTime: { optional: true },
  location: { optional: true },
  endDate: {},
  endTime: {},
  confirmationNumber: {},
  notes: {},
}, "other-booking form");

// Timezones are auto-derived from the selected location (TripIt-style), never
// typed. Every non-flight booking still persists its zone, now through a hidden
// input that syncQuickTimezone() fills from the chosen place — no
// traveler-facing timezone field may reappear.
for (const [key, names] of [
  ["rail", ["departureTimezone", "arrivalTimezone"]],
  ["car", ["timezone", "endTimezone"]],
  ["transfer", ["timezone", "endTimezone"]],
  ["cruise", ["timezone"]],
  ["restaurant", ["timezone"]],
  ["activity", ["timezone"]],
  ["other", ["timezone"]],
]) {
  for (const name of names) {
    assert(
      !new RegExp(`quickField\\("${name}"`).test(formBranches[key]),
      `${key} form must not expose a traveler-facing ${name} field`,
    );
    assert(
      new RegExp(`hiddenTz\\("${name}"`).test(formBranches[key]),
      `${key} form must persist ${name} through a hidden auto-derived input`,
    );
  }
}
// Single-location forms wire the location field so the zone can be derived.
for (const key of ["restaurant", "activity", "other"]) {
  assert(
    formBranches[key].includes('data-location-role="location"'),
    `${key} form must derive its timezone from the chosen location`,
  );
}
// The hidden control seeds a safe fallback (trip → device → UTC) and
// syncQuickTimezone restores it when a location is cleared, so
// resolveEventLocalDateTime always receives a valid zone.
assert(
  app.includes("const hiddenTz = (name, role) =>") &&
    app.includes("data-default-timezone=") &&
    app.includes("control.value = control.dataset.defaultTimezone"),
  "auto-derived timezone must seed a trip/device fallback and restore it when a location is cleared",
);
// A drop-off/arrival location on transport routes derives into endTimezone.
assert(
  app.includes('form.elements.arrivalTimezone ? "arrivalTimezone" : "endTimezone"'),
  "arrival location must derive into endTimezone when the form has no arrivalTimezone control",
);

const manualRouteCard = section(app, "function manualRouteCard(", "function manualAttachmentRows(");
assert(
  manualRouteCard.includes("required: from.required !== false") &&
    manualRouteCard.includes("required: to.required !== false"),
  "route cards must require both endpoints unless a category explicitly opts out",
);
assert(
  app.includes("transportType") && app.includes('subtype: "ferry"') &&
    app.includes('subtype: "cruise"') && app.includes('subtype: "car"') &&
    app.includes('subtype: "transfer"'),
  "specialized manual categories must retain their deterministic backend subtype",
);

// Tickets & Documents is a reusable, optional, multi-file local attachment
// control on manual booking forms—not a network upload field.
const attachmentScriptIndex = index.indexOf("/manual-booking-attachments.js");
assert(attachmentScriptIndex >= 0, "local attachment helper is not loaded");
assert(
  attachmentScriptIndex < index.indexOf("/mobile-app.min.js"),
  "local attachment helper must load before the app",
);
assert(
  serviceWorker.includes("/manual-booking-attachments.js"),
  "local attachment helper is missing from the offline shell",
);
for (const token of [
  "Tickets &amp; Documents",
  "multiple",
  "Add file",
  "document-attachment",
  "manualAttachmentScope",
  "stageManualAttachments",
  "commitManualAttachments",
]) {
  assert(formScreen.includes(token) || app.includes(token), `attachment UI missing ${token}`);
}
assert(
  /<input[^>]+type="file"[^>]+multiple[^>]*>/s.test(app),
  "manual booking attachments must use a native multi-file picker",
);
assert(
  /type="file"[^>]+accept="[^"]*(?:application\/pdf|\.pdf)[^"]*(?:image\/\*|image\/jpeg)[^"]*"/s.test(
    app,
  ),
  "manual attachment picker does not advertise the supported PDF/image formats",
);
assert(
  !/<input[^>]+type="file"[^>]+multiple[^>]+required/s.test(app),
  "attaching a document must remain optional",
);
for (const action of ["open", "remove", "retry"]) {
  assert(
    app.includes(`data-action=\"manual-attachment-${action}\"`) ||
      app.includes(`data-action=\"${action}-manual-attachment\"`),
    `attachment action missing: ${action}`,
  );
}
includesOneOf(
  app,
  ["Stored on this device", "Available on this device"],
  "attachment storage truth is not visible",
);
assert(
  app.includes("draftId: scope") && app.includes("tripId: state.trip?.id"),
  "attachment service calls must use a trip-bound stable draft scope",
);
assert(
  app.includes("row.files") || app.includes("record.files") || app.includes("flatMap"),
  "attachment UI must flatten the service draft record into visible file rows",
);
assert(
  /await\s+api\??\.list\(|api\??\.list\([^)]*\)\.then\(/.test(app),
  "persisted attachment drafts must be hydrated asynchronously after navigation/reload",
);
assert(
  /refreshManualAttachmentPanel\(nativeForm,\s*true\)[\s\S]{0,240}record\?\.files\?\.length[\s\S]{0,120}formHasMeaningfulChanges\s*=\s*true/.test(
    app,
  ),
  "recovered local attachments must mark the restored form dirty before navigation",
);
assert(
  app.includes("URL.createObjectURL") && app.includes("URL.revokeObjectURL"),
  "Open must display the staged local Blob without uploading it",
);
const attachmentRetypeBinding = section(
  app,
  'attachmentList?.addEventListener("change"',
  "bindMeaningfulChanges(nativeForm);",
);
for (const token of [
  "data-manual-attachment-type",
  "retypeManualAttachment",
  "formHasMeaningfulChanges = true",
  'nativeForm.dataset.hasStagedAttachments = "true"',
  "refreshManualAttachmentPanel(nativeForm)",
]) {
  assert(
    app.includes(token) && attachmentRetypeBinding.includes(token),
    `per-file attachment retype is missing ${token}`,
  );
}

const attachmentViewer = section(
  app,
  "function openDocumentViewer(",
  "async function commitManualAttachments(",
);
assert(
  attachmentViewer.includes('overlay.className = "doc-viewer"') &&
    attachmentViewer.includes('data-action="close-doc-viewer"') &&
    attachmentViewer.includes("document.body.appendChild(overlay)") &&
    attachmentViewer.includes("URL.createObjectURL(blob)"),
  "Open must render an in-app document viewer with a Back-to-app control instead of leaving the PWA",
);
const attachmentOpenAction = section(
  app,
  'case "manual-attachment-open": {',
  'case "manual-attachment-retry": {',
);
assert(
  attachmentOpenAction.includes("await openManualAttachment(target.dataset.scope, target.dataset.id)") &&
    !attachmentOpenAction.includes("reserveManualAttachmentWindow"),
  "the attachment Open handler must delegate to the in-app viewer",
);

const attachmentContext = Object.create(null);
runInNewContext(attachments, attachmentContext);
const attachmentApi = attachmentContext.TriptoManualAttachments;
for (const method of ["stage", "list", "commit", "remove", "retype", "clear", "retry", "fail", "create"]) {
  assert.equal(typeof attachmentApi?.[method], "function", `attachment helper missing ${method}()`);
}
assert.equal(attachmentApi.constants.dbName, "tripto-local-docs-v1");
assert.equal(attachmentApi.constants.draftStore, "bookingDrafts");
assert.deepEqual(
  [...attachmentApi.validStatuses],
  ["staged", "failed", "linked"],
  "attachment recovery states changed",
);
for (const token of [
  'cryptoLike.subtle.digest("SHA-256"',
  'status: "staged"',
  'status: "failed"',
  'status: "linked"',
  "relatedBookingId: bookingId",
  'integrity: "verified"',
  "DOC_STORE",
  "DRAFT_STORE",
]) {
  assert(attachments.includes(token), `local attachment lifecycle missing ${token}`);
}
assert(
  (() => {
    const commit = section(
      attachments,
      "async function commit(",
      "async function fail(",
    );
    return (
      commit.includes("transaction([DOC_STORE, DRAFT_STORE]") &&
      commit.includes("objectStore(DOC_STORE)") &&
      /(?:docs|docStore)\.put\(/.test(commit)
    );
  })(),
  "commit must atomically materialize verified files in docs before marking the draft linked",
);
for (const forbidden of ["fetch(", "XMLHttpRequest", "/api/", "R2", "FormData("]) {
  assert(!attachments.includes(forbidden), `local attachment helper must not upload files: ${forbidden}`);
}

// Booking success and file-link success are deliberately separate. A local
// attachment failure must be retryable and must never roll back the booking.
const saveForm = section(app, "async function saveNativeForm(form)", "function importFormatWarnings(");
assert(
  saveForm.includes("bookingBaseKind(kind)") &&
    saveForm.includes("manualBookingConfig(kind)"),
  "save routing must resolve every purpose-built category to its existing backend kind",
);
assert(
  saveForm.includes('["flight","train"].includes(baseKind)') &&
    saveForm.includes('baseKind === "transport"') &&
    saveForm.includes('["activity","reservation"].includes(baseKind)'),
  "specialized categories can currently bypass booking creation",
);
assert(
  saveForm.includes("config?.subtype") ||
    saveForm.includes("config.subtype") ||
    saveForm.includes("manualBookingConfig(kind)?.subtype"),
  "specialized category subtype is not preserved in the save payload",
);
for (const token of [
  'form.getAttribute("aria-busy") === "true"',
  "setFormSaving(form, true)",
  "commitManualAttachments",
  "retryManualAttachment",
  "showFormSubmissionError",
  "clearQuickDraft(kind)",
]) {
  assert(saveForm.includes(token) || app.includes(token), `save/recovery hook missing ${token}`);
}
includesOneOf(
  app,
  ["failManualAttachments", ".fail("],
  "attachment link failure must be recorded for a safe retry",
);
includesOneOf(
  app,
  ["document could not be attached", "documents could not be attached"],
  "partial attachment failure needs a recoverable traveler-facing warning",
);
const attachmentSave = section(
  saveForm,
  "if (savedBookingId && form.dataset.attachmentScope)",
  "let saveWarning=",
);
const linkedCleanup = attachmentSave.slice(
  attachmentSave.indexOf('if(attachmentResult?.status==="linked")'),
);
assert.equal(
  (attachmentSave.match(/catch\s*\(/g) || []).length,
  2,
  "attachment commit and post-commit cleanup must have independent recovery boundaries",
);
assert(
  attachmentSave.indexOf("forgetManualAttachmentRetry(kind,savedBookingId)") >= 0 &&
    attachmentSave.indexOf("forgetManualAttachmentRetry(kind,savedBookingId)") <
      attachmentSave.indexOf("await clearManualAttachment(form.dataset.attachmentScope)"),
  "a successful attachment commit must be recorded before best-effort draft cleanup",
);
assert(
  linkedCleanup.includes("Booking and documents saved.") &&
    linkedCleanup.includes("the attached documents are safe") &&
    !linkedCleanup.includes("rememberManualAttachmentRetry") &&
    !linkedCleanup.includes("could not be attached"),
  "cleanup failure after a successful attachment commit must not be reported as an attachment failure",
);
assert(app.includes("Retry"), "failed local attachments need a Retry action");
const attachmentStaging = section(
  app,
  'manualFiles.addEventListener("change", async () => {',
  'attachmentList?.addEventListener("change"',
);
assert(
  attachmentStaging.includes('nativeForm.dataset.manualAttachmentsBusy = "true"') &&
    attachmentStaging.includes("submit.disabled = true") &&
    attachmentStaging.includes("delete nativeForm.dataset.manualAttachmentsBusy"),
  "manual booking submit must stay blocked until local attachment staging finishes",
);
assert(
  saveForm.includes('form.dataset.manualAttachmentsBusy === "true"') &&
    saveForm.includes("Wait for the selected files to finish preparing"),
  "manual booking save must guard keyboard/programmatic submission during attachment staging",
);
const discardFlow = section(app, "async function closeDiscardDialog(", "function confirmDeleteTrip(");
assert(
  discardFlow.includes("await clearManualAttachment(scope)") &&
    !discardFlow.includes("clearManualAttachment(scope).catch(() => {})") &&
    discardFlow.indexOf("await clearManualAttachment(scope)") < discardFlow.indexOf("clearActiveFormDraft()"),
  "confirmed discard must verify local attachment cleanup before clearing the form and navigating",
);
assert(
  app.includes("sessionStorage.setItem(quickDraftKey(kind)") &&
    app.includes("restoreQuickDraft(nativeForm)") &&
    app.includes("Discard changes?") &&
    app.includes("bindMeaningfulChanges(nativeForm)"),
  "manual booking draft/discard recovery hooks are incomplete",
);
const meaningfulChanges = section(
  app,
  "function bindMeaningfulChanges(",
  "function saveQuickDraft(",
);
assert(
  meaningfulChanges.includes('control.tagName === "SELECT"') &&
    meaningfulChanges.includes("option.defaultSelected") &&
    meaningfulChanges.includes("control.options[0].value"),
  "default select values must not make a pristine booking form look dirty",
);
assert(
  meaningfulChanges.includes('control.hasAttribute("checked")'),
  "pristine traveler checkboxes must not make an untouched booking form look dirty",
);

// A new booking owns one cryptographically random request identity for its
// whole draft lifetime. It is restored after navigation/reload and reused on a
// retry, while edits are deterministically separated by booking id.
const draftIdentity = section(
  app,
  "function manualBookingDraftId(kind, editId",
  "function clearQuickDraft(",
);
assert(
  /if\s*\(editId\)\s*return\s*`edit:\$\{editId\}`/.test(draftIdentity),
  "manual edits must have a booking-specific identity, separate from new forms",
);
assert(
  /crypto\.(?:randomUUID|getRandomValues)\(/.test(draftIdentity),
  "new manual forms must use a cryptographically random draft/request id",
);
assert(
  draftIdentity.includes("sessionStorage.getItem(key)") &&
    draftIdentity.includes("sessionStorage.setItem(key"),
  "the new-form request id must survive route changes in the quick draft",
);
assert(
  formScreen.includes('data-client-request-id="${esc(manualBookingDraftId(kind, editId))}"'),
  "manual forms must expose the stable draft identity to submission code",
);
const saveQuickDraft = section(app, "function saveQuickDraft(form)", "function restoreQuickDraft(form)");
assert(
  saveQuickDraft.includes("form.dataset.clientRequestId") &&
    /values\.__(?:manualDraftId|clientRequestId)\s*=\s*form\.dataset\.clientRequestId/.test(saveQuickDraft),
  "quick-draft persistence must retain the client request id used for retries",
);

assert(
  saveForm.includes("manualCreateHeaders"),
  "manual booking creates must build one shared idempotency header set",
);
assert(
  /["']Idempotency-Key["']\s*:\s*(?:form\.dataset\.clientRequestId|clientRequestId)/.test(saveForm),
  "manual booking creates must send the stable client request id as Idempotency-Key",
);
assert.equal(
  (saveForm.match(/headers\s*:\s*manualCreateHeaders/g) || []).length,
  2,
  "stay and activity/reservation create POSTs must reuse the stable idempotency headers; transport uses its key-aware helper",
);
assert.equal(
  (saveForm.match(/manualTransportCreateOptions\(/g) || []).length,
  3,
  "specialized transport, outbound flight/train, and return-flight creates must use the idempotent transport-create helper",
);
assert(
  /manualTransportCreateOptions\s*=\s*\(body,key=clientRequestId\)\s*=>\s*\(\{[^}]*["']Idempotency-Key["']\s*:\s*key/.test(saveForm),
  "the transport-create helper must default to the stable request id while allowing a distinct child key",
);
assert(
  saveForm.includes('`${clientRequestId}:return`'),
  "a round-trip return leg must use a distinct stable idempotency key",
);

// Every More Details fact must either reach a first-class API field or the
// structured secondary-details/contact persistence path. Merely rendering a
// control is not sufficient acceptance coverage.
for (const helper of [
  "saveManualSecondaryDetails",
  "saveManualContact",
  "parseManualDetailNotes",
  "buildManualDetailNotes",
]) {
  assert(app.includes(`${helper}(`), `manual persistence helper is missing: ${helper}`);
}
const manualPersistenceSource = section(
  app,
  "async function saveTravelerFacts(",
  "function importFormatWarnings(",
);
const travelerFacts = section(
  app,
  "async function saveTravelerFacts(",
  "async function saveManualContact(",
);
const contactPersistence = section(
  app,
  "async function saveManualContact(",
  "async function saveManualSecondaryDetails(",
);
assert(
  contactPersistence.includes("directItemContactById(itemId, type)") &&
    contactPersistence.includes('method:"PATCH"') &&
    contactPersistence.includes('`${clientRequestId}:contact:${type}`') &&
    contactPersistence.includes('"Idempotency-Key":requestKey'),
  "secondary contact retries must resolve the existing trip-item/contact-type row and update it instead of duplicating it",
);
assert(
  !travelerFacts.includes("travelerIds.length !== 1") &&
    travelerFacts.includes("new Set(") &&
    /for\s*\(const travelerId of assignedTravelerIds\)/.test(travelerFacts) &&
    /travelerId,\s*\.\.\.values/.test(travelerFacts),
  "seat, cabin, ticket, and baggage facts must be persisted for every selected traveler",
);
assertPersistedFields(manualPersistenceSource, [
  // Flight / train / ferry facts.
  "carrierName", "flightNumber", "fromLocation", "toLocation",
  "departureDate", "departureLocalTime", "arrivalDate", "arrivalLocalTime",
  "operatingAirlineCode", "departureTerminal", "departureGate",
  "boardingTime", "gateCloseTime", "seat", "cabin", "checkedBags",
  "bookingReference", "ticketNumber", "serviceNumber", "platform", "coach",
  // Hotel / contact facts.
  "propertyName", "location", "streetAddress", "checkInDate", "checkOutDate",
  "checkInFrom", "checkInUntil", "checkOutBy", "roomName", "phone", "email",
  // Car, transfer, cruise, restaurant, activity, and other facts.
  "title", "endLocation", "reservationDate", "reservationTime", "endDate",
  "endTime", "confirmationNumber", "vehicle", "driver", "provider", "ship",
  "activityDate", "activityTime", "cabin", "deck", "embarkation", "guests",
  "activityType", "seatSection", "timezone", "notes",
], "manual booking save");
assert(
  saveForm.includes("saveManualSecondaryDetails"),
  "manual booking save must invoke the isolated structured detail/contact persistence path",
);
assert(
  !saveForm.includes("await saveTravelerFacts(") &&
    !saveForm.includes("await saveItemContact(") &&
    !/await\s+api\([^\n]*\/contacts/.test(saveForm),
  "secondary traveler/contact writes must not remain inside the primary-create failure boundary",
);

const secondaryPersistence = section(
  app,
  "async function saveManualSecondaryDetails(",
  "async function saveNativeForm(form)",
);
assert(
  secondaryPersistence.includes("saveScopedContact") &&
    secondaryPersistence.includes("clientRequestId") &&
    saveForm.includes("saveManualContact,clientRequestId"),
  "secondary contact creates must receive a stable per-draft idempotency key",
);
assert(
  secondaryPersistence.includes("catch") &&
    /warning/i.test(secondaryPersistence) &&
    !/catch\s*\([^)]*\)\s*\{[^}]*throw\b/s.test(secondaryPersistence),
  "secondary persistence must convert failures to a warning instead of rejecting a saved booking",
);
assert(
  /savedBookingId[\s\S]{0,1200}saveManualSecondaryDetails/.test(saveForm),
  "secondary writes must run only after a primary booking id has been saved",
);
includesOneOf(
  saveForm,
  [
    "Booking saved, but some optional details could not be saved",
    "Booking saved, but some details could not be saved",
    "saved with a warning",
  ],
  "secondary-write failure needs truthful post-create recovery copy",
);
assert(
  /saveWarning\s*=\s*\[secondaryWarning\s*,\s*attachmentWarning\]/.test(saveForm) &&
    /showToast\(saveWarning\s*\|\|/.test(saveForm),
  "successful booking feedback must surface secondary-write warnings without reporting primary failure",
);
assert(
  saveForm.includes('route("timeline"') ||
    saveForm.includes('?"timeline"') ||
    saveForm.includes(':"timeline"'),
  "successful manual booking must return directly to Timeline",
);
assert(
  app.includes("relatedBookingId") && app.includes("linkedBookingDocumentRows"),
  "Booking Detail cannot expose its linked Tickets & Documents",
);

// Progressive disclosure: one collapsed, semantic More Details section is
// rendered in the form shell; individual categories populate it rather than
// opening a separate advanced editor.
const quickMore = section(app, "function quickMore(", "function quickDateSuggestions(");
for (const token of [
  'type="button"',
  'aria-expanded="false"',
  "aria-controls=",
  "hidden",
  "form-more-toggle",
]) {
  assert(quickMore.includes(token), `More Details disclosure missing ${token}`);
}
assert.equal(
  (formScreen.match(/quickMore\(/g) || []).length,
  1,
  "manual form shell must render exactly one More Details disclosure",
);
assert(
  formScreen.includes("config.cta") || formScreen.includes("config?.cta"),
  "manual form CTA must use the traveler category label",
);
for (const [, , , , cta] of expectedCategories) {
  assert(app.includes(cta), `manual form CTA is missing: ${cta}`);
}
for (const obsolete of [
  "Save Flight",
  "Save Hotel",
  "Save Train",
  "Save Reservation",
]) {
  assert(!formScreen.includes(obsolete), `database-style CTA remains: ${obsolete}`);
}

// Mobile and accessibility invariants apply to the shared shell, the file
// rows, and the sticky action rather than being reimplemented per category.
for (const token of [
  "env(safe-area-inset-bottom)",
  "--keyboard-offset",
  "min-height:44px",
  "@media(prefers-reduced-motion:reduce)",
]) {
  assert(css.includes(token), `mobile safety contract missing ${token}`);
}
assert(
  /(?:input|textarea|select)[^{]*\{[^}]*font-size:(?:max\([^)]*16px|16px)/s.test(css) ||
    css.includes("font-size:16px"),
  "manual form controls must prevent iOS focus zoom",
);
for (const token of [
  'role="status"',
  'role="alert"',
  "aria-describedby",
  "aria-invalid",
  'aria-label="Remove',
]) {
  assert(app.includes(token), `manual booking accessibility hook missing ${token}`);
}
assert(
  app.includes('behavior: matchMedia("(prefers-reduced-motion: reduce)")') &&
    app.includes("visualViewport"),
  "mobile keyboard/reduced-motion recovery changed",
);
const focusedValidation = section(
  app,
  "function validateFocusedForm(form)",
  "function showFormSubmissionError(form, message)",
);
assert(
  focusedValidation.includes('[\n        "carrierName",\n        "flightNumber",\n        "fromLocation",\n        "toLocation"') &&
    focusedValidation.indexOf("const requiredEssentials") <
      focusedValidation.indexOf("const departureTimezone"),
  "Flight must validate and focus Airline, Flight number, From, and To before timezone semantics",
);

console.log("Manual booking Product V2 UI contract passed.");
