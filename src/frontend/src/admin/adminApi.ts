/**
 * Typed access to the `admin-api` Edge Function.
 *
 * Every administrative read goes through this module. The browser holds no
 * privileged credential: it sends the Supabase Auth access token of the
 * administrator and the public anon key, and the function decides.
 *
 * Two failure modes are distinguished on purpose:
 *   • `AdminAccessDenied` — the backend answered 404/403. The UI must react by
 *     behaving as if the administration did not exist; it must not explain.
 *   • `AdminServiceError` — anything else. The UI shows the generic message.
 */

import { ADMIN_GENERIC_ERROR, adminApiKey, adminApiUrl, getAdminSupabase } from './adminClient';

export class AdminAccessDenied extends Error {
  constructor() {
    super('Not found');
    this.name = 'AdminAccessDenied';
  }
}

export class AdminServiceError extends Error {
  readonly requestId?: string;
  constructor(requestId?: string) {
    super(ADMIN_GENERIC_ERROR);
    this.name = 'AdminServiceError';
    this.requestId = requestId;
  }
}

export interface AdminSession {
  id: string;
  email: string;
  displayName: string;
  isRoot: boolean;
  roles: string[];
  permissions: string[];
}

export interface AdminDashboard {
  generatedAt: string;
  users: { total: number | null; new7d: number | null };
  administration: { admins: number; root: number; mfaRequired: number; roles: number };
  audit: { total: number; last24h: number; denied7d: number };
  errors: { total: number; last24h: number };
}

export interface AdministratorRow {
  id: string;
  email: string;
  display_name: string;
  is_root: boolean;
  status: string;
  mfa_required: boolean;
  last_seen_at: string | null;
  created_at: string;
  account_linked: boolean;
  roles: string[];
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_root: boolean;
  permissions: string[];
  admin_count: number;
}

export interface AuditLogRow {
  id: number;
  occurred_at: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  permission: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reason: string | null;
  evidence: Record<string, unknown>;
  request_id: string | null;
}

export interface AuditLogPage {
  total: number;
  items: AuditLogRow[];
}

/** State of one external intelligence source, as reported by `ai-chat`. */
export interface IntelSourceRow {
  provider: string;
  endpoint: string;
  kinds: string[];
  status: 'operational' | 'degraded' | 'not_configured' | 'disabled';
  error?: string;
  httpStatus?: number;
  checkedAt: string;
  durationMs?: number;
  /** True when a real request was sent to the provider for this result. */
  probed: boolean;
  /** Names (never values) of the secrets the source needs. */
  secrets: string[];
}

export interface IntelSourcesResult {
  sources: IntelSourceRow[];
  /** ISO instant of the live test, or null when only the configured state was read. */
  probedAt: string | null;
}

async function call<T>(path: string): Promise<T> {
  const supabase = getAdminSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new AdminAccessDenied();

  let response: Response;
  try {
    response = await fetch(adminApiUrl(path), {
      headers: {
        apikey: adminApiKey(),
        Authorization: 'Bearer ' + accessToken,
      },
    });
  } catch {
    // Network-level failure: no detail exists that is safe or useful to show.
    throw new AdminServiceError();
  }

  if (response.status === 404 || response.status === 403 || response.status === 401) {
    throw new AdminAccessDenied();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new AdminServiceError(typeof body?.requestId === 'string' ? body.requestId : undefined);
  }

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new AdminServiceError();
  }
  return (body as { data: T }).data;
}

/** Resolves the administrator behind the current session, or denies. */
export async function fetchAdminSession(): Promise<AdminSession> {
  const data = await call<{ admin: AdminSession }>('/session');
  return data.admin;
}

export function fetchDashboard(): Promise<AdminDashboard> {
  return call<AdminDashboard>('/dashboard');
}

export async function fetchAdministrators(): Promise<AdministratorRow[]> {
  const data = await call<{ administrators: AdministratorRow[] }>('/administrators');
  return data.administrators;
}

export async function fetchRoles(): Promise<RoleRow[]> {
  const data = await call<{ roles: RoleRow[] }>('/roles');
  return data.roles;
}

export function fetchAuditLogs(params: {
  limit?: number;
  offset?: number;
  search?: string;
  result?: string;
}): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  if (params.search) query.set('search', params.search);
  if (params.result) query.set('result', params.result);
  const suffix = query.toString();
  return call<AuditLogPage>('/audit-logs' + (suffix ? `?${suffix}` : ''));
}

/**
 * State of the external intelligence sources.
 *
 * Without `probe` only the configured state is read and no provider is
 * contacted. `probe: 'all'` runs a real test lookup against every source, and a
 * `Provider|endpoint` id tests exactly one — that is the "test now" button.
 */
export function fetchIntelSources(probe?: string): Promise<IntelSourcesResult> {
  const query = probe ? `?probe=${encodeURIComponent(probe)}` : '';
  return call<IntelSourcesResult>('/intel-sources' + query);
}
