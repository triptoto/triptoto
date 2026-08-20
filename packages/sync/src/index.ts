export type SyncStatus = 'pending' | 'sending' | 'applied' | 'conflict' | 'failed_retryable' | 'failed_permanent';
export interface SyncOperation<T = unknown> {
  id: string;
  deviceId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  baseVersion?: number;
  payload: T;
  status: SyncStatus;
  createdAt: number;
}

export function canApplyOperation(serverVersion: number | undefined, op: SyncOperation): boolean {
  if (op.operationType === 'create') return serverVersion == null;
  return serverVersion != null && op.baseVersion === serverVersion;
}
