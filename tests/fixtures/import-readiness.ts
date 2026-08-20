export const importReadinessFixtures = [
  {"name":"airline html","subject":"Fwd: Flight confirmation","body":"<p>Booking reference: ZX91QP</p><p>Flight: BA 282</p><p>SFO - LHR</p><p>Departure: September 4, 2027 4:30 PM</p><p>Arrival: September 5, 2027 10:40 AM</p>","type":"flight"},
  {"name":"codeshare","subject":"Your flight","body":"Flight: BA 705\nOperated by American Airlines AA 101\nFCO -> JFK\nDeparture: 4 September 2027 10:30\nArrival: 4 September 2027 14:20","type":"flight","warning":"Codeshare"},
  {"name":"hotel forwarded headers","subject":"Fwd: Booking confirmation at Hotel Roma","body":"Begin forwarded message:\nFrom: hotel@example.test\nHotel: Hotel Roma\nAddress: Via Roma 1\nCheck-in: 4 September 2027\nCheck-out: 8 September 2027\nConfirmation: HTL7788","type":"stay"},
  {"name":"train safe unsupported","subject":"Rail ticket","body":"Train ICE 615\nBerlin Hbf to Munich Hbf\nDeparture: 4 September 2027 08:10\nCoach 7 Seat 21","unsupported":"Train confirmation detected"},
  {"name":"activity safe unsupported","subject":"Activity ticket","body":"Activity confirmation\nVatican Museums guided tour\nSeptember 4, 2027 10:30\nTicketed event","unsupported":"Activity confirmation detected"},
  {"name":"ambiguous locale","subject":"Hotel confirmation","body":"Hotel: Example\nCheck-in: 09/10/2027\nCheck-out: 10/10/2027","type":"stay","nullField":"checkInDate"}
] as const;
