#!/usr/bin/env node
// One-off seed generator for tripto.to production D1.
// Emits SQL to stdout. Deterministic IDs (seed-* prefixes) so it is idempotent/cleanable.
const OWNER = "24fff8c1-e430-4677-9edb-fbe0eae1d908";
const now = Date.now();
const esc = (s) => s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const ts = (iso) => Date.parse(iso); // ISO with explicit offset -> UTC ms
const out = [];
const sql = (s) => out.push(s);

// helper builders -----------------------------------------------------------
function trip(idn, title, state, startsOn, endsOn) {
  const id = `seed-trip-${idn}`;
  sql(`INSERT INTO trips (id,owner_user_id,created_by_device_id,title,lifecycle_state,starts_on,ends_on,created_at,updated_at,version) VALUES (${esc(id)},${esc(OWNER)},NULL,${esc(title)},${esc(state)},${esc(startsOn)},${esc(endsOn)},${now},${now},1);`);
  sql(`INSERT OR IGNORE INTO trip_members (trip_id,user_id,role,status,joined_at) VALUES (${esc(id)},${esc(OWNER)},'owner','active',${now});`);
  return id;
}
function loc(id, type, name, opts = {}) {
  const { addr = null, tz = null, iata = null, city = null, cc = null } = opts;
  sql(`INSERT INTO locations (id,type,display_name,formatted_address,timezone,iata_code,city,country_code,created_at,updated_at,version) VALUES (${esc(id)},${esc(type)},${esc(name)},${esc(addr)},${esc(tz)},${esc(iata)},${esc(city)},${esc(cc)},${now},${now},1);`);
  return id;
}
function tripLoc(tripId, locId) {
  sql(`INSERT OR IGNORE INTO trip_locations (trip_id,location_id,created_at) VALUES (${esc(tripId)},${esc(locId)},${now});`);
}
function item(id, tripId, type, status, title, subtitle, startsUtc, endsUtc, startTz, endTz, startLoc, endLoc) {
  sql(`INSERT INTO trip_items (id,trip_id,type,status,title,subtitle,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (${esc(id)},${esc(tripId)},${esc(type)},${esc(status)},${esc(title)},${esc(subtitle)},${esc(startLoc)},${esc(endLoc)},${startsUtc},${endsUtc},${esc(startTz)},${esc(endTz)},'manual','confirmed',${now},${now},1);`);
}
function flight(itemId, tripId, o) {
  // transport_segment + flight
  sql(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (${esc(itemId)},'flight',${esc(o.carrier)},${esc(o.flightNo)},${esc(o.depLoc)},${esc(o.arrLoc)},${o.depUtc},${o.arrUtc},${esc(o.depTz)},${esc(o.arrTz)},${esc(o.ref)},'confirmed');`);
  sql(`INSERT INTO flights (trip_item_id,marketing_airline_code,marketing_flight_number,departure_terminal,arrival_terminal,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (${esc(itemId)},${esc(o.code)},${esc(o.num)},${esc(o.depTerm)},${esc(o.arrTerm)},${o.depUtc},${o.arrUtc},'scheduled','none',0);`);
}
function transfer(itemId, o) {
  sql(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.carrier)},${esc(o.serviceNo)},${esc(o.depLoc)},${esc(o.arrLoc)},${o.depUtc},${o.arrUtc},${esc(o.tz)},${esc(o.tz)},${esc(o.ref)},'confirmed');`);
}
function stay(itemId, o) {
  sql(`INSERT INTO stays (trip_item_id,property_name,property_location_id,check_in_date,check_out_date,confirmation_number,room_name,booking_status) VALUES (${esc(itemId)},${esc(o.name)},${esc(o.loc)},${esc(o.checkIn)},${esc(o.checkOut)},${esc(o.conf)},${esc(o.room)},'confirmed');`);
}
function activity(itemId, o) {
  sql(`INSERT INTO activities (trip_item_id,activity_type,venue_location_id,reservation_reference,notes) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.loc)},${esc(o.ref)},${esc(o.notes)});`);
}
function reservation(itemId, o) {
  sql(`INSERT INTO reservations (trip_item_id,reservation_type,confirmation_number,window_start_utc,window_end_utc,notes) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.conf)},${o.startUtc},${o.endUtc},${esc(o.notes)});`);
}

// =========================================================================
// TRIP 1 — Rome, Italy (upcoming)
// =========================================================================
{
  const t = trip(1, "Rome Getaway", "upcoming", "2026-09-10", "2026-09-14");
  const tlv = loc("seed-loc-tlv", "airport", "Ben Gurion Airport", { addr: "Tel Aviv, Israel", tz: "Asia/Jerusalem", iata: "TLV", city: "Tel Aviv", cc: "IL" });
  const fco = loc("seed-loc-fco", "airport", "Rome Fiumicino Airport", { addr: "Fiumicino, Italy", tz: "Europe/Rome", iata: "FCO", city: "Rome", cc: "IT" });
  const artemide = loc("seed-loc-artemide", "hotel", "Hotel Artemide", { addr: "Via Nazionale 22, Rome", tz: "Europe/Rome", city: "Rome", cc: "IT" });
  const roscioli = loc("seed-loc-roscioli", "restaurant", "Roscioli", { addr: "Via dei Giubbonari 21, Rome", tz: "Europe/Rome", city: "Rome", cc: "IT" });
  [tlv, fco, artemide, roscioli].forEach((l) => tripLoc(t, l));

  const f = "seed-i-1-flight";
  item(f, t, "transport", "confirmed", "Tel Aviv → Rome", "LY 383", ts("2026-09-10T09:20:00+03:00"), ts("2026-09-10T12:40:00+02:00"), "Asia/Jerusalem", "Europe/Rome", tlv, fco);
  flight(f, t, { carrier: "El Al", flightNo: "LY 383", code: "LY", num: "383", depLoc: tlv, arrLoc: fco, depUtc: ts("2026-09-10T09:20:00+03:00"), arrUtc: ts("2026-09-10T12:40:00+02:00"), depTz: "Asia/Jerusalem", arrTz: "Europe/Rome", depTerm: "3", arrTerm: "1", ref: "ELAL7QK2" });

  const tr = "seed-i-1-transfer";
  item(tr, t, "transport", "confirmed", "Airport transfer", "FCO → Hotel Artemide", ts("2026-09-10T14:10:00+02:00"), ts("2026-09-10T15:00:00+02:00"), "Europe/Rome", "Europe/Rome", fco, artemide);
  transfer(tr, { type: "transfer", carrier: "Welcome Pickups", serviceNo: null, depLoc: fco, arrLoc: artemide, depUtc: ts("2026-09-10T14:10:00+02:00"), arrUtc: ts("2026-09-10T15:00:00+02:00"), tz: "Europe/Rome", ref: "WP-3391" });

  const h = "seed-i-1-stay";
  item(h, t, "stay", "confirmed", "Hotel Artemide", "Check-in · 4 nights", ts("2026-09-10T15:00:00+02:00"), ts("2026-09-14T11:00:00+02:00"), "Europe/Rome", "Europe/Rome", artemide, artemide);
  stay(h, { name: "Hotel Artemide", loc: artemide, checkIn: "2026-09-10", checkOut: "2026-09-14", conf: "ART-556210", room: "Deluxe King" });

  const d = "seed-i-1-dinner";
  item(d, t, "reservation", "confirmed", "Roscioli", "Dinner reservation", ts("2026-09-10T20:00:00+02:00"), ts("2026-09-10T22:00:00+02:00"), "Europe/Rome", "Europe/Rome", roscioli, roscioli);
  reservation(d, { type: "restaurant", conf: "RSC-8842", startUtc: ts("2026-09-10T20:00:00+02:00"), endUtc: ts("2026-09-10T22:00:00+02:00"), notes: "Table for 2, tasting menu" });
}

// =========================================================================
// TRIP 2 — Tokyo, Japan (upcoming)
// =========================================================================
{
  const t = trip(2, "Tokyo Discovery", "upcoming", "2026-10-05", "2026-10-12");
  const tlv = "seed-loc-tlv";
  const hnd = loc("seed-loc-hnd", "airport", "Tokyo Haneda Airport", { addr: "Ota City, Tokyo", tz: "Asia/Tokyo", iata: "HND", city: "Tokyo", cc: "JP" });
  const parkhotel = loc("seed-loc-parkhotel", "hotel", "Park Hotel Tokyo", { addr: "1-7-1 Higashi-Shimbashi, Tokyo", tz: "Asia/Tokyo", city: "Tokyo", cc: "JP" });
  const teamlab = loc("seed-loc-teamlab", "attraction", "teamLab Planets", { addr: "6-1-16 Toyosu, Koto City, Tokyo", tz: "Asia/Tokyo", city: "Tokyo", cc: "JP" });
  tripLoc(t, tlv); [hnd, parkhotel, teamlab].forEach((l) => tripLoc(t, l));

  const f = "seed-i-2-flight";
  item(f, t, "transport", "confirmed", "Tel Aviv → Tokyo", "LY 095", ts("2026-10-05T00:30:00+03:00"), ts("2026-10-05T17:20:00+09:00"), "Asia/Jerusalem", "Asia/Tokyo", tlv, hnd);
  flight(f, t, { carrier: "El Al", flightNo: "LY 095", code: "LY", num: "095", depLoc: tlv, arrLoc: hnd, depUtc: ts("2026-10-05T00:30:00+03:00"), arrUtc: ts("2026-10-05T17:20:00+09:00"), depTz: "Asia/Jerusalem", arrTz: "Asia/Tokyo", depTerm: "3", arrTerm: "3", ref: "ELAL9RT5" });

  const h = "seed-i-2-stay";
  item(h, t, "stay", "confirmed", "Park Hotel Tokyo", "Check-in · 7 nights", ts("2026-10-05T19:00:00+09:00"), ts("2026-10-12T10:00:00+09:00"), "Asia/Tokyo", "Asia/Tokyo", parkhotel, parkhotel);
  stay(h, { name: "Park Hotel Tokyo", loc: parkhotel, checkIn: "2026-10-05", checkOut: "2026-10-12", conf: "PHT-771903", room: "Artist Room" });

  const a = "seed-i-2-activity";
  item(a, t, "activity", "confirmed", "teamLab Planets", "Digital art museum", ts("2026-10-06T13:00:00+09:00"), ts("2026-10-06T15:30:00+09:00"), "Asia/Tokyo", "Asia/Tokyo", teamlab, teamlab);
  activity(a, { type: "attraction", loc: teamlab, ref: "TLB-20261006", notes: "Timed entry, wear shorts" });
}

// =========================================================================
// TRIP 3 — Paris, France (upcoming)
// =========================================================================
{
  const t = trip(3, "Paris Long Weekend", "upcoming", "2026-11-20", "2026-11-23");
  const ldn = loc("seed-loc-stpancras", "station", "London St Pancras International", { addr: "Euston Rd, London", tz: "Europe/London", city: "London", cc: "GB" });
  const parisnord = loc("seed-loc-parisnord", "station", "Paris Gare du Nord", { addr: "18 Rue de Dunkerque, Paris", tz: "Europe/Paris", city: "Paris", cc: "FR" });
  const lebristol = loc("seed-loc-lebristol", "hotel", "Le Bristol Paris", { addr: "112 Rue du Faubourg Saint-Honoré, Paris", tz: "Europe/Paris", city: "Paris", cc: "FR" });
  const septime = loc("seed-loc-septime", "restaurant", "Septime", { addr: "80 Rue de Charonne, Paris", tz: "Europe/Paris", city: "Paris", cc: "FR" });
  [ldn, parisnord, lebristol, septime].forEach((l) => tripLoc(t, l));

  const tr = "seed-i-3-train";
  item(tr, t, "transport", "confirmed", "London → Paris", "Eurostar 9024", ts("2026-11-20T10:24:00+00:00"), ts("2026-11-20T13:47:00+01:00"), "Europe/London", "Europe/Paris", ldn, parisnord);
  transfer(tr, { type: "train", carrier: "Eurostar", serviceNo: "9024", depLoc: ldn, arrLoc: parisnord, depUtc: ts("2026-11-20T10:24:00+00:00"), arrUtc: ts("2026-11-20T13:47:00+01:00"), tz: "Europe/Paris", ref: "EUR-4471Q2" });

  const h = "seed-i-3-stay";
  item(h, t, "stay", "confirmed", "Le Bristol Paris", "Check-in · 3 nights", ts("2026-11-20T15:00:00+01:00"), ts("2026-11-23T12:00:00+01:00"), "Europe/Paris", "Europe/Paris", lebristol, lebristol);
  stay(h, { name: "Le Bristol Paris", loc: lebristol, checkIn: "2026-11-20", checkOut: "2026-11-23", conf: "BRI-330187", room: "Deluxe Room" });

  const d = "seed-i-3-dinner";
  item(d, t, "reservation", "confirmed", "Septime", "Dinner reservation", ts("2026-11-21T19:30:00+01:00"), ts("2026-11-21T22:00:00+01:00"), "Europe/Paris", "Europe/Paris", septime, septime);
  reservation(d, { type: "restaurant", conf: "SEP-1121", startUtc: ts("2026-11-21T19:30:00+01:00"), endUtc: ts("2026-11-21T22:00:00+01:00"), notes: "Tasting menu, 2 guests" });
}

// =========================================================================
// TRIP 4 — New York, USA (active)
// =========================================================================
{
  const t = trip(4, "New York City Break", "active", "2026-08-21", "2026-08-27");
  const tlv = "seed-loc-tlv";
  const jfk = loc("seed-loc-jfk", "airport", "John F. Kennedy International", { addr: "Queens, NY", tz: "America/New_York", iata: "JFK", city: "New York", cc: "US" });
  const pod = loc("seed-loc-pod51", "hotel", "The Pod 51 Hotel", { addr: "230 E 51st St, New York", tz: "America/New_York", city: "New York", cc: "US" });
  const moma = loc("seed-loc-moma", "attraction", "Museum of Modern Art", { addr: "11 W 53rd St, New York", tz: "America/New_York", city: "New York", cc: "US" });
  tripLoc(t, tlv); [jfk, pod, moma].forEach((l) => tripLoc(t, l));

  const f = "seed-i-4-flight";
  item(f, t, "transport", "completed", "Tel Aviv → New York", "LY 001", ts("2026-08-21T00:50:00+03:00"), ts("2026-08-21T05:30:00-04:00"), "Asia/Jerusalem", "America/New_York", tlv, jfk);
  flight(f, t, { carrier: "El Al", flightNo: "LY 001", code: "LY", num: "001", depLoc: tlv, arrLoc: jfk, depUtc: ts("2026-08-21T00:50:00+03:00"), arrUtc: ts("2026-08-21T05:30:00-04:00"), depTz: "Asia/Jerusalem", arrTz: "America/New_York", depTerm: "3", arrTerm: "4", ref: "ELAL2MN8" });

  const h = "seed-i-4-stay";
  item(h, t, "stay", "confirmed", "The Pod 51 Hotel", "Check-in · 6 nights", ts("2026-08-21T15:00:00-04:00"), ts("2026-08-27T11:00:00-04:00"), "America/New_York", "America/New_York", pod, pod);
  stay(h, { name: "The Pod 51 Hotel", loc: pod, checkIn: "2026-08-21", checkOut: "2026-08-27", conf: "POD-889201", room: "Queen Pod" });

  const a = "seed-i-4-activity";
  item(a, t, "activity", "confirmed", "MoMA", "Museum of Modern Art", ts("2026-08-23T11:00:00-04:00"), ts("2026-08-23T14:00:00-04:00"), "America/New_York", "America/New_York", moma, moma);
  activity(a, { type: "attraction", loc: moma, ref: "MOMA-0823", notes: "Members entrance" });
}

// =========================================================================
// TRIP 5 — Barcelona, Spain (completed)
// =========================================================================
{
  const t = trip(5, "Barcelona Escape", "completed", "2026-06-12", "2026-06-16");
  const tlv = "seed-loc-tlv";
  const bcn = loc("seed-loc-bcn", "airport", "Barcelona El Prat Airport", { addr: "El Prat de Llobregat, Spain", tz: "Europe/Madrid", iata: "BCN", city: "Barcelona", cc: "ES" });
  const cotton = loc("seed-loc-cottonhouse", "hotel", "Cotton House Hotel", { addr: "Gran Via de les Corts Catalanes 670, Barcelona", tz: "Europe/Madrid", city: "Barcelona", cc: "ES" });
  const sagrada = loc("seed-loc-sagrada", "attraction", "Sagrada Família", { addr: "Carrer de Mallorca 401, Barcelona", tz: "Europe/Madrid", city: "Barcelona", cc: "ES" });
  tripLoc(t, tlv); [bcn, cotton, sagrada].forEach((l) => tripLoc(t, l));

  const f = "seed-i-5-flight";
  item(f, t, "transport", "completed", "Tel Aviv → Barcelona", "LY 393", ts("2026-06-12T08:15:00+03:00"), ts("2026-06-12T12:05:00+02:00"), "Asia/Jerusalem", "Europe/Madrid", tlv, bcn);
  flight(f, t, { carrier: "El Al", flightNo: "LY 393", code: "LY", num: "393", depLoc: tlv, arrLoc: bcn, depUtc: ts("2026-06-12T08:15:00+03:00"), arrUtc: ts("2026-06-12T12:05:00+02:00"), depTz: "Asia/Jerusalem", arrTz: "Europe/Madrid", depTerm: "3", arrTerm: "1", ref: "ELAL5PP1" });

  const h = "seed-i-5-stay";
  item(h, t, "stay", "completed", "Cotton House Hotel", "Check-in · 4 nights", ts("2026-06-12T15:00:00+02:00"), ts("2026-06-16T11:00:00+02:00"), "Europe/Madrid", "Europe/Madrid", cotton, cotton);
  stay(h, { name: "Cotton House Hotel", loc: cotton, checkIn: "2026-06-12", checkOut: "2026-06-16", conf: "COT-442015", room: "Junior Suite" });

  const a = "seed-i-5-activity";
  item(a, t, "activity", "completed", "Sagrada Família", "Guided tour", ts("2026-06-13T10:00:00+02:00"), ts("2026-06-13T12:00:00+02:00"), "Europe/Madrid", "Europe/Madrid", sagrada, sagrada);
  activity(a, { type: "attraction", loc: sagrada, ref: "SAG-0613", notes: "Tower access included" });
}

process.stdout.write(out.join("\n") + "\n");
