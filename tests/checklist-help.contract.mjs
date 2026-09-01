import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Checklist/Help contract failed: ${m}`)};
const app=read('public/mobile-app.js'),css=read('public/mobile-app.css'),routes=read('public/mobile-routes.js');

// ---- Contextual reachability (not permanent bottom tabs) ----
const nav=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
assert(!nav.includes('navBtn("help"')&&!nav.includes('navBtn("checklist"'),'Help and Checklist must not displace the approved Trip / Add / Account navigation');

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
assert(help.includes('Quick answers for planning your trip.'),'Help subtitle missing');

// ---- FAQ content grounded in the real product ----
const faq=app.slice(app.indexOf('const FAQ_SECTIONS'),app.indexOf('function helpScreen('));
for(const label of ['Getting started','Bookings','Your trip','Account'])assert(faq.includes(`title: "${label}"`),`FAQ section missing: ${label}`);
// Real product labels only — no invented controls.
for(const real of ['Upload Booking','Add Booking Manually','Trip Map','Sign out','Timeline'])assert(faq.includes(real),`FAQ must reference real control: ${real}`);
// Forward Email option is hidden in the product, so it must NOT be documented.
assert(!faq.includes('Forward'),'FAQ documents a hidden Forward Email option');
// No invented support email beyond the real booking address.
assert(!/[a-z0-9._%+-]+@tripto\.to/i.test(faq.replace(/go@tripto\.to/g,'')),'FAQ invents an unsupported email address');
// Question count sanity (search UI only warranted >12-15 questions; we keep it simple).
const qCount=(faq.match(/\bid: "/g)||[]).length;
assert(qCount>=10&&qCount<=15,`unexpected FAQ question count: ${qCount}`);

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
assert(app.includes('function addChecklistItem(')&&app.includes('function toggleChecklistItem(')&&app.includes('function deleteChecklistItem(')&&app.includes('function editChecklistItem('),'checklist CRUD handlers missing');
assert(app.includes('persistChecklistCache('),'checklist offline persistence missing');

// ---- Touch targets (>=44px) ----
const flatCss=css.replace(/\n/g,'');
assert(/\.cl-row__toggle\{[^}]*min-height:5\d px?|\.cl-row__toggle\{[^}]*min-height:(?:4[4-9]|5\d|6\d)px/.test(flatCss),'checklist toggle under 44px');
assert(/\.cl-row__act\{[^}]*height:44px/.test(flatCss)&&/\.cl-chip\{[^}]*min-height:44px/.test(flatCss),'checklist controls under 44px');
assert(/\.faq-q\{[^}]*min-height:(?:4[4-9]|5\d|6\d)px/.test(flatCss),'FAQ question button under 44px');
assert(/\.faq-action\{[^}]*min-height:44px/.test(flatCss),'FAQ action button under 44px');

console.log('Checklist/Help contract passed.');
