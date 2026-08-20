export type ChecklistCategory = 'documents' | 'before_you_leave' | 'packing' | 'custom';
export type ChecklistPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ChecklistSeedContext {
  international: boolean;
  durationDays?: number;
  hasFlight: boolean;
  travelerCount: number;
  destinationCountryCode?: string;
}

export interface SeedItem {
  key: string;
  title: string;
  category: ChecklistCategory;
  priority: ChecklistPriority;
  perTraveler?: boolean;
  autoRule?: string;
}

export function seedChecklist(ctx: ChecklistSeedContext): SeedItem[] {
  const out: SeedItem[] = [];
  if (ctx.international) out.push({ key: 'passport', title: 'Passport / travel document', category: 'documents', priority: 'critical', perTraveler: true });
  if (ctx.hasFlight) out.push({ key: 'boarding-pass-offline', title: 'Boarding pass available offline', category: 'before_you_leave', priority: 'high', perTraveler: true, autoRule: 'boarding_pass_offline' });
  out.push({ key: 'hotel-confirmation-offline', title: 'Key booking confirmations available offline', category: 'before_you_leave', priority: 'high', autoRule: 'critical_confirmations_offline' });
  out.push({ key: 'phone-charger', title: 'Phone charger', category: 'packing', priority: 'medium' });
  out.push({ key: 'power-bank', title: 'Power bank', category: 'packing', priority: 'medium' });
  if ((ctx.durationDays ?? 0) >= 5) out.push({ key: 'medications', title: 'Regular medications', category: 'packing', priority: 'high', perTraveler: true });
  return out;
}
