/**
 * Supabase Edge Function — `news-ticker`
 *
 * Feeds the Valthoris news ticker with Portuguese cybersecurity / fraud /
 * technology headlines from NewsData.io.
 *
 * The browser must never hold the provider key, so the ticker calls this
 * function instead of NewsData.io.
 *
 * Caching (mandatory, not an optimisation): the headlines are stored in
 * `public.cached_news` (see supabase/migrations). While the cached row is
 * younger than 24 hours it is returned as-is; only when it is older does the
 * function call NewsData.io, upsert the fresh result with the service role and
 * return it. This keeps the provider quota intact and makes the ticker load
 * instantly.
 *
 * Required secret (set with `supabase secrets set …`):
 *   NEWSDATA_API_KEY           — NewsData.io key; never exposed to the browser
 * Injected by the platform:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Nothing is fabricated: when the provider fails and no cache exists at all,
 * the function answers with a real error and the UI hides the ticker.
 */

// deno-lint-ignore-file no-explicit-any

/** One cached feed. Language and topic are fixed by the product, not the caller. */
const CACHE_KEY = 'pt-cybersecurity';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 12;

/** NewsData.io "latest news" endpoint. */
const NEWSDATA_ENDPOINT = 'https://newsdata.io/api/1/latest';
const NEWSDATA_LANGUAGE = 'pt';
const NEWSDATA_CATEGORY = 'technology';
/** Cybersecurity / fraud focus inside the technology category. */
const NEWSDATA_QUERY = 'cibersegurança OR fraude OR phishing OR burla OR hacker';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

export interface NewsTickerResponse {
  items: NewsItem[];
  fetchedAt: string;
  cached: boolean;
  /** Set when stale cache is served because the provider call failed. */
  warning?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

/** An error whose message is safe to return to the browser. */
class NewsTickerError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

// ─── Supabase REST access (service role) ─────────────────────────────────────

function restConfig(): { url: string; key: string } {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new NewsTickerError(
      'News ticker cache is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
      503,
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

const AUTH_SCHEME = 'Bearer';

async function rest(
  path: string,
  init: { method: string; body?: unknown; prefer?: string },
): Promise<any> {
  const { url, key } = restConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `${AUTH_SCHEME} ${key}`,
    'Content-Type': 'application/json',
  };
  if (init.prefer) headers['Prefer'] = init.prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  if (!res.ok) {
    // The PostgREST body can carry schema details: log it, do not return it.
    console.error('[news-ticker] rest', init.method, path, res.status, text);
    throw storageError(res.status, text);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function storageError(status: number, body: string): NewsTickerError {
  let code = '';
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.code === 'string') code = parsed.code;
  } catch {
    // Not JSON: the status alone has to carry the meaning.
  }
  // PGRST205: the table is absent from the schema cache (migration not applied).
  if (status === 404 || code === 'PGRST205' || code === '42P01') {
    return new NewsTickerError(
      'News ticker cache is not initialised: the cached_news table is missing. ' +
        'Apply the supabase/migrations cached_news migration to the project.',
      503,
    );
  }
  if (status === 401 || status === 403) {
    return new NewsTickerError(
      'News ticker cache refused the service credentials. ' +
        'Check the SUPABASE_SERVICE_ROLE_KEY secret of the function.',
      503,
    );
  }
  return new NewsTickerError('News ticker cache rejected the operation.', 502);
}

interface CachedRow {
  items: NewsItem[];
  fetchedAt: string;
}

export async function readCache(): Promise<CachedRow | null> {
  const rows = await rest(
    `cached_news?cache_key=eq.${encodeURIComponent(CACHE_KEY)}&select=items,fetched_at&limit=1`,
    { method: 'GET' },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !Array.isArray(row.items) || row.items.length === 0) return null;
  return { items: row.items as NewsItem[], fetchedAt: String(row.fetched_at) };
}

async function writeCache(items: NewsItem[], fetchedAt: string): Promise<void> {
  await rest('cached_news?on_conflict=cache_key', {
    method: 'POST',
    body: [{ cache_key: CACHE_KEY, items, fetched_at: fetchedAt }],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

// ─── NewsData.io ─────────────────────────────────────────────────────────────

/** Keeps only the fields the ticker renders, and only usable articles. */
export function normaliseArticles(results: unknown): NewsItem[] {
  if (!Array.isArray(results)) return [];
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of results) {
    const article = raw as Record<string, unknown> | null;
    const title = typeof article?.title === 'string' ? article.title.trim() : '';
    const link = typeof article?.link === 'string' ? article.link.trim() : '';
    // Only absolute http(s) links are rendered: the ticker opens them.
    if (!title || !/^https?:\/\//i.test(link)) continue;
    if (seen.has(link)) continue;
    seen.add(link);

    const source =
      (typeof article?.source_name === 'string' && article.source_name.trim()) ||
      (typeof article?.source_id === 'string' && article.source_id.trim()) ||
      '';
    const publishedAt = typeof article?.pubDate === 'string' ? article.pubDate : null;

    items.push({ title, link, source, publishedAt });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

async function fetchFromProvider(): Promise<NewsItem[]> {
  const apiKey = env('NEWSDATA_API_KEY');
  if (!apiKey) {
    throw new NewsTickerError(
      'News ticker is not configured: the NEWSDATA_API_KEY secret is missing.',
      503,
    );
  }

  const url = new URL(NEWSDATA_ENDPOINT);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('language', NEWSDATA_LANGUAGE);
  url.searchParams.set('category', NEWSDATA_CATEGORY);
  url.searchParams.set('q', NEWSDATA_QUERY);
  url.searchParams.set('size', String(MAX_ITEMS));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    // The upstream body can echo the request back: it stays in the logs only.
    console.error('[news-ticker] newsdata', res.status);
    throw new NewsTickerError(`NewsData.io returned HTTP ${res.status}.`, 502);
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new NewsTickerError('NewsData.io returned a malformed response.', 502);
  }

  const items = normaliseArticles(payload?.results);
  if (items.length === 0) {
    throw new NewsTickerError('NewsData.io returned no usable articles.', 502);
  }
  return items;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export function isFresh(fetchedAt: string, now: number): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now - at < CACHE_TTL_MS;
}

export async function getNews(): Promise<NewsTickerResponse> {
  let cache: CachedRow | null = null;
  try {
    cache = await readCache();
  } catch (err) {
    // A missing or broken cache must not prevent a live fetch.
    console.error('[news-ticker] cache read failed', err);
  }

  if (cache && isFresh(cache.fetchedAt, Date.now())) {
    return { items: cache.items, fetchedAt: cache.fetchedAt, cached: true };
  }

  try {
    const items = await fetchFromProvider();
    const fetchedAt = new Date().toISOString();
    try {
      await writeCache(items, fetchedAt);
    } catch (err) {
      // Fresh news is still worth serving even when the cache write failed.
      console.error('[news-ticker] cache write failed', err);
    }
    return { items, fetchedAt, cached: false };
  } catch (err) {
    if (cache) {
      return {
        items: cache.items,
        fetchedAt: cache.fetchedAt,
        cached: true,
        warning:
          err instanceof Error
            ? `Showing cached headlines: ${err.message}`
            : 'Showing cached headlines: the news provider is unavailable.',
      };
    }
    throw err;
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    return json(await getNews(), 200);
  } catch (err) {
    if (err instanceof NewsTickerError) {
      return json({ error: err.message }, err.status);
    }
    // Unexpected faults stay in the function logs; the browser gets no detail.
    console.error('[news-ticker]', err);
    return json({ error: 'News ticker backend error. Please try again.' }, 500);
  }
}

(globalThis as any).Deno?.serve(handleRequest);
