/**
 * Supabase Edge Function — `admin-api`
 *
 * The single backend door of the Valthoris Administration & Governance Center.
 *
 * The browser is never a security mechanism: the admin UI hides itself for
 * non-administrators, but *this* function is what actually decides. Every
 * request goes through the same pipeline:
 *
 *   Request → Authentication → Authorization → Admin identity → RBAC → Audit
 *
 *   1. Authentication — the caller must present a Supabase Auth access token.
 *      It is verified against the Auth server (never merely decoded).
 *   2. Assurance level — the session must have reached AAL2 (MFA) when the
 *      administrator record requires it, which the two ROOT accounts do.
 *   3. Admin identity — the verified e-mail / user id is resolved against
 *      `governance.admins`. Anything else is treated as "not an administrator".
 *   4. RBAC — the requested action maps to a permission key resolved from
 *      `governance.role_permissions`; nothing is hardcoded in the frontend.
 *   5. Audit — the outcome is written to `governance.audit_logs`.
 *
 * Failures are answered with a generic message and an opaque request id. Stack
 * traces, SQL errors, provider secrets and internal paths never leave the
 * function: the detail is stored in `governance.error_logs`.
 *
 * Injected by the platform:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

// deno-lint-ignore-file no-explicit-any

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/** The only message a failed administrative call ever shows to a human. */
export const GENERIC_ERROR =
  'O serviço encontra-se temporariamente indisponível. Tente novamente.';

/**
 * The answer given to every caller that is not a recognised administrator.
 * It is deliberately identical for "not signed in", "unknown e-mail",
 * "suspended" and "MFA missing": the administration must not confirm its own
 * existence, nor whether a given address belongs to an administrator.
 */
const NOT_FOUND_BODY = { error: 'Not found' };

/** Action → permission required. Unlisted actions are refused. */
export const ACTION_PERMISSIONS: Record<string, string> = {
  session: 'admin.access',
  dashboard: 'dashboard.read',
  administrators: 'admins.read',
  roles: 'roles.read',
  'audit-logs': 'audit.read',
};

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
  isRoot: boolean;
  status: string;
  mfaRequired: boolean;
  roles: string[];
  permissions: string[];
}

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function newRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads the `aal` claim of an already-verified access token.
 *
 * The token itself is validated by the Auth server (`GET /auth/v1/user`); this
 * only extracts a claim from that very same string, so decoding it without
 * re-verifying the signature adds no trust that was not already established.
 */
export function readAal(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

/** Resolves the action from the request path: /admin-api/<action>. */
export function readAction(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const index = segments.indexOf('admin-api');
  const action = index >= 0 ? segments[index + 1] : segments[segments.length - 1];
  return action && Object.prototype.hasOwnProperty.call(ACTION_PERMISSIONS, action)
    ? action
    : null;
}

// ─── Supabase access (service role) ──────────────────────────────────────────

function serviceConfig(): { url: string; key: string } {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'admin-api is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    );
  }
  return { url, key };
}

/** Calls a `public.governance_*` RPC with the service role. */
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = serviceConfig();
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    // The provider message may carry SQL detail — it is kept for the error log
    // and never returned to the browser.
    throw new Error(
      'rpc ' + name + ' failed with HTTP ' + response.status + ': ' + (await response.text()),
    );
  }
  return (await response.json()) as T;
}

/** Stores technical detail out of sight of the browser. Never throws. */
async function logError(
  requestId: string,
  message: string,
  detail: string,
  actorEmail: string | null,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await rpc('governance_write_error', {
      p_request_id: requestId,
      p_source: 'admin-api',
      p_severity: 'ERROR',
      p_message: message,
      p_detail: detail.slice(0, 4000),
      p_actor_email: actorEmail,
      p_context: context,
    });
  } catch {
    // Logging must never turn into a second failure.
  }
}

/** Writes one audit entry. Never throws. */
async function logAudit(entry: {
  requestId: string;
  admin: AdminIdentity | null;
  email: string | null;
  action: string;
  permission: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reason?: string;
  evidence?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await rpc('governance_write_audit', {
      p_actor_admin_id: entry.admin?.id ?? null,
      p_actor_email: entry.admin?.email ?? entry.email,
      p_action: entry.action,
      p_target_type: 'admin-api',
      p_target_id: entry.action,
      p_permission: entry.permission,
      p_result: entry.result,
      p_reason: entry.reason ?? null,
      p_evidence: entry.evidence ?? {},
      p_request_id: entry.requestId,
      p_ip_address: entry.ip ?? null,
      p_user_agent: entry.userAgent ?? null,
    });
  } catch {
    // Never let auditing break the request; the error log already records it.
  }
}

// ─── Authentication ──────────────────────────────────────────────────────────

interface AuthenticatedUser {
  id: string;
  email: string | null;
  aal: string | null;
}

/** Verifies the bearer token against the Auth server. Returns null when invalid. */
async function authenticate(request: Request): Promise<AuthenticatedUser | null> {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];

  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new Error('admin-api is not configured: SUPABASE_ANON_KEY is required.');
  }

  const response = await fetch(url + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: 'Bearer ' + token },
  });
  if (!response.ok) return null;

  const user = await response.json();
  if (!user?.id) return null;
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
    aal: readAal(token),
  };
}

// ─── Authorization ───────────────────────────────────────────────────────────

/**
 * Resolves the administrator behind an authenticated session.
 *
 * Returns null when the account is not an administrator, is suspended, or has
 * not satisfied the mandatory MFA step. The caller must not distinguish those
 * cases in its answer.
 */
async function resolveAdmin(user: AuthenticatedUser): Promise<AdminIdentity | null> {
  const row = await rpc<any>('governance_resolve_admin', {
    p_user_id: user.id,
    p_email: user.email,
  });
  if (!row || !row.id) return null;

  const admin: AdminIdentity = {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isRoot: Boolean(row.is_root),
    status: row.status,
    mfaRequired: Boolean(row.mfa_required),
    roles: Array.isArray(row.roles) ? row.roles : [],
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  };

  if (admin.status !== 'ACTIVE') return null;
  if (admin.mfaRequired && user.aal !== 'aal2') return null;

  // Bind the Auth user to the seeded row on first successful sign-in.
  if (!row.user_id) {
    await rpc('governance_bind_admin_user', { p_admin_id: admin.id, p_user_id: user.id });
  }
  return admin;
}

export function hasPermission(admin: AdminIdentity, permission: string): boolean {
  return admin.isRoot || admin.permissions.includes(permission);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function runAction(action: string, admin: AdminIdentity, url: URL): Promise<unknown> {
  switch (action) {
    case 'session':
      return {
        admin: {
          id: admin.id,
          email: admin.email,
          displayName: admin.displayName,
          isRoot: admin.isRoot,
          roles: admin.roles,
          permissions: admin.permissions,
        },
      };

    case 'dashboard':
      return await rpc('governance_dashboard', {});

    case 'administrators':
      return { administrators: await rpc('governance_list_admins', {}) };

    case 'roles':
      return { roles: await rpc('governance_list_roles', {}) };

    case 'audit-logs': {
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
      const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
      const search = url.searchParams.get('search');
      const result = url.searchParams.get('result');
      const allowedResults = ['SUCCESS', 'DENIED', 'FAILURE'];
      return await rpc('governance_list_audit_logs', {
        p_limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
        p_offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
        p_search: search && search.length <= 120 ? search : null,
        p_result: result && allowedResults.includes(result) ? result : null,
      });
    }

    default:
      // Unreachable: readAction() only returns known actions.
      throw new Error('Unhandled action: ' + action);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const requestId = newRequestId();
  const url = new URL(request.url);
  const ip = request.headers.get('x-forwarded-for');
  const userAgent = request.headers.get('user-agent');
  let email: string | null = null;

  try {
    const action = readAction(url.pathname);
    if (!action) return json(NOT_FOUND_BODY, 404);

    const user = await authenticate(request);
    if (!user) return json(NOT_FOUND_BODY, 404);
    email = user.email;

    const admin = await resolveAdmin(user);
    if (!admin) {
      // Someone holding a valid Valthoris session tried to reach the
      // administration. It is refused as "not found" and recorded.
      await logAudit({
        requestId,
        admin: null,
        email,
        action,
        permission: ACTION_PERMISSIONS[action],
        result: 'DENIED',
        reason: 'Not an active administrator, or MFA/AAL2 not satisfied',
        ip,
        userAgent,
      });
      return json(NOT_FOUND_BODY, 404);
    }

    const permission = ACTION_PERMISSIONS[action];
    if (!hasPermission(admin, permission)) {
      await logAudit({
        requestId,
        admin,
        email,
        action,
        permission,
        result: 'DENIED',
        reason: 'Missing permission',
        ip,
        userAgent,
      });
      return json({ error: 'Forbidden' }, 403);
    }

    const data = await runAction(action, admin, url);
    await logAudit({
      requestId,
      admin,
      email,
      action,
      permission,
      result: 'SUCCESS',
      evidence: { method: request.method },
      ip,
      userAgent,
    });
    return json({ requestId, data }, 200);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message + '\n' + (error.stack ?? '') : String(error);
    await logError(requestId, 'admin-api request failed', detail, email, {
      path: url.pathname,
      method: request.method,
    });
    return json({ error: GENERIC_ERROR, requestId }, 503);
  }
}

// Only start the server when running inside Deno Deploy / `supabase functions
// serve`; the unit tests import this module directly.
const denoServe = (globalThis as any).Deno?.serve;
if (typeof denoServe === 'function') {
  denoServe(handleRequest);
}
