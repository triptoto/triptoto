-- Verified airport and departure-point guidance for Tax Free.
-- Hours are structured so the UI can distinguish an actual published schedule
-- from flight-relative availability or a schedule the source did not publish.

CREATE TABLE IF NOT EXISTS tax_free_departure_points (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  location_type TEXT NOT NULL CHECK (location_type IN ('airport','port','border','other')),
  location_code TEXT,
  location_name TEXT NOT NULL,
  city TEXT,
  timezone TEXT,
  terminal TEXT,
  zone TEXT,
  service_type TEXT NOT NULL CHECK (service_type IN ('customs','electronic_validation','refund','combined','departure_check')),
  operator_name TEXT,
  hours_status TEXT NOT NULL CHECK (hours_status IN ('published','flight_relative','varies','not_published','not_required')),
  hours_json TEXT NOT NULL CHECK (json_valid(hours_json)),
  location_details TEXT NOT NULL,
  before_security INTEGER CHECK (before_security IS NULL OR before_security IN (0,1)),
  instruction_codes_json TEXT NOT NULL CHECK (json_valid(instruction_codes_json)),
  baggage_code TEXT,
  contact_json TEXT CHECK (contact_json IS NULL OR json_valid(contact_json)),
  map_url TEXT,
  source_id TEXT REFERENCES tax_free_sources(id),
  content_verified_at INTEGER NOT NULL,
  source_checked_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_tax_free_departure_rule ON tax_free_departure_points(rule_version_id,active,location_code);

-- Official airport/operator sources. Their claims remain scoped to airport
-- layout and service procedure and do not modify the legal country rule.
INSERT OR IGNORE INTO tax_free_sources VALUES
('tf-src-it-fco','tf-it-v1','https://www.adr.it/immigrazione-e-dogana','www.adr.it','Aeroporti di Roma','airport','Fiumicino customs and VAT-refund locations, baggage order and operators',NULL,1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-it-fco-operator','tf-it-v1','https://www.taxrefund.it/find_out_how_departure_airport_fiumicino.php','www.taxrefund.it','Tax Refund S.r.l.','operator','Tax Refund priority-desk location and operator procedure at Fiumicino',NULL,1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-it-mxp','tf-it-v1','https://milanairports.com/sites/default/files/2024-03/Carta%20dei%20Servizi%20Malpensa%20-%202023.pdf','milanairports.com','SEA Milan Airports','airport','Malpensa Terminal 1 VAT-refund locations by baggage type',NULL,1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-it-vce','tf-it-v1','https://www.veneziaairport.it/en_gb/services/passengers/tax-refund','www.veneziaairport.it','Venice Marco Polo Airport','airport','Venice desk locations, departure-relative customs time and closed-office fallback',NULL,1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-fr-airports','tf-fr-v1','https://www.douane.gouv.fr/dossier/la-detaxe-pour-les-voyageurs','www.douane.gouv.fr','French Customs','customs','Official PABLO departure-point directory and airport procedure',NULL,1790467200000,NULL,NULL,NULL,NULL,1791072000000,1);

INSERT OR IGNORE INTO tax_free_departure_points VALUES
('tf-point-fco-customs','tf-it-v1','airport','FCO','Rome Fiumicino Leonardo da Vinci','Rome','Europe/Rome','T1, T3, boarding areas A and E','Departures and airside boarding areas','customs',NULL,'not_published','{"kind":"not_published"}','Customs offices are in the T1 and T3 departures areas and boarding areas A and E.',NULL,'["arrive_early","show_documents_goods","follow_otello"]','keep_accessible',NULL,'https://www.adr.it/web/aeroporti-di-roma-en/fiumicino-map','tf-src-it-fco',1790467200000,1790467200000,1),
('tf-point-fco-refund','tf-it-v1','airport','FCO','Rome Fiumicino Leonardo da Vinci','Rome','Europe/Rome','T1, T3 and boarding area E','T3 near check-in 196–225; T1 near 111–140; area E near the ADR Info Point','refund','Global Blue, Planet and Tax Refund','not_published','{"kind":"not_published"}','Use the desk matching the operator shown on the Italian tax-free invoice.',NULL,'["use_form_operator","validation_before_payment","arrive_within_flight_window"]','hold_before_checkin',NULL,'https://www.adr.it/web/aeroporti-di-roma-en/fiumicino-map','tf-src-it-fco',1790467200000,1790467200000,1),
('tf-point-fco-priority','tf-it-v1','airport','FCO','Rome Fiumicino Leonardo da Vinci','Rome','Europe/Rome','T3','Before check-in, near check-in desk 348','combined','Tax Refund S.r.l.','not_published','{"kind":"not_published"}','Operator priority desk for Tax Refund S.r.l. forms.',1,'["before_checkin","show_documents_goods","use_form_operator"]','hold_before_checkin','{"phone":"+39 06 6877877","email":"contact@taxrefund.it"}',NULL,'tf-src-it-fco-operator',1790467200000,1790467200000,1),
('tf-point-mxp-checkin','tf-it-v1','airport','MXP','Milan Malpensa','Milan','Europe/Rome','T1, second floor','Departures check-in area, island 12','combined',NULL,'not_published','{"kind":"not_published"}','Use this landside point when the goods are in checked baggage.',1,'["before_checkin","show_documents_goods","validation_before_payment"]','hold_before_checkin',NULL,NULL,'tf-src-it-mxp',1790467200000,1790467200000,1),
('tf-point-mxp-airside','tf-it-v1','airport','MXP','Milan Malpensa','Milan','Europe/Rome','T1, first floor','Boarding area; hand baggage only','combined',NULL,'not_published','{"kind":"not_published"}','Airside VAT-refund point for purchases kept in hand baggage.',0,'["hand_luggage_only","show_documents_goods","use_form_operator"]','hand_after_security',NULL,NULL,'tf-src-it-mxp',1790467200000,1790467200000,1),
('tf-point-vce-landside','tf-it-v1','airport','VCE','Venice Marco Polo','Venice','Europe/Rome','First floor','Before security checks','combined','Global Blue, Planet and Tax Refund','flight_relative','{"kind":"flight_relative","fromHoursBeforeFlight":4}','Operator desks are on the first floor before security. The customs stamp is available from four hours before departure.',1,'["arrive_early","use_form_operator","customs_if_closed","dropbox_if_closed"]','hold_before_checkin',NULL,'https://www.veneziaairport.it/en_gb/transport/airport-map','tf-src-it-vce',1790467200000,1790467200000,1),
('tf-point-vce-airside','tf-it-v1','airport','VCE','Venice Marco Polo','Venice','Europe/Rome','Departures','After security checks','refund','Global Blue and YexChange','varies','{"kind":"varies"}','Airside refund desks for hand-baggage passengers. Follow the operator name on the form.',0,'["hand_luggage_only","use_form_operator","customs_if_closed","dropbox_if_closed"]','hand_after_security',NULL,'https://www.veneziaairport.it/en_gb/transport/airport-map','tf-src-it-vce',1790467200000,1790467200000,1),
('tf-point-cdg-pablo','tf-fr-v1','airport','CDG','Paris Charles de Gaulle','Paris','Europe/Paris','Your departure terminal','PABLO kiosk near the customs counter, before baggage check-in','electronic_validation','PABLO','not_published','{"kind":"not_published"}','Use the PABLO terminal in your departure terminal. Customs may request the goods and documents.',1,'["scan_pablo","show_documents_goods","validation_before_payment"]','hold_before_checkin',NULL,'https://www.parisaeroport.fr/passagers/les-vols/compagnies-aeriennes/terminaux','tf-src-fr-airports',1790467200000,1790467200000,1),
('tf-point-ory-pablo','tf-fr-v1','airport','ORY','Paris Orly','Paris','Europe/Paris','Your departure terminal','PABLO kiosk near the customs counter, before baggage check-in','electronic_validation','PABLO','not_published','{"kind":"not_published"}','Use the PABLO terminal in your departure terminal. Customs may request the goods and documents.',1,'["scan_pablo","show_documents_goods","validation_before_payment"]','hold_before_checkin',NULL,'https://www.parisaeroport.fr/passagers/les-vols/compagnies-aeriennes/terminaux','tf-src-fr-airports',1790467200000,1790467200000,1),
('tf-point-nrt-departure','tf-jp-v1','airport','NRT','Narita International Airport','Tokyo','Asia/Tokyo',NULL,'International departure customs route','departure_check','Japan Customs','not_required','{"kind":"not_required"}','Under the current shop-based system there is no airport refund counter to visit. Customs may inspect your passport and goods.',NULL,'["no_refund_desk_current","keep_goods_accessible","follow_customs_request"]','keep_accessible',NULL,NULL,'tf-src-jp-rule',1790467200000,1790467200000,1),
('tf-point-hnd-departure','tf-jp-v1','airport','HND','Tokyo Haneda Airport','Tokyo','Asia/Tokyo',NULL,'International departure customs route','departure_check','Japan Customs','not_required','{"kind":"not_required"}','Under the current shop-based system there is no airport refund counter to visit. Customs may inspect your passport and goods.',NULL,'["no_refund_desk_current","keep_goods_accessible","follow_customs_request"]','keep_accessible',NULL,NULL,'tf-src-jp-rule',1790467200000,1790467200000,1),
('tf-point-nrt-future','tf-jp-v2','airport','NRT','Narita International Airport','Tokyo','Asia/Tokyo',NULL,'Departure procedure checking route','departure_check','Japan Customs','varies','{"kind":"varies"}','From 1 November 2026, follow the airport departure confirmation process; the retailer processes payment after customs confirmation.',NULL,'["show_documents_goods","follow_customs_request","validation_before_payment"]','keep_accessible',NULL,NULL,'tf-src-jp-future',1790467200000,1790467200000,1),
('tf-point-hnd-future','tf-jp-v2','airport','HND','Tokyo Haneda Airport','Tokyo','Asia/Tokyo',NULL,'Departure procedure checking route','departure_check','Japan Customs','varies','{"kind":"varies"}','From 1 November 2026, follow the airport departure confirmation process; the retailer processes payment after customs confirmation.',NULL,'["show_documents_goods","follow_customs_request","validation_before_payment"]','keep_accessible',NULL,NULL,'tf-src-jp-future',1790467200000,1790467200000,1);
