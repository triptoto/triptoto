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
// Mini-timeline is dots-only: no category icons, no card class, no shadow.
assert(app.includes('class="mini-stop__dot"')&&app.includes('mini-stop__time')&&app.includes('mini-stop__name')&&app.includes('mini-stop__rail'),'mini-timeline must render time · dot · name');
assert(!app.includes('mini-stop__icon'),'mini-timeline stops must not render category icons');
assert(/class="mini-timeline"[\s\S]{0,900}?mini-stop__dot/.test(app),'mini-timeline list must contain dots');

// --- Design contract in CSS: flat, monochrome, dot size 14-18px, no shadow ---
const dot=css.match(/\.mini-stop__dot\{[^}]*\}/g)?.join(' ')||'';
const dotSize=Number((dot.match(/width:(\d+)px/)||[])[1]);
assert(dotSize===32,`mini-timeline numbered marker must be 32px (got ${dotSize||'none'})`);
assert(!/\.mini-(timeline|stop)[^{]*\{[^}]*box-shadow/.test(css)&&!/\.mini-stop__[a-z]+[^{]*\{[^}]*box-shadow/.test(css),'mini-timeline must have no shadow (flat)');
assert(/\.mini-stop__hit\{[^}]*display:grid[^}]*grid-template-columns:32px minmax\(0,1fr\) 16px/.test(css),'mini-timeline must use the rail · content · affordance grid');
// Dot state communicated by shape/tone, plus strikethrough for skipped (never color alone).
for(const st of ['next','future','past','skipped'])assert(css.includes(`.mini-stop--${st} .mini-stop__dot`),`missing dot state style: ${st}`);
assert(css.includes('.mini-stop--skipped .mini-stop__name{color:var(--muted);text-decoration:line-through}'),'skipped stop must be struck through, not only recolored');
// No blue/purple category colors, gradients, or glassmorphism introduced.
assert(!/\.mini-stop[^{]*\{[^}]*(gradient|backdrop-filter|#[0-9a-fA-F]{3,6}\b)/.test(css),'mini-timeline must use neutral tokens, not raw colors/gradients/glass');

// --- Actions gated server-and-client side; viewers are read-only ---
for(const act of ['add-collection','edit-collection','delete-collection','collection-add-place','edit-stop','delete-stop','stop-move','stop-status'])assert(app.includes(`"${act}"`),`action not implemented: ${act}`);
assert(/VIEWER_BLOCKED_ACTIONS[\s\S]*?"add-collection"[\s\S]*?"stop-status"/.test(app),'mutating collection actions must be viewer-blocked');

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

console.log('Planning-collections contract passed.');
