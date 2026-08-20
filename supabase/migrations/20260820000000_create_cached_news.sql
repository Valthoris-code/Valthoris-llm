-- Cached news — server-side cache for the Valthoris news ticker
--
-- The ticker shown on the AI Assistant page is fed by NewsData.io. The API key
-- must never reach the browser, so the `news-ticker` Edge Function is the only
-- caller of the provider; this table is the 24 hour cache it keeps, which also
-- keeps the daily request quota under control.
--
-- Access model
-- ------------
--   * reading is public (anon/authenticated): the ticker content is public
--     information and the function may serve it straight from PostgREST;
--   * writing is reserved to the service role, which bypasses RLS. No
--     insert/update/delete policy exists for anon/authenticated and their
--     write privileges are revoked, so a leaked anon key cannot poison the
--     ticker.

CREATE TABLE IF NOT EXISTS public.cached_news (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifies one cached feed (language + topic), e.g. 'pt-cybersecurity'.
  cache_key  TEXT        NOT NULL UNIQUE,
  -- Normalised articles: [{ title, link, source, publishedAt }, …]
  items      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cached_news_items_is_array CHECK (jsonb_typeof(items) = 'array')
);

CREATE INDEX IF NOT EXISTS cached_news_fetched_at_idx
  ON public.cached_news (fetched_at DESC);

ALTER TABLE public.cached_news ENABLE ROW LEVEL SECURITY;

-- Public read.
DROP POLICY IF EXISTS "cached_news_public_read" ON public.cached_news;
CREATE POLICY "cached_news_public_read"
  ON public.cached_news FOR SELECT TO anon, authenticated
  USING (true);

-- Service role: full access (it bypasses RLS, the policy documents the intent).
DROP POLICY IF EXISTS "cached_news_service_role_all" ON public.cached_news;
CREATE POLICY "cached_news_service_role_all"
  ON public.cached_news FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Only the service role writes.
REVOKE INSERT, UPDATE, DELETE ON public.cached_news FROM anon, authenticated;
GRANT SELECT ON public.cached_news TO anon, authenticated;
