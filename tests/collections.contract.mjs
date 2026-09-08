import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Planning-collections contract failed: ${m}`)};
const routes=read('apps/worker/src/routes/planning-collections.ts'),worker=read('apps/worker/src/index.ts'),migration=read('migrations/0025_trip_planning_collections.sql'),app=read('public/mobile-app.js'),css=read('public/mobile-app.css'),clientRoutes=read('public/mobile-routes.js');

// --- Backend endpoints wired (order-sensitive: stops/order before stops/:id,
//     collection/:id LAST so it never shadows the sub-routes) ---
assert(worker.includes("from './routes/planning-collections.ts'"),'planning-collections routes not imported');
for(const fn of ['listCollections','createCollection','updateCollection','deleteCollection','addStop','updateStop','deleteStop','reorderStops'])assert(worker.includes(fn),`route handler not wired: ${fn}`);
assert(worker.indexOf('/collections\\/([^/]+)\\/stops\\/order')<worker.indexOf('/collections\\/([^/]+)\\/stops$'),'stops/order route must be matched before stops POST');
assert(worker.indexOf('/collections\\/([^/]+)\\/stops\\/([^/]+)')<worker.indexOf('/collections\\/([^/]+)$'),'stop-by-id route must be matched before collection-by-id');

// --- Data model: reusable subtype of trip_items; stops are NOT trip_items ---
assert(migration.includes('CREATE TABLE planning_collections')&&migration.includes('trip_item_id TEXT PRIMARY KEY')&&migration.includes('REFERENCES trip_items(id) ON DELETE CASCADE'),'planning_collections must be a 1:1 subtype of trip_items');
assert(migration.includes("collection_type TEXT NOT NULL CHECK(collection_type IN ('neighborhood','day_trip','walking_route','places_to_visit','food_and_drink','shopping'))"),'six collection types must be constrained');
assert(migration.includes('CREATE TABLE planning_stops')&&migration.includes('collection_item_id TEXT NOT NULL')&&!/CREATE TABLE planning_stops[\s\S]*?type='custom'/.test(migration),'stops must live in their own table, never as trip_items (no top-level timeline rows)');
assert(migration.includes('position INTEGER NOT NULL DEFAULT 0')&&migration.includes('idx_planning_stops_collection ON planning_stops(collection_item_id, position, deleted_at)'),'stops must be ordered by position with a supporting index');
assert(migration.includes('linked_trip_item_id TEXT')&&migration.includes('FOREIGN KEY(linked_trip_item_id) REFERENCES trip_items(id) ON DELETE SET NULL'),'stops must be able to link an existing booking without duplicating it');
assert(migration.includes('version INTEGER NOT NULL DEFAULT 1')&&migration.includes('deleted_at INTEGER'),'stops need the sync quartet for offline/collaboration');

// --- Server-side authorization: every mutation requires write access ---
assert((routes.match(/requireTripAccess\(env,auth,tripId,true\)/g)||[]).length>=7,'all mutating handlers must requireTripAccess(write=true)');
assert(routes.includes('export async function listCollections')&&/listCollections[\s\S]*?requireTripAccess\(env,auth,tripId\)/.test(routes),'list must require (read) trip access');

// --- Optimistic concurrency + immutable type + safe delete ---
assert(routes.includes("'VERSION_REQUIRED'")&&routes.includes("'VERSION_CONFLICT'"),'optimistic version checks missing');
assert(routes.includes("'TYPE_IMMUTABLE'"),'collection_type must be immutable after creation');
assert(routes.includes('Soft-delete the parent only')&&routes.includes('are never touched'),'delete must soft-delete parent only and never touch linked bookings');
assert(routes.includes("INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip_item'"),'collection delete must emit a trip_item tombstone for sync');
assert(routes.includes('recordChangeEvent(env,tripId,')&&routes.includes(",auth)"),'change events must be recorded with actor attribution');
// Reorder validates every id belongs to the collection.
assert(routes.includes("'STOP_NOT_IN_COLLECTION'")&&routes.includes('order.length>200'),'reorder must validate membership and bound size');
// Display order is manual position, so reorder persists across reloads.
assert(routes.includes('ORDER BY position, created_at')&&routes.includes('ORDER BY ps.collection_item_id, ps.position, ps.created_at'),'stops must be returned in manual position order');

// --- Neighborhood is now the only supported collection type. The migration
//     CHECK keeps the original six values (it is live on prod and a superset),
//     but createCollection rejects anything but neighborhood server-side. ---
assert(migration.includes("collection_type TEXT NOT NULL CHECK(collection_type IN ('neighborhood','day_trip','walking_route','places_to_visit','food_and_drink','shopping'))"),'original collection-type CHECK must remain (live migration, superset)');
assert(routes.includes("if(collectionType!=='neighborhood')throw new HttpError(400,'COLLECTION_TYPE_UNSUPPORTED'"),'createCollection must reject non-neighborhood types server-side');

// --- Frontend: neighborhood-only config, timeline integration, numbered mini-timeline ---
assert(app.includes('const COLLECTION_TYPE_CONFIG = Object.freeze({')&&/COLLECTION_TYPE_CONFIG = Object\.freeze\(\{\s*neighborhood:/.test(app),'neighborhood must be the only collection type config');
for(const retired of ['day_trip:','walking_route:','places_to_visit:','food_and_drink:'])assert(!app.includes(retired),`retired collection type must not appear in client config: ${retired}`);
assert(app.includes('const TIMELINE_COLLECTION_TYPES = new Set(["neighborhood"])'),'only neighborhood is timeline-capable');
assert(app.includes('function isTimelineVisibleItem')&&app.includes('if (!isTimelineVisibleItem(item)) continue;'),'main timeline must hide wishlists and unscheduled collections');
assert(app.includes('function collectionSummary')&&app.includes('places')&&app.includes('.join(" · ")'),'parent summary must be computed from children (N places · start–end)');
assert(/function collectionForItem\(id\)[\s\S]{0,260}trip_item_id[\s\S]{0,260}c\.id/.test(app),'collection lookup must accept both collection id and trip item id');
assert(/function collectionStopsFor\(id\)[\s\S]{0,500}collection_item_id/.test(app),'stop lookup must resolve the collection id aliases');
// Mini-timeline uses the main timeline's time · rail · marker · copy roles;
// the marker is a stop number rather than a category icon.
assert(app.includes('class="mini-stop__dot"')&&app.includes('mini-stop__time')&&app.includes('mini-stop__marker')&&app.includes('mini-stop__name')&&app.includes('mini-stop__rail'),'mini-timeline must render time · rail · numbered marker · name');
assert(app.includes('function collectionStopTimelineMeta')&&app.includes('mini-stop__secondary')&&app.includes('mini-stop__detail'),'mini-timeline rows must expose the same contextual metadata hierarchy as the main timeline');
assert(app.includes('linked_trip_item_id')&&app.includes('linkedSummary && linkedSummary !== secondary')&&app.includes('Linked to ${String(linked.title).trim()}'),'linked booking or idea context must remain visible in its neighborhood row');
assert(!app.includes('mini-stop__icon'),'mini-timeline stops must not render category icons');
assert(/class="mini-timeline"[\s\S]{0,900}?mini-stop__dot/.test(app),'mini-timeline list must contain dots');

// --- Design contract in CSS: main timeline geometry and typography, no cards.
const marker=css.match(/\.collection-page \.mini-stop__marker\{[^}]*\}/g)?.join(' ')||'';
const markerSize=Number((marker.match(/width:(\d+)px/)||[])[1]);
assert(markerSize===44,`mini-timeline numbered marker must be 44px (got ${markerSize||'none'})`);
assert(!/\.collection-page \.mini-stop__(?:marker|content|name)[^{]*\{[^}]*box-shadow/.test(css),'mini-timeline content and numbered markers must have no shadow');
assert(/\.collection-page \.mini-stop__hit\{[^}]*display:grid[^}]*grid-template-columns:48px 26px 50px minmax\(0,1fr\)/.test(css),'mini-timeline must use the main timeline time · rail · numbered marker · copy grid');
assert(css.includes('.collection-page .mini-stop__name{display:block;color:var(--ink);font-size:var(--timeline-booking-title-size)')&&css.includes('.collection-page .mini-stop__secondary{display:-webkit-box;-webkit-line-clamp:2')&&css.includes('.collection-page .mini-stop__detail{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted-soft);font-size:12.5px')&&css.includes('.collection-page .mini-stop__time{grid-column:1;justify-self:end;padding-right:10px;color:var(--ink);font-size:var(--timeline-time-size)'),'mini-timeline typography must match main timeline roles');
// Dot state communicated by shape/tone, plus strikethrough for skipped (never color alone).
for(const st of ['next','future','past','skipped'])assert(css.includes(`.mini-stop--${st} .mini-stop__dot`),`missing dot state style: ${st}`);
assert(css.includes('.collection-page .mini-stop--skipped .mini-stop__name{color:var(--muted);text-decoration:line-through}'),'skipped stop must be struck through, not only recolored');
// No blue/purple category colors, gradients, or glassmorphism introduced.
assert(!/\.mini-stop[^{]*\{[^}]*(gradient|backdrop-filter|#[0-9a-fA-F]{3,6}\b)/.test(css),'mini-timeline must use neutral tokens, not raw colors/gradients/glass');

// --- Actions gated server-and-client side; viewers are read-only ---
for(const act of ['add-collection','edit-collection','delete-collection','collection-add-place','edit-stop','delete-stop','stop-move','stop-status'])assert(app.includes(`"${act}"`),`action not implemented: ${act}`);
assert(/VIEWER_BLOCKED_ACTIONS[\s\S]*?"add-collection"[\s\S]*?"stop-status"/.test(app),'mutating collection actions must be viewer-blocked');
const collectionScreen=app.slice(app.indexOf('function collectionScreen()'),app.indexOf('function collectionFormScreen()'));
assert(app.includes('function HeaderNavigation(')&&app.includes('collection-header-add')&&app.includes('data-action="collection-add-place"'),'Add place must remain available in the shared header');
assert(!collectionScreen.includes('primaryCta(`Add ${cfg.stop}`'),'collection detail must not repeat Add place as a large body row');
assert(collectionScreen.includes('class="collection-timeline-scroll"')&&collectionScreen.includes('aria-label="Places timeline"'),'collection stop list must have its own labelled scrolling region');
assert(/html body \.phone-app > \.collection-page > main\.focused-page\{[^}]*overflow:hidden/.test(css),'collection page shell must keep its context fixed while the list scrolls');
assert(/\.collection-page \.collection-timeline-scroll\{[^}]*flex:1 1 auto[^}]*overflow-y:auto/.test(css),'only the collection timeline list must own vertical scrolling');
assert(collectionScreen.includes('class="mini-stop__hit"')&&collectionScreen.includes('data-action="stop-menu"'),'each mini-timeline row must remain an interactive stop menu action');
assert(!collectionScreen.includes('mini-stop__more'),'mini-timeline rows must not show chevrons; the row itself remains the action');
assert(!css.includes('.collection-page .mini-stop__more{'),'mini-timeline must not reserve a chevron affordance');
assert(css.includes('.collection-page .mini-stop__content{grid-column:4;display:grid;align-content:center;gap:1px;min-width:0;padding:12px 0 12px 14px;border:0}'),'mini-timeline copy must use the released chevron space');
assert(css.includes('html body .phone-app > .collection-page > .app-bar .app-bar-title strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'),'narrow Neighborhood headers must truncate instead of wrapping beside their actions');

// --- Client routes: planning + collection + forms, forms matched first ---
assert(clientRoutes.includes('planning: "/planning"')&&clientRoutes.includes('collection: "/collections"'),'planning/collection routes missing');
assert(clientRoutes.indexOf('/collections\\/new\\/')<clientRoutes.indexOf("for (const [screen, base] of Object.entries(DETAIL_PATHS))"),'collection-form parse must precede generic detail loop');
assert(app.includes('case "planning": html = planningScreen();')&&app.includes('case "collection": html = collectionScreen();')&&app.includes('case "collection-form": html = collectionFormScreen();')&&app.includes('case "stop-form": html = stopFormScreen();'),'render switch missing collection screens');

// --- Offline-first: mutations queue and a dedicated flusher replays them ---
assert(app.includes('function flushCollectionsQueue')&&app.includes('await flushCollectionsQueue();'),'offline queue flusher for collections missing/not wired to online');
assert(app.includes('queuePendingMutation({ kind: "collection"'),'collection mutations must queue offline');

// --- Dedup: re-linking the same idea into a neighborhood is idempotent ---
// A double-tap (or offline-replay) must not create a second linking stop; the
// server returns the existing stop instead of inserting a duplicate.
assert(/addStop[\s\S]*?SELECT \* FROM planning_stops WHERE collection_item_id=\? AND linked_trip_item_id=\? AND deleted_at IS NULL/.test(routes)&&routes.includes('deduped:true'),'addStop must be idempotent for a repeated idea link (dedup guard)');
assert(routes.indexOf('deduped:true')<routes.indexOf('INSERT INTO planning_stops'),'dedup guard must run before the insert');

// --- Functional: dot-state derivation (self-contained pure function) ---
{
  const src=app.slice(app.indexOf('function collectionStopStates('));
  const fnSrc=src.slice(0,src.indexOf('\n  }')+4);
  const ctx={};
  runInNewContext(`${fnSrc}\nresult=collectionStopStates;`,ctx);
  const states=ctx.result([{status:'visited'},{status:'planned'},{status:'planned'},{status:'skipped'}]);
  assert(JSON.stringify(states)===JSON.stringify(['past','next','future','skipped']),`dot-state derivation wrong: ${JSON.stringify(states)}`);
  // First non-visited/non-skipped is "next"; only one "next".
  assert(ctx.result([{status:'skipped'},{status:'planned'},{status:'planned'}]).filter(s=>s==='next').length===1,'exactly one stop may be "next"');
}

// --- Functional: a linked booking keeps its Timeline context even when the
// stop also has local place details. This prevents a useful route/category
// from disappearing behind an address, while a standalone stop stays concise.
{
  const start=app.indexOf('function collectionStopLinkedItem('),end=app.indexOf('\n\n  // The Planning Overview',start);
  const ctx={
    state:{timeline:[{id:'booking-1',title:'Dinner reservation'}],transport:[],stays:[]},
    PLACE_TYPE_OPTIONS:[['','Choose a type'],['restaurant','Restaurant']],
    itemId:item=>String(item?.id||''),timelineType:()=> 'reservation',transportForItem:()=>null,
    timelineGlyph:()=> 'restaurant',timelineSecondary:()=> 'Reservation · Trastevere',
  };
  runInNewContext(`${app.slice(start,end)}\nresult=collectionStopTimelineMeta;`,ctx);
  const linked=ctx.result({title:'Dinner reservation',linked_trip_item_id:'booking-1',place_type:'restaurant',address_snapshot:'Piazza Santa Maria',notes:'Ask for the terrace'});
  assert(linked.secondary==='Restaurant · Piazza Santa Maria','local type and address must form the first Timeline metadata line');
  assert(linked.detail==='Reservation · Trastevere · Ask for the terrace','linked booking context and note must remain visible after local details');
  const standalone=ctx.result({title:'Gelato',place_type:'restaurant',address_snapshot:'Via della Scala'});
  assert(standalone.secondary==='Restaurant · Via della Scala'&&standalone.detail==='','standalone stops must not invent booking metadata');
}

console.log('Planning-collections contract passed.');
