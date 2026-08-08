-- profiles table
-- Stores extended user profile data synced from the ICP backend.
--
-- RLS policy:
--   * Authenticated users may read and upsert only their own row.
--   * Anon callers have no access.

CREATE TABLE IF NOT EXISTS public.profiles (
  principal    TEXT        PRIMARY KEY,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (principal = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can insert / update their own profile
CREATE POLICY "profiles_upsert_own"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING      (principal = current_setting('request.jwt.claims', true)::json->>'sub')
  WITH CHECK (principal = current_setting('request.jwt.claims', true)::json->>'sub');
