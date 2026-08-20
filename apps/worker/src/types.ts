export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Env {
  DB: D1Database;
  SESSION_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  LIVE_FLIGHTS_ENABLED?: string;
  AI_ENABLED?: string;
  GMAIL_SYNC_ENABLED?: string;
  R2_DOCUMENTS_ENABLED?: string;
  ACCOUNT_AUTH_ENABLED?: string;
  SHARING_ENABLED?: string;
  DEMO_TOOLS_ENABLED?: string;
  DEMO_TOOLS_SECRET?: string;
  APP_BASE_URL?: string;
  BETA_RELEASE?: string;
  BETA_METRICS_ENABLED?: string;
  OPS_ENABLED?: string;
  OPS_SECRET?: string;
}

export interface AuthContext {
  deviceId: string;
  userId?: string;
}
