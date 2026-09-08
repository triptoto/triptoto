// Local-only navigation fixtures; never bundled into the application.
(() => {
  const s = state;
  const start = Date.parse(s.trip.starts_on + 'T09:00:00Z');
  s.collections = [{id:'audit-neighborhood',trip_item_id:'audit-neighborhood',collection_type:'neighborhood',title:'A morning in Trastevere',city:'Rome',starts_at_utc:start,start_timezone:'Europe/Rome',start_local_datetime:s.trip.starts_on+'T11:00',collection_notes:'Explore at your own pace.'}];
  s.collectionStops = Array.from({length:8},(_,i)=>({id:'audit-stop-'+i,collection_item_id:'audit-neighborhood',title:['Santa Maria in Trastevere','Coffee and pastries','Galleria Corsini','Lunch in the neighborhood','Botanical garden','A quiet walk along the river','Piazza Trilussa','Evening gelato'][i],scheduled_time:i%2?'':String(9+i).padStart(2,'0')+':30',status:i===6?'visited':i===7?'skipped':'planned',place_type:['museum','cafe','museum','restaurant','park','street','viewpoint','cafe'][i],local_address:'Trastevere, Roma',notes:i===2?'Allow time for the permanent collection.':'',order_index:i}));
  s.timeline.push({id:'audit-neighborhood',type:'activity',title:'A morning in Trastevere',starts_at_utc:start,start_timezone:'Europe/Rome',status:'planned'});
  s.timeline.push({id:'audit-idea',type:'activity',activity_type:'museum_culture',title:'Visit the museum of contemporary art',starts_at_utc:null,ends_at_utc:null,start_timezone:'Europe/Rome',status:'planned',notes:'Choose a day later.'});
  s.account={mode:'account',user:{id:'audit-owner',display_name:'Alex Traveler',email:'alex@example.test'}};
  s.sharing={enabled:true,role:'owner',canManage:true,maxMembers:10};
  s.sharingTripId=s.collabTripId=s.trip.id;
  s.members=[{user_id:'audit-owner',display_name:'Alex Traveler',role:'owner'},{user_id:'audit-editor',display_name:'Sam Companion',role:'editor'},{user_id:'audit-viewer',display_name:'Taylor Companion',role:'viewer'}];
  s.invites=[{id:'audit-invite',invited_email:'friend@example.test',role:'viewer',status:'invited',expires_at:new Date(Date.now()+86400000).toISOString()}];
  s.bookingEmails=[{id:'audit-email',subject:'Your travel booking confirmation',status:'needs_trip',candidate_count:1,import_id:'imp-flight',received_at:Date.now(),candidate_type:'hotel'}];
  s.changes=[{id:'audit-change',entity_type:'trip_item',event_type:'created',created_at:Date.now()}];
  return true;
})()

if (["navigation-no-trip", "navigation-guest"].includes(QA_STATE)) {
  state.account = { mode: "guest", providers: [] };
  state.trip = null;
  state.trips = [];
}
if (QA_STATE === "navigation-viewer") {
  state.trip.role = "viewer";
  state.trips.find(trip => trip.id === state.trip.id).role = "viewer";
  state.sharing.role = "viewer";
}
if (QA_STATE === "navigation-long") state.trip.title = "A longer journey through Italy with friends and family";
if (QA_STATE === "navigation-error") state.error = "Local QA: the trip could not load.";
if (QA_STATE === "navigation-handoff") state.googleAuthHandoffStatus = "expired";
if (QA_STATE === "navigation-review") state.importReview = {
  candidates: [{ id: "audit-candidate", candidate_type: "hotel", confidence: 0.9, payload: {
    propertyName: "QA hotel", checkInDate: state.trip.starts_on, checkOutDate: state.trip.ends_on,
  }}],
};
