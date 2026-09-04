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

/**
 * The backend refused the *content* of a write (400). Unlike the two errors
 * above this one is meant to be shown next to the form: the message describes
 * the shape that was expected, never a value and never anything about the
 * database.
 */
export class AdminInvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminInvalidInput';
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
  /** Present once the Command Center tables exist; null before that. */
  reports?: { total: number | null; last7d: number | null };
  blacklist?: { active: number | null };
  reputation?: { total: number | null };
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

async function request<T>(path: string, body?: unknown): Promise<T> {
  const supabase = getAdminSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new AdminAccessDenied();

  let response: Response;
  try {
    response = await fetch(adminApiUrl(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        apikey: adminApiKey(),
        Authorization: 'Bearer ' + accessToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Network-level failure: no detail exists that is safe or useful to show.
    throw new AdminServiceError();
  }

  if (response.status === 404 || response.status === 403 || response.status === 401) {
    throw new AdminAccessDenied();
  }
  if (response.status === 400) {
    const detail = await response.json().catch(() => ({}));
    throw new AdminInvalidInput(
      typeof detail?.error === 'string' ? detail.error : 'Os dados enviados não são válidos.',
    );
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new AdminServiceError(
      typeof failure?.requestId === 'string' ? failure.requestId : undefined,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new AdminServiceError();
  }
  return (payload as { data: T }).data;
}

/** A read. */
function call<T>(path: string): Promise<T> {
  return request<T>(path);
}

/** A write. Always a POST, even when the body happens to be empty. */
function send<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(path, body);
}

/** Builds a query string, dropping the filters the operator left untouched. */
function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
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

// ─── Centro de Comando ───────────────────────────────────────────────────────
//
// Everything below reads and writes the Valthoris Supabase and nothing else.
// The vocabularies are mirrored from the Edge Function, which validates them
// again: the browser copy exists so the forms can offer the right options, not
// so the backend can trust it.

export const REPORT_CATEGORIES = [
  'PHISHING', 'SMISHING', 'PHONE_SCAM', 'MALWARE', 'BANK_FRAUD', 'CRYPTO_FRAUD',
  'ROMANCE_SCAM', 'FRAUDULENT_URL', 'MALICIOUS_IP', 'SUSPICIOUS_DOMAIN',
  'SUSPICIOUS_IBAN', 'IMPERSONATION', 'OTHER',
] as const;
export const TARGET_TYPES = ['PHONE', 'EMAIL', 'URL', 'DOMAIN', 'IP', 'CRYPTO', 'IBAN', 'OTHER'] as const;
export const REPORT_STATUSES = ['NEW', 'TRIAGE', 'CONFIRMED', 'REJECTED'] as const;
export const REPORT_SEVERITIES = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const BLACKLIST_CATEGORIES = ['IP', 'PHONE', 'EMAIL', 'CRYPTO', 'IBAN', 'DOMAIN', 'OTHER'] as const;
export const BLACKLIST_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const REPUTATION_LEVELS = ['UNKNOWN', 'TRUSTED', 'NEUTRAL', 'SUSPICIOUS', 'DANGEROUS'] as const;

/** Portuguese labels for the vocabularies above. */
export const CATEGORY_LABELS: Record<string, string> = {
  PHISHING: 'Phishing',
  SMISHING: 'Smishing (SMS)',
  PHONE_SCAM: 'Scam telefónico',
  MALWARE: 'Malware',
  BANK_FRAUD: 'Fraude bancária',
  CRYPTO_FRAUD: 'Cripto fraude',
  ROMANCE_SCAM: 'Romance scam',
  FRAUDULENT_URL: 'URL fraudulento',
  MALICIOUS_IP: 'IP malicioso',
  SUSPICIOUS_DOMAIN: 'Domínio suspeito',
  SUSPICIOUS_IBAN: 'IBAN suspeito',
  IMPERSONATION: 'Falsa identidade',
  OTHER: 'Outros',
};

export const TARGET_LABELS: Record<string, string> = {
  PHONE: 'Telefone',
  EMAIL: 'Email',
  URL: 'URL',
  DOMAIN: 'Domínio',
  IP: 'IP',
  CRYPTO: 'Cripto',
  IBAN: 'IBAN',
  OTHER: 'Outros',
};

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nova',
  TRIAGE: 'Em triagem',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rejeitada',
};

export const SEVERITY_LABELS: Record<string, string> = {
  UNKNOWN: 'Por avaliar',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const LEVEL_LABELS: Record<string, string> = {
  UNKNOWN: 'Sem avaliação',
  TRUSTED: 'Confiável',
  NEUTRAL: 'Neutra',
  SUSPICIOUS: 'Suspeita',
  DANGEROUS: 'Perigosa',
};

export interface CommandCenterStats {
  generatedAt: string;
  /** Row count per table; `null` when that table does not exist here. */
  tables: Record<string, number | null>;
  reports: { total: number; last7d: number; confirmed: number; located: number };
  blacklist: { total: number; active: number };
  reputation: { total: number; flagged: number };
  users: { total: number; new7d: number };
}

export interface FraudReportRow {
  id: string;
  created_at: string;
  category: string;
  target_type: string;
  target_value: string;
  description: string | null;
  status: string;
  severity: string;
  source: string | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FraudReportPage {
  total: number;
  items: FraudReportRow[];
}

export interface FraudMapPoint {
  id: string;
  created_at: string;
  category: string;
  target_type: string;
  target_value: string;
  status: string;
  severity: string;
  country: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
}

export interface FraudMapResult {
  located: FraudMapPoint[];
  totalReports: number;
  withoutLocation: number;
}

export interface BlacklistRow {
  id: string;
  created_at: string;
  updated_at: string;
  category: string;
  value: string;
  reason: string | null;
  severity: string;
  source: string | null;
  active: boolean;
  expires_at: string | null;
}

export interface BlacklistPage {
  total: number;
  items: BlacklistRow[];
  byCategory: Record<string, number>;
}

export interface BlacklistImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  processed: number;
  /** Rows the browser itself could not turn into an entry. */
  rejected: number;
}

export interface ReputationHistoryRow {
  occurred_at: string;
  previous_score: number | null;
  new_score: number;
  previous_level: string | null;
  new_level: string;
  reason: string | null;
  actor_admin_email: string | null;
}

export interface ReputationRow {
  id: string;
  entity_type: string;
  entity_value: string;
  score: number;
  level: string;
  signals: Record<string, unknown>;
  computed_at: string;
  created_at: string;
  updated_at: string;
  history: ReputationHistoryRow[];
}

export interface ReputationPage {
  total: number;
  items: ReputationRow[];
}

export interface ThreatIndicator {
  key: string;
  label: string;
  reports: number;
  reports7d: number;
  confirmed: number;
  blacklisted: number;
  flaggedEntities: number;
  total: number;
}

export interface ThreatIntelSummary {
  generatedAt: string;
  indicators: ThreatIndicator[];
}

export interface MonitoringEvent {
  kind: 'AUDIT' | 'ERROR';
  occurred_at: string;
  title: string | null;
  actor: string | null;
  state: string | null;
  detail: string | null;
}

export interface MonitoringFeed {
  generatedAt: string;
  events: MonitoringEvent[];
  counters: { audit24h: number; denied24h: number; errors24h: number };
}

export interface PlatformUserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  is_admin: boolean;
}

export interface PlatformUsersResult {
  users: {
    total: number;
    items: PlatformUserRow[];
    counters: {
      total: number;
      new7d: number;
      confirmed: number;
      admins: number;
      profiles: number;
    };
  };
  administrators: AdministratorRow[];
}

/** Real row counts of the tables this project has. */
export function fetchStatistics(): Promise<CommandCenterStats> {
  return call<CommandCenterStats>('/statistics');
}

export function fetchFraudReports(params: {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
  status?: string;
} = {}): Promise<FraudReportPage> {
  return call<FraudReportPage>('/fraud-reports' + query(params));
}

export function createFraudReport(report: {
  category: string;
  targetType: string;
  targetValue: string;
  description?: string;
  severity?: string;
  status?: string;
  country?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ id: string }> {
  return send<{ id: string }>('/fraud-report-create', report);
}

/** Only the reports that actually carry coordinates. */
export function fetchFraudMap(limit = 500): Promise<FraudMapResult> {
  return call<FraudMapResult>('/fraud-map' + query({ limit }));
}

export function fetchBlacklist(params: {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
} = {}): Promise<BlacklistPage> {
  return call<BlacklistPage>('/blacklist' + query(params));
}

export function addBlacklistEntry(entry: {
  category: string;
  value: string;
  reason?: string;
  severity?: string;
}): Promise<{ id: string; updated: boolean }> {
  return send<{ id: string; updated: boolean }>('/blacklist-add', entry);
}

/** A batch from a CSV or JSON file the operator supplied. */
export function importBlacklist(
  entries: Array<{ category: string; value: string; reason?: string; severity?: string }>,
): Promise<BlacklistImportResult> {
  return send<BlacklistImportResult>('/blacklist-import', { entries });
}

export function fetchReputation(params: {
  limit?: number;
  offset?: number;
  search?: string;
  entityType?: string;
} = {}): Promise<ReputationPage> {
  return call<ReputationPage>('/reputation' + query(params));
}

export function setReputation(entry: {
  entityType: string;
  entityValue: string;
  score: number;
  level?: string;
  reason?: string;
}): Promise<{ id: string; level: string; created: boolean }> {
  return send<{ id: string; level: string; created: boolean }>('/reputation-set', entry);
}

export function fetchThreatIntel(): Promise<ThreatIntelSummary> {
  return call<ThreatIntelSummary>('/threat-intel');
}

export function fetchMonitoring(limit = 60): Promise<MonitoringFeed> {
  return call<MonitoringFeed>('/monitoring' + query({ limit }));
}

export function fetchPlatformUsers(params: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<PlatformUsersResult> {
  return call<PlatformUsersResult>('/users' + query(params));
}
