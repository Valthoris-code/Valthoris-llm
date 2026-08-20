/**
 * Real tests for the `news-ticker` Edge Function.
 *
 * They exercise the two behaviours that matter:
 *   • the NewsData.io payload is normalised into the minimal shape the ticker
 *     renders, dropping unusable articles;
 *   • the 24 hour cache decides whether the provider is called at all, and a
 *     provider failure falls back to stale cache instead of an empty ticker.
 *
 * PostgREST and NewsData.io are stubbed at the `fetch` level: no network and no
 * real key is needed.
 *
 * Run with:  deno test --allow-env supabase/functions/news-ticker
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getNews, isFresh, normaliseArticles } from './index.ts';

// ─── Normalisation ───────────────────────────────────────────────────────────

Deno.test('keeps usable articles and drops the rest', () => {
  const items = normaliseArticles([
    { title: 'Nova vaga de phishing', link: 'https://exemplo.pt/1', source_name: 'Exemplo' },
    { title: 'Sem link', link: null },
    { title: '', link: 'https://exemplo.pt/2' },
    { title: 'Link relativo', link: '/interno' },
    { title: 'Duplicado', link: 'https://exemplo.pt/1' },
    { title: 'Fraude bancária', link: 'https://exemplo.pt/3', source_id: 'exemplo' },
  ]);
  assertEquals(items.length, 2);
  assertEquals(items[0], {
    title: 'Nova vaga de phishing',
    link: 'https://exemplo.pt/1',
    source: 'Exemplo',
    publishedAt: null,
  });
  assertEquals(items[1].source, 'exemplo');
});

Deno.test('normalises a non-array payload to an empty list', () => {
  assertEquals(normaliseArticles(undefined), []);
  assertEquals(normaliseArticles({ results: [] }), []);
});

// ─── Cache freshness ─────────────────────────────────────────────────────────

Deno.test('cache is fresh under 24 hours and stale beyond it', () => {
  const now = Date.parse('2026-08-20T00:00:00Z');
  assert(isFresh('2026-08-19T23:00:00Z', now));
  assert(!isFresh('2026-08-18T23:00:00Z', now));
  assert(!isFresh('not-a-date', now));
});

// ─── End to end, with stubbed upstreams ──────────────────────────────────────

interface Stub {
  cacheRows: unknown[];
  newsStatus: number;
  newsBody: unknown;
  calls: string[];
  writes: unknown[];
}

function installFetch(stub: Stub): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? 'GET').toUpperCase();
    stub.calls.push(`${method} ${url.split('?')[0]}`);

    if (url.includes('/rest/v1/cached_news')) {
      if (method === 'POST') {
        stub.writes.push(JSON.parse(String(init?.body ?? 'null')));
        return new Response('', { status: 201 });
      }
      return new Response(JSON.stringify(stub.cacheRows), { status: 200 });
    }
    if (url.includes('newsdata.io')) {
      return new Response(JSON.stringify(stub.newsBody), { status: stub.newsStatus });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function withEnv(): () => void {
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
  Deno.env.set('NEWSDATA_API_KEY', 'test-news-key');
  return () => {
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    Deno.env.delete('NEWSDATA_API_KEY');
  };
}

Deno.test('fresh cache is served without calling the provider', async () => {
  const restoreEnv = withEnv();
  const stub: Stub = {
    cacheRows: [{
      items: [{ title: 'Cache', link: 'https://exemplo.pt/c', source: 'X', publishedAt: null }],
      fetched_at: new Date().toISOString(),
    }],
    newsStatus: 200,
    newsBody: {},
    calls: [],
    writes: [],
  };
  const restoreFetch = installFetch(stub);
  try {
    const result = await getNews();
    assertEquals(result.cached, true);
    assertEquals(result.items.length, 1);
    assert(!stub.calls.some((c) => c.includes('newsdata.io')));
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('stale cache triggers a provider call and a cache write', async () => {
  const restoreEnv = withEnv();
  const stub: Stub = {
    cacheRows: [{
      items: [{ title: 'Antiga', link: 'https://exemplo.pt/old', source: '', publishedAt: null }],
      fetched_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    }],
    newsStatus: 200,
    newsBody: {
      results: [{ title: 'Nova', link: 'https://exemplo.pt/new', source_name: 'Fonte' }],
    },
    calls: [],
    writes: [],
  };
  const restoreFetch = installFetch(stub);
  try {
    const result = await getNews();
    assertEquals(result.cached, false);
    assertEquals(result.items[0].title, 'Nova');
    assertEquals(stub.writes.length, 1);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('a provider failure falls back to the stale cache', async () => {
  const restoreEnv = withEnv();
  const stub: Stub = {
    cacheRows: [{
      items: [{ title: 'Antiga', link: 'https://exemplo.pt/old', source: '', publishedAt: null }],
      fetched_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    }],
    newsStatus: 429,
    newsBody: {},
    calls: [],
    writes: [],
  };
  const restoreFetch = installFetch(stub);
  try {
    const result = await getNews();
    assertEquals(result.cached, true);
    assertEquals(result.items[0].title, 'Antiga');
    assert(result.warning && result.warning.length > 0);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('no cache and a failing provider is a real error', async () => {
  const restoreEnv = withEnv();
  const stub: Stub = {
    cacheRows: [],
    newsStatus: 500,
    newsBody: {},
    calls: [],
    writes: [],
  };
  const restoreFetch = installFetch(stub);
  try {
    await assertRejects(() => getNews(), Error, 'NewsData.io returned HTTP 500');
  } finally {
    restoreFetch();
    restoreEnv();
  }
});
