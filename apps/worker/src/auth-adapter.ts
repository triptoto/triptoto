import type { Env } from './types.ts';
import type { VerifiedIdentityInput, VerifiedLoginResult, VerifiedProvider } from './verified-auth.ts';
import { completeVerifiedIdentityLogin } from './verified-auth.ts';

/**
 * Adapter boundary for future Apple, Google, or email-code verification.
 * Implementations must validate provider signatures/codes before returning a
 * VerifiedIdentityInput. Browser-submitted claims must never bypass verify().
 */
export interface AuthAdapter<Credential = unknown> {
  readonly provider: VerifiedProvider;
  verify(credential: Credential): Promise<VerifiedIdentityInput>;
}

export async function completeAdapterLogin<Credential>(
  env: Env,
  deviceId: string,
  adapter: AuthAdapter<Credential>,
  credential: Credential,
): Promise<VerifiedLoginResult> {
  const identity = await adapter.verify(credential);
  if (identity.provider !== adapter.provider) throw new Error('Auth adapter provider mismatch.');
  return completeVerifiedIdentityLogin(env, deviceId, identity);
}
