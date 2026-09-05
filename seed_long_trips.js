#!/usr/bin/env node
// Seed generator: 10 LONG multi-city trips for tripto.to production D1.
// Deterministic IDs (lt-* prefixes) so it is idempotent / cleanable.
// Emits SQL to stdout.
const OWNER = "24fff8c1-e430-4677-9edb-fbe0eae1d908"; // travelinkme@gmail.com
const now = Date.now();
const esc = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const ts = (iso) => {
  const v = Date.parse(iso);
  if (Number.isNaN(v)) throw new Error("bad date: " + iso);
  return v;
};
const out = [];
const sql = (s) => out.push(s);
const dateOnly = (iso) => iso.slice(0, 10);
const dateAdd = (ymd, days) => {
  const base = Date.parse(ymd + "T12:00:00Z") + days * 86400000;
  return new Date(base).toISOString().slice(0, 10);
};

// ---- low-level builders (column lists mirror the live schema) --------------
function trip(id, title, state, startsOn, endsOn) {
  sql(`INSERT INTO trips (id,owner_user_id,created_by_device_id,title,lifecycle_state,starts_on,ends_on,created_at,updated_at,version) VALUES (${esc(id)},${esc(OWNER)},NULL,${esc(title)},${esc(state)},${esc(startsOn)},${esc(endsOn)},${now},${now},1);`);
  sql(`INSERT OR IGNORE INTO trip_members (trip_id,user_id,role,status,joined_at) VALUES (${esc(id)},${esc(OWNER)},'owner','active',${now});`);
}
function loc(id, type, name, opts = {}) {
  const { addr = null, tz = null, iata = null, station = null, city = null, cc = null } = opts;
  sql(`INSERT INTO locations (id,type,display_name,formatted_address,timezone,iata_code,station_code,city,country_code,created_at,updated_at,version) VALUES (${esc(id)},${esc(type)},${esc(name)},${esc(addr)},${esc(tz)},${esc(iata)},${esc(station)},${esc(city)},${esc(cc)},${now},${now},1);`);
  return id;
}
function tripLoc(tripId, locId) {
  sql(`INSERT OR IGNORE INTO trip_locations (trip_id,location_id,created_at) VALUES (${esc(tripId)},${esc(locId)},${now});`);
}
function item(id, tripId, type, status, title, subtitle, startsUtc, endsUtc, startTz, endTz, startLoc, endLoc) {
  sql(`INSERT INTO trip_items (id,trip_id,type,status,title,subtitle,start_location_id,end_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (${esc(id)},${esc(tripId)},${esc(type)},${esc(status)},${esc(title)},${esc(subtitle)},${esc(startLoc)},${esc(endLoc)},${startsUtc},${endsUtc},${esc(startTz)},${esc(endTz)},'manual','confirmed',${now},${now},1);`);
}
function segFlight(itemId, o) {
  sql(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (${esc(itemId)},'flight',${esc(o.carrier)},${esc(o.flightNo)},${esc(o.depLoc)},${esc(o.arrLoc)},${o.depUtc},${o.arrUtc},${esc(o.depTz)},${esc(o.arrTz)},${esc(o.ref)},'confirmed');`);
  sql(`INSERT INTO flights (trip_item_id,marketing_airline_code,marketing_flight_number,departure_terminal,arrival_terminal,scheduled_departure_utc,scheduled_arrival_utc,operational_phase,disruption_state,live_data_enabled) VALUES (${esc(itemId)},${esc(o.code)},${esc(o.num)},${esc(o.depTerm)},${esc(o.arrTerm)},${o.depUtc},${o.arrUtc},'scheduled','none',0);`);
}
function segGround(itemId, o) {
  sql(`INSERT INTO transport_segments (trip_item_id,transport_type,carrier_name,service_number,departure_location_id,arrival_location_id,scheduled_departure_utc,scheduled_arrival_utc,departure_timezone,arrival_timezone,booking_reference,booking_status) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.carrier)},${esc(o.serviceNo)},${esc(o.depLoc)},${esc(o.arrLoc)},${o.depUtc},${o.arrUtc},${esc(o.tz)},${esc(o.tz)},${esc(o.ref)},'confirmed');`);
}
function stayRow(itemId, o) {
  sql(`INSERT INTO stays (trip_item_id,property_name,property_location_id,check_in_date,check_out_date,confirmation_number,room_name,booking_status) VALUES (${esc(itemId)},${esc(o.name)},${esc(o.loc)},${esc(o.checkIn)},${esc(o.checkOut)},${esc(o.conf)},${esc(o.room)},'confirmed');`);
}
function activityRow(itemId, o) {
  sql(`INSERT INTO activities (trip_item_id,activity_type,venue_location_id,reservation_reference,notes) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.loc)},${esc(o.ref)},${esc(o.notes)});`);
}
function reservationRow(itemId, o) {
  sql(`INSERT INTO reservations (trip_item_id,reservation_type,confirmation_number,window_start_utc,window_end_utc,notes) VALUES (${esc(itemId)},${esc(o.type)},${esc(o.conf)},${o.startUtc},${o.endUtc},${esc(o.notes)});`);
}

// ---- catalog ---------------------------------------------------------------
const TLV = { code: "TLV", name: "Ben Gurion Airport", addr: "Tel Aviv, Israel", tz: "Asia/Jerusalem", city: "Tel Aviv", cc: "IL" };

// Each city carries its fixed UTC offset for its trip month plus curated venues.
const CITIES = {
  bangkok: { off: "+07:00", tz: "Asia/Bangkok", cc: "TH", city: "Bangkok", air: { code: "BKK", name: "Suvarnabhumi Airport", addr: "Bang Phli, Samut Prakan" }, hotel: { name: "The Siam Hotel", addr: "3/2 Thanon Khao, Bangkok", room: "River Suite" }, venues: [{ t: "attraction", name: "Grand Palace", addr: "Na Phra Lan Rd, Bangkok" }, { t: "attraction", name: "Wat Arun", addr: "158 Thanon Wang Doem, Bangkok" }, { t: "restaurant", name: "Gaggan Anand", addr: "68/1 Soi Langsuan, Bangkok" }, { t: "restaurant", name: "Jay Fai", addr: "327 Maha Chai Rd, Bangkok" }] },
  chiangmai: { off: "+07:00", tz: "Asia/Bangkok", cc: "TH", city: "Chiang Mai", air: { code: "CNX", name: "Chiang Mai International", addr: "Su Thep, Chiang Mai" }, hotel: { name: "137 Pillars House", addr: "2 Soi 1 Nawatgate Rd, Chiang Mai", room: "Rajah Brooke Suite" }, venues: [{ t: "attraction", name: "Doi Suthep Temple", addr: "Su Thep, Chiang Mai" }, { t: "attraction", name: "Elephant Nature Park", addr: "Kuet Chang, Mae Taeng" }, { t: "restaurant", name: "David's Kitchen", addr: "113 Bumrungrad Rd, Chiang Mai" }] },
  phuket: { off: "+07:00", tz: "Asia/Bangkok", cc: "TH", city: "Phuket", air: { code: "HKT", name: "Phuket International", addr: "Mai Khao, Phuket" }, hotel: { name: "Trisara", addr: "60/1 Moo 6, Sakhu, Phuket", room: "Ocean View Pool Villa" }, venues: [{ t: "attraction", name: "Phi Phi Islands Tour", addr: "Phi Phi, Krabi" }, { t: "attraction", name: "Big Buddha Phuket", addr: "Karon, Phuket" }, { t: "restaurant", name: "PRU", addr: "Cherngtalay, Phuket" }] },

  rome: { off: "+01:00", tz: "Europe/Rome", cc: "IT", city: "Rome", air: { code: "FCO", name: "Rome Fiumicino Airport", addr: "Fiumicino, Italy" }, hotel: { name: "Hotel de la Ville", addr: "Via Sistina 69, Rome", room: "Deluxe Room" }, venues: [{ t: "attraction", name: "Colosseum", addr: "Piazza del Colosseo, Rome" }, { t: "attraction", name: "Vatican Museums", addr: "Viale Vaticano, Vatican City" }, { t: "restaurant", name: "Roscioli", addr: "Via dei Giubbonari 21, Rome" }] },
  florence: { off: "+01:00", tz: "Europe/Rome", cc: "IT", city: "Florence", station: { code: "SMN", name: "Firenze Santa Maria Novella", addr: "Piazza della Stazione, Florence" }, hotel: { name: "Portrait Firenze", addr: "Lungarno degli Acciaiuoli 4, Florence", room: "Arno View Suite" }, venues: [{ t: "attraction", name: "Uffizi Gallery", addr: "Piazzale degli Uffizi, Florence" }, { t: "attraction", name: "Duomo di Firenze", addr: "Piazza del Duomo, Florence" }, { t: "restaurant", name: "Enoteca Pinchiorri", addr: "Via Ghibellina 87, Florence" }] },
  venice: { off: "+01:00", tz: "Europe/Rome", cc: "IT", city: "Venice", station: { code: "VSL", name: "Venezia Santa Lucia", addr: "Fondamenta Santa Lucia, Venice" }, hotel: { name: "The Gritti Palace", addr: "Campo Santa Maria del Giglio, Venice", room: "Canal View Room" }, venues: [{ t: "attraction", name: "St Mark's Basilica", addr: "Piazza San Marco, Venice" }, { t: "attraction", name: "Doge's Palace", addr: "Piazza San Marco 1, Venice" }, { t: "restaurant", name: "Osteria alle Testiere", addr: "Calle del Mondo Novo, Venice" }] },

  tokyo: { off: "+09:00", tz: "Asia/Tokyo", cc: "JP", city: "Tokyo", air: { code: "HND", name: "Tokyo Haneda Airport", addr: "Ota City, Tokyo" }, hotel: { name: "Aman Tokyo", addr: "1-5-6 Otemachi, Chiyoda City, Tokyo", room: "Deluxe Room" }, venues: [{ t: "attraction", name: "teamLab Planets", addr: "6-1-16 Toyosu, Koto City, Tokyo" }, { t: "attraction", name: "Senso-ji Temple", addr: "2-3-1 Asakusa, Taito City, Tokyo" }, { t: "restaurant", name: "Sukiyabashi Jiro", addr: "Ginza, Chuo City, Tokyo" }] },
  kyoto: { off: "+09:00", tz: "Asia/Tokyo", cc: "JP", city: "Kyoto", station: { code: "KYO", name: "Kyoto Station", addr: "Higashishiokoji, Shimogyo Ward, Kyoto" }, hotel: { name: "The Ritz-Carlton Kyoto", addr: "Kamogawa Nijo-Ohashi Hotori, Kyoto", room: "Kamogawa River View" }, venues: [{ t: "attraction", name: "Fushimi Inari Shrine", addr: "68 Fukakusa, Fushimi Ward, Kyoto" }, { t: "attraction", name: "Arashiyama Bamboo Grove", addr: "Ukyo Ward, Kyoto" }, { t: "restaurant", name: "Kikunoi Honten", addr: "459 Shimokawara-cho, Kyoto" }] },
  osaka: { off: "+09:00", tz: "Asia/Tokyo", cc: "JP", city: "Osaka", station: { code: "SNO", name: "Shin-Osaka Station", addr: "Nishinakajima, Yodogawa Ward, Osaka" }, hotel: { name: "Conrad Osaka", addr: "3-2-4 Nakanoshima, Kita Ward, Osaka", room: "Bay View King" }, venues: [{ t: "attraction", name: "Osaka Castle", addr: "1-1 Osakajo, Chuo Ward, Osaka" }, { t: "attraction", name: "Dotonbori", addr: "Dotonbori, Chuo Ward, Osaka" }, { t: "restaurant", name: "Kigawa", addr: "1-7-7 Dotonbori, Osaka" }] },

  lisbon: { off: "+00:00", tz: "Europe/Lisbon", cc: "PT", city: "Lisbon", air: { code: "LIS", name: "Lisbon Portela Airport", addr: "Alameda das Comunidades Portuguesas, Lisbon" }, hotel: { name: "Bairro Alto Hotel", addr: "Praca Luis de Camoes 2, Lisbon", room: "Bairro View Room" }, venues: [{ t: "attraction", name: "Belem Tower", addr: "Av. Brasilia, Lisbon" }, { t: "attraction", name: "Jeronimos Monastery", addr: "Praca do Imperio, Lisbon" }, { t: "restaurant", name: "Belcanto", addr: "Rua Serpa Pinto 10A, Lisbon" }] },
  madrid: { off: "+01:00", tz: "Europe/Madrid", cc: "ES", city: "Madrid", air: { code: "MAD", name: "Madrid Barajas Airport", addr: "Av. de la Hispanidad, Madrid" }, hotel: { name: "Rosewood Villa Magna", addr: "Paseo de la Castellana 22, Madrid", room: "Prado Suite" }, venues: [{ t: "attraction", name: "Museo del Prado", addr: "Paseo del Prado, Madrid" }, { t: "attraction", name: "Royal Palace", addr: "Calle de Bailen, Madrid" }, { t: "restaurant", name: "DiverXO", addr: "Padre Damian 23, Madrid" }] },
  barcelona: { off: "+01:00", tz: "Europe/Madrid", cc: "ES", city: "Barcelona", air: { code: "BCN", name: "Barcelona El Prat Airport", addr: "El Prat de Llobregat, Spain" }, hotel: { name: "Cotton House Hotel", addr: "Gran Via 670, Barcelona", room: "Junior Suite" }, venues: [{ t: "attraction", name: "Sagrada Familia", addr: "Carrer de Mallorca 401, Barcelona" }, { t: "attraction", name: "Park Guell", addr: "Carrer d'Olot, Barcelona" }, { t: "restaurant", name: "Disfrutar", addr: "Carrer de Villarroel 163, Barcelona" }] },

  la: { off: "-07:00", tz: "America/Los_Angeles", cc: "US", city: "Los Angeles", air: { code: "LAX", name: "Los Angeles International", addr: "1 World Way, Los Angeles" }, hotel: { name: "The Beverly Hills Hotel", addr: "9641 Sunset Blvd, Beverly Hills", room: "Deluxe King" }, venues: [{ t: "attraction", name: "Griffith Observatory", addr: "2800 E Observatory Rd, Los Angeles" }, { t: "attraction", name: "Getty Center", addr: "1200 Getty Center Dr, Los Angeles" }, { t: "restaurant", name: "n/naka", addr: "3455 S Overland Ave, Los Angeles" }] },
  vegas: { off: "-07:00", tz: "America/Los_Angeles", cc: "US", city: "Las Vegas", air: { code: "LAS", name: "Harry Reid International", addr: "5757 Wayne Newton Blvd, Las Vegas" }, hotel: { name: "The Venetian Resort", addr: "3355 S Las Vegas Blvd, Las Vegas", room: "Luxury Suite" }, venues: [{ t: "attraction", name: "Grand Canyon Day Tour", addr: "Grand Canyon, Arizona" }, { t: "attraction", name: "The Sphere Show", addr: "255 Sands Ave, Las Vegas" }, { t: "restaurant", name: "Joel Robuchon", addr: "3799 S Las Vegas Blvd, Las Vegas" }] },
  sf: { off: "-07:00", tz: "America/Los_Angeles", cc: "US", city: "San Francisco", air: { code: "SFO", name: "San Francisco International", addr: "San Francisco, CA" }, hotel: { name: "Fairmont San Francisco", addr: "950 Mason St, San Francisco", room: "Fairmont Room" }, venues: [{ t: "attraction", name: "Alcatraz Island", addr: "San Francisco Bay, CA" }, { t: "attraction", name: "Golden Gate Bridge", addr: "Golden Gate Bridge, San Francisco" }, { t: "restaurant", name: "Benu", addr: "22 Hawthorne St, San Francisco" }] },

  copenhagen: { off: "+02:00", tz: "Europe/Copenhagen", cc: "DK", city: "Copenhagen", air: { code: "CPH", name: "Copenhagen Airport", addr: "Lufthavnsboulevarden 6, Kastrup" }, hotel: { name: "Hotel d'Angleterre", addr: "Kongens Nytorv 34, Copenhagen", room: "Deluxe Room" }, venues: [{ t: "attraction", name: "Tivoli Gardens", addr: "Vesterbrogade 3, Copenhagen" }, { t: "attraction", name: "Nyhavn Harbour", addr: "Nyhavn, Copenhagen" }, { t: "restaurant", name: "Noma", addr: "Refshalevej 96, Copenhagen" }] },
  oslo: { off: "+02:00", tz: "Europe/Oslo", cc: "NO", city: "Oslo", air: { code: "OSL", name: "Oslo Gardermoen Airport", addr: "Edvard Munchs veg, Gardermoen" }, hotel: { name: "The Thief", addr: "Landgangen 1, Oslo", room: "Fjord View Room" }, venues: [{ t: "attraction", name: "Vigeland Park", addr: "Nobels gate 32, Oslo" }, { t: "attraction", name: "Opera House", addr: "Kirsten Flagstads Plass 1, Oslo" }, { t: "restaurant", name: "Maaemo", addr: "Schweigaards gate 15B, Oslo" }] },
  bergen: { off: "+02:00", tz: "Europe/Oslo", cc: "NO", city: "Bergen", air: { code: "BGO", name: "Bergen Flesland Airport", addr: "Flyplassvegen 555, Bergen" }, hotel: { name: "Opus XVI", addr: "Vagsallmenningen 16, Bergen", room: "Grieg Suite" }, venues: [{ t: "attraction", name: "Bryggen Wharf", addr: "Bryggen, Bergen" }, { t: "attraction", name: "Mount Floyen Funicular", addr: "Vetrlidsallmenningen 23A, Bergen" }, { t: "restaurant", name: "Lysverket", addr: "Rasmus Meyers alle 9, Bergen" }] },

  sydney: { off: "+10:00", tz: "Australia/Sydney", cc: "AU", city: "Sydney", air: { code: "SYD", name: "Sydney Kingsford Smith", addr: "Mascot, Sydney" }, hotel: { name: "Park Hyatt Sydney", addr: "7 Hickson Rd, The Rocks, Sydney", room: "Opera Deluxe" }, venues: [{ t: "attraction", name: "Sydney Opera House Tour", addr: "Bennelong Point, Sydney" }, { t: "attraction", name: "Bondi to Bronte Walk", addr: "Bondi Beach, Sydney" }, { t: "restaurant", name: "Quay", addr: "Upper Level, Overseas Passenger Terminal, Sydney" }] },
  melbourne: { off: "+10:00", tz: "Australia/Melbourne", cc: "AU", city: "Melbourne", air: { code: "MEL", name: "Melbourne Tullamarine", addr: "Departure Dr, Melbourne" }, hotel: { name: "The Langham Melbourne", addr: "1 Southgate Ave, Southbank, Melbourne", room: "Yarra River View" }, venues: [{ t: "attraction", name: "Great Ocean Road Tour", addr: "Great Ocean Rd, Victoria" }, { t: "attraction", name: "Queen Victoria Market", addr: "Queen St, Melbourne" }, { t: "restaurant", name: "Attica", addr: "74 Glen Eira Rd, Ripponlea, Melbourne" }] },
  auckland: { off: "+12:00", tz: "Pacific/Auckland", cc: "NZ", city: "Auckland", air: { code: "AKL", name: "Auckland Airport", addr: "Ray Emery Dr, Mangere, Auckland" }, hotel: { name: "Park Hyatt Auckland", addr: "99 Halsey St, Auckland", room: "Harbour View King" }, venues: [{ t: "attraction", name: "Waiheke Island Wine Tour", addr: "Waiheke Island, Auckland" }, { t: "attraction", name: "Sky Tower", addr: "Victoria St W, Auckland" }, { t: "restaurant", name: "The Grove", addr: "Saint Patricks Square, Auckland" }] },

  athens: { off: "+03:00", tz: "Europe/Athens", cc: "GR", city: "Athens", air: { code: "ATH", name: "Athens Eleftherios Venizelos", addr: "Spata, Athens" }, hotel: { name: "Hotel Grande Bretagne", addr: "1 Vasileos Georgiou A, Athens", room: "Acropolis View" }, venues: [{ t: "attraction", name: "Acropolis & Parthenon", addr: "Athens 105 58, Greece" }, { t: "attraction", name: "Acropolis Museum", addr: "15 Dionysiou Areopagitou, Athens" }, { t: "restaurant", name: "Spondi", addr: "5 Pyrronos, Athens" }] },
  santorini: { off: "+03:00", tz: "Europe/Athens", cc: "GR", city: "Santorini", air: { code: "JTR", name: "Santorini Airport", addr: "Kamari, Santorini" }, hotel: { name: "Katikies Santorini", addr: "Oia, Santorini", room: "Cave Suite Caldera View" }, venues: [{ t: "attraction", name: "Oia Sunset Caldera Walk", addr: "Oia, Santorini" }, { t: "attraction", name: "Catamaran Cruise", addr: "Ammoudi Bay, Santorini" }, { t: "restaurant", name: "Lauda", addr: "Oia, Santorini" }] },
  mykonos: { off: "+03:00", tz: "Europe/Athens", cc: "GR", city: "Mykonos", air: { code: "JMK", name: "Mykonos Airport", addr: "Mykonos Town, Mykonos" }, hotel: { name: "Cavo Tagoo", addr: "Agios Stefanos, Mykonos", room: "Sea View Suite" }, venues: [{ t: "attraction", name: "Delos Island Tour", addr: "Delos, Cyclades" }, { t: "attraction", name: "Little Venice", addr: "Mykonos Town, Mykonos" }, { t: "restaurant", name: "Scorpios", addr: "Paraga Beach, Mykonos" }] },

  buenosaires: { off: "-03:00", tz: "America/Argentina/Buenos_Aires", cc: "AR", city: "Buenos Aires", air: { code: "EZE", name: "Ministro Pistarini (Ezeiza)", addr: "Ezeiza, Buenos Aires" }, hotel: { name: "Alvear Palace Hotel", addr: "Av. Alvear 1891, Buenos Aires", room: "Recoleta Suite" }, venues: [{ t: "attraction", name: "Recoleta Cemetery", addr: "Junin 1760, Buenos Aires" }, { t: "attraction", name: "La Boca & Caminito", addr: "Caminito, La Boca, Buenos Aires" }, { t: "restaurant", name: "Don Julio", addr: "Guatemala 4699, Buenos Aires" }] },
  rio: { off: "-03:00", tz: "America/Sao_Paulo", cc: "BR", city: "Rio de Janeiro", air: { code: "GIG", name: "Galeao International", addr: "Ilha do Governador, Rio de Janeiro" }, hotel: { name: "Copacabana Palace", addr: "Av. Atlantica 1702, Rio de Janeiro", room: "Ocean View Suite" }, venues: [{ t: "attraction", name: "Christ the Redeemer", addr: "Parque Nacional da Tijuca, Rio" }, { t: "attraction", name: "Sugarloaf Cable Car", addr: "Av. Pasteur 520, Rio de Janeiro" }, { t: "restaurant", name: "Oro", addr: "Rua Frei Leandro 20, Rio de Janeiro" }] },
  lima: { off: "-05:00", tz: "America/Lima", cc: "PE", city: "Lima", air: { code: "LIM", name: "Jorge Chavez International", addr: "Callao, Lima" }, hotel: { name: "Belmond Miraflores Park", addr: "Av. Malecon de la Reserva 1035, Lima", room: "Ocean View Suite" }, venues: [{ t: "attraction", name: "Machu Picchu Day Tour", addr: "Cusco Region, Peru" }, { t: "attraction", name: "Larco Museum", addr: "Av. Simon Bolivar 1515, Lima" }, { t: "restaurant", name: "Central", addr: "Av. Pedro de Osma 301, Lima" }] },

  dubai: { off: "+04:00", tz: "Asia/Dubai", cc: "AE", city: "Dubai", air: { code: "DXB", name: "Dubai International", addr: "Garhoud, Dubai" }, hotel: { name: "Burj Al Arab Jumeirah", addr: "Jumeirah St, Dubai", room: "Deluxe Suite" }, venues: [{ t: "attraction", name: "Burj Khalifa At The Top", addr: "1 Sheikh Mohammed bin Rashid Blvd, Dubai" }, { t: "attraction", name: "Desert Safari", addr: "Dubai Desert Conservation Reserve" }, { t: "restaurant", name: "Ossiano", addr: "Atlantis The Palm, Dubai" }] },
  abudhabi: { off: "+04:00", tz: "Asia/Dubai", cc: "AE", city: "Abu Dhabi", air: { code: "AUH", name: "Zayed International", addr: "Abu Dhabi" }, hotel: { name: "Emirates Palace Mandarin", addr: "West Corniche Rd, Abu Dhabi", room: "Palace Suite" }, venues: [{ t: "attraction", name: "Sheikh Zayed Grand Mosque", addr: "Sheikh Rashid Bin Saeed St, Abu Dhabi" }, { t: "attraction", name: "Louvre Abu Dhabi", addr: "Saadiyat Island, Abu Dhabi" }, { t: "restaurant", name: "Hakkasan Abu Dhabi", addr: "Emirates Palace, Abu Dhabi" }] },
  doha: { off: "+03:00", tz: "Asia/Qatar", cc: "QA", city: "Doha", air: { code: "DOH", name: "Hamad International", addr: "Doha, Qatar" }, hotel: { name: "Mandarin Oriental Doha", addr: "Msheireb Downtown, Doha", room: "Deluxe Room" }, venues: [{ t: "attraction", name: "Museum of Islamic Art", addr: "Corniche, Doha" }, { t: "attraction", name: "Souq Waqif", addr: "Souq Waqif, Doha" }, { t: "restaurant", name: "IDAM by Alain Ducasse", addr: "Museum of Islamic Art, Doha" }] },
};

// ---- trip specs ------------------------------------------------------------
// depTime/arrTime are local wall-clock with the segment's UTC offset.
const TRIPS = [
  { idn: 1, title: "Grand Southeast Asia", startsOn: "2026-12-03", endsOn: "2026-12-16", originOff: "+02:00",
    legs: [
      { key: "bangkok", mode: "flight", carrier: "Thai Airways", code: "TG", num: "TG 973", ref: "TG-BKK21", depTerm: "3", arrTerm: "1", depIso: "2026-12-03T00:40:00+02:00", arrIso: "2026-12-03T13:20:00+07:00", nights: 4 },
      { key: "chiangmai", mode: "flight", carrier: "Bangkok Airways", code: "PG", num: "PG 213", ref: "PG-CNX88", depTerm: "1", arrTerm: "1", depIso: "2026-12-07T10:15:00+07:00", arrIso: "2026-12-07T11:35:00+07:00", nights: 3 },
      { key: "phuket", mode: "flight", carrier: "Thai Smile", code: "WE", num: "WE 197", ref: "WE-HKT40", depTerm: "1", arrTerm: "1", depIso: "2026-12-10T12:00:00+07:00", arrIso: "2026-12-10T14:10:00+07:00", nights: 6 },
    ],
    ret: { carrier: "Thai Airways", code: "TG", num: "TG 972", ref: "TG-TLV77", depTerm: "1", arrTerm: "3", depIso: "2026-12-16T15:30:00+07:00", arrIso: "2026-12-16T21:40:00+02:00" } },

  { idn: 2, title: "Italian Grand Tour", startsOn: "2027-01-08", endsOn: "2027-01-19", originOff: "+02:00",
    legs: [
      { key: "rome", mode: "flight", carrier: "ITA Airways", code: "AZ", num: "AZ 807", ref: "AZ-FCO11", depTerm: "3", arrTerm: "1", depIso: "2027-01-08T07:10:00+02:00", arrIso: "2027-01-08T10:35:00+01:00", nights: 4 },
      { key: "florence", mode: "train", carrier: "Trenitalia Frecciarossa", num: "9518", ref: "TI-FLR29", depIso: "2027-01-12T11:00:00+01:00", arrIso: "2027-01-12T12:31:00+01:00", nights: 3 },
      { key: "venice", mode: "train", carrier: "Trenitalia Frecciarossa", num: "9420", ref: "TI-VEN63", depIso: "2027-01-15T09:48:00+01:00", arrIso: "2027-01-15T11:53:00+01:00", nights: 4 },
    ],
    ret: { carrier: "ITA Airways", code: "AZ", num: "AZ 808", ref: "AZ-TLV12", depTerm: "1", arrTerm: "3", depIso: "2027-01-19T13:20:00+01:00", arrIso: "2027-01-19T18:05:00+02:00" } },

  { idn: 3, title: "Japan Rail Adventure", startsOn: "2027-02-05", endsOn: "2027-02-17", originOff: "+02:00",
    legs: [
      { key: "tokyo", mode: "flight", carrier: "El Al", code: "LY", num: "LY 095", ref: "LY-HND53", depTerm: "3", arrTerm: "3", depIso: "2027-02-05T00:30:00+02:00", arrIso: "2027-02-05T18:20:00+09:00", nights: 5 },
      { key: "kyoto", mode: "train", carrier: "JR Tokaido Shinkansen", num: "Nozomi 221", ref: "JR-KYO07", depIso: "2027-02-10T09:33:00+09:00", arrIso: "2027-02-10T11:52:00+09:00", nights: 4 },
      { key: "osaka", mode: "train", carrier: "JR Tokaido Shinkansen", num: "Nozomi 15", ref: "JR-OSA44", depIso: "2027-02-14T10:15:00+09:00", arrIso: "2027-02-14T10:29:00+09:00", nights: 3 },
    ],
    ret: { carrier: "El Al", code: "LY", num: "LY 096", ref: "LY-TLV61", depTerm: "1", arrTerm: "3", depIso: "2027-02-17T11:00:00+09:00", arrIso: "2027-02-17T18:40:00+02:00" } },

  { idn: 4, title: "Iberian Discovery", startsOn: "2027-03-06", endsOn: "2027-03-15", originOff: "+02:00",
    legs: [
      { key: "lisbon", mode: "flight", carrier: "TAP Air Portugal", code: "TP", num: "TP 1256", ref: "TP-LIS90", depTerm: "3", arrTerm: "1", depIso: "2027-03-06T06:50:00+02:00", arrIso: "2027-03-06T10:40:00+00:00", nights: 3 },
      { key: "madrid", mode: "flight", carrier: "Iberia", code: "IB", num: "IB 3105", ref: "IB-MAD30", depTerm: "1", arrTerm: "4", depIso: "2027-03-09T13:20:00+00:00", arrIso: "2027-03-09T15:55:00+01:00", nights: 3 },
      { key: "barcelona", mode: "flight", carrier: "Vueling", code: "VY", num: "VY 1002", ref: "VY-BCN18", depTerm: "4", arrTerm: "1", depIso: "2027-03-12T10:30:00+01:00", arrIso: "2027-03-12T11:45:00+01:00", nights: 3 },
    ],
    ret: { carrier: "El Al", code: "LY", num: "LY 394", ref: "LY-TLV55", depTerm: "1", arrTerm: "3", depIso: "2027-03-15T12:10:00+01:00", arrIso: "2027-03-15T17:20:00+02:00" } },

  { idn: 5, title: "USA West Coast", startsOn: "2027-04-10", endsOn: "2027-04-21", originOff: "+03:00",
    legs: [
      { key: "la", mode: "flight", carrier: "United Airlines", code: "UA", num: "UA 91", ref: "UA-LAX10", depTerm: "3", arrTerm: "B", depIso: "2027-04-10T08:00:00+03:00", arrIso: "2027-04-10T17:30:00-07:00", nights: 4 },
      { key: "vegas", mode: "flight", carrier: "Southwest", code: "WN", num: "WN 442", ref: "WN-LAS22", depTerm: "1", arrTerm: "1", depIso: "2027-04-14T11:20:00-07:00", arrIso: "2027-04-14T12:30:00-07:00", nights: 3 },
      { key: "sf", mode: "flight", carrier: "Alaska Airlines", code: "AS", num: "AS 601", ref: "AS-SFO35", depTerm: "1", arrTerm: "2", depIso: "2027-04-17T09:15:00-07:00", arrIso: "2027-04-17T10:45:00-07:00", nights: 4 },
    ],
    ret: { carrier: "United Airlines", code: "UA", num: "UA 90", ref: "UA-TLV99", depTerm: "I", arrTerm: "3", depIso: "2027-04-21T13:40:00-07:00", arrIso: "2027-04-22T18:10:00+03:00" } },

  { idn: 6, title: "Nordic Lights", startsOn: "2027-05-14", endsOn: "2027-05-22", originOff: "+03:00",
    legs: [
      { key: "copenhagen", mode: "flight", carrier: "SAS", code: "SK", num: "SK 748", ref: "SK-CPH14", depTerm: "3", arrTerm: "3", depIso: "2027-05-14T09:30:00+03:00", arrIso: "2027-05-14T13:10:00+02:00", nights: 3 },
      { key: "oslo", mode: "flight", carrier: "SAS", code: "SK", num: "SK 460", ref: "SK-OSL27", depTerm: "3", arrTerm: "2", depIso: "2027-05-17T10:05:00+02:00", arrIso: "2027-05-17T11:20:00+02:00", nights: 2 },
      { key: "bergen", mode: "flight", carrier: "Norwegian", code: "DY", num: "DY 740", ref: "DY-BGO51", depTerm: "2", arrTerm: "1", depIso: "2027-05-19T09:40:00+02:00", arrIso: "2027-05-19T10:35:00+02:00", nights: 3 },
    ],
    ret: { carrier: "SAS", code: "SK", num: "SK 4771", ref: "SK-TLV33", depTerm: "1", arrTerm: "3", depIso: "2027-05-22T12:15:00+02:00", arrIso: "2027-05-22T18:50:00+03:00" } },

  { idn: 7, title: "Down Under", startsOn: "2027-06-04", endsOn: "2027-06-17", originOff: "+03:00",
    legs: [
      { key: "sydney", mode: "flight", carrier: "Qantas", code: "QF", num: "QF 2", ref: "QF-SYD05", depTerm: "3", arrTerm: "1", depIso: "2027-06-04T22:10:00+03:00", arrIso: "2027-06-06T06:30:00+10:00", nights: 5 },
      { key: "melbourne", mode: "flight", carrier: "Qantas", code: "QF", num: "QF 428", ref: "QF-MEL19", depTerm: "3", arrTerm: "1", depIso: "2027-06-11T09:00:00+10:00", arrIso: "2027-06-11T10:35:00+10:00", nights: 4 },
      { key: "auckland", mode: "flight", carrier: "Air New Zealand", code: "NZ", num: "NZ 124", ref: "NZ-AKL73", depTerm: "1", arrTerm: "I", depIso: "2027-06-15T13:20:00+10:00", arrIso: "2027-06-15T18:40:00+12:00", nights: 4 },
    ],
    ret: { carrier: "Air New Zealand", code: "NZ", num: "NZ 34", ref: "NZ-TLV02", depTerm: "I", arrTerm: "3", depIso: "2027-06-19T15:30:00+12:00", arrIso: "2027-06-20T09:10:00+03:00" } },

  { idn: 8, title: "Greek Islands", startsOn: "2027-07-09", endsOn: "2027-07-19", originOff: "+03:00",
    legs: [
      { key: "athens", mode: "flight", carrier: "Aegean Airlines", code: "A3", num: "A3 929", ref: "A3-ATH61", depTerm: "3", arrTerm: "M", depIso: "2027-07-09T07:20:00+03:00", arrIso: "2027-07-09T09:05:00+03:00", nights: 3 },
      { key: "santorini", mode: "flight", carrier: "Aegean Airlines", code: "A3", num: "A3 352", ref: "A3-JTR14", depTerm: "M", arrTerm: "1", depIso: "2027-07-12T10:40:00+03:00", arrIso: "2027-07-12T11:30:00+03:00", nights: 4 },
      { key: "mykonos", mode: "ferry", carrier: "SeaJets", num: "Ferry WorldChampion", ref: "SJ-JMK77", depIso: "2027-07-16T12:15:00+03:00", arrIso: "2027-07-16T14:35:00+03:00", nights: 3 },
    ],
    ret: { carrier: "Aegean Airlines", code: "A3", num: "A3 351", ref: "A3-TLV48", depTerm: "1", arrTerm: "3", depIso: "2027-07-19T16:10:00+03:00", arrIso: "2027-07-19T18:20:00+03:00" } },

  { idn: 9, title: "South America Explorer", startsOn: "2027-09-03", endsOn: "2027-09-15", originOff: "+03:00",
    legs: [
      { key: "buenosaires", mode: "flight", carrier: "Iberia", code: "IB", num: "IB 6841", ref: "IB-EZE72", depTerm: "3", arrTerm: "A", depIso: "2027-09-03T05:30:00+03:00", arrIso: "2027-09-03T20:10:00-03:00", nights: 4 },
      { key: "rio", mode: "flight", carrier: "LATAM", code: "LA", num: "LA 8043", ref: "LA-GIG26", depTerm: "A", arrTerm: "2", depIso: "2027-09-07T11:00:00-03:00", arrIso: "2027-09-07T14:15:00-03:00", nights: 4 },
      { key: "lima", mode: "flight", carrier: "LATAM", code: "LA", num: "LA 2469", ref: "LA-LIM58", depTerm: "2", arrTerm: "1", depIso: "2027-09-11T09:25:00-03:00", arrIso: "2027-09-11T13:50:00-05:00", nights: 4 },
    ],
    ret: { carrier: "Iberia", code: "IB", num: "IB 6652", ref: "IB-TLV81", depTerm: "1", arrTerm: "3", depIso: "2027-09-15T14:00:00-05:00", arrIso: "2027-09-16T21:30:00+03:00" } },

  { idn: 10, title: "Arabian Gulf", startsOn: "2027-10-08", endsOn: "2027-10-17", originOff: "+03:00",
    legs: [
      { key: "dubai", mode: "flight", carrier: "Emirates", code: "EK", num: "EK 8", ref: "EK-DXB63", depTerm: "3", arrTerm: "3", depIso: "2027-10-08T08:40:00+03:00", arrIso: "2027-10-08T13:20:00+04:00", nights: 4 },
      { key: "abudhabi", mode: "car", carrier: "Emirates Chauffeur", ref: "EK-AUH-CAR", depIso: "2027-10-12T11:00:00+04:00", arrIso: "2027-10-12T12:30:00+04:00", nights: 2 },
      { key: "doha", mode: "flight", carrier: "Qatar Airways", code: "QR", num: "QR 1015", ref: "QR-DOH29", depTerm: "1", arrTerm: "1", depIso: "2027-10-14T15:10:00+04:00", arrIso: "2027-10-14T15:30:00+03:00", nights: 3 },
    ],
    ret: { carrier: "Qatar Airways", code: "QR", num: "QR 402", ref: "QR-TLV19", depTerm: "1", arrTerm: "3", depIso: "2027-10-17T13:45:00+03:00", arrIso: "2027-10-17T16:05:00+03:00" } },
];

// ---- location id helpers ---------------------------------------------------
function airId(idn, key) { return `lt-${idn}-${key}-air`; }
function hotelId(idn, key) { return `lt-${idn}-${key}-hotel`; }
function venueId(idn, key, i) { return `lt-${idn}-${key}-v${i}`; }
function originId(idn) { return `lt-${idn}-tlv`; }

// ---- build one trip --------------------------------------------------------
function buildTrip(spec) {
  const tid = `lt-trip-${spec.idn}`;
  trip(tid, spec.title, "upcoming", spec.startsOn, spec.endsOn);

  // origin airport
  const oid = loc(originId(spec.idn), "airport", TLV.name, { addr: TLV.addr, tz: TLV.tz, iata: TLV.code, city: TLV.city, cc: TLV.cc });
  tripLoc(tid, oid);

  let prevDepPointId = oid; // where the next segment departs from
  let prevDepTz = TLV.tz;

  spec.legs.forEach((leg, li) => {
    const c = CITIES[leg.key];
    if (!c) throw new Error("unknown city " + leg.key);
    const isRail = leg.mode !== "flight";
    // arrival transport terminus (airport or station)
    const terminus = c.air || c.station;
    const termType = c.air ? "airport" : c.station ? "station" : "address";
    const aId = loc(airId(spec.idn, leg.key), termType, terminus.name, { addr: terminus.addr, tz: c.tz, iata: c.air ? terminus.code : null, station: c.station ? terminus.code : null, city: c.city, cc: c.cc });
    const hId = loc(hotelId(spec.idn, leg.key), "hotel", c.hotel.name, { addr: c.hotel.addr, tz: c.tz, city: c.city, cc: c.cc });
    tripLoc(tid, aId); tripLoc(tid, hId);
    // venues
    const vIds = c.venues.map((v, i) => loc(venueId(spec.idn, leg.key, i), v.t === "restaurant" ? "restaurant" : "attraction", v.name, { addr: v.addr, tz: c.tz, city: c.city, cc: c.cc }));
    vIds.forEach((v) => tripLoc(tid, v));

    // arrival segment
    const segId = `lt-${spec.idn}-${leg.key}-move`;
    if (leg.mode === "flight") {
      item(segId, tid, "transport", "confirmed", `${(li === 0 ? "Tel Aviv" : CITIES[spec.legs[li - 1].key].city)} → ${c.city}`, leg.num, ts(leg.depIso), ts(leg.arrIso), prevDepTz, c.tz, prevDepPointId, aId);
      segFlight(segId, { carrier: leg.carrier, flightNo: leg.num, code: leg.code, num: (leg.num || "").split(" ").pop(), depLoc: prevDepPointId, arrLoc: aId, depUtc: ts(leg.depIso), arrUtc: ts(leg.arrIso), depTz: prevDepTz, arrTz: c.tz, depTerm: leg.depTerm, arrTerm: leg.arrTerm, ref: leg.ref });
    } else {
      const label = leg.mode === "train" ? "train" : leg.mode === "ferry" ? "ferry" : leg.mode === "car" ? "car" : "transfer";
      item(segId, tid, "transport", "confirmed", `${CITIES[spec.legs[li - 1].key].city} → ${c.city}`, leg.num || leg.carrier, ts(leg.depIso), ts(leg.arrIso), prevDepTz, c.tz, prevDepPointId, aId);
      segGround(segId, { type: label, carrier: leg.carrier, serviceNo: leg.num || null, depLoc: prevDepPointId, arrLoc: aId, depUtc: ts(leg.depIso), arrUtc: ts(leg.arrIso), tz: c.tz, ref: leg.ref });
    }

    // airport/station transfer to hotel (30-60 min after arrival)
    const trId = `lt-${spec.idn}-${leg.key}-transfer`;
    const arrDate = dateOnly(leg.arrIso);
    const arrClock = leg.arrIso.slice(11, 16);
    const [ah, am] = arrClock.split(":").map(Number);
    const transferStart = `${arrDate}T${String(ah).padStart(2, "0")}:${String(am).padStart(2, "0")}:00${c.off}`;
    const transferEndH = (ah + 1) % 24;
    const transferEnd = `${arrDate}T${String(transferEndH).padStart(2, "0")}:${String(am).padStart(2, "0")}:00${c.off}`;
    item(trId, tid, "transport", "confirmed", "Private transfer", `${terminus.name} → ${c.hotel.name}`, ts(transferStart), ts(transferEnd), c.tz, c.tz, aId, hId);
    segGround(trId, { type: "transfer", carrier: "Blacklane", serviceNo: null, depLoc: aId, arrLoc: hId, depUtc: ts(transferStart), arrUtc: ts(transferEnd), tz: c.tz, ref: `${leg.ref}-CAR` });

    // stay
    const checkIn = dateOnly(leg.arrIso);
    const checkOut = dateAdd(checkIn, leg.nights);
    const hStayId = `lt-${spec.idn}-${leg.key}-stay`;
    item(hStayId, tid, "stay", "confirmed", c.hotel.name, `Check-in · ${leg.nights} night${leg.nights === 1 ? "" : "s"}`, ts(`${checkIn}T15:00:00${c.off}`), ts(`${checkOut}T11:00:00${c.off}`), c.tz, c.tz, hId, hId);
    stayRow(hStayId, { name: c.hotel.name, loc: hId, checkIn, checkOut, conf: `${leg.ref}-HTL`, room: c.hotel.room });

    // daily events: attractions on days 1..min(nights,3), dinners on days 1..min(nights,2)
    const attractions = c.venues.map((v, i) => ({ ...v, id: vIds[i] })).filter((v) => v.t === "attraction");
    const restaurants = c.venues.map((v, i) => ({ ...v, id: vIds[i] })).filter((v) => v.t === "restaurant");
    const actDays = Math.min(leg.nights, attractions.length, 3);
    for (let d = 0; d < actDays; d++) {
      const day = dateAdd(checkIn, d + (d === 0 ? 0 : 0) + 1 > leg.nights ? d : d + (leg.nights > 1 ? 1 : 0));
      const a = attractions[d % attractions.length];
      const aid = `lt-${spec.idn}-${leg.key}-act${d}`;
      const start = `${dateAdd(checkIn, Math.min(d + 1, leg.nights))}T10:00:00${c.off}`;
      const end = `${dateAdd(checkIn, Math.min(d + 1, leg.nights))}T13:00:00${c.off}`;
      item(aid, tid, "activity", "confirmed", a.name, "Guided experience", ts(start), ts(end), c.tz, c.tz, a.id, a.id);
      activityRow(aid, { type: "attraction", loc: a.id, ref: `${leg.ref}-A${d}`, notes: "Skip-the-line entry" });
    }
    const dinDays = Math.min(leg.nights, 2);
    for (let d = 0; d < dinDays; d++) {
      const r = restaurants[d % Math.max(restaurants.length, 1)] || restaurants[0];
      if (!r) break;
      const rid = `lt-${spec.idn}-${leg.key}-din${d}`;
      const start = `${dateAdd(checkIn, Math.min(d + 1, leg.nights))}T20:00:00${c.off}`;
      const end = `${dateAdd(checkIn, Math.min(d + 1, leg.nights))}T22:30:00${c.off}`;
      item(rid, tid, "reservation", "confirmed", r.name, "Dinner reservation", ts(start), ts(end), c.tz, c.tz, r.id, r.id);
      reservationRow(rid, { type: "restaurant", conf: `${leg.ref}-R${d}`, startUtc: ts(start), endUtc: ts(end), notes: "Table for 2" });
    }

    prevDepPointId = aId;
    prevDepTz = c.tz;
  });

  // return flight from last city airport to TLV
  const last = spec.legs[spec.legs.length - 1];
  const lastCity = CITIES[last.key];
  const r = spec.ret;
  const rId = `lt-${spec.idn}-return`;
  item(rId, tid, "transport", "confirmed", `${lastCity.city} → Tel Aviv`, r.num, ts(r.depIso), ts(r.arrIso), lastCity.tz, TLV.tz, airId(spec.idn, last.key), originId(spec.idn));
  segFlight(rId, { carrier: r.carrier, flightNo: r.num, code: r.code, num: (r.num || "").split(" ").pop(), depLoc: airId(spec.idn, last.key), arrLoc: originId(spec.idn), depUtc: ts(r.depIso), arrUtc: ts(r.arrIso), depTz: lastCity.tz, arrTz: TLV.tz, depTerm: r.depTerm, arrTerm: r.arrTerm, ref: r.ref });
}

TRIPS.forEach(buildTrip);
process.stdout.write(out.join("\n") + "\n");
