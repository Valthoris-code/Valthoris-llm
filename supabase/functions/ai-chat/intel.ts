/**
 * External threat-intelligence orchestration for the `ai-chat` Edge Function.
 *
 * The Valthoris assistant must not answer security questions from the model's
 * memory alone: when the user submits an analysable entity (IP, URL, domain,
 * e-mail, wallet, IBAN, phone, VAT number) the function queries the real
 * providers that are already configured as Supabase secrets, and the collected
 * evidence is what the model is allowed to reason about.
 *
 * Rules enforced here — they are the reason this file exists:
 *   • API keys are read from the function secret store only. They never leave
 *     this module: no key is logged, returned to the browser or embedded in a
 *     source report.
 *   • A provider that is not configured is reported as `not_configured`; it is
 *     never presented as if it had been consulted.
 *   • A provider that fails (network, quota, HTTP error, timeout) is reported
 *     as `failed` and the remaining providers still run: one broken API never
 *     takes the whole analysis down.
 *   • Nothing is invented. A source report only carries values the provider
 *     actually returned.
 *
 * Secrets read (names only — values are never printed):
 *   ABUSEIPDB_API_KEY, IPINFO_API_KEY, VIRUSTOTAL_API_KEY, URLSCAN_API_KEY,
 *   ABSTRACT_IP_API_KEY, ABSTRACT_PHONE_API_KEY, ABSTRACT_EMAIL_API_KEY,
 *   ABSTRACT_IBAN_API_KEY, ABSTRACT_VAT_API_KEY, NUMVERIFY_API_KEY,
 *   OPENIBAN_API_URL, CRYPTOSCAMDB_API_URL, GOPLUS_API_URL,
 *   GOPLUS_APP_KEY, GOPLUS_APP_SECRET, COINGECKO_API_KEY, ETHERSCAN_API_KEY,
 *   NEWSDATA_API_KEY, DATA_GOV_API_KEY
 *
 * One provider needs no credential at all: OpenStreetMap Nominatim, used for
 * public place/business lookups, is queried anonymously with the User-Agent the
 * Nominatim usage policy requires.
 */

// deno-lint-ignore-file no-explicit-any

/** Entity kinds the orchestrator knows how to enrich. */
export type IntelEntityKind =
  | 'ip'
  | 'url'
  | 'domain'
  | 'email'
  | 'crypto_eth'
  | 'crypto_btc'
  | 'iban'
  | 'phone'
  | 'vat'
  | 'place'
  | 'topic';

export interface IntelEntity {
  kind: IntelEntityKind;
  value: string;
}

/** Outcome of a single provider call, as shown to the user under "Sources". */
export interface SourceReport {
  /** Human-readable provider name, e.g. "AbuseIPDB". */
  provider: string;
  /** Which lookup was performed, e.g. "ip/reputation". */
  endpoint: string;
  /** The entity the provider was queried with. Never a key. */
  entity: string;
  /** ISO-8601 instant the lookup finished. */
  timestamp: string;
  status: 'success' | 'failed' | 'not_configured';
  /** Real failure reason. Empty when the call succeeded. */
  error?: string;
  /** Normalised, non-sensitive summary of what the provider returned. */
  data?: Record<string, unknown>;
}

const TIMEOUT_MS = 8_000;
const MAX_CONCURRENT = 8;

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Validates a secret that holds a base URL.
 *
 * The value is operator-controlled, but it is still checked: only an absolute
 * `https://` origin is accepted, so a malformed secret cannot redirect a lookup
 * to an arbitrary scheme or to the local network.
 */
function baseUrl(name: string): string | undefined {
  const raw = env(name);
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  return parsed.href.replace(/\/+$/, '');
}

// ─── Entity validation ───────────────────────────────────────────────────────
//
// Every value interpolated into a provider URL is validated against a strict
// pattern first and always percent-encoded. Nothing else reaches the network.

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9A-Fa-f:]{2,45}$/;
const DOMAIN_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;
const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_RE = /^(?:bc1[a-z0-9]{20,80}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const IBAN_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const VAT_RE = /^[A-Z]{2}[A-Za-z0-9]{2,15}$/;

/** True when `value` is a plausible instance of `kind`. */
export function isValidEntity(kind: IntelEntityKind, value: string): boolean {
  switch (kind) {
    case 'ip':
      return IPV4_RE.test(value) || (value.includes(':') && IPV6_RE.test(value));
    case 'domain':
      return DOMAIN_RE.test(value);
    case 'email':
      return EMAIL_RE.test(value);
    case 'crypto_eth':
      return ETH_RE.test(value);
    case 'crypto_btc':
      return BTC_RE.test(value);
    case 'iban':
      return IBAN_RE.test(value.replace(/\s+/g, '').toUpperCase());
    case 'phone':
      return PHONE_RE.test(value.replace(/[\s().-]/g, ''));
    case 'vat':
      return VAT_RE.test(value.replace(/\s+/g, '').toUpperCase());
    case 'url':
      return isPublicHttpUrl(value);
    case 'place':
      return value.trim().length > 2 && value.length <= 200;
    case 'topic':
      return value.trim().length > 2 && value.length <= 200;
  }
}

/** Accepts only an absolute http(s) URL with a public hostname. */
function isPublicHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isPublicHost(parsed.hostname);
}

/**
 * Rejects hostnames that resolve inside the deployment: an entity supplied by a
 * user must never make the function probe a private address (SSRF).
 */
function isPublicHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host.length === 0) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === '::1' || host === '0.0.0.0') return false;
  if (IPV4_RE.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (host.includes(':')) {
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return false;
    return true;
  }
  return DOMAIN_RE.test(host);
}

/** Normalises an entity value to the exact form the providers expect. */
function normaliseEntity(kind: IntelEntityKind, value: string): string {
  switch (kind) {
    case 'iban':
      return value.replace(/\s+/g, '').toUpperCase();
    case 'phone':
      return value.replace(/[\s().-]/g, '');
    case 'vat':
      return value.replace(/\s+/g, '').toUpperCase();
    case 'domain':
      return value.toLowerCase();
    case 'place':
      return value.replace(/\s+/g, ' ').trim();
    default:
      return value;
  }
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────

interface FetchOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

/** GET/POST with a hard timeout, returning parsed JSON or throwing a real error. */
async function fetchJson(url: string, options: FetchOptions = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { Accept: 'application/json', ...(options.headers ?? {}) },
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      // The body may echo the request (which can contain the key in a query
      // string for some providers), so only the status is surfaced.
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`timed out after ${TIMEOUT_MS} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Truncates a provider string so a report stays small and printable. */
function str(value: unknown, max = 160): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value.slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function clean(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

// ─── Public places ───────────────────────────────────────────────────────────

const COORD_RE = /^-?\d{1,3}(?:\.\d{1,10})?$/;

/**
 * Builds the clickable OpenStreetMap link for a pair of coordinates.
 *
 * Both values come from a provider response, so they are validated as plain
 * decimal numbers before being interpolated: a malformed value produces no link
 * instead of a broken (or attacker-shaped) URL.
 */
export function placeMapLink(lat?: string, lon?: string): string | undefined {
  if (!lat || !lon || !COORD_RE.test(lat) || !COORD_RE.test(lon)) return undefined;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

/**
 * True when the place evidence has no contact detail (phone or website).
 *
 * Nominatim is a gazetteer, not a directory: it very often locates a business
 * without carrying its phone number. That is exactly when the answer needs a
 * second, web-wide source instead of a gap.
 */
export function placeContactMissing(reports: SourceReport[]): boolean {
  return !reports.some(
    (r) =>
      r.status === 'success' &&
      typeof r.data?.phone === 'string' &&
      (r.data.phone as string).length > 0,
  );
}

// ─── Provider registry ───────────────────────────────────────────────────────

interface Provider {
  /** Display name shown to the user. */
  provider: string;
  /** Lookup label shown to the user. */
  endpoint: string;
  /** Entity kinds this provider can enrich. */
  kinds: IntelEntityKind[];
  /**
   * Runs the lookup. Returns the normalised summary, or throws.
   * Returning `null` means "configured, but this provider has nothing for this
   * entity" and is reported as a successful lookup with an empty result.
   */
  run: (value: string) => Promise<Record<string, unknown> | null>;
  /** Reads the secrets this provider needs; undefined when not configured. */
  config: () => string | undefined;
}

/** Base64url of a URL, the identifier VirusTotal v3 uses for URL objects. */
function virusTotalUrlId(url: string): string {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function vtStats(attributes: any): Record<string, unknown> {
  const stats = attributes?.last_analysis_stats ?? {};
  return clean({
    malicious: num(stats.malicious),
    suspicious: num(stats.suspicious),
    harmless: num(stats.harmless),
    undetected: num(stats.undetected),
    reputation: num(attributes?.reputation),
    categories: attributes?.categories ? Object.values(attributes.categories).slice(0, 5) : undefined,
    lastAnalysisDate: attributes?.last_analysis_date
      ? new Date(Number(attributes.last_analysis_date) * 1000).toISOString()
      : undefined,
  });
}

// ─── GoPlus authentication ───────────────────────────────────────────────────
//
// The GoPlus Security API requires an access token for the endpoints Valthoris
// uses. The token is obtained with the app key/secret pair:
//
//   POST {GOPLUS_API_URL}/api/v1/token
//   { app_key, time (Unix seconds), sign: SHA1(app_key + time + app_secret) }
//
// The token is valid for about an hour, so it is cached in memory for 55
// minutes: a warm function instance authenticates once instead of on every
// lookup. Neither the key, the secret nor the token is ever logged or returned.

const GOPLUS_TOKEN_TTL_MS = 55 * 60 * 1000;

let goPlusToken: { token: string; expiresAt: number } | undefined;
/** In-flight token request, so parallel lookups share a single authentication. */
let goPlusTokenPending: Promise<string> | undefined;

/** True when every GoPlus credential is present on this deployment. */
function goPlusConfigured(): string | undefined {
  const base = baseUrl('GOPLUS_API_URL');
  if (!base || !env('GOPLUS_APP_KEY') || !env('GOPLUS_APP_SECRET')) return undefined;
  return base;
}

/** Lowercase hex SHA-1 of `input`, computed with the Deno-native Web Crypto API. */
async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns a valid GoPlus access token, reusing the cached one while it lasts. */
async function goPlusAccessToken(base: string): Promise<string> {
  const now = Date.now();
  if (goPlusToken && goPlusToken.expiresAt > now) return goPlusToken.token;
  if (goPlusTokenPending) return await goPlusTokenPending;

  const appKey = env('GOPLUS_APP_KEY')!;
  const appSecret = env('GOPLUS_APP_SECRET')!;
  // The cache is updated *inside* the request, before the promise settles, so
  // every waiter — the caller that started the authentication and any lookup
  // that joined it — observes the same, already-consistent state.
  const pending = (async () => {
    try {
      const time = Math.floor(Date.now() / 1000);
      const sign = await sha1Hex(`${appKey}${time}${appSecret}`);
      const data = await fetchJson(`${base}/api/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_key: appKey, sign, time }),
      });
      const token = str(data?.result?.access_token, 512);
      if (!token) throw new Error('GoPlus did not return an access token');
      goPlusToken = { token, expiresAt: Date.now() + GOPLUS_TOKEN_TTL_MS };
      return token;
    } catch (err) {
      goPlusToken = undefined;
      throw err;
    } finally {
      goPlusTokenPending = undefined;
    }
  })();
  goPlusTokenPending = pending;
  return await pending;
}

/** Test seam: drops the cached token so a test starts from a clean state. */
export function resetGoPlusToken(): void {
  goPlusToken = undefined;
  goPlusTokenPending = undefined;
}

/**
 * Returns the North-American area code of `phone`, or undefined when the number
 * is not a US/NANP number.
 *
 * Accepted shapes (digits only, after normalisation): 10 digits, or 11 digits
 * starting with the `1` country code. Anything else — a Portuguese `+351`
 * number, for example — has no area code in this scheme.
 */
function usAreaCode(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return digits.slice(0, 3);
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  return undefined;
}

const PROVIDERS: Provider[] = [
  // ── IP ────────────────────────────────────────────────────────────────────
  {
    provider: 'AbuseIPDB',
    endpoint: 'ip/reputation',
    kinds: ['ip'],
    config: () => env('ABUSEIPDB_API_KEY'),
    run: async (value) => {
      const key = env('ABUSEIPDB_API_KEY')!;
      const data = await fetchJson(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(value)}&maxAgeInDays=90`,
        { headers: { Key: key } },
      );
      const d = data?.data ?? {};
      return clean({
        abuseConfidenceScore: num(d.abuseConfidenceScore),
        totalReports: num(d.totalReports),
        distinctReporters: num(d.numDistinctUsers),
        countryCode: str(d.countryCode),
        isp: str(d.isp),
        usageType: str(d.usageType),
        domain: str(d.domain),
        isTor: d.isTor === true ? true : undefined,
        isWhitelisted: d.isWhitelisted === true ? true : undefined,
        lastReportedAt: str(d.lastReportedAt),
      });
    },
  },
  {
    provider: 'IPinfo',
    endpoint: 'ip/geolocation-asn',
    kinds: ['ip'],
    config: () => env('IPINFO_API_KEY'),
    run: async (value) => {
      const key = env('IPINFO_API_KEY')!;
      const data = await fetchJson(`https://ipinfo.io/${encodeURIComponent(value)}/json`, {
        headers: { Authorization: 'Bearer ' + key },
      });
      return clean({
        city: str(data?.city),
        region: str(data?.region),
        country: str(data?.country),
        org: str(data?.org),
        asn: str(data?.asn?.asn ?? data?.asn),
        hostname: str(data?.hostname),
        privacy: data?.privacy ? clean(data.privacy) : undefined,
      });
    },
  },
  {
    provider: 'Abstract IP',
    endpoint: 'ip/intelligence',
    kinds: ['ip'],
    config: () => env('ABSTRACT_IP_API_KEY'),
    run: async (value) => {
      const key = env('ABSTRACT_IP_API_KEY')!;
      const data = await fetchJson(
        `https://ipgeolocation.abstractapi.com/v1/?api_key=${encodeURIComponent(key)}&ip_address=${encodeURIComponent(value)}`,
      );
      return clean({
        country: str(data?.country),
        city: str(data?.city),
        connectionType: str(data?.connection?.connection_type),
        organisation: str(data?.connection?.autonomous_system_organization),
        isVpn: data?.security?.is_vpn === true ? true : undefined,
      });
    },
  },

  // ── URL / domain ──────────────────────────────────────────────────────────
  {
    provider: 'VirusTotal',
    endpoint: 'url-domain-ip/reputation',
    kinds: ['url', 'domain', 'ip'],
    config: () => env('VIRUSTOTAL_API_KEY'),
    run: async (value) => {
      const key = env('VIRUSTOTAL_API_KEY')!;
      let path: string;
      if (/^https?:\/\//i.test(value)) {
        path = `urls/${virusTotalUrlId(value)}`;
      } else if (IPV4_RE.test(value) || value.includes(':')) {
        path = `ip_addresses/${encodeURIComponent(value)}`;
      } else {
        path = `domains/${encodeURIComponent(value)}`;
      }
      const data = await fetchJson(`https://www.virustotal.com/api/v3/${path}`, {
        headers: { 'x-apikey': key },
      });
      return vtStats(data?.data?.attributes);
    },
  },
  {
    provider: 'URLScan',
    endpoint: 'url-domain/scan-history',
    kinds: ['url', 'domain'],
    config: () => env('URLSCAN_API_KEY'),
    run: async (value) => {
      const key = env('URLSCAN_API_KEY')!;
      const host = /^https?:\/\//i.test(value) ? new URL(value).hostname : value;
      const data = await fetchJson(
        `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`page.domain:"${host}"`)}&size=5`,
        { headers: { 'API-Key': key } },
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      return clean({
        totalScans: num(data?.total),
        malicious: results.filter((r) => r?.verdicts?.overall?.malicious === true).length,
        recent: results.slice(0, 3).map((r) => clean({
          url: str(r?.page?.url),
          date: str(r?.task?.time),
          score: num(r?.verdicts?.overall?.score),
        })),
      });
    },
  },
  {
    provider: 'GoPlus',
    endpoint: 'url/phishing-site',
    kinds: ['url'],
    config: () => goPlusConfigured(),
    run: async (value) => {
      const base = goPlusConfigured()!;
      const token = await goPlusAccessToken(base);
      const data = await fetchJson(`${base}/api/v1/phishing_site?url=${encodeURIComponent(value)}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const r = data?.result ?? {};
      return clean({
        phishingSite: num(r.phishing_site),
        websiteContractSecurity: Array.isArray(r.website_contract_security)
          ? r.website_contract_security.length
          : undefined,
      });
    },
  },

  // ── E-mail ────────────────────────────────────────────────────────────────
  {
    provider: 'Abstract Email',
    endpoint: 'email/validation',
    kinds: ['email'],
    config: () => env('ABSTRACT_EMAIL_API_KEY'),
    run: async (value) => {
      const key = env('ABSTRACT_EMAIL_API_KEY')!;
      const data = await fetchJson(
        `https://emailvalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(value)}`,
      );
      return clean({
        deliverability: str(data?.deliverability),
        qualityScore: num(data?.quality_score),
        isDisposable: data?.is_disposable_email?.value,
        isFreeProvider: data?.is_free_email?.value,
        mxFound: data?.is_mx_found?.value,
        smtpValid: data?.is_smtp_valid?.value,
      });
    },
  },

  // ── Phone ─────────────────────────────────────────────────────────────────
  {
    provider: 'NumVerify',
    endpoint: 'phone/validation',
    kinds: ['phone'],
    config: () => env('NUMVERIFY_API_KEY'),
    run: async (value) => {
      const key = env('NUMVERIFY_API_KEY')!;
      const data = await fetchJson(
        `https://apilayer.net/api/validate?access_key=${encodeURIComponent(key)}&number=${encodeURIComponent(value)}`,
      );
      if (data?.success === false) throw new Error(str(data?.error?.info) ?? 'provider rejected the request');
      return clean({
        valid: data?.valid,
        countryName: str(data?.country_name),
        location: str(data?.location),
        carrier: str(data?.carrier),
        lineType: str(data?.line_type),
        internationalFormat: str(data?.international_format),
      });
    },
  },
  {
    provider: 'Abstract Phone',
    endpoint: 'phone/intelligence',
    kinds: ['phone'],
    config: () => env('ABSTRACT_PHONE_API_KEY'),
    run: async (value) => {
      const key = env('ABSTRACT_PHONE_API_KEY')!;
      const data = await fetchJson(
        `https://phonevalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(key)}&phone=${encodeURIComponent(value)}`,
      );
      return clean({
        valid: data?.valid,
        type: str(data?.type),
        carrier: str(data?.carrier),
        country: str(data?.country?.name),
        format: str(data?.format?.international),
      });
    },
  },
  {
    // ── Coverage warning ────────────────────────────────────────────────────
    // The FTC "Do Not Call" complaint database only contains complaints filed
    // by consumers in the UNITED STATES, about numbers with the +1 country
    // code. It has NO coverage whatsoever for Portugal or the rest of Europe:
    // a Portuguese number returns `{ applicable: false }` (an empty, expected
    // result — not an error). This source is only relevant for scams that run
    // on US telephone infrastructure.
    //
    // The API cannot be filtered by a complete phone number: only by area
    // code, state, city or date. The lookup therefore uses the area code, and
    // the result is an approximation — complaints from the same area, not
    // necessarily about this exact number. The report says so explicitly.
    provider: 'FTC DNC Complaints',
    endpoint: 'phone/us-robocall-complaints',
    kinds: ['phone'],
    config: () => env('DATA_GOV_API_KEY'),
    run: async (value) => {
      // api.ftc.gov is served by api.data.gov, which only accepts the key as
      // the `api_key` query parameter on this endpoint — hence the same
      // treatment as the other query-string providers: the upstream body is
      // never echoed, only the HTTP status, so the key cannot leak in a report.
      const key = env('DATA_GOV_API_KEY')!;
      const areaCode = usAreaCode(value);
      if (!areaCode) {
        return { applicable: false, reason: 'not a US (+1) number — FTC data does not cover it' };
      }
      const data = await fetchJson(
        `https://api.ftc.gov/v0/dnc-complaints?api_key=${encodeURIComponent(key)}&items_per_page=10&area_code=${encodeURIComponent(areaCode)}`,
      );
      const items: any[] = Array.isArray(data?.data) ? data.data : [];
      const rows = items.map((item) => item?.attributes ?? item ?? {});
      const robocalls = rows.filter((r: any) => {
        const flag = r?.['recorded-message-or-robocall'] ?? r?.recorded_message_or_robocall;
        return typeof flag === 'string' && /^(y|yes|true)$/i.test(flag.trim());
      }).length;
      const subjects: string[] = [];
      for (const row of rows) {
        const subject = str((row as any)?.subject ?? (row as any)?.['violation-type'], 80);
        if (subject && !subjects.includes(subject)) subjects.push(subject);
      }
      return clean({
        scope: `US area code ${areaCode} — complaints from the same area, not necessarily this exact number`,
        areaCode,
        complaintsInArea: num(data?.meta?.count) ?? rows.length,
        complaintsReturned: rows.length,
        robocallComplaints: robocalls,
        commonSubjects: subjects.length > 0 ? subjects.slice(0, 5) : undefined,
      });
    },
  },

  // ── IBAN / VAT ────────────────────────────────────────────────────────────
  {
    provider: 'OpenIBAN',
    endpoint: 'iban/validation',
    kinds: ['iban'],
    config: () => baseUrl('OPENIBAN_API_URL'),
    run: async (value) => {
      const base = baseUrl('OPENIBAN_API_URL')!;
      const data = await fetchJson(
        `${base}/validate/${encodeURIComponent(value)}?getBIC=true&validateBankCode=true`,
      );
      return clean({
        valid: data?.valid,
        bankName: str(data?.bankData?.name),
        bic: str(data?.bankData?.bic),
        checkResults: data?.checkResults ? clean(data.checkResults) : undefined,
      });
    },
  },
  {
    provider: 'Abstract IBAN',
    endpoint: 'iban/intelligence',
    kinds: ['iban'],
    config: () => env('ABSTRACT_IBAN_API_KEY'),
    run: async (value) => {
      const key = env('ABSTRACT_IBAN_API_KEY')!;
      const data = await fetchJson(
        `https://ibanvalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(key)}&iban=${encodeURIComponent(value)}`,
      );
      return clean({
        valid: data?.is_valid,
        country: str(data?.country),
        bankName: str(data?.bank?.name ?? data?.bank_name),
        bic: str(data?.bank?.bic ?? data?.bic),
      });
    },
  },
  {
    provider: 'Abstract VAT',
    endpoint: 'vat/validation',
    kinds: ['vat'],
    config: () => env('ABSTRACT_VAT_API_KEY'),
    run: async (value) => {
      const key = env('ABSTRACT_VAT_API_KEY')!;
      const data = await fetchJson(
        `https://vat.abstractapi.com/v1/validate?api_key=${encodeURIComponent(key)}&vat_number=${encodeURIComponent(value)}`,
      );
      return clean({
        valid: data?.valid,
        companyName: str(data?.company?.name),
        companyAddress: str(data?.company?.address),
        country: str(data?.country?.name),
      });
    },
  },

  // ── Crypto ────────────────────────────────────────────────────────────────
  {
    provider: 'Etherscan',
    endpoint: 'ethereum/address-activity',
    kinds: ['crypto_eth'],
    config: () => env('ETHERSCAN_API_KEY'),
    run: async (value) => {
      const key = env('ETHERSCAN_API_KEY')!;
      // Etherscan API V2: one multichain endpoint, the chain is selected with
      // `chainid` (1 = Ethereum mainnet). The V1 host-per-chain API is retired.
      const base = 'https://api.etherscan.io/v2/api?chainid=1';
      const balance = await fetchJson(
        `${base}&module=account&action=balance&address=${encodeURIComponent(value)}&tag=latest&apikey=${encodeURIComponent(key)}`,
      );
      if (balance?.status === '0' && balance?.message !== 'No transactions found') {
        throw new Error(str(balance?.result) ?? 'provider rejected the request');
      }
      const wei = num(balance?.result);
      const txs = await fetchJson(
        `${base}&module=account&action=txlist&address=${encodeURIComponent(value)}&page=1&offset=10&sort=desc&apikey=${encodeURIComponent(key)}`,
      ).catch(() => null);
      const list: any[] = Array.isArray(txs?.result) ? txs.result : [];
      return clean({
        balanceEth: typeof wei === 'number' ? Number((wei / 1e18).toFixed(6)) : undefined,
        recentTransactions: list.length,
        firstSeen: list.length > 0
          ? new Date(Number(list[list.length - 1]?.timeStamp) * 1000).toISOString()
          : undefined,
        lastSeen: list.length > 0
          ? new Date(Number(list[0]?.timeStamp) * 1000).toISOString()
          : undefined,
      });
    },
  },
  {
    provider: 'CryptoScamDB',
    endpoint: 'crypto/scam-database',
    kinds: ['crypto_eth', 'crypto_btc', 'domain', 'url'],
    config: () => baseUrl('CRYPTOSCAMDB_API_URL'),
    run: async (value) => {
      const base = baseUrl('CRYPTOSCAMDB_API_URL')!;
      const target = /^https?:\/\//i.test(value) ? new URL(value).hostname : value;
      const data = await fetchJson(`${base}/v1/check/${encodeURIComponent(target)}`);
      const result = data?.result ?? {};
      return clean({
        status: str(result.status),
        type: str(result.type),
        entries: Array.isArray(result.entries) ? result.entries.length : undefined,
        blocked: result.status === 'blocked' ? true : undefined,
      });
    },
  },
  {
    provider: 'GoPlus',
    endpoint: 'crypto/address-security',
    kinds: ['crypto_eth'],
    config: () => goPlusConfigured(),
    run: async (value) => {
      const base = goPlusConfigured()!;
      const token = await goPlusAccessToken(base);
      const data = await fetchJson(
        `${base}/api/v1/address_security/${encodeURIComponent(value)}?chain_id=1`,
        { headers: { Authorization: 'Bearer ' + token } },
      );
      const result = data?.result ?? {};
      const flags = Object.entries(result)
        .filter(([, v]) => v === '1')
        .map(([k]) => k)
        .slice(0, 10);
      return clean({
        maliciousFlags: flags.length > 0 ? flags : undefined,
        flaggedCount: flags.length,
      });
    },
  },
  {
    provider: 'CoinGecko',
    endpoint: 'crypto/token-market',
    kinds: ['crypto_eth'],
    config: () => env('COINGECKO_API_KEY'),
    run: async (value) => {
      const key = env('COINGECKO_API_KEY')!;
      // A wallet address is not a token; a 404 simply means "no listed token at
      // this contract", which is a real answer and not a failure.
      let data: any;
      try {
        data = await fetchJson(
          `https://api.coingecko.com/api/v3/coins/ethereum/contract/${encodeURIComponent(value)}`,
          { headers: { 'x-cg-demo-api-key': key } },
        );
      } catch (err) {
        if (err instanceof Error && err.message === 'HTTP 404') {
          return { listedToken: false };
        }
        throw err;
      }
      return clean({
        listedToken: true,
        name: str(data?.name),
        symbol: str(data?.symbol),
        marketCapRank: num(data?.market_cap_rank),
        priceUsd: num(data?.market_data?.current_price?.usd),
      });
    },
  },

  // ── Public places / businesses ────────────────────────────────────────────
  {
    // OpenStreetMap Nominatim: free, keyless public gazetteer. The usage policy
    // requires an identifying User-Agent, which is sent on every call. It
    // returns the public location of a place — never a private record — and it
    // frequently has no phone number, in which case nothing is invented here.
    provider: 'Nominatim',
    endpoint: 'place/public-search',
    kinds: ['place'],
    config: () => 'https://nominatim.openstreetmap.org',
    run: async (value) => {
      // `extratags` is what carries the contact details (phone, website,
      // opening hours); without it Nominatim answers with the location only,
      // so the answer could never contain a real contact.
      const data = await fetchJson(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=1`,
        { headers: { 'User-Agent': 'Valthoris-App/1.0 (contacto@valthoris.com)' } },
      );
      const first: any = Array.isArray(data) ? data[0] : undefined;
      if (!first) return { found: false };
      const lat = str(first?.lat, 32);
      const lon = str(first?.lon, 32);
      const tags = first?.extratags ?? {};
      return clean({
        found: true,
        name: str(first?.name) ?? str(first?.namedetails?.name) ?? str(first?.display_name, 200),
        address: str(first?.display_name, 200),
        category: str(first?.category ?? first?.class),
        type: str(first?.type),
        latitude: lat,
        longitude: lon,
        phone: str(tags?.phone ?? tags?.['contact:phone'] ?? tags?.['contact:mobile']),
        website: str(tags?.website ?? tags?.['contact:website'] ?? tags?.url, 200),
        email: str(tags?.email ?? tags?.['contact:email'], 200),
        openingHours: str(tags?.opening_hours, 200),
        link: placeMapLink(lat, lon),
      });
    },
  },

  // ── Current threat intelligence ───────────────────────────────────────────
  {
    provider: 'NewsData',
    endpoint: 'threat-intelligence/news',
    kinds: ['topic'],
    config: () => env('NEWSDATA_API_KEY'),
    run: async (value) => {
      const key = env('NEWSDATA_API_KEY')!;
      const data = await fetchJson(
        `https://newsdata.io/api/1/news?apikey=${encodeURIComponent(key)}&q=${encodeURIComponent(value)}&language=en,pt&category=technology`,
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) return { articles: 0 };
      return {
        articles: results.length,
        headlines: results.slice(0, 5).map((r) => clean({
          title: str(r?.title, 200),
          source: str(r?.source_id),
          publishedAt: str(r?.pubDate),
          link: str(r?.link, 300),
        })),
      };
    },
  },
];

/** Provider names that could serve `kind`, whether configured or not. */
export function providersFor(kind: IntelEntityKind): Provider[] {
  return PROVIDERS.filter((p) => p.kinds.includes(kind));
}

/**
 * Runs every provider that applies to `entity`, in parallel and independently.
 *
 * A provider never aborts the others: each one produces its own report, so a
 * partial outage degrades the analysis instead of failing it.
 */
export async function gatherIntelligence(entity: IntelEntity): Promise<SourceReport[]> {
  const value = normaliseEntity(entity.kind, entity.value);
  if (!isValidEntity(entity.kind, value)) return [];

  const selected = providersFor(entity.kind).slice(0, MAX_CONCURRENT);
  return await Promise.all(selected.map((provider) => runProvider(provider, entity.kind, value)));
}

async function runProvider(
  provider: Provider,
  _kind: IntelEntityKind,
  value: string,
): Promise<SourceReport> {
  const base: Omit<SourceReport, 'status'> = {
    provider: provider.provider,
    endpoint: provider.endpoint,
    entity: value,
    timestamp: new Date().toISOString(),
  };

  if (!provider.config()) {
    return { ...base, timestamp: new Date().toISOString(), status: 'not_configured' };
  }

  try {
    const data = await provider.run(value);
    return {
      ...base,
      timestamp: new Date().toISOString(),
      status: 'success',
      data: data ?? {},
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Provider name and reason only — never the key or the full URL.
    console.error(`[ai-chat] intel ${provider.provider} failed: ${message}`);
    return {
      ...base,
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: message.slice(0, 200),
    };
  }
}

/**
 * Renders the collected evidence as the grounding block handed to the model.
 *
 * Only what a provider actually returned appears here; unavailable providers
 * are listed explicitly so the model can state the limitation instead of
 * filling the gap with an assumption.
 */
export function formatEvidence(entity: IntelEntity, reports: SourceReport[]): string {
  const lines: string[] = [
    'VALTHORIS INTELLIGENCE EVIDENCE (real lookups performed for this turn):',
    `Entity analysed: ${entity.kind} = ${entity.value}`,
    `Collected at: ${new Date().toISOString()}`,
    '',
  ];

  const ok = reports.filter((r) => r.status === 'success');
  const failed = reports.filter((r) => r.status === 'failed');
  const missing = reports.filter((r) => r.status === 'not_configured');

  if (ok.length === 0) {
    lines.push('No external source returned data for this entity.');
  }
  for (const report of ok) {
    lines.push(`• ${report.provider} (${report.endpoint}) @ ${report.timestamp}`);
    lines.push(`  ${JSON.stringify(report.data ?? {})}`);
  }
  if (failed.length > 0) {
    lines.push('');
    lines.push('Sources that did not answer (state this as a limitation, do not guess):');
    for (const report of failed) {
      lines.push(`• ${report.provider}: ${report.error ?? 'unavailable'}`);
    }
  }
  if (missing.length > 0) {
    lines.push('');
    lines.push(
      `Sources not available on this deployment: ${missing.map((r) => r.provider).join(', ')}.`,
    );
  }

  lines.push('');
  lines.push(
    'Base the verdict only on the evidence above and on general security knowledge. ' +
      'Never claim a source was consulted if it is not listed as returning data.',
  );
  return lines.join('\n');
}
