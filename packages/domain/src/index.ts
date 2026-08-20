export type Confidence = 'confirmed' | 'live' | 'estimated' | 'unavailable' | 'low_confidence';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type TripLifecycle = 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
export type TripItemType = 'transport' | 'stay' | 'activity' | 'reservation' | 'custom';
export type TripItemStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled' | 'skipped' | 'unknown';

export interface Location {
  id: string;
  displayName: string;
  localName?: string;
  formattedAddress?: string;
  localAddress?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  countryCode?: string;
}

export interface TripItem {
  id: string;
  tripId: string;
  type: TripItemType;
  status: TripItemStatus;
  title: string;
  startsAtUtc?: number;
  endsAtUtc?: number;
  startTimezone?: string;
  endTimezone?: string;
  startLocationId?: string;
  endLocationId?: string;
  confidence: Confidence;
  deletedAt?: number;
}

export interface Connection {
  id: string;
  fromItemId: string;
  toItemId: string;
  type: 'protected' | 'self_transfer' | 'planned_transfer' | 'logical' | 'unknown';
  minimumBufferMinutes?: number;
  recommendedBufferMinutes?: number;
  requiresAirportChange?: boolean;
  requiresTerminalChange?: boolean;
  requiresBaggageReclaim?: boolean;
  requiresImmigration?: boolean;
  requiresSecurity?: boolean;
}

export interface TravelDuration {
  minutes: number;
  source: 'cached_route' | 'user' | 'unknown';
  calculatedAt?: number;
}
