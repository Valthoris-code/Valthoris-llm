/**
 * News ticker client.
 *
 * The headlines shown by the ticker come from NewsData.io, but the browser
 * never talks to the provider: the `news-ticker` Supabase Edge Function
 * (supabase/functions/news-ticker) holds the key and serves a 24 hour cache
 * stored in `public.cached_news`.
 *
 * Required browser configuration:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Nothing is fabricated: a failure is thrown as a real Error and the ticker
 * simply does not render.
 */

import {
  functionAuthHeaders,
  getSupabase,
  isSupabaseConfigured,
  SUPABASE_CONFIG_ERROR,
} from './supabaseClient';

export const NEWS_TICKER_FUNCTION_NAME = 'news-ticker';

export const isNewsTickerConfigured = isSupabaseConfigured;

export const NEWS_TICKER_CONFIG_ERROR =
  `${SUPABASE_CONFIG_ERROR} The news ticker reads its headlines through the ` +
  `"${NEWS_TICKER_FUNCTION_NAME}" Supabase Edge Function.`;

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

export interface NewsTickerResult {
  items: NewsItem[];
  fetchedAt: string;
  cached: boolean;
  /** Present when stale headlines are served because the provider failed. */
  warning?: string;
}

/** Extracts a human-readable message from an Edge Function error response. */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // fall through
    }
    if (context.status === 401) {
      return (
        'News ticker backend rejected the request (HTTP 401). Check that ' +
        'VITE_SUPABASE_ANON_KEY matches the project and that the ' +
        `"${NEWS_TICKER_FUNCTION_NAME}" function is deployed with JWT ` +
        'verification disabled (supabase/config.toml).'
      );
    }
    return `News ticker backend returned HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Only absolute http(s) links are kept: the ticker opens them in a new tab. */
function isSafeLink(link: unknown): link is string {
  return typeof link === 'string' && /^https?:\/\//i.test(link);
}

function normalise(payload: unknown): NewsTickerResult {
  const data = (payload ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: NewsItem[] = [];
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    if (!isSafeLink(item.link)) continue;
    items.push({
      title: item.title.trim(),
      link: item.link,
      source: typeof item.source === 'string' ? item.source : '',
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
    });
  }
  return {
    items,
    fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt : '',
    cached: data.cached === true,
    ...(typeof data.warning === 'string' ? { warning: data.warning } : {}),
  };
}

/** Fetches the current headlines. Throws the real error when it fails. */
export async function fetchNews(): Promise<NewsTickerResult> {
  if (!isNewsTickerConfigured) {
    throw new Error(NEWS_TICKER_CONFIG_ERROR);
  }
  const { data, error } = await getSupabase().functions.invoke<unknown>(
    NEWS_TICKER_FUNCTION_NAME,
    { body: {}, headers: functionAuthHeaders() },
  );
  if (error) throw new Error(await readFunctionError(error));
  if (!data) throw new Error('News ticker backend returned an empty response');
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  ) {
    throw new Error((data as { error: string }).error);
  }
  return normalise(data);
}
