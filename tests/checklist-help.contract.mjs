import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Checklist/Help contract failed: ${m}`)};
const app=read('public/mobile-app.js'),css=read('public/mobile-app.css'),routes=read('public/mobile-routes.js');

// ---- Current approved primary navigation ----
const nav=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
for(const item of ['navBtn("trips"','navBtn("trip-options"','navBtn("checklist"','navBtn("account"'])assert(nav.includes(item),`approved navigation item missing: ${item}`);
assert(nav.includes('class="nav-item nav-add"')&&!nav.includes('navBtn("help"'),'Help must remain contextual and Add must remain centered');

// ---- Route registration (offline-capable deep links) ----
assert(routes.includes('help: "/help"'),'Help route /help missing');
assert(routes.includes('checklist: "/before-you-go"'),'Checklist route missing');

// ---- Render dispatch ----
assert(app.includes('case "help": html = helpScreen(); break;'),'help screen is not dispatched by render()');
assert(app.includes('function helpScreen(')&&app.includes('function checklistScreen('),'help/checklist screens missing');

// ---- FAQ accordion accessibility ----
const help=app.slice(app.indexOf('function helpScreen('),app.indexOf('function travelerDocumentSummary('));
assert(help.includes('aria-expanded="${open}"')&&help.includes('aria-controls="${panelId}"'),'FAQ rows lack aria-expanded/aria-controls');
assert(help.includes('data-action="faq-toggle"'),'FAQ toggle action missing');
assert(help.includes('type="button"'),'FAQ questions must be real buttons');
assert(help.includes('role="region"'),'FAQ answer panel lacks region role');
assert(help.includes('mobilePage("Help & FAQ"'),'Help screen title wrong');
assert(help.includes('How can we help?')&&help.includes('Find a clear answer without leaving your trip.'),'Help introduction missing');
assert(help.includes('data-faq-search')&&help.includes('data-faq-row')&&help.includes('data-faq-section'),'FAQ search structure missing');
assert(app.includes('const faqSearch = event.target.closest?.("[data-faq-search]")')&&app.includes('row.hidden = !match'),'FAQ search behavior missing');
assert(help.includes('data-faq-empty')&&help.includes('No answer found'),'FAQ empty search state missing');
assert(help.includes('Take the tour')&&help.includes('href="/privacy"')&&help.includes('href="/terms"'),'Help utility links missing');

// ---- FAQ content grounded in the real product ----
const faq=app.slice(app.indexOf('const FAQ_SECTIONS'),app.indexOf('function helpScreen('));
for(const label of ['Getting started','Bookings','Your trip','Account'])assert(faq.includes(`title: "${label}"`),`FAQ section missing: ${label}`);
// Real product labels only — no invented controls.
for(const real of ['Upload Booking','ADD NEW BOOKING','Trip Map','Sign out','Timeline'])assert(faq.includes(real),`FAQ must reference real control: ${real}`);
// Forward Email option is hidden in the product, so it must NOT be documented.
assert(!faq.includes('Forward'),'FAQ documents a hidden Forward Email option');
// No invented support email beyond the real booking address.
assert(!/[a-z0-9._%+-]+@tripto\.to/i.test(faq.replace(/go@tripto\.to/g,'')),'FAQ invents an unsupported email address');
// Question count sanity. Search keeps this comprehensive set easy to navigate.
const qCount=(faq.match(/\bid: "/g)||[]).length;
assert(qCount>=10&&qCount<=20,`unexpected FAQ question count: ${qCount}`);

// ---- FAQ action links must map to real screens/actions ----
assert(help.includes('data-screen="${esc(item.action.screen)}"')||help.includes('data-action="${esc(item.action.action)}"'),'FAQ actions not wired');
// Trip-scoped actions gated so no dead action fires without a trip.
assert(help.includes('state.trip ? true : false'),'FAQ trip-scoped actions are not guarded');

// ---- Checklist screen behavior ----
const cl=app.slice(app.indexOf('function checklistScreen('),app.indexOf('const FAQ_SECTIONS'));
assert(cl.includes('data-action="toggle-checklist"')&&cl.includes('data-action="edit-checklist"')&&cl.includes('data-action="delete-checklist"'),'checklist row actions missing');
assert(cl.includes('id="checklist-add-form"'),'checklist add form missing');
assert(cl.includes('aria-pressed'),'checklist toggle lacks aria-pressed');
assert(cl.includes('mobilePage("Checklist"'),'checklist screen title wrong');
assert(app.includes('function normalizeChecklist(')&&app.includes('completed_at')&&app.includes('completedAt != null'),'checklist completion normalization missing (completed_at bug guard)');
assert(app.includes('function showUndoToast('),'undo toast for delete missing');
assert(app.includes('function flushChecklistQueue('),'offline checklist replay missing');
assert(app.includes('function addChecklistItem(')&&app.includes('function toggleChecklistItem(')&&app.includes('function deleteChecklistItem(')&&app.includes('function renameChecklistItem('),'checklist CRUD handlers missing');
assert(app.includes('persistChecklistCache('),'checklist offline persistence missing');

// ---- Touch targets (>=44px) ----
const flatCss=css.replace(/\n/g,'');
assert(/\.cl-row__toggle\{[^}]*min-height:5\d px?|\.cl-row__toggle\{[^}]*min-height:(?:4[4-9]|5\d|6\d)px/.test(flatCss),'checklist toggle under 44px');
assert(/\.cl-row__act\{[^}]*height:44px/.test(flatCss)&&/\.cl-chip\{[^}]*min-height:44px/.test(flatCss),'checklist controls under 44px');
assert(/\.faq-q\{[^}]*min-height:(?:4[4-9]|5\d|6\d)px/.test(flatCss),'FAQ question button under 44px');
assert(/\.faq-action\{[^}]*min-height:44px/.test(flatCss),'FAQ action button under 44px');

console.log('Checklist/Help contract passed.');
