/**
 * Supabase Edge Function — `admin-icp-bridge`
 *
 * The bridge between the identity Valthoris actually uses (Internet Identity)
 * and the identity the administration needs (a real Supabase Auth session).
 *
 * THE PROBLEM IT SOLVES
 * ─────────────────────
 * Valthoris signs users in with Internet Identity. The browser therefore holds
 * no Supabase session, `auth.users` is empty, `auth.uid()` is NULL, and every
 * administrative check that depends on it can never recognise anybody. The
 * administration was unreachable not because of MFA, but because no Supabase
 * session existed at all.
 *
 * THE FLOW
 * ────────
 *   1. POST /challenge  → a signed, single-purpose, 2-minute challenge.
 *   2. the browser signs it with its Internet Identity session key.
 *   3. POST /session    → the delegation chain is verified cryptographically
 *                         (see delegation.ts), the resulting principal is
 *                         matched against `governance.admins.icp_principal`,
 *                         and only then a real Supabase session is minted with
 *                         the service role and handed back as a one-time token.
 *   4. POST /claim      → an administrator already holding a verified Supabase
 *                         session binds their own principal, once, so the
 *                         second ROOT never needs a manual database edit.
 *
 * WHAT IS NEVER TRUSTED
 * ─────────────────────
 * The principal in the request body. It is public information. The principal
 * used for the lookup is *derived* from the verified delegation chain.
 *
 * WHAT NEVER LEAVES THE FUNCTION
 * ──────────────────────────────
 * The service-role key, the reason a request was refused, and any technical
 * detail. Every refusal is the same HTTP 404 body, and the detail goes to
 * `governance.error_logs` / `governance.audit_logs`.
 *
 * Injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY.
 * Optional secrets: ADMIN_ALLOWED_ORIGINS, ADMIN_ICP_BRIDGE_SECRET,
 * II_CANISTER_ID, IC_ROOT_KEY_HEX.
 */

// deno-lint-ignore-file no-explicit-any

import { DelegationVerificationError, verifyInternetIdentity } from './delegation.ts';

/** Origins allowed to call the bridge, as for `admin-api`. */
const DEFAULT_ALLOWED_ORIGINS = ['https://valthoris.com', 'https://www.valthoris.com'];

/** The only answer an unauthorised caller ever receives. */
const NOT_FOUND_BODY = { error: 'Not found' };

/** The only message a failed call ever shows to a human. */
export const GENERIC_ERROR =
  'O serviço encontra-se temporariamente indisponível. Tente novamente.';

/** How long a challenge may be used, in milliseconds. */
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** Largest request body accepted, in bytes. Delegation chains are small. */
const MAX_BODY_BYTES = 32 * 1024;

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

export function allowedOrigins(): string[] {
  const extra = (env('ADMIN_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function newRequestId(): string {
  const raw = new Uint8Array(8);
  crypto.getRandomValues(raw);
  return Array.from(raw, b => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves the action from the request path: /admin-icp-bridge/<action>. */
export function readAction(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const index = segments.indexOf('admin-icp-bridge');
  const action = index >= 0 ? segments[index + 1] : segments[segments.length - 1];
  return action === 'challenge' || action === 'session' || action === 'claim' ? action : null;
}

// ─── Challenges ──────────────────────────────────────────────────────────────
//
// The challenge is stateless: `<expiry>.<nonce>.<hmac>`. Nothing is stored, so
// nothing can be exhausted by an anonymous caller, and the HMAC key never
// leaves the function. It is single-purpose (the browser signs it under the
// bridge's own domain separator) and short lived, which is what makes a
// captured delegation chain useless on its own.

function toBase64Url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string): Promise<string> {
  const secret = env('ADMIN_ICP_BRIDGE_SECRET') ?? env('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('admin-icp-bridge is not configured: no signing secret.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function issueChallenge(now = Date.now()): Promise<{ challenge: string; expiresAt: string }> {
  const nonce = new Uint8Array(24);
  crypto.getRandomValues(nonce);
  const expiry = now + CHALLENGE_TTL_MS;
  const payload = `${expiry}.${toBase64Url(nonce)}`;
  return { challenge: `${payload}.${await hmac(payload)}`, expiresAt: new Date(expiry).toISOString() };
}

export async function challengeIsValid(challenge: unknown, now = Date.now()): Promise<boolean> {
  if (typeof challenge !== 'string' || challenge.length > 512) return false;
  const parts = challenge.split('.');
  if (parts.length !== 3) return false;
  const expiry = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(expiry) || expiry < now || expiry > now + CHALLENGE_TTL_MS + 5_000) {
    return false;
  }
  const expected = await hmac(`${parts[0]}.${parts[1]}`);
  // Constant-time comparison: both strings have the same, fixed length.
  if (expected.length !== parts[2].length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return diff === 0;
}

// ─── Supabase access (service role) ──────────────────────────────────────────

function serviceConfig(): { url: string; key: string } {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'admin-icp-bridge is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    );
  }
  return { url, key };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = serviceConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    throw new Error(`rpc ${name} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function logError(
  requestId: string,
  message: string,
  detail: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await rpc('governance_write_error', {
      p_request_id: requestId,
      p_source: 'admin-icp-bridge',
      p_severity: 'ERROR',
      p_message: message,
      p_detail: detail.slice(0, 4000),
      p_actor_email: null,
      p_context: context,
    });
  } catch {
    // Logging must never become a second failure.
  }
}

async function logAudit(entry: {
  requestId: string;
  adminId: string | null;
  email: string | null;
  action: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reason?: string;
  evidence?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await rpc('governance_write_audit', {
      p_actor_admin_id: entry.adminId,
      p_actor_email: entry.email,
      p_action: entry.action,
      p_target_type: 'admin-icp-bridge',
      p_target_id: entry.action,
      p_permission: 'admin.access',
      p_result: entry.result,
      p_reason: entry.reason ?? null,
      p_evidence: entry.evidence ?? {},
      p_request_id: entry.requestId,
      p_ip_address: entry.ip ?? null,
      p_user_agent: entry.userAgent ?? null,
    });
  } catch {
    // The error log already records the failure.
  }
}

interface AdminRow {
  id: string;
  email: string;
  display_name: string;
  is_root: boolean;
  status: string;
  mfa_required: boolean;
}

/**
 * Mints a real Supabase session for an administrator, without any password
 * ever existing: `generate_link` produces a one-time hashed token that the
 * browser exchanges through `supabase.auth.verifyOtp()`.
 *
 * Only the hashed token is returned. The action link and the e-mail OTP that
 * Supabase also returns are deliberately dropped: they are additional ways to
 * obtain the same session and nothing in the browser needs them.
 */
async function mintSession(email: string): Promise<string> {
  const { url, key } = serviceConfig();
  const response = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!response.ok) {
    throw new Error(`generate_link failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const tokenHash = body?.hashed_token ?? body?.properties?.hashed_token;
  if (typeof tokenHash !== 'string' || tokenHash.length === 0) {
    throw new Error('generate_link returned no hashed token.');
  }
  return tokenHash;
}

/** Verifies a Supabase access token against the Auth server. */
async function authenticate(request: Request): Promise<{ id: string; email: string | null } | null> {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('Authorization') ?? '').trim());
  if (!match) return null;
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('admin-icp-bridge is not configured: SUPABASE_ANON_KEY.');

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: 'Bearer ' + match[1] },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email.toLowerCase() : null };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new DelegationVerificationError('Body too large.');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new DelegationVerificationError('Body is not JSON.');
  }
}

/** Verifies the delegation carried by a request body. */
async function verifyBody(body: Record<string, unknown>): Promise<string> {
  if (!(await challengeIsValid(body.challenge))) {
    throw new DelegationVerificationError('The challenge is missing, expired or forged.');
  }
  if (typeof body.signature !== 'string' || body.signature.length > 512) {
    throw new DelegationVerificationError('The signature is missing.');
  }
  const verified = await verifyInternetIdentity({
    delegation: body.delegation,
    challenge: body.challenge as string,
    signature: body.signature,
    canisterId: env('II_CANISTER_ID'),
    rootKeyHex: env('IC_ROOT_KEY_HEX'),
  });
  return verified.principal;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleRequest(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const requestId = newRequestId();
  const url = new URL(request.url);
  const ip = request.headers.get('x-forwarded-for');
  const userAgent = request.headers.get('user-agent');

  try {
    const action = readAction(url.pathname);
    if (!action || request.method !== 'POST') return json(NOT_FOUND_BODY, 404, cors);

    if (action === 'challenge') {
      return json(await issueChallenge(), 200, cors);
    }

    const body = await readBody(request).catch(() => null);
    if (!body) return json(NOT_FOUND_BODY, 404, cors);

    if (action === 'session') {
      let principal: string;
      try {
        principal = await verifyBody(body);
      } catch (error) {
        await logAudit({
          requestId,
          adminId: null,
          email: null,
          action: 'ADMIN_ICP_SIGN_IN',
          result: 'DENIED',
          reason:
            error instanceof DelegationVerificationError
              ? error.message
              : 'Delegation verification failed',
          ip,
          userAgent,
        });
        return json(NOT_FOUND_BODY, 404, cors);
      }

      const admin = await rpc<AdminRow | null>('governance_admin_by_principal', {
        p_principal: principal,
      });
      if (!admin?.id) {
        // A genuine Internet Identity holder who is not an administrator. The
        // answer is the same as for a forged delegation.
        await logAudit({
          requestId,
          adminId: null,
          email: null,
          action: 'ADMIN_ICP_SIGN_IN',
          result: 'DENIED',
          reason: 'Verified principal is not an active administrator',
          evidence: { principal },
          ip,
          userAgent,
        });
        return json(NOT_FOUND_BODY, 404, cors);
      }

      const tokenHash = await mintSession(admin.email);
      await logAudit({
        requestId,
        adminId: admin.id,
        email: admin.email,
        action: 'ADMIN_ICP_SIGN_IN',
        result: 'SUCCESS',
        evidence: { principal, mfaRequired: admin.mfa_required },
        ip,
        userAgent,
      });
      // `mfaRequired` tells the browser that a TOTP step still follows. It is
      // not a decision: `admin-api` refuses every call below AAL2 anyway.
      return json(
        { requestId, tokenHash, type: 'magiclink', mfaRequired: Boolean(admin.mfa_required) },
        200,
        cors,
      );
    }

    // action === 'claim'
    const user = await authenticate(request);
    if (!user) return json(NOT_FOUND_BODY, 404, cors);

    const admin = await rpc<any>('governance_resolve_admin', {
      p_user_id: user.id,
      p_email: user.email,
    });
    if (!admin?.id || admin.status !== 'ACTIVE') return json(NOT_FOUND_BODY, 404, cors);

    let principal: string;
    try {
      principal = await verifyBody(body);
    } catch (error) {
      await logAudit({
        requestId,
        adminId: admin.id,
        email: admin.email,
        action: 'ADMIN_ICP_CLAIM',
        result: 'DENIED',
        reason:
          error instanceof DelegationVerificationError
            ? error.message
            : 'Delegation verification failed',
        ip,
        userAgent,
      });
      return json(NOT_FOUND_BODY, 404, cors);
    }

    const claimed = await rpc<boolean>('governance_claim_admin_principal', {
      p_admin_id: admin.id,
      p_principal: principal,
    });
    await logAudit({
      requestId,
      adminId: admin.id,
      email: admin.email,
      action: 'ADMIN_ICP_CLAIM',
      result: claimed ? 'SUCCESS' : 'DENIED',
      reason: claimed ? undefined : 'A principal is already bound to this or another administrator',
      evidence: { principal },
      ip,
      userAgent,
    });
    return json({ requestId, claimed: Boolean(claimed) }, claimed ? 200 : 409, cors);
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    await logError(requestId, 'admin-icp-bridge request failed', detail, {
      path: url.pathname,
      method: request.method,
    });
    return json({ error: GENERIC_ERROR, requestId }, 503, cors);
  }
}

// Only start the server inside Deno Deploy / `supabase functions serve`; the
// unit tests import this module directly.
const denoServe = (globalThis as any).Deno?.serve;
if (typeof denoServe === 'function') {
  denoServe(handleRequest);
}
