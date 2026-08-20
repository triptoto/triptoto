export interface LocalDocumentState {
  integrity: 'verified' | 'unverified' | 'corrupt';
  travelerIds: string[];
}

export interface DocumentReadiness {
  verifiedDocumentCount: number;
  missingTravelerIds: string[];
  ready: boolean;
}

export function assessDocumentReadiness(documents: LocalDocumentState[], travelerIds: string[]): DocumentReadiness {
  const verified = documents.filter(document => document.integrity === 'verified');
  const missingTravelerIds = travelerIds.filter(travelerId => !verified.some(document => document.travelerIds.includes(travelerId)));
  return { verifiedDocumentCount: verified.length, missingTravelerIds, ready: verified.length > 0 && missingTravelerIds.length === 0 };
}
