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
 *   NEWSDATA_API_KEY, DATA_GOV_API_KEY,
 *   GEMINI_API_KEY (+ GEMINI_SEARCH_MODEL) — Google Search through Gemini,
 *   BRAVE_SEARCH_API_KEY, TAVILY_API_KEY, SERPER_API_KEY (web search, optional)
 *
 * The primary web search is Google's own, reached through the Gemini key the
 * deployment already has: it is a contracted API, so it does not depend on a
 * public endpoint tolerating a datacentre address. Four more providers need no
 * credential at all and run alongside it: OpenStreetMap Nominatim and Photon
 * (public gazetteers, queried with the User-Agent their usage policy requires),
 * DuckDuckGo (its no-JavaScript result page) and Wikipedia. The commercial
 * search APIs above are used in addition whenever their key is configured.
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
  | 'topic'
  /** Free-text question answered by a real public web search. */
  | 'web';

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
  /**
   * `disabled` marks a provider that is deliberately switched off on every
   * deployment (a retired upstream service). It is never queried and never
   * reported as a silent failure.
   */
  status: 'success' | 'failed' | 'not_configured' | 'disabled';
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
    case 'web':
      return value.trim().length > 2 && value.length <= 300;
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
    case 'web':
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

/**
 * Turns an HTTP status into the real, actionable reason a lookup failed.
 *
 * The generic "the assistant cannot answer right now" message hides exactly
 * what an operator needs: 401 (credential rejected) and 429 (quota) look the
 * same to a user but require opposite fixes. The upstream body is never echoed
 * — for the query-string providers it can contain the key — so the diagnosis is
 * derived from the status alone.
 */
export function describeHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return `HTTP 400 — the provider rejected the request format (wrong parameters)`;
    case 401:
      return `HTTP 401 — the provider rejected the credential (invalid, revoked or wrong header)`;
    case 403:
      return `HTTP 403 — access denied by the provider (plan, permission or blocked client)`;
    case 404:
      return `HTTP 404 — endpoint not found (upstream URL changed or was retired)`;
    case 422:
      return `HTTP 422 — the provider could not process this entity`;
    case 429:
      return `HTTP 429 — rate limit or quota exhausted at the provider`;
    default:
      if (status >= 500) return `HTTP ${status} — provider-side failure`;
      return `HTTP ${status}`;
  }
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
      // string for some providers), so only the status is surfaced — but it is
      // surfaced with the diagnosis that status actually carries.
      throw new HttpStatusError(res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`timed out after ${TIMEOUT_MS} ms (provider slow or unreachable)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** A non-2xx answer from a provider, carrying the status for the caller. */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(describeHttpStatus(status));
    this.status = status;
  }
}

/**
 * GET/POST returning the raw body, for the sources that answer with HTML.
 *
 * A search engine without an API answers with a page, not with JSON; refusing
 * to read it would mean having no keyless web search at all.
 */
async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', ...(options.headers ?? {}) },
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new HttpStatusError(res.status);
    // A search page is large and only the first results are used: reading it
    // whole would spend the function's memory on markup nobody looks at.
    return (await res.text()).slice(0, 400_000);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`timed out after ${TIMEOUT_MS} ms (provider slow or unreachable)`);
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

// ─── Public web search ───────────────────────────────────────────────────────
//
// The assistant must be able to look something up on the open web — any
// subject, not only a security artefact — instead of answering from the
// language model's memory. Two of the engines below need no credential at all,
// so a deployment with no extra secret still searches for real; the commercial
// APIs are used first when their key is present, because they answer with a
// cleaner result set.

/** One public page returned by a search engine. */
export interface WebResult {
  title: string;
  url: string;
  snippet?: string;
  /** Publication date, when the engine reports one. */
  published?: string;
}

/** Minimal HTML-entity decoding, enough for a search result title. */
function decodeEntities(text: string): string {
  return text
    .replace(/&(#\d{1,6}|#x[0-9a-fA-F]{1,5}|[a-zA-Z]{2,8});/g, (match, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        const point = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      if (code.startsWith('#')) {
        const point = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        hellip: '…',
        mdash: '—',
        ndash: '–',
        rsquo: '’',
        lsquo: '‘',
        ldquo: '“',
        rdquo: '”',
        euro: '€',
        deg: '°',
      };
      if (named[code]) return named[code];
      // The accented letters a Portuguese page is full of (&iacute;, &ccedil;,
      // &atilde;) are composed from the letter and the accent they name, so a
      // title comes out readable instead of littered with entity codes.
      const accents: Record<string, string> = {
        acute: '\u0301',
        grave: '\u0300',
        circ: '\u0302',
        tilde: '\u0303',
        uml: '\u0308',
        ring: '\u030a',
        cedil: '\u0327',
      };
      const letter = /^([A-Za-z])(acute|grave|circ|tilde|uml|ring|cedil)$/.exec(code);
      if (letter) return (letter[1] + accents[letter[2]]).normalize('NFC');
      return match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text of an HTML fragment: markup is removed, never executed. */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '));
}

/**
 * Accepts a result URL only when it is a public http(s) address.
 *
 * The link is shown to the user and handed to the model, so a `javascript:`
 * href or an address inside the deployment must never survive parsing.
 */
function safeResultUrl(raw: string): string | undefined {
  const value = decodeEntities(raw);
  // DuckDuckGo wraps every result in its own redirect: the real target is the
  // `uddg` parameter, and it is what must be reported as the source.
  try {
    const parsed = new URL(value, 'https://duckduckgo.com');
    const wrapped = parsed.searchParams.get('uddg');
    const target = wrapped ? new URL(wrapped) : parsed;
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return undefined;
    if (!isPublicHost(target.hostname)) return undefined;
    return target.href.slice(0, 400);
  } catch {
    return undefined;
  }
}

/** Drops duplicate pages and caps how many results a source reports. */
function dedupeResults(results: WebResult[], max = 6): WebResult[] {
  const seen = new Set<string>();
  const out: WebResult[] = [];
  for (const result of results) {
    if (!result.url || !result.title) continue;
    const key = result.url.replace(/[#?].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: result.title.slice(0, 200),
      url: result.url,
      ...(result.snippet ? { snippet: result.snippet.slice(0, 400) } : {}),
      ...(result.published ? { published: result.published.slice(0, 40) } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Browser-shaped identification: a search page refuses an anonymous client. */
const WEB_SEARCH_USER_AGENT =
  'Mozilla/5.0 (compatible; Valthoris-App/1.0; +https://valthoris.com)';

/** DuckDuckGo's no-JavaScript result page: keyless, and stable for years. */
const DUCKDUCKGO_ENDPOINT = 'https://html.duckduckgo.com/html/';

/**
 * The normalised payload every web-search source reports.
 *
 * `results` is what the user sees under "Fontes" and what the model is allowed
 * to quote; `answer` and `place` only exist when the engine itself returned
 * them. A search that found nothing says so — it never returns an empty shape
 * that reads like a result.
 */
function webSearchResult(
  results: WebResult[],
  answer?: string,
  place?: Record<string, unknown>,
): Record<string, unknown> {
  if (results.length === 0 && !answer && (!place || Object.keys(place).length === 0)) {
    return { found: false, results: 0 };
  }
  return clean({
    found: true,
    results: results.length,
    ...(answer ? { answer } : {}),
    ...(place && Object.keys(place).length > 0 ? place : {}),
    pages: results,
  });
}

/**
 * DuckDuckGo's no-JavaScript endpoint, parsed into results.
 *
 * It needs no key and no account, which is what makes a real web search
 * available to every deployment. The HTML is only ever read: tags are stripped,
 * and each link is validated before it is reported.
 */
export function parseDuckDuckGoHtml(html: string): WebResult[] {
  const results: WebResult[] = [];
  // The lite and html endpoints differ only in the class name of the anchor.
  const anchor = /<a[^>]+class="[^"]*result(?:__a|-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippet = /<(?:a|td)[^>]+class="[^"]*result(?:__snippet|-snippet)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td)>/gi;
  const snippets: string[] = [];
  for (const match of html.matchAll(snippet)) snippets.push(stripTags(match[1]));
  let index = 0;
  for (const match of html.matchAll(anchor)) {
    const url = safeResultUrl(match[1]);
    const title = stripTags(match[2]);
    if (url && title.length > 0) {
      results.push({ title, url, ...(snippets[index] ? { snippet: snippets[index] } : {}) });
    }
    index += 1;
    if (results.length >= 8) break;
  }
  return dedupeResults(results);
}

/** DuckDuckGo's Instant Answer API: a definition, when it has one. */
async function duckDuckGoInstantAnswer(query: string): Promise<WebResult[]> {
  const data = await fetchJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1&t=valthoris`,
    { headers: { 'User-Agent': WEB_SEARCH_USER_AGENT } },
  );
  const results: WebResult[] = [];
  const abstract = str(data?.AbstractText, 400);
  const abstractUrl = typeof data?.AbstractURL === 'string' ? safeResultUrl(data.AbstractURL) : undefined;
  if (abstract && abstractUrl) {
    results.push({
      title: str(data?.Heading, 200) ?? query,
      url: abstractUrl,
      snippet: abstract,
    });
  }
  const related: any[] = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of related) {
    const url = typeof topic?.FirstURL === 'string' ? safeResultUrl(topic.FirstURL) : undefined;
    const text = str(topic?.Text, 300);
    if (url && text) results.push({ title: text.slice(0, 120), url, snippet: text });
  }
  return dedupeResults(results);
}

/** Language editions searched by the keyless encyclopedia source. */
const WIKIPEDIA_LANGS = ['pt', 'en'];

/**
 * Wikipedia, searched for real (not recalled).
 *
 * It is keyless, it answers about virtually any subject, and every fact it
 * gives comes with the article it came from — which is exactly the property a
 * verifiable answer needs.
 */
async function wikipediaSearch(query: string): Promise<WebResult[]> {
  const results: WebResult[] = [];
  for (const lang of WIKIPEDIA_LANGS) {
    try {
      const data = await fetchJson(
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': WEB_SEARCH_USER_AGENT } },
      );
      const hits: any[] = Array.isArray(data?.query?.search) ? data.query.search : [];
      for (const hit of hits) {
        const title = str(hit?.title, 200);
        if (!title) continue;
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        results.push({
          title,
          url,
          ...(hit?.snippet ? { snippet: stripTags(String(hit.snippet)) } : {}),
        });
      }
    } catch {
      // One language edition failing must not lose the other one.
    }
    if (results.length >= 3) break;
  }
  return dedupeResults(results, 4);
}

/**
 * Google Search through Gemini — the search that does not depend on scraping.
 *
 * Every keyless engine wired above is a public endpoint that may throttle a
 * datacentre address, and the answer then silently narrows to whatever is left.
 * Gemini's `google_search` tool is a contracted API served against the key the
 * deployment already has, so it is the source that makes the web search
 * *stable*: it runs before the answer is written, its result is evidence like
 * any other, and the pages it consulted are reported with their links.
 */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Models tried, in order, for a search call. */
const GEMINI_SEARCH_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/**
 * The model names to try for a search.
 *
 * `GEMINI_SEARCH_MODEL` overrides `GEMINI_MODEL` for search only, so an
 * operator whose main model does not serve the tool can point the search at one
 * that does without changing the model that writes the answers.
 */
export function geminiSearchModels(): string[] {
  const chain: string[] = [];
  for (const name of [env('GEMINI_SEARCH_MODEL'), env('GEMINI_MODEL')]) {
    if (!name) continue;
    const cleaned = name.replace(/^\/+|\/+$/g, '').replace(/^models\//, '').trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleaned) && !chain.includes(cleaned)) chain.push(cleaned);
  }
  for (const fallback of GEMINI_SEARCH_FALLBACK_MODELS) {
    if (!chain.includes(fallback)) chain.push(fallback);
  }
  return chain;
}

/** The instruction the search model receives: find, do not recall. */
const GEMINI_SEARCH_INSTRUCTION =
  'Pesquisa AGORA na Web com a ferramenta de pesquisa e responde apenas com o que as ' +
  'páginas encontradas dizem. Para locais ou empresas indica morada completa, telefone, ' +
  'site oficial e horário quando existirem. Se a pesquisa não encontrar o assunto, ' +
  'responde exatamente "SEM RESULTADOS". Nunca respondas de memória. Pergunta: ';

/**
 * Reads Gemini's grounding metadata into result pages.
 *
 * Only chunks that carry a real, public URL are reported: an answer with no
 * grounding chunks consulted no page and must not be presented as a search.
 */
export function geminiGroundingResults(data: any): WebResult[] {
  const candidate = data?.candidates?.[0];
  const chunks: any[] = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
    ? candidate.groundingMetadata.groundingChunks
    : [];
  const results: WebResult[] = [];
  for (const chunk of chunks) {
    const raw = chunk?.web?.uri;
    if (typeof raw !== 'string') continue;
    const url = safeResultUrl(raw);
    if (!url) continue;
    const title = str(chunk?.web?.title, 200) ?? str(chunk?.web?.domain, 200);
    if (!title) continue;
    results.push({ title, url });
  }
  return dedupeResults(results, 8);
}

/** The text of a Gemini candidate, concatenated across its parts. */
export function geminiAnswerText(data: any): string {
  const parts: any[] = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts
    : [];
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
}

async function geminiWebSearch(query: string): Promise<{ results: WebResult[]; answer?: string }> {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  let lastError: Error | undefined;
  for (const model of geminiSearchModels()) {
    try {
      const data = await fetchJson(
        `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: GEMINI_SEARCH_INSTRUCTION + query }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0, maxOutputTokens: 600 },
          }),
        },
      );
      const results = geminiGroundingResults(data);
      const text = geminiAnswerText(data);
      const answer = /^SEM RESULTADOS/i.test(text) ? undefined : str(text, 900);
      return { results, ...(answer ? { answer } : {}) };
    } catch (err) {
      // A model that does not exist for this key, or does not serve the search
      // tool, answers 404/400: try the next name before giving up, so a single
      // misconfigured `GEMINI_MODEL` never costs the deployment its search.
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Gemini search failed');
}


const COORD_RE = /^-?\d{1,3}(?:\.\d{1,10})?$/;

/**
 * Nominatim usage policy, implemented instead of merely documented.
 *
 * The public OpenStreetMap geocoder allows *one* request per second for the
 * whole application and requires a User-Agent (or Referer) that identifies the
 * caller; a generic HTTP-client User-Agent and bursts of parallel requests are
 * answered with HTTP 403 "Usage limit reached" and the block lifts on its own
 * after a while — precisely the intermittent failure observed in production.
 *
 * Three things keep Valthoris inside the policy:
 *   • `NOMINATIM_USER_AGENT` identifies the app and a contact address;
 *   • `nominatimThrottle()` serialises every call with at least one second
 *     between them, even when several users ask at the same time;
 *   • `nominatimCache` answers a repeated search from memory for 24 h, so the
 *     same question does not spend a request at all.
 */
export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
export const NOMINATIM_USER_AGENT =
  'Valthoris-App/1.0 (https://valthoris.com; contacto@valthoris.com)';
export const NOMINATIM_REFERER = 'https://valthoris.com';
const NOMINATIM_MIN_INTERVAL_MS = 1_000;
const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const NOMINATIM_CACHE_MAX_ENTRIES = 200;

/**
 * Photon (Komoot) — a second keyless geocoder over the same OpenStreetMap data.
 *
 * Nominatim answers a strict gazetteer lookup; Photon answers a fuzzy one, so
 * a business whose name is spelled slightly differently is still found instead
 * of being declared non-existent.
 */
export const PHOTON_BASE_URL = 'https://photon.komoot.io';
const PHOTON_LANG = 'default';

/** The postal address of a Photon feature, assembled from its own fields. */
function photonAddress(properties: any): string | undefined {
  const parts = [
    [properties?.name, properties?.street && properties?.name !== properties?.street ? properties?.street : undefined]
      .filter(Boolean)
      .join(', '),
    properties?.housenumber,
    properties?.postcode,
    properties?.city ?? properties?.district,
    properties?.county,
    properties?.state,
    properties?.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);
  const address = [...new Set(parts)].join(', ');
  return address.length > 0 ? address : undefined;
}

/** Tail of the request queue: every call chains onto the previous one. */
let nominatimQueue: Promise<void> = Promise.resolve();
let nominatimLastCall = 0;

const nominatimCache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `task` no sooner than one second after the previous Nominatim call.
 *
 * The queue is a single promise chain, so concurrent turns are serialised
 * rather than racing: two users asking at the same instant produce two requests
 * one second apart instead of a burst the policy forbids.
 */
export function nominatimThrottle<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = nominatimQueue.then(async () => {
    const wait = nominatimLastCall + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    nominatimLastCall = Date.now();
    return await task();
  });
  // The queue must keep flowing even when this task fails.
  nominatimQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

/** Test seam: forgets the cached searches and the throttle timestamp. */
export function resetNominatimState(): void {
  nominatimCache.clear();
  nominatimQueue = Promise.resolve();
  nominatimLastCall = 0;
}

function nominatimCached(query: string): Record<string, unknown> | undefined {
  const hit = nominatimCache.get(query);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    nominatimCache.delete(query);
    return undefined;
  }
  return hit.value;
}

function nominatimStore(query: string, value: Record<string, unknown>): void {
  if (nominatimCache.size >= NOMINATIM_CACHE_MAX_ENTRIES) {
    const oldest = nominatimCache.keys().next();
    if (!oldest.done) nominatimCache.delete(oldest.value);
  }
  nominatimCache.set(query, { expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS, value });
}

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

/**
 * OSM categories that describe street furniture rather than the place asked
 * about. "Hospital de Setúbal" used to be answered with a *bus stop* named
 * "Hospital", because the first Nominatim hit wins by relevance alone: a stop,
 * a road or an administrative boundary matches the word without being the
 * establishment. They are still usable when nothing better exists, but they
 * never outrank a real building or business.
 */
const WEAK_PLACE_CATEGORIES = new Set([
  'highway',
  'railway',
  'waterway',
  'boundary',
  'landuse',
  'route',
  'barrier',
  'man_made',
]);

/** Categories that really are a place someone can visit. */
const STRONG_PLACE_CATEGORIES = new Set([
  'amenity',
  'shop',
  'tourism',
  'healthcare',
  'office',
  'leisure',
  'craft',
  'building',
  'historic',
  'club',
  'emergency',
]);

/** Words that carry no distinguishing power when matching a candidate name. */
const PLACE_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os',
  'the', 'of', 'in', 'at', 'and', 'e',
]);

/** Lowercased, accent-free tokens of a name, for comparison. */
function placeTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !PLACE_STOPWORDS.has(token));
}

/**
 * Scores one Nominatim candidate against the query.
 *
 * What is rewarded is being the *kind* of thing a person asks about (a shop, a
 * hospital, an office) and carrying the words the person typed; what is
 * penalised is a bus stop or a road that merely shares a word. Nothing here
 * invents data: it only chooses which of the provider's own answers is
 * reported.
 */
export function scorePlaceCandidate(candidate: any, query: string): number {
  const category = String(candidate?.category ?? candidate?.class ?? '');
  const type = String(candidate?.type ?? '');
  let score = 0;
  if (STRONG_PLACE_CATEGORIES.has(category)) score += 6;
  if (WEAK_PLACE_CATEGORIES.has(category)) score -= 6;
  if (type === 'bus_stop' || type === 'stop_position' || type === 'platform') score -= 4;

  const wanted = placeTokens(query);
  const name = String(candidate?.name ?? candidate?.namedetails?.name ?? '');
  const nameTokens = new Set(placeTokens(name));
  const addressTokens = new Set(placeTokens(String(candidate?.display_name ?? '')));
  for (const token of wanted) {
    if (nameTokens.has(token)) score += 3;
    else if (addressTokens.has(token)) score += 1;
  }
  const importance = Number(candidate?.importance);
  if (Number.isFinite(importance)) score += importance * 2;
  const tags = candidate?.extratags ?? {};
  if (tags?.phone || tags?.['contact:phone'] || tags?.website || tags?.['contact:website']) score += 2;
  return score;
}

/** The best of the candidates the geocoder returned, or nothing at all. */
export function pickPlaceCandidate(candidates: any[], query: string): any | undefined {
  let best: any | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scorePlaceCandidate(candidate, query);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Simplified forms of a place query, tried in order until one is found.
 *
 * Nominatim searches a gazetteer: "Óptica Havaneza em Évora" finds nothing
 * while "Óptica Havaneza, Évora" and then "Havaneza, Évora" do. Reformulating
 * the same question is what a person would do, and it is the difference
 * between an answer and "não encontrado".
 */
export function placeQueryVariants(query: string): string[] {
  const variants: string[] = [];
  const push = (value: string) => {
    const cleaned = value.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    if (cleaned.length > 2 && !variants.includes(cleaned)) variants.push(cleaned);
  };
  push(query);
  // "X em Y" is a location, and the gazetteer understands it as "X, Y".
  push(query.replace(/\s+(?:em|no|na|nos|nas|in|at)\s+/gi, ', '));
  const commaForm = query.replace(/\s+(?:em|no|na|nos|nas|in|at)\s+/gi, ', ');
  const words = commaForm.split(' ');
  // Drop the leading generic word ("Restaurante", "Óptica") — the proper name
  // plus the town is usually what the gazetteer indexes.
  if (words.length > 2) push(words.slice(1).join(' '));
  return variants.slice(0, 3);
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
  /**
   * Set when the upstream service is retired or otherwise switched off for
   * every deployment. A disabled provider is never called; the reason is shown
   * instead of a silent failure that looks like a missing credential.
   */
  disabled?: string;
  /**
   * A harmless, well-known value used by the health check to prove the provider
   * really answers. It is never a user value.
   */
  probeValue: string;
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
    probeValue: '8.8.8.8',
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
    probeValue: '8.8.8.8',
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
    probeValue: '8.8.8.8',
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
    probeValue: 'example.com',
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
    probeValue: 'example.com',
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
    probeValue: 'https://example.com',
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
    probeValue: 'security@valthoris.com',
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
    probeValue: '+351210000000',
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
    probeValue: '+351210000000',
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
    probeValue: '+12025550123',
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
    probeValue: 'DE89370400440532013000',
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
    probeValue: 'DE89370400440532013000',
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
    probeValue: 'PT501442600',
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
    probeValue: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
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
    // ── Retired upstream service ────────────────────────────────────────────
    // The public CryptoScamDB API (`/v1/check/…`) answers HTTP 404 for every
    // lookup: the project is no longer maintained and the endpoint is gone.
    // Leaving it enabled produced a permanent "failed" source on every crypto
    // and domain analysis, which read like a Valthoris outage. It is therefore
    // switched off explicitly and reported as `disabled`, with the reason, and
    // the entities it used to cover are still served by VirusTotal, URLScan and
    // GoPlus. Re-enable it by removing `disabled` once a replacement
    // (Chainabuse or ScamSniffer, both key-based) is contracted and wired here.
    provider: 'CryptoScamDB',
    endpoint: 'crypto/scam-database',
    kinds: ['crypto_eth', 'crypto_btc', 'domain', 'url'],
    probeValue: 'example.com',
    disabled:
      'CryptoScamDB was discontinued: the public API answers HTTP 404. ' +
      'Coverage is provided by VirusTotal, URLScan and GoPlus until a ' +
      'replacement (Chainabuse / ScamSniffer) is configured.',
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
    probeValue: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
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
    probeValue: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
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
        if (err instanceof HttpStatusError && err.status === 404) {
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
    probeValue: 'Lisboa',
    config: () => NOMINATIM_BASE_URL,
    run: async (value) => {
      const query = value.toLowerCase();
      const cached = nominatimCached(query);
      if (cached) return cached;

      // `extratags` is what carries the contact details (phone, website,
      // opening hours); without it Nominatim answers with the location only,
      // so the answer could never contain a real contact.
      let first: any | undefined;
      for (const variant of placeQueryVariants(value)) {
        const data = await nominatimThrottle(() =>
          fetchJson(
            `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(variant)}&format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=5`,
            {
              headers: {
                'User-Agent': NOMINATIM_USER_AGENT,
                Referer: NOMINATIM_REFERER,
                'Accept-Language': 'pt,en',
              },
            },
          )
        );
        const candidates: any[] = Array.isArray(data) ? data : [];
        first = pickPlaceCandidate(candidates, value);
        if (first) break;
      }
      if (!first) {
        const empty = { found: false };
        nominatimStore(query, empty);
        return empty;
      }
      const lat = str(first?.lat, 32);
      const lon = str(first?.lon, 32);
      const tags = first?.extratags ?? {};
      const result = clean({
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
      nominatimStore(query, result);
      return result;
    },
  },

  {
    // Photon (Komoot): a second keyless geocoder, built on the same
    // OpenStreetMap data but with a different search engine behind it. It finds
    // businesses Nominatim's strict gazetteer misses, so a place is not
    // declared "not found" on the word of a single index.
    provider: 'Photon',
    endpoint: 'place/geocode',
    kinds: ['place'],
    probeValue: 'Lisboa',
    config: () => PHOTON_BASE_URL,
    run: async (value) => {
      let feature: any | undefined;
      for (const variant of placeQueryVariants(value)) {
        const data = await fetchJson(
          `${PHOTON_BASE_URL}/api/?q=${encodeURIComponent(variant)}&limit=5&lang=${PHOTON_LANG}`,
          { headers: { 'User-Agent': NOMINATIM_USER_AGENT } },
        );
        const features: any[] = Array.isArray(data?.features) ? data.features : [];
        feature = pickPlaceCandidate(
          features.map((f) => ({
            ...f?.properties,
            category: f?.properties?.osm_key,
            type: f?.properties?.osm_value,
            display_name: photonAddress(f?.properties),
            coordinates: f?.geometry?.coordinates,
          })),
          value,
        );
        if (feature) break;
      }
      if (!feature) return { found: false };
      const coordinates: any[] = Array.isArray(feature.coordinates) ? feature.coordinates : [];
      const lon = str(coordinates[0] !== undefined ? String(coordinates[0]) : undefined, 32);
      const lat = str(coordinates[1] !== undefined ? String(coordinates[1]) : undefined, 32);
      return clean({
        found: true,
        name: str(feature?.name) ?? str(photonAddress(feature), 200),
        address: str(photonAddress(feature), 200),
        category: str(feature?.category),
        type: str(feature?.type),
        latitude: lat,
        longitude: lon,
        link: placeMapLink(lat, lon),
      });
    },
  },

  // ── Public web search (any subject) ───────────────────────────────────────
  {
    // Google Search, served through the Gemini key the deployment already has.
    // It is listed first because it is the only search here that is a
    // contracted API rather than a public endpoint that may throttle us.
    provider: 'Google Search (Gemini)',
    endpoint: 'web/search',
    kinds: ['web', 'topic'],
    probeValue: 'openstreetmap',
    config: () => env('GEMINI_API_KEY'),
    run: async (value) => {
      const { results, answer } = await geminiWebSearch(value);
      return webSearchResult(results, answer);
    },
  },
  {
    // Brave Search API — used when a key is configured, because it returns the
    // cleanest, freshest result set of the engines wired here.
    provider: 'Brave Search',
    endpoint: 'web/search',
    kinds: ['web', 'topic'],
    probeValue: 'openstreetmap',
    config: () => env('BRAVE_SEARCH_API_KEY'),
    run: async (value) => {
      const key = env('BRAVE_SEARCH_API_KEY')!;
      const data = await fetchJson(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(value)}&count=6`,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': key } },
      );
      const rows: any[] = Array.isArray(data?.web?.results) ? data.web.results : [];
      const results = dedupeResults(
        rows.flatMap((row) => {
          const url = typeof row?.url === 'string' ? safeResultUrl(row.url) : undefined;
          const title = str(row?.title, 200);
          if (!url || !title) return [];
          return [{
            title,
            url,
            ...(row?.description ? { snippet: stripTags(String(row.description)) } : {}),
            ...(row?.page_age ? { published: str(row.page_age, 40) } : {}),
          }];
        }),
      );
      return webSearchResult(results);
    },
  },
  {
    // Tavily — a search API built for AI answers; optional, key-based.
    provider: 'Tavily',
    endpoint: 'web/search',
    kinds: ['web', 'topic'],
    probeValue: 'openstreetmap',
    config: () => env('TAVILY_API_KEY'),
    run: async (value) => {
      const key = env('TAVILY_API_KEY')!;
      const data = await fetchJson('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ query: value, max_results: 6, search_depth: 'basic' }),
      });
      const rows: any[] = Array.isArray(data?.results) ? data.results : [];
      const results = dedupeResults(
        rows.flatMap((row) => {
          const url = typeof row?.url === 'string' ? safeResultUrl(row.url) : undefined;
          const title = str(row?.title, 200);
          if (!url || !title) return [];
          return [{ title, url, ...(row?.content ? { snippet: stripTags(String(row.content)) } : {}) }];
        }),
      );
      return webSearchResult(results, str(data?.answer, 400));
    },
  },
  {
    // Serper (Google Search API) — optional, key-based.
    provider: 'Serper (Google)',
    endpoint: 'web/search',
    kinds: ['web', 'topic'],
    probeValue: 'openstreetmap',
    config: () => env('SERPER_API_KEY'),
    run: async (value) => {
      const key = env('SERPER_API_KEY')!;
      const data = await fetchJson('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q: value, num: 6, hl: 'pt' }),
      });
      const rows: any[] = Array.isArray(data?.organic) ? data.organic : [];
      const results = dedupeResults(
        rows.flatMap((row) => {
          const url = typeof row?.link === 'string' ? safeResultUrl(row.link) : undefined;
          const title = str(row?.title, 200);
          if (!url || !title) return [];
          return [{
            title,
            url,
            ...(row?.snippet ? { snippet: stripTags(String(row.snippet)) } : {}),
            ...(row?.date ? { published: str(row.date, 40) } : {}),
          }];
        }),
      );
      const knowledge = data?.knowledgeGraph;
      return webSearchResult(
        results,
        str(data?.answerBox?.answer ?? data?.answerBox?.snippet, 400),
        clean({
          title: str(knowledge?.title, 200),
          phone: str(knowledge?.attributes?.Phone ?? knowledge?.phoneNumber),
          website: str(knowledge?.website, 200),
          address: str(knowledge?.address, 200),
        }),
      );
    },
  },
  {
    // DuckDuckGo — no key, no account, no quota to configure: this is the
    // source that guarantees every deployment really searches the web.
    provider: 'DuckDuckGo',
    endpoint: 'web/search',
    kinds: ['web', 'topic'],
    probeValue: 'openstreetmap',
    config: () => DUCKDUCKGO_ENDPOINT,
    run: async (value) => {
      let results: WebResult[] = [];
      try {
        const html = await fetchText(DUCKDUCKGO_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': WEB_SEARCH_USER_AGENT,
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
          },
          body: `q=${encodeURIComponent(value)}&kl=pt-pt`,
        });
        results = parseDuckDuckGoHtml(html);
      } catch (err) {
        // The HTML endpoint throttles datacentre addresses; the Instant Answer
        // API is the documented, stable fallback and needs no key either.
        console.warn('[ai-chat] duckduckgo html search unavailable:', String(err).slice(0, 200));
      }
      if (results.length === 0) results = await duckDuckGoInstantAnswer(value);
      return webSearchResult(results);
    },
  },
  {
    // Wikipedia — keyless, encyclopaedic and always attributable. It is what
    // lets a general question ("o que aconteceu em…", "quem foi…") be answered
    // from a source instead of from the model's memory.
    provider: 'Wikipedia',
    endpoint: 'web/encyclopedia',
    kinds: ['web', 'topic'],
    probeValue: 'Lisboa',
    config: () => 'https://wikipedia.org',
    run: async (value) => webSearchResult(await wikipediaSearch(value)),
  },

  // ── Current threat intelligence ───────────────────────────────────────────
  {
    provider: 'NewsData',
    endpoint: 'threat-intelligence/news',
    kinds: ['topic'],
    probeValue: 'phishing',
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

/**
 * Runs the lookups for several entities at once — for instance the gazetteer
 * for a place *and* a web search for its contact details.
 *
 * The reports are merged, and a provider that would answer twice for the same
 * value is only queried once, so the "Fontes" list never shows a duplicate.
 */
export async function gatherAllIntelligence(entities: IntelEntity[]): Promise<SourceReport[]> {
  const batches = await Promise.all(entities.map((entity) => gatherIntelligence(entity)));
  const seen = new Set<string>();
  const merged: SourceReport[] = [];
  for (const report of batches.flat()) {
    const key = `${sourceId(report.provider, report.endpoint)}|${report.entity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(report);
  }
  return merged;
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

  if (provider.disabled) {
    return {
      ...base,
      timestamp: new Date().toISOString(),
      status: 'disabled',
      error: provider.disabled,
    };
  }

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
    // The user still sees a generic message, but the operator must be able to
    // tell a revoked key (401) from a quota (429) from a dead endpoint (404)
    // long after the turn is over.
    reportFailure({
      provider: provider.provider,
      endpoint: provider.endpoint,
      status: err instanceof HttpStatusError ? err.status : undefined,
      message: message.slice(0, 400),
    });
    return {
      ...base,
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: message.slice(0, 200),
    };
  }
}

// ─── Failure sink ────────────────────────────────────────────────────────────

/** A provider failure, as handed to whoever is recording them. */
export interface IntelFailure {
  provider: string;
  endpoint: string;
  /** HTTP status, when the failure was an HTTP answer. */
  status?: number;
  message: string;
}

let failureSink: ((failure: IntelFailure) => void) | undefined;

/**
 * Registers where provider failures are recorded (the `governance.error_logs`
 * writer in production, a collector in the tests).
 *
 * Recording is deliberately fire-and-forget: an intelligence lookup must never
 * fail because the log could not be written.
 */
export function setIntelFailureSink(sink: ((failure: IntelFailure) => void) | undefined): void {
  failureSink = sink;
}

function reportFailure(failure: IntelFailure): void {
  if (!failureSink) return;
  try {
    failureSink(failure);
  } catch (err) {
    console.error('[ai-chat] intel failure sink threw', err);
  }
}

// ─── Source health ───────────────────────────────────────────────────────────

/** One line of the administrative "state of the sources" panel. */
export interface SourceHealth {
  provider: string;
  endpoint: string;
  kinds: IntelEntityKind[];
  /**
   * `operational` — a real test lookup answered;
   * `degraded`    — the provider answered with an error (quota, credential,
   *                 endpoint) and the exact reason is in `error`;
   * `not_configured` — no secret for it on this deployment;
   * `disabled`    — deliberately switched off, with the reason.
   */
  status: 'operational' | 'degraded' | 'not_configured' | 'disabled';
  /** Real reason, when the source is not operational. */
  error?: string;
  /** HTTP status of the failed test lookup, when there was one. */
  httpStatus?: number;
  /** ISO-8601 instant of the check. */
  checkedAt: string;
  /** Milliseconds the test lookup took, when it ran. */
  durationMs?: number;
  /** True when a real request was sent to the provider. */
  probed: boolean;
  /** Names of the secrets this source needs, so a gap is obvious. */
  secrets: string[];
}

/** Secrets each source reads, for the administrative panel. Names only. */
const PROVIDER_SECRETS: Record<string, string[]> = {
  AbuseIPDB: ['ABUSEIPDB_API_KEY'],
  IPinfo: ['IPINFO_API_KEY'],
  'Abstract IP': ['ABSTRACT_IP_API_KEY'],
  VirusTotal: ['VIRUSTOTAL_API_KEY'],
  URLScan: ['URLSCAN_API_KEY'],
  GoPlus: ['GOPLUS_API_URL', 'GOPLUS_APP_KEY', 'GOPLUS_APP_SECRET'],
  'Abstract Email': ['ABSTRACT_EMAIL_API_KEY'],
  NumVerify: ['NUMVERIFY_API_KEY'],
  'Abstract Phone': ['ABSTRACT_PHONE_API_KEY'],
  'FTC DNC Complaints': ['DATA_GOV_API_KEY'],
  OpenIBAN: ['OPENIBAN_API_URL'],
  'Abstract IBAN': ['ABSTRACT_IBAN_API_KEY'],
  'Abstract VAT': ['ABSTRACT_VAT_API_KEY'],
  Etherscan: ['ETHERSCAN_API_KEY'],
  CryptoScamDB: ['CRYPTOSCAMDB_API_URL'],
  CoinGecko: ['COINGECKO_API_KEY'],
  Nominatim: [],
  Photon: [],
  'Google Search (Gemini)': ['GEMINI_API_KEY'],
  'Brave Search': ['BRAVE_SEARCH_API_KEY'],
  Tavily: ['TAVILY_API_KEY'],
  'Serper (Google)': ['SERPER_API_KEY'],
  DuckDuckGo: [],
  Wikipedia: [],
  NewsData: ['NEWSDATA_API_KEY'],
};

/** Stable identifier of a source: provider plus the lookup it performs. */
export function sourceId(provider: string, endpoint: string): string {
  return `${provider}|${endpoint}`;
}

/**
 * Every source Valthoris knows about, without contacting any of them.
 *
 * `operational` here only means "configured": nothing was asked of the
 * provider, which is why `probed` is false. Only `probeSource()` can state
 * that a source really answers.
 */
export function listSources(): SourceHealth[] {
  const checkedAt = new Date().toISOString();
  return PROVIDERS.map((provider) => ({
    provider: provider.provider,
    endpoint: provider.endpoint,
    kinds: provider.kinds,
    status: provider.disabled
      ? ('disabled' as const)
      : provider.config()
        ? ('operational' as const)
        : ('not_configured' as const),
    error: provider.disabled,
    checkedAt,
    probed: false,
    secrets: PROVIDER_SECRETS[provider.provider] ?? [],
  }));
}

/**
 * Sends a real test lookup to one source and reports exactly what came back.
 *
 * This is what the administrative panel's "test now" button runs, and it is the
 * same code path a user turn takes — a source that passes here really answers.
 */
export async function probeSource(id: string): Promise<SourceHealth | null> {
  const provider = PROVIDERS.find((p) => sourceId(p.provider, p.endpoint) === id);
  if (!provider) return null;

  const secrets = PROVIDER_SECRETS[provider.provider] ?? [];
  const started = Date.now();
  if (provider.disabled) {
    return {
      provider: provider.provider,
      endpoint: provider.endpoint,
      kinds: provider.kinds,
      status: 'disabled',
      error: provider.disabled,
      checkedAt: new Date().toISOString(),
      probed: false,
      secrets,
    };
  }
  if (!provider.config()) {
    return {
      provider: provider.provider,
      endpoint: provider.endpoint,
      kinds: provider.kinds,
      status: 'not_configured',
      error: `No usable value for: ${secrets.join(', ') || 'the provider configuration'}`,
      checkedAt: new Date().toISOString(),
      probed: false,
      secrets,
    };
  }

  try {
    await provider.run(provider.probeValue);
    return {
      provider: provider.provider,
      endpoint: provider.endpoint,
      kinds: provider.kinds,
      status: 'operational',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      probed: true,
      secrets,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportFailure({
      provider: provider.provider,
      endpoint: provider.endpoint,
      status: err instanceof HttpStatusError ? err.status : undefined,
      message: `health check: ${message.slice(0, 300)}`,
    });
    return {
      provider: provider.provider,
      endpoint: provider.endpoint,
      kinds: provider.kinds,
      status: 'degraded',
      error: message.slice(0, 300),
      httpStatus: err instanceof HttpStatusError ? err.status : undefined,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      probed: true,
      secrets,
    };
  }
}

const PROBE_BATCH_SIZE = 4;

/**
 * Probes every source, `PROBE_BATCH_SIZE` at a time.
 *
 * The concurrency cap keeps the Nominatim throttle honest and avoids turning a
 * health check into a burst that itself trips a provider's rate limit.
 */
export async function probeAllSources(): Promise<SourceHealth[]> {
  const ids = PROVIDERS.map((p) => sourceId(p.provider, p.endpoint));
  const results: SourceHealth[] = [];
  for (let i = 0; i < ids.length; i += PROBE_BATCH_SIZE) {
    const batch = await Promise.all(
      ids.slice(i, i + PROBE_BATCH_SIZE).map((id) => probeSource(id)),
    );
    for (const row of batch) if (row) results.push(row);
  }
  return results;
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
  const off = reports.filter((r) => r.status === 'disabled');

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
  if (off.length > 0) {
    lines.push('');
    lines.push(
      `Sources switched off (upstream service retired): ${off.map((r) => r.provider).join(', ')}.`,
    );
  }

  lines.push('');
  lines.push(
    'Base the verdict only on the evidence above and on general security knowledge. ' +
      'Never claim a source was consulted if it is not listed as returning data.',
  );
  return lines.join('\n');
}
