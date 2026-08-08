-- waiting_list table
-- Stores waiting-list sign-up submissions from the frontend.
--
-- RLS policy:
--   * Anyone (anon) may INSERT a new entry.
--   * SELECT / UPDATE / DELETE require the service role (server-side only).

CREATE TABLE IF NOT EXISTS public.waiting_list (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  language    TEXT        NOT NULL,
  reason      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT waiting_list_email_key UNIQUE (email)
);

-- Enable Row Level Security
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (the UNIQUE constraint prevents duplicates)
CREATE POLICY "allow_anon_insert"
  ON public.waiting_list
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Service-role can read everything (no SELECT policy needed for anon)
