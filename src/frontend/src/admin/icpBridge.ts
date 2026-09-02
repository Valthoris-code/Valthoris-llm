/**
 * The browser half of the Internet Identity → Supabase bridge.
 *
 * Valthoris signs users in with Internet Identity, so the browser holds a
 * delegation chain and no Supabase session at all. Everything administrative —
 * `auth.uid()`, the AAL2 checks, the RLS policies on `governance` — depends on
 * a real Supabase session, which is what this module obtains:
 *
 *   1. ask `admin-icp-bridge` for a short-lived challenge;
 *   2. sign it with the Internet Identity session key (proof of possession);
 *   3. send the challenge, the signature and the delegation chain;
 *   4. the function verifies the chain against the Internet Computer root key,
 *      maps the principal to an administrator and returns a one-time token;
 *   5. exchange that token for a real Supabase session.
 *
 * Nothing here is an authorisation decision. The principal is not sent as a
 * claim of identity — the server derives it from the chain it verified — and a
 * refusal is always the same opaque failure.
 */

import type { Identity } from '@dfinity/agent';
import type { DelegationIdentity } from '@dfinity/identity';
import { getAuthClient, login as internetIdentityLogin } from '../services/auth';
import { adminApiKey, adminBridgeUrl, getAdminSupabase, isAdminBackendConfigured } from './adminClient';

/** Domain separator of the bridge challenge; must match the Edge Function. */
const CHALLENGE_DOMAIN = 'valthoris-admin-icp-bridge';

/** Raised for every bridge failure. The reason is never disclosed. */
export class InternetIdentityBridgeError extends Error {
  constructor() {
    super('Internet Identity sign-in failed');
    this.name = 'InternetIdentityBridgeError';
  }
}

function toHex(data: Uint8Array): string {
  return Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** `len(domain) || domain || challenge`, exactly as the function recomputes it. */
function challengeMessage(challenge: string): Uint8Array {
  const domain = new TextEncoder().encode(CHALLENGE_DOMAIN);
  const body = new TextEncoder().encode(challenge);
  const message = new Uint8Array(1 + domain.length + body.length);
  message[0] = domain.length;
  message.set(domain, 1);
  message.set(body, 1 + domain.length);
  return message;
}

/** True when the identity carries a delegation chain (i.e. is signed in). */
function asDelegationIdentity(identity: Identity): DelegationIdentity | null {
  const candidate = identity as Partial<DelegationIdentity>;
  return typeof candidate.getDelegation === 'function' && typeof candidate.sign === 'function'
    ? (identity as DelegationIdentity)
    : null;
}

async function post(path: string, body: unknown, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: adminApiKey(),
    'Content-Type': 'application/json',
    // The gateway requires a key even though the function does its own
    // authorisation; the anon key is public by design.
    Authorization: 'Bearer ' + (accessToken ?? adminApiKey()),
  };
  return await fetch(adminBridgeUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

/** Signs the current challenge with the live Internet Identity session. */
async function proveIdentity(): Promise<{
  challenge: string;
  signature: string;
  delegation: unknown;
}> {
  const client = await getAuthClient();
  if (!(await client.isAuthenticated())) {
    // Opens the Internet Identity window. A cancelled flow throws, and is
    // reported as a plain failure.
    await internetIdentityLogin();
  }

  const identity = asDelegationIdentity(client.getIdentity());
  if (!identity) throw new InternetIdentityBridgeError();

  const challengeResponse = await post('/challenge', {});
  if (!challengeResponse.ok) throw new InternetIdentityBridgeError();
  const { challenge } = await challengeResponse.json();
  if (typeof challenge !== 'string') throw new InternetIdentityBridgeError();

  const signature = new Uint8Array(
    await identity.sign(challengeMessage(challenge).buffer as ArrayBuffer),
  );

  return {
    challenge,
    signature: toHex(signature),
    delegation: identity.getDelegation().toJSON(),
  };
}

/**
 * Signs the administrator in with Internet Identity and opens the resulting
 * Supabase session. Throws `InternetIdentityBridgeError` when the principal is
 * not an administrator, when the delegation does not verify, or when anything
 * else goes wrong — the three are deliberately indistinguishable.
 */
export async function signInWithInternetIdentity(): Promise<void> {
  if (!isAdminBackendConfigured) throw new InternetIdentityBridgeError();

  const proof = await proveIdentity();
  const response = await post('/session', proof);
  if (!response.ok) throw new InternetIdentityBridgeError();

  const body = await response.json().catch(() => null);
  if (!body || typeof body.tokenHash !== 'string') throw new InternetIdentityBridgeError();

  const { error } = await getAdminSupabase().auth.verifyOtp({
    token_hash: body.tokenHash,
    type: 'magiclink',
  });
  if (error) throw new InternetIdentityBridgeError();
}

/**
 * Binds the Internet Identity of the administrator who is *already* signed in
 * to their administrator record, so that they can use Internet Identity from
 * then on. It is deliberately one-way: an existing binding is never replaced
 * silently, and the attempt is audited either way.
 *
 * Returns true when the binding was stored, false when it was refused because
 * a principal is already bound.
 */
export async function linkInternetIdentity(): Promise<boolean> {
  if (!isAdminBackendConfigured) throw new InternetIdentityBridgeError();

  const { data } = await getAdminSupabase().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new InternetIdentityBridgeError();

  const proof = await proveIdentity();
  const response = await post('/claim', proof, accessToken);
  if (response.status === 409) return false;
  if (!response.ok) throw new InternetIdentityBridgeError();
  const body = await response.json().catch(() => null);
  return Boolean(body?.claimed);
}
