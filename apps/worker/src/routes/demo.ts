import type { AuthContext, Env } from '../types.ts';
import { enumValue, json, nowMs, readJson, uuid } from '../http.ts';

const scenarios=['normal','self_transfer','overnight','family','missing_essentials','airport_change','date_line','cancelled_flight','road_trip','provider_outage'] as const;

export async function createDemoTrip(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  if(env.DEMO_TOOLS_ENABLED!=='true')return json({error:{code:'NOT_FOUND',message:'Endpoint not found.'}},{status:404},request,env);
  const provided=request.headers.get('x-tripto-demo-secret')??'';
  if(!env.DEMO_TOOLS_SECRET||env.DEMO_TOOLS_SECRET.length<16||provided!==env.DEMO_TOOLS_SECRET)return json({error:{code:'DEMO_SECRET_REQUIRED',message:'Demo tools secret is invalid.'}},{status:403},request,env);
  const body=await readJson<{scenario?:unknown}>(request); const scenario=enumValue(body.scenario,'scenario',scenarios,'normal');
  const now=nowMs(); const day=86400000; const hour=3600000;
  const starts=now+7*day; const tripId=uuid();
  const titles:Record<typeof scenarios[number],string>={
    normal:'Demo · Rome',self_transfer:'Demo · Tight self-transfer',overnight:'Demo · Overnight flight',family:'Demo · Family trip',missing_essentials:'Demo · Missing essentials',
    airport_change:'Demo · Airport change',date_line:'Demo · Date-line crossing',cancelled_flight:'Demo · Cancelled flight',road_trip:'Demo · Road trip',provider_outage:'Demo · Provider outage',
  };
  const title=titles[scenario];
  const startDate=new Date(starts).toISOString().slice(0,10); const endDate=new Date(starts+5*day).toISOString().slice(0,10);
  const statements=[env.DB.prepare(`INSERT INTO trips(id,owner_user_id,created_by_device_id,title,lifecycle_state,starts_on,ends_on,created_at,updated_at,version) VALUES (?,?,?,?, 'upcoming',?,?,?,?,1)`)
    .bind(tripId,auth.userId??null,auth.deviceId,title,startDate,endDate,now,now)];
  if(auth.userId)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO trip_members(trip_id,user_id,role,status,joined_at) VALUES (?,?,'owner','active',?)`).bind(tripId,auth.userId,now));
  await env.DB.batch(statements);

  const travelerIds:string[]=[];
  const travelerCount=scenario==='family'?4:1;
  for(let i=0;i<travelerCount;i++){
    const id=uuid();travelerIds.push(id);
    await env.DB.prepare(`INSERT INTO travelers(id,trip_id,display_name,traveler_type,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)`)
      .bind(id,tripId,i===0?'Alex Traveler':`Traveler ${i+1}`,i===2?'child':i===3?'infant':'adult',now,now).run();
  }

  if(scenario==='road_trip'){
    const rome=await addLocation(env,tripId,{type:'city',name:'Rome',tz:'Europe/Rome'},now);
    const florence=await addLocation(env,tripId,{type:'city',name:'Florence',tz:'Europe/Rome'},now);
    const venice=await addLocation(env,tripId,{type:'city',name:'Venice',tz:'Europe/Rome'},now);
    await addGround(env,tripId,rome,florence,'Drive · Rome → Florence',starts+9*hour,starts+12*hour,'Europe/Rome',travelerIds,now);
    await addGround(env,tripId,florence,venice,'Drive · Florence → Venice',starts+2*day+9*hour,starts+2*day+12.5*hour,'Europe/Rome',travelerIds,now);
  } else if(scenario==='date_line'){
    const lax=await addLocation(env,tripId,{type:'airport',name:'Los Angeles International Airport',iata:'LAX',tz:'America/Los_Angeles'},now);
    const hnd=await addLocation(env,tripId,{type:'airport',name:'Tokyo Haneda Airport',iata:'HND',tz:'Asia/Tokyo'},now);
    await addFlight(env,tripId,lax,hnd,'JL','7015',starts+15*hour,starts+26*hour,'America/Los_Angeles','Asia/Tokyo',travelerIds,now);
  } else {
    const tlv=await addLocation(env,tripId,{type:'airport',name:'Ben Gurion Airport',iata:'TLV',tz:'Asia/Jerusalem'},now);
    const fco=await addLocation(env,tripId,{type:'airport',name:'Rome Fiumicino Airport',iata:'FCO',tz:'Europe/Rome'},now);
    const hotel=await addLocation(env,tripId,{type:'hotel',name:'Demo Hotel Roma',address:'Via Nazionale 1, Roma',localAddress:'Via Nazionale 1, Roma',tz:'Europe/Rome'},now);
    let dep=starts+6*hour; let arr=dep+3.5*hour;
    if(scenario==='overnight'){dep=starts+22*hour;arr=dep+4*hour;}
    const flight1=await addFlight(env,tripId,tlv,fco,'LY','383',dep,arr,'Asia/Jerusalem','Europe/Rome',travelerIds,now);
    await addStay(env,tripId,hotel,'Demo Hotel Roma',startDate,endDate,travelerIds,now);

    if(scenario==='self_transfer'){
      const mxp=await addLocation(env,tripId,{type:'airport',name:'Milan Malpensa Airport',iata:'MXP',tz:'Europe/Rome'},now);
      const secondDep=arr+70*60000; const secondArr=secondDep+75*60000;
      const flight2=await addFlight(env,tripId,fco,mxp,'AZ','202',secondDep,secondArr,'Europe/Rome','Europe/Rome',travelerIds,now);
      await env.DB.prepare(`INSERT INTO connections(id,trip_id,from_item_id,to_item_id,connection_type,recommended_buffer_minutes,requires_baggage_reclaim,requires_immigration,requires_security,created_at,updated_at,version) VALUES (?,?,?,?,'self_transfer',120,1,0,1,?,?,1)`)
        .bind(uuid(),tripId,flight1,flight2,now,now).run();
    }
    if(scenario==='airport_change'){
      const cia=await addLocation(env,tripId,{type:'airport',name:'Rome Ciampino Airport',iata:'CIA',tz:'Europe/Rome'},now);
      const mxp=await addLocation(env,tripId,{type:'airport',name:'Milan Malpensa Airport',iata:'MXP',tz:'Europe/Rome'},now);
      const flight2=await addFlight(env,tripId,cia,mxp,'AZ','205',arr+100*60000,arr+190*60000,'Europe/Rome','Europe/Rome',travelerIds,now);
      await env.DB.prepare(`INSERT INTO connections(id,trip_id,from_item_id,to_item_id,connection_type,recommended_buffer_minutes,requires_airport_change,requires_security,created_at,updated_at,version) VALUES (?,?,?,?,'self_transfer',180,1,1,?,?,1)`)
        .bind(uuid(),tripId,flight1,flight2,now,now).run();
    }
    if(scenario==='cancelled_flight'){
      await env.DB.batch([
        env.DB.prepare(`UPDATE trip_items SET status='cancelled',updated_at=?,version=version+1 WHERE id=?`).bind(now,flight1),
        env.DB.prepare(`UPDATE flights SET disruption_state='cancelled',operational_phase='unknown' WHERE trip_item_id=?`).bind(flight1),
        env.DB.prepare(`INSERT INTO alerts(id,trip_id,type,severity,status,related_item_id,title,message,created_at,updated_at) VALUES (?,?,'flight_cancelled','critical','new',?,'Flight cancelled','The demo flight is marked cancelled. No replacement is assumed.',?,?)`).bind(uuid(),tripId,flight1,now,now),
      ]);
    }
    if(scenario==='provider_outage'){
      await env.DB.prepare(`INSERT INTO alerts(id,trip_id,type,severity,status,related_item_id,title,message,created_at,updated_at) VALUES (?,?,'provider_outage','medium','new',?,'Live flight data unavailable','Provider data is unavailable. Scheduled booking data remains visible and must not be presented as live.',?,?)`)
        .bind(uuid(),tripId,flight1,now,now).run();
    }
  }

  const essentials=[
    ['Passport / travel ID','documents','critical'],
    ['Save key confirmations offline','documents','high'],
    ['Check power adapter','packing','medium'],
  ] as const;
  for(const [itemTitle,category,priority] of essentials){
    const completed=scenario==='missing_essentials'?null:(priority==='critical'?now:null);
    await env.DB.prepare(`INSERT INTO trip_checklist_items(id,trip_id,title,category,priority,completion_source,completed_at,reminder_enabled,created_at,updated_at,version) VALUES (?,?,?,?,?,? ,?,0,?,?,1)`)
      .bind(uuid(),tripId,itemTitle,category,priority,completed?'system':'none',completed,now,now).run();
  }

  return json({demo:{scenario,tripId,title,note:'Internal QA data only. Live flight status and AI remain disabled unless explicitly enabled elsewhere.'}},{status:201},request,env);
}

interface DemoLocation{type:'airport'|'hotel'|'city'|'address';name:string;iata?:string;tz?:string;address?:string;localAddress?:string}
async function addLocation(env:Env,tripId:string,v:DemoLocation,now:number):Promise<string>{
  const id=uuid();await env.DB.batch([
    env.DB.prepare(`INSERT INTO locations(id,type,display_name,formatted_address,local_address,timezone,iata_code,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,1)`).bind(id,v.type,v.name,v.address??null,v.localAddress??null,v.tz??null,v.iata??null,now,now),
    env.DB.prepare(`INSERT INTO trip_locations(trip_id,location_id,created_at) VALUES (?,?,?)`).bind(tripId,id,now),
  ]);return id;
}
async function addFlight(env:Env,tripId:string,from:string,to:string,airline:string,num:string,dep:number,arr:number,depTz:string,arrTz:string,travelers:string[],now:number):Promise<string>{
  const id=uuid();const stmts=[
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,'system','confirmed',?,?,1)`).bind(id,tripId,`${airline} ${num}`,from,to,dep,arr,depTz,arrTz,now,now),
    env.DB.prepare(`INSERT INTO transport_segments(trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_status) VALUES (?,'flight',?,?,?,?,?,?,?,?, 'confirmed')`).bind(id,airline,num,from,to,dep,arr,depTz,arrTz),
    env.DB.prepare(`INSERT INTO flights(trip_item_id,marketing_airline_code,marketing_flight_number,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (?,?,?,?,?,'scheduled','none',0)`).bind(id,airline,num,dep,arr),
  ];
  for(const travelerId of travelers)stmts.push(env.DB.prepare(`INSERT INTO trip_item_travelers(trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
  await env.DB.batch(stmts);return id;
}
async function addGround(env:Env,tripId:string,from:string,to:string,title:string,dep:number,arr:number,tz:string,travelers:string[],now:number):Promise<string>{
  const id=uuid();const stmts=[
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'transport','confirmed',?,?,?,?,?,?,?,'system','estimated',?,?,1)`).bind(id,tripId,title,from,to,dep,arr,tz,tz,now,now),
    env.DB.prepare(`INSERT INTO transport_segments(trip_item_id,transport_type,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_status) VALUES (?,'car',?,?,?,?,?,?, 'confirmed')`).bind(id,from,to,dep,arr,tz,tz),
  ];
  for(const travelerId of travelers)stmts.push(env.DB.prepare(`INSERT INTO trip_item_travelers(trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
  await env.DB.batch(stmts);return id;
}
async function addStay(env:Env,tripId:string,locationId:string,name:string,checkIn:string,checkOut:string,travelers:string[],now:number):Promise<string>{
  const id=uuid();const stmts=[
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'stay','confirmed',?,?,'system','confirmed',?,?,1)`).bind(id,tripId,name,locationId,now,now),
    env.DB.prepare(`INSERT INTO stays(trip_item_id,property_name,property_location_id,check_in_date,check_out_date,booking_status) VALUES (?,?,?,?,?,'confirmed')`).bind(id,name,locationId,checkIn,checkOut),
  ];
  for(const travelerId of travelers)stmts.push(env.DB.prepare(`INSERT INTO trip_item_travelers(trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
  await env.DB.batch(stmts);return id;
}
