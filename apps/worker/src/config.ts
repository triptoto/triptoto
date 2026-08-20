export const PRODUCT_LIMITS = {
  activeTripsPerAccount: 10,
  documentsPerTrip: 30,
  maxDocumentBytes: 10 * 1024 * 1024,
  tripMembers: 10,
  pendingInvitesPerTrip: 10,
  forwardedImportsPerDay: 30,
} as const;

export const FEATURE_FLAGS = {
  liveFlights: false,
  generativeAI: false,
  gmailSync: false,
  accountAuth: false,
  sharing: false,
  demoTools: false,
} as const;
