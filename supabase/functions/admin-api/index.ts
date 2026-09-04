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

/**
 * Origins allowed to call the administration.
 *
 * Unlike the public functions, this one is not answered with a wildcard: an
 * arbitrary page must not be able to script requests to the administrative API
 * from an administrator's browser. Additional origins (a preview deployment,
 * a local `vite preview`) are declared in the `ADMIN_ALLOWED_ORIGINS` secret as
 * a comma-separated list.
 */
const DEFAULT_ALLOWED_ORIGINS = ['https://valthoris.com', 'https://www.valthoris.com'];

export function allowedOrigins(): string[] {
  const extra = (env('ADMIN_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

/**
 * CORS headers for one request. An unknown origin is simply not granted
 * access; the request is still processed and still authorised normally, because
 * CORS is a browser rule and never the thing that protects this endpoint.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

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
  'intel-sources': 'system_health.read',

  // Command Center sections. Every one of them is backed by a table of *this*
  // Supabase project; none of them reads an external system.
  statistics: 'dashboard.read',
  'fraud-reports': 'reports.read',
  'fraud-report-create': 'reports.write',
  'fraud-map': 'reports.read',
  blacklist: 'blacklist.read',
  'blacklist-add': 'blacklist.write',
  'blacklist-import': 'blacklist.write',
  reputation: 'reputation.read',
  'reputation-set': 'reputation.write',
  'threat-intel': 'threat_intel.read',
  monitoring: 'audit.read',
  users: 'users.read',
};

/**
 * Actions that change state. They are only accepted over POST, so a state
 * change can never be triggered by a link, an image or a prefetch.
 */
export const WRITE_ACTIONS = new Set([
  'fraud-report-create',
  'blacklist-add',
  'blacklist-import',
  'reputation-set',
]);

/** Largest request body accepted, in bytes. */
export const MAX_BODY_BYTES = 1_000_000;

/** Largest number of rows accepted in a single bulk import call. */
export const MAX_IMPORT_ROWS = 2000;

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

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
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

// ─── Input validation ────────────────────────────────────────────────────────
//
// Everything the browser sends is treated as hostile. Each field is checked
// against an explicit shape — an enumeration, a length, a numeric range — and
// anything else is refused with 400 before a single row is written. The
// database repeats the same checks as CHECK constraints, so a mistake here
// still cannot corrupt a table.

export class InvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInput';
  }
}

export const REPORT_CATEGORIES = [
  'PHISHING', 'SMISHING', 'PHONE_SCAM', 'MALWARE', 'BANK_FRAUD', 'CRYPTO_FRAUD',
  'ROMANCE_SCAM', 'FRAUDULENT_URL', 'MALICIOUS_IP', 'SUSPICIOUS_DOMAIN',
  'SUSPICIOUS_IBAN', 'IMPERSONATION', 'OTHER',
];
export const TARGET_TYPES = ['PHONE', 'EMAIL', 'URL', 'DOMAIN', 'IP', 'CRYPTO', 'IBAN', 'OTHER'];
export const REPORT_STATUSES = ['NEW', 'TRIAGE', 'CONFIRMED', 'REJECTED'];
export const REPORT_SEVERITIES = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const BLACKLIST_CATEGORIES = ['IP', 'PHONE', 'EMAIL', 'CRYPTO', 'IBAN', 'DOMAIN', 'OTHER'];
export const BLACKLIST_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const REPUTATION_LEVELS = ['UNKNOWN', 'TRUSTED', 'NEUTRAL', 'SUSPICIOUS', 'DANGEROUS'];

/** A required string of bounded length. */
function requireText(body: any, field: string, maxLength: number): string {
  const value = body?.[field];
  if (typeof value !== 'string') throw new InvalidInput(field + ' is required');
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new InvalidInput(field + ' has an invalid length');
  }
  return trimmed;
}

/** An optional string; empty and absent both become null. */
function optionalText(body: any, field: string, maxLength: number): string | null {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InvalidInput(field + ' must be a string');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) throw new InvalidInput(field + ' is too long');
  return trimmed;
}

/** A value that must belong to a fixed set. Case is normalised first. */
function requireEnum(body: any, field: string, allowed: string[]): string {
  const value = requireText(body, field, 64).toUpperCase();
  if (!allowed.includes(value)) throw new InvalidInput(field + ' is not a valid value');
  return value;
}

function optionalEnum(body: any, field: string, allowed: string[], fallback: string): string {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return fallback;
  return requireEnum(body, field, allowed);
}

/** A coordinate, or null. Both must be present for either to be kept. */
function optionalCoordinate(body: any, field: string, limit: number): number | null {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < -limit || parsed > limit) {
    throw new InvalidInput(field + ' is not a valid coordinate');
  }
  return parsed;
}

function requireInteger(body: any, field: string, min: number, max: number): number {
  const value = body?.[field];
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new InvalidInput(field + ' must be an integer between ' + min + ' and ' + max);
  }
  return parsed;
}

/**
 * Validates the rows of a bulk blacklist import.
 *
 * Only `category`, `value`, `reason` and `severity` are carried over: whatever
 * else the file contained is dropped rather than stored. A row that cannot be
 * used is reported as rejected instead of silently changing meaning.
 */
export function normaliseImportRows(
  input: unknown,
): { rows: Array<Record<string, string>>; rejected: number } {
  if (!Array.isArray(input)) throw new InvalidInput('entries must be an array');
  if (input.length > MAX_IMPORT_ROWS) {
    throw new InvalidInput('entries holds more than ' + MAX_IMPORT_ROWS + ' rows');
  }

  const rows: Array<Record<string, string>> = [];
  let rejected = 0;

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      rejected += 1;
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const category = String(entry.category ?? '').trim().toUpperCase();
    const value = String(entry.value ?? '').trim();
    if (!BLACKLIST_CATEGORIES.includes(category) || value.length === 0 || value.length > 512) {
      rejected += 1;
      continue;
    }
    const severity = String(entry.severity ?? '').trim().toUpperCase();
    const reason = String(entry.reason ?? '').trim().slice(0, 2000);
    rows.push({
      category,
      value,
      severity: BLACKLIST_SEVERITIES.includes(severity) ? severity : 'MEDIUM',
      ...(reason ? { reason } : {}),
    });
  }

  return { rows, rejected };
}

/** Reads and size-limits the JSON body of a write request. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new InvalidInput('the request body is too large');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new InvalidInput('the request body is too large');
  if (text.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidInput('the request body is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidInput('the request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Bounded pagination and search parameters, shared by every listing action. */
function listParams(url: URL, defaultLimit: number): {
  p_limit: number;
  p_offset: number;
  p_search: string | null;
} {
  const limit = Number.parseInt(url.searchParams.get('limit') ?? String(defaultLimit), 10);
  const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const search = url.searchParams.get('search');
  return {
    p_limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : defaultLimit,
    p_offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    p_search: search && search.length <= 120 ? search : null,
  };
}

/** A query-string filter that must belong to a fixed set, or null. */
function enumParam(url: URL, name: string, allowed: string[]): string | null {
  const value = url.searchParams.get(name);
  if (!value) return null;
  const upper = value.toUpperCase();
  return allowed.includes(upper) ? upper : null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function runAction(
  action: string,
  admin: AdminIdentity,
  url: URL,
  body: Record<string, unknown>,
): Promise<{ data: unknown; evidence?: Record<string, unknown> }> {
  switch (action) {
    case 'session':
      return {
        data: {
          admin: {
            id: admin.id,
            email: admin.email,
            displayName: admin.displayName,
            isRoot: admin.isRoot,
            roles: admin.roles,
            permissions: admin.permissions,
          },
        },
      };

    case 'dashboard':
      return { data: await rpc('governance_dashboard', {}) };

    case 'statistics':
      return { data: await rpc('governance_command_center_stats', {}) };

    case 'administrators':
      return { data: { administrators: await rpc('governance_list_admins', {}) } };

    case 'roles':
      return { data: { roles: await rpc('governance_list_roles', {}) } };

    case 'intel-sources': {
      // The state of every external intelligence source. The registry and the
      // credentials live in the `ai-chat` function, which is the only place
      // that may hold them, so the administration asks *it* instead of
      // duplicating the provider list here (the duplication is exactly what let
      // the deployment drift from the repository in the first place).
      const probe = url.searchParams.get('probe');
      const safeProbe =
        probe && probe.length <= 120 && /^[A-Za-z0-9 .|/_-]+$/.test(probe) ? probe : undefined;
      return { data: await intelHealth(safeProbe) };
    }

    case 'audit-logs': {
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
      const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
      const search = url.searchParams.get('search');
      const result = url.searchParams.get('result');
      const allowedResults = ['SUCCESS', 'DENIED', 'FAILURE'];
      return {
        data: await rpc('governance_list_audit_logs', {
          p_limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
          p_offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
          p_search: search && search.length <= 120 ? search : null,
          p_result: result && allowedResults.includes(result) ? result : null,
        }),
      };
    }

    // ─── Denúncias ───────────────────────────────────────────────────────────

    case 'fraud-reports':
      return {
        data: await rpc('governance_list_fraud_reports', {
          ...listParams(url, 25),
          p_category: enumParam(url, 'category', REPORT_CATEGORIES),
          p_status: enumParam(url, 'status', REPORT_STATUSES),
        }),
      };

    case 'fraud-report-create': {
      const latitude = optionalCoordinate(body, 'latitude', 90);
      const longitude = optionalCoordinate(body, 'longitude', 180);
      const located = latitude !== null && longitude !== null;
      const category = requireEnum(body, 'category', REPORT_CATEGORIES);
      const data = await rpc('governance_create_fraud_report', {
        p_category: category,
        p_target_type: requireEnum(body, 'targetType', TARGET_TYPES),
        p_target_value: requireText(body, 'targetValue', 512),
        p_description: optionalText(body, 'description', 4000),
        p_severity: optionalEnum(body, 'severity', REPORT_SEVERITIES, 'UNKNOWN'),
        p_status: optionalEnum(body, 'status', REPORT_STATUSES, 'NEW'),
        p_country: optionalText(body, 'country', 80),
        p_city: optionalText(body, 'city', 120),
        p_latitude: located ? latitude : null,
        p_longitude: located ? longitude : null,
        p_evidence: {},
        p_source: 'admin-center',
      });
      // The audit records what kind of thing was filed, never its content.
      return { data, evidence: { category, located } };
    }

    case 'fraud-map': {
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '500', 10);
      return {
        data: await rpc('governance_fraud_report_map', {
          p_limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 2000) : 500,
        }),
      };
    }

    // ─── Blacklist ───────────────────────────────────────────────────────────

    case 'blacklist':
      return {
        data: await rpc('governance_list_blacklist', {
          ...listParams(url, 50),
          p_category: enumParam(url, 'category', BLACKLIST_CATEGORIES),
        }),
      };

    case 'blacklist-add': {
      const category = requireEnum(body, 'category', BLACKLIST_CATEGORIES);
      const data = await rpc('governance_add_blacklist_entry', {
        p_category: category,
        p_value: requireText(body, 'value', 512),
        p_reason: optionalText(body, 'reason', 2000),
        p_severity: optionalEnum(body, 'severity', BLACKLIST_SEVERITIES, 'MEDIUM'),
        p_source: 'manual',
        p_expires_at: null,
        p_admin_id: admin.id,
        p_evidence: {},
      });
      return { data, evidence: { category } };
    }

    case 'blacklist-import': {
      const { rows, rejected } = normaliseImportRows(body.entries);
      const data = (await rpc('governance_import_blacklist', {
        p_entries: rows,
        p_source: 'import',
        p_admin_id: admin.id,
      })) as Record<string, unknown>;
      const result = { ...data, rejected };
      return { data: result, evidence: result };
    }

    // ─── Reputação ───────────────────────────────────────────────────────────

    case 'reputation':
      return {
        data: await rpc('governance_list_entity_reputation', {
          ...listParams(url, 50),
          p_entity_type: enumParam(url, 'entityType', TARGET_TYPES),
        }),
      };

    case 'reputation-set': {
      const entityType = requireEnum(body, 'entityType', TARGET_TYPES);
      const score = requireInteger(body, 'score', 0, 100);
      const data = await rpc('governance_upsert_entity_reputation', {
        p_entity_type: entityType,
        p_entity_value: requireText(body, 'entityValue', 512),
        p_score: score,
        p_level:
          body.level === undefined || body.level === null || body.level === ''
            ? null
            : requireEnum(body, 'level', REPUTATION_LEVELS),
        p_reason: optionalText(body, 'reason', 2000),
        p_actor_email: admin.email,
        p_signals: {},
      });
      return { data, evidence: { entityType, score } };
    }

    // ─── Threat Intelligence / Monitorização / Utilizadores ──────────────────

    case 'threat-intel':
      return { data: await rpc('governance_threat_intel_summary', {}) };

    case 'monitoring': {
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '60', 10);
      return {
        data: await rpc('governance_recent_events', {
          p_limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 60,
        }),
      };
    }

    case 'users': {
      const params = listParams(url, 50);
      return {
        data: {
          users: await rpc('governance_list_platform_users', params),
          administrators: await rpc('governance_list_admins', {}),
        },
      };
    }

    default:
      // Unreachable: readAction() only returns known actions.
      throw new Error('Unhandled action: ' + action);
  }
}

/**
 * Reads the intelligence-source health from the `ai-chat` function.
 *
 * The call is authorised with this project's service-role key, which `ai-chat`
 * checks in constant time; a browser can never reach that endpoint. `probe`
 * asks for a real test lookup ("all", or a single `Provider|endpoint` id)
 * instead of the configured state alone.
 */
async function intelHealth(probe?: string): Promise<unknown> {
  const { url, key } = serviceConfig();
  const response = await fetch(url + '/functions/v1/ai-chat', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'x-valthoris-service-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'intel-health', ...(probe ? { probe } : {}) }),
  });
  if (!response.ok) {
    throw new Error(
      'intel-health failed with HTTP ' + response.status + ': ' + (await response.text()),
    );
  }
  return await response.json();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleRequest(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const requestId = newRequestId();
  const url = new URL(request.url);
  const ip = request.headers.get('x-forwarded-for');
  const userAgent = request.headers.get('user-agent');
  let email: string | null = null;

  try {
    const action = readAction(url.pathname);
    if (!action) return json(NOT_FOUND_BODY, 404, cors);

    // A state-changing action is only reachable over POST, and a read is never
    // allowed to carry a body. This is decided before authentication so the
    // shape of the API never depends on who is asking.
    const isWrite = WRITE_ACTIONS.has(action);
    if (isWrite ? request.method !== 'POST' : request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    const user = await authenticate(request);
    if (!user) return json(NOT_FOUND_BODY, 404, cors);
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
      return json(NOT_FOUND_BODY, 404, cors);
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
      return json({ error: 'Forbidden' }, 403, cors);
    }

    // The body is only read once the caller is a known, entitled administrator,
    // so an anonymous request never causes any parsing work at all.
    let body: Record<string, unknown> = {};
    let result: { data: unknown; evidence?: Record<string, unknown> };
    try {
      if (isWrite) body = await readBody(request);
      result = await runAction(action, admin, url, body);
    } catch (error) {
      if (error instanceof InvalidInput) {
        // The message describes the *shape* that was expected, never the value
        // that was sent and never anything about the database.
        await logAudit({
          requestId,
          admin,
          email,
          action,
          permission,
          result: 'FAILURE',
          reason: 'Invalid input: ' + error.message,
          ip,
          userAgent,
        });
        return json({ error: error.message, requestId }, 400, cors);
      }
      throw error;
    }

    await logAudit({
      requestId,
      admin,
      email,
      action,
      permission,
      result: 'SUCCESS',
      evidence: { method: request.method, ...(result.evidence ?? {}) },
      ip,
      userAgent,
    });
    return json({ requestId, data: result.data }, 200, cors);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message + '\n' + (error.stack ?? '') : String(error);
    await logError(requestId, 'admin-api request failed', detail, email, {
      path: url.pathname,
      method: request.method,
    });
    return json({ error: GENERIC_ERROR, requestId }, 503, cors);
  }
}

// Only start the server when running inside Deno Deploy / `supabase functions
// serve`; the unit tests import this module directly.
const denoServe = (globalThis as any).Deno?.serve;
if (typeof denoServe === 'function') {
  denoServe(handleRequest);
}
