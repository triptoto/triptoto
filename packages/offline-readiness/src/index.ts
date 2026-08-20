export interface LocalDocumentState {
  integrity: 'verified' | 'unverified' | 'corrupt';
  travelerIds: string[];
  type?: 'boarding_pass' | 'ticket' | 'hotel_confirmation' | 'reservation' | 'voucher' | 'qr_code' | 'other';
}

export interface ItineraryDocumentSource {
  kind: 'flight' | 'train' | 'stay' | 'other';
  travelerIds?: string[];
}

export interface MissingDocumentRequirement {
  scope: 'traveler' | 'trip';
  travelerId?: string;
  itineraryKind: 'flight' | 'train' | 'stay';
  acceptedTypes: LocalDocumentState['type'][];
}

export interface DocumentReadiness {
  verifiedDocumentCount: number;
  missingTravelerIds: string[];
  missingRequirements: MissingDocumentRequirement[];
  ready: boolean;
}

export function assessDocumentReadiness(documents: LocalDocumentState[], travelerIds: string[], itinerary: ItineraryDocumentSource[] = []): DocumentReadiness {
  const verified = documents.filter(document => document.integrity === 'verified');
  const knownTravelers = new Set(travelerIds);
  const requirements: MissingDocumentRequirement[] = [];
  for (const source of itinerary) {
    if (source.kind === 'stay') {
      if (!requirements.some(requirement => requirement.scope === 'trip' && requirement.itineraryKind === 'stay')) requirements.push({ scope:'trip', itineraryKind:'stay', acceptedTypes:['hotel_confirmation'] });
      continue;
    }
    if (source.kind !== 'flight' && source.kind !== 'train') continue;
    const acceptedTypes: LocalDocumentState['type'][] = source.kind === 'flight' ? ['ticket','boarding_pass'] : ['ticket'];
    for (const travelerId of source.travelerIds ?? []) {
      if (!knownTravelers.has(travelerId)) continue;
      if (!requirements.some(requirement => requirement.travelerId === travelerId && requirement.itineraryKind === source.kind)) requirements.push({ scope:'traveler', travelerId, itineraryKind:source.kind, acceptedTypes });
    }
  }
  const missingRequirements = requirements.filter(requirement => !verified.some(document =>
    requirement.acceptedTypes.includes(document.type)
    && (requirement.scope === 'trip' || document.travelerIds.includes(requirement.travelerId!))
  ));
  const missingTravelerIds = [...new Set(missingRequirements.map(requirement => requirement.travelerId).filter((id): id is string => Boolean(id)))];
  return { verifiedDocumentCount: verified.length, missingTravelerIds, missingRequirements, ready: missingRequirements.length === 0 };
}
