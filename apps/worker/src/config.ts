export const PRODUCT_LIMITS = {
  activeTripsPerAccount: 10,
  documentsPerTrip: 20,
  maxDocumentBytes: 10 * 1024 * 1024,
  tripMembers: 10,
  pendingInvitesPerTrip: 10,
  forwardedImportsPerDay: 20,
  actorWritesPerHour: 300,
  guestSessionsPerHourPerFingerprint: 60,
  googleAuthAttemptsPerHour: 20,
} as const;

// Documentational only. The RUNTIME source of truth for each capability is the
// corresponding env binding in wrangler.jsonc (e.g. sharing => env.SHARING_ENABLED,
// checked via requireSharingEnabled). These constants are NOT read by request
// handlers and MUST NOT be used as authorization gates — they exist to document
// intended default posture. `sharing:false` here reflects the default-off beta
// posture; flipping collaboration on/off is done via env.SHARING_ENABLED, not here.
export const FEATURE_FLAGS = {
  liveFlights: false,
  generativeAI: false,
  gmailSync: false,
  accountAuth: false,
  sharing: false,
  demoTools: false,
  betaMetrics: true,
  ops: false,
} as const;
