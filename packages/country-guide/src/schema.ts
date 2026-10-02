// Canonical Country Guide schema. One record per ISO 3166-1 alpha-2 code; the
// code is the record's key and is not repeated inside it. Every fact has exactly
// one owning group (FIELD_OWNERSHIP). Anything that can be calculated (flag
// emoji, primary currency, "multiple time zones", 12/24-hour clock, shared
// calling plans, home-country differences) is a selector, never a stored field.

export type Iso2 = string;
export type GroupStatus = 'verified' | 'stable_source' | 'needs_review' | 'unavailable';
export type DrivingSide = 'left' | 'right';
export type MeasurementSystem = 'metric' | 'US' | 'UK';
export type DistanceUnit = 'kilometer' | 'mile';
export type RoadSpeedUnit = 'km/h' | 'mph';
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type WeightUnit = 'kilogram' | 'pound';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const PLUG_TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] as const;
export type PlugType = typeof PLUG_TYPES[number];

export interface IdentityGroup {
  iso3?: string;
  numericCode?: string;
  name: string;
  localNames?: { lang: string; name: string }[];
  capital?: string;
  region?: string;      // UN M49 code, display name comes from Intl.DisplayNames
  subregion?: string;   // UN M49 code
  internetTld?: string;
}
export interface LanguageGroup { officialLanguages?: string[]; widelyUsedLanguages?: string[] }
// Ordered: the first entry is the primary currency.
export interface CurrencyGroup { currencies: string[] }
// Country calling codes without "+". Shared plans (NANP "1") appear in every member.
export interface TelecomGroup { callingCodes: string[] }
export interface TimeGroup { timeZones: string[] }
export interface LocaleFormatsGroup {
  locale: string;          // CLDR likely locale used to derive the patterns below
  dateFormat: string;      // e.g. DD/MM/YYYY
  timeFormat: string;      // e.g. HH:mm or h:mm a (clock preference is derived)
  firstDayOfWeek: Weekday;
  decimalSeparator: string;
  groupingSeparator: string;
}
export interface MeasurementsGroup {
  measurementSystem: MeasurementSystem;
  distanceUnit?: DistanceUnit;
  roadSpeedUnit?: RoadSpeedUnit;
  temperatureUnit?: TemperatureUnit;
  weightUnit?: WeightUnit;
}
export interface ElectricityGroup { voltage: number[]; frequency: number[]; plugTypes: PlugType[] }
export interface DrivingGroup { drivingSide: DrivingSide }
// numbers: every short number the phone network treats as an emergency call
// (libphonenumber). The typed fields are only filled from a reviewed
// service-mapping snapshot; they are never guessed from the number list.
export interface EmergencyGroup { numbers?: string[]; general?: string; police?: string; ambulance?: string; fire?: string }
export interface PracticalGroup { tapWater?: string; tipping?: string; paymentCards?: string; cash?: string; notes?: string[] }
// Per-country provenance only where it differs from the dataset-level group
// provenance (fallback source, override, review status).
export interface GroupMeta { status?: GroupStatus; source?: string; verifiedAt?: string; reason?: string }

export interface CountryRecord {
  identity: IdentityGroup;
  language?: LanguageGroup;
  currency?: CurrencyGroup;
  telecom?: TelecomGroup;
  time?: TimeGroup;
  formats?: LocaleFormatsGroup;
  measurements?: MeasurementsGroup;
  electricity?: ElectricityGroup;
  driving?: DrivingGroup;
  emergency?: EmergencyGroup;
  practical?: PracticalGroup;
  _meta?: Partial<Record<GroupName, GroupMeta>>;
}

export interface SourceInfo { id: string; name: string; version?: string; license: string; url: string; retrievedAt?: string }
export interface GroupProvenance { status: GroupStatus; changeFrequency: 'stable' | 'moderate' | 'changeable'; sources: string[] }

export interface CountryDataset {
  datasetVersion: string;
  generatedAt: string;
  lastReviewedAt: string;
  expectedCount: number;
  sources: SourceInfo[];
  groups: Record<GroupName, GroupProvenance>;
  countries: Record<Iso2, CountryRecord>;
}

export const GROUPS = ['identity', 'language', 'currency', 'telecom', 'time', 'formats', 'measurements', 'electricity', 'driving', 'emergency', 'practical'] as const;
export type GroupName = typeof GROUPS[number];

// The single ownership map. Validation rejects any field outside its owner and
// any concept stored under more than one group.
export const FIELD_OWNERSHIP: Record<GroupName, readonly string[]> = {
  identity: ['iso3', 'numericCode', 'name', 'localNames', 'capital', 'region', 'subregion', 'internetTld'],
  language: ['officialLanguages', 'widelyUsedLanguages'],
  currency: ['currencies'],
  telecom: ['callingCodes'],
  time: ['timeZones'],
  formats: ['locale', 'dateFormat', 'timeFormat', 'firstDayOfWeek', 'decimalSeparator', 'groupingSeparator'],
  measurements: ['measurementSystem', 'distanceUnit', 'roadSpeedUnit', 'temperatureUnit', 'weightUnit'],
  electricity: ['voltage', 'frequency', 'plugTypes'],
  driving: ['drivingSide'],
  emergency: ['numbers', 'general', 'police', 'ambulance', 'fire'],
  practical: ['tapWater', 'tipping', 'paymentCards', 'cash', 'notes'],
};

// Concepts that must have exactly one storage location. Each entry lists the
// spellings that would mean the same fact; only the canonical one may exist,
// and only inside its owner group.
export const CANONICAL_CONCEPTS: Record<string, { owner: GroupName; field: string; aliases: string[] }> = {
  currency: { owner: 'currency', field: 'currencies', aliases: ['currency', 'currencyCode', 'primaryCurrency', 'currencies'] },
  callingCode: { owner: 'telecom', field: 'callingCodes', aliases: ['callingCode', 'calling_code', 'dialCode', 'phoneCode', 'callingCodes', 'idd'] },
  timeZone: { owner: 'time', field: 'timeZones', aliases: ['timezone', 'timeZone', 'time_zone', 'tz', 'timeZones', 'timezones', 'primaryTimeZone'] },
  drivingSide: { owner: 'driving', field: 'drivingSide', aliases: ['driveSide', 'drivingSide', 'driving_side', 'trafficSide'] },
  speedUnit: { owner: 'measurements', field: 'roadSpeedUnit', aliases: ['speedUnit', 'roadSpeedUnit', 'speed_unit'] },
  distanceUnit: { owner: 'measurements', field: 'distanceUnit', aliases: ['distanceUnit', 'distance_unit'] },
  temperatureUnit: { owner: 'measurements', field: 'temperatureUnit', aliases: ['temperatureUnit', 'tempUnit', 'temperature_unit'] },
  dateFormat: { owner: 'formats', field: 'dateFormat', aliases: ['dateFormat', 'date_format', 'datePattern'] },
  timeFormat: { owner: 'formats', field: 'timeFormat', aliases: ['timeFormat', 'time_format', 'clockPreference', 'hourCycle'] },
  plugType: { owner: 'electricity', field: 'plugTypes', aliases: ['plugTypes', 'plugType', 'plugs', 'socketTypes'] },
  voltage: { owner: 'electricity', field: 'voltage', aliases: ['voltage', 'volts'] },
  frequency: { owner: 'electricity', field: 'frequency', aliases: ['frequency', 'hz'] },
  emergencyNumber: { owner: 'emergency', field: 'numbers', aliases: ['emergencyNumber', 'emergencyNumbers', 'emergency_number', 'sos'] },
};

// Values that are calculated by selectors and must never be stored.
export const DERIVED_FIELDS = ['iso2', 'flag', 'flagEmoji', 'primaryCurrency', 'multipleTimeZones', 'isMultiZone', 'adapterRecommended', 'sameDrivingSide', 'timeDifference', 'clockPreference', 'hourCycle', 'sharedCallingCode'] as const;
