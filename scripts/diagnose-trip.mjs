#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
const tripId=args.find(x=>!x.startsWith('--'));
const mode=args.includes('--remote')?'--remote':'--local';
if(!tripId||!/^[A-Za-z0-9_-]{8,128}$/.test(tripId)){
  console.error('Usage: npm run diagnose:trip -- <trip-id> [--local|--remote]');
  process.exit(2);
}
const escaped=tripId.replaceAll("'","''");
function query(sql){
  const run=spawnSync('npx',['wrangler','d1','execute','tripto-db',mode,'--json','--command',sql],{encoding:'utf8'});
  if(run.status!==0)throw new Error(run.stderr||run.stdout||'D1 query failed');
  const parsed=JSON.parse(run.stdout); const groups=Array.isArray(parsed)?parsed:[parsed];
  for(const group of groups){if(Array.isArray(group?.results))return group.results;if(Array.isArray(group?.result?.[0]?.results))return group.result[0].results;}
  return [];
}
const trip=query(`SELECT * FROM trips WHERE id='${escaped}' AND deleted_at IS NULL LIMIT 1`)[0];
if(!trip){console.log('FAIL trip: selected trip does not exist or is deleted');process.exit(2);}
const rows=query(`SELECT
 (SELECT COUNT(*) FROM trip_items WHERE trip_id='${escaped}' AND deleted_at IS NULL) items,
 (SELECT COUNT(*) FROM travelers WHERE trip_id='${escaped}' AND deleted_at IS NULL) travelers,
 (SELECT COUNT(*) FROM transport_segments ts JOIN trip_items ti ON ti.id=ts.trip_item_id WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL) transport,
 (SELECT COUNT(*) FROM transport_segments ts JOIN trip_items ti ON ti.id=ts.trip_item_id WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL AND (ts.departure_timezone IS NULL OR ts.arrival_timezone IS NULL)) missing_transport_timezones,
 (SELECT COUNT(*) FROM transport_segments ts JOIN trip_items ti ON ti.id=ts.trip_item_id WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL AND ts.scheduled_departure_utc IS NOT NULL AND ts.scheduled_arrival_utc IS NOT NULL AND ts.scheduled_arrival_utc<ts.scheduled_departure_utc) invalid_transport_order,
 (SELECT COUNT(*) FROM stays s JOIN trip_items ti ON ti.id=s.trip_item_id WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL) stays,
 (SELECT COUNT(*) FROM stays s JOIN trip_items ti ON ti.id=s.trip_item_id WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL AND (s.check_in_date IS NULL OR s.check_out_date IS NULL)) incomplete_stays,
 (SELECT COUNT(*) FROM connections WHERE trip_id='${escaped}') connections,
 (SELECT COUNT(*) FROM connections WHERE trip_id='${escaped}' AND (connection_type='unknown' OR recommended_buffer_minutes IS NULL)) uncertain_connections,
 (SELECT COUNT(*) FROM trip_items ti WHERE ti.trip_id='${escaped}' AND ti.deleted_at IS NULL AND ti.type IN ('transport','stay') AND NOT EXISTS (SELECT 1 FROM trip_item_travelers tt WHERE tt.trip_item_id=ti.id)) unassigned_bookings,
 (SELECT COUNT(*) FROM impact_assessments WHERE trip_id='${escaped}' AND status='active' AND severity IN ('critical','high')) urgent_health,
 (SELECT COUNT(*) FROM impact_assessments WHERE trip_id='${escaped}' AND status='active' AND calculated_at<${Date.now()-86400000}) stale_health,
 (SELECT COUNT(*) FROM trip_checklist_items WHERE trip_id='${escaped}' AND deleted_at IS NULL AND completed_at IS NULL AND category='documents') missing_document_tasks,
 (SELECT COUNT(*) FROM imports i JOIN import_candidates c ON c.import_id=i.id WHERE i.trip_id='${escaped}' AND c.validation_status='pending' AND c.confidence<0.8) low_confidence_imports,
 (SELECT COUNT(*) FROM sync_operations WHERE entity_id IN (SELECT id FROM trip_items WHERE trip_id='${escaped}') AND status IN ('pending','sending','failed_retryable')) pending_sync,
 (SELECT COUNT(*) FROM sync_conflicts sc JOIN sync_operations so ON so.id=sc.operation_id WHERE sc.status='open' AND so.entity_id IN (SELECT id FROM trip_items WHERE trip_id='${escaped}')) open_conflicts,
 (SELECT COUNT(*) FROM trip_items WHERE trip_id='${escaped}' AND deleted_at IS NULL AND confidence IN ('estimated','unavailable','low_confidence')) uncertain_data`)[0]||{};

const out=[];const add=(level,name,reason)=>out.push({level,name,reason});
add(['draft','upcoming','active','completed','cancelled'].includes(trip.lifecycle_state)?'PASS':'FAIL','lifecycle',`state=${trip.lifecycle_state}`);
add(trip.starts_on&&trip.ends_on?'PASS':'WARNING','trip dates',trip.starts_on&&trip.ends_on?`${trip.starts_on} to ${trip.ends_on}`:'start or end date is missing');
add(+rows.items>0?'PASS':'WARNING','itinerary',`${rows.items} item(s)`);
add(+rows.missing_transport_timezones===0?'PASS':'FAIL','timezones',+rows.missing_transport_timezones===0?'all transport timezones present':`${rows.missing_transport_timezones} transport item(s) missing timezone`);
add(+rows.invalid_transport_order===0?'PASS':'FAIL','transport consistency',+rows.invalid_transport_order===0?'scheduled ordering is consistent':`${rows.invalid_transport_order} segment(s) arrive before departure`);
add(+rows.incomplete_stays===0?'PASS':'WARNING','stay consistency',+rows.incomplete_stays===0?'stay dates complete':`${rows.incomplete_stays} stay(s) missing check-in/out date`);
add(+rows.unassigned_bookings===0?'PASS':'WARNING','traveler assignments',+rows.unassigned_bookings===0?'transport/stays have traveler coverage':`${rows.unassigned_bookings} booking(s) have no traveler assignment`);
add(+rows.uncertain_connections===0?'PASS':'WARNING','connections',`${rows.connections} connection(s); ${rows.uncertain_connections} uncertain`);
add(+rows.urgent_health===0?'PASS':'FAIL','Trip Health',+rows.urgent_health===0?'no active critical/high impacts':`${rows.urgent_health} active critical/high impact(s)`);
add(+rows.stale_health===0?'PASS':'WARNING','health freshness',+rows.stale_health===0?'active assessments are current or absent':`${rows.stale_health} assessment(s) older than 24h`);
add(+rows.missing_document_tasks===0?'PASS':'WARNING','Ready Offline documents',+rows.missing_document_tasks===0?'no open document checklist prerequisite':'open document checklist requirements remain');
add('WARNING','local document bytes','device-local IndexedDB documents cannot be inspected from D1; verify on the selected device');
add(+rows.low_confidence_imports===0?'PASS':'WARNING','imports',+rows.low_confidence_imports===0?'no pending low-confidence import':'pending low-confidence import requires review');
add(+rows.pending_sync===0?'PASS':'WARNING','pending sync',`${rows.pending_sync} pending/retryable operation(s)`);
add(+rows.open_conflicts===0?'PASS':'FAIL','sync conflicts',`${rows.open_conflicts} unresolved conflict(s)`);
add(+rows.uncertain_data===0?'PASS':'WARNING','data confidence',`${rows.uncertain_data} estimated/unavailable/low-confidence item(s)`);
for(const x of out)console.log(`${x.level.padEnd(7)} ${x.name}: ${x.reason}`);
const fails=out.filter(x=>x.level==='FAIL').length,warnings=out.filter(x=>x.level==='WARNING').length;
console.log(`\nSUMMARY ${fails?'FAIL':warnings?'WARNING':'PASS'}: ${fails} failure(s), ${warnings} warning(s)`);
if(fails)process.exitCode=2;
