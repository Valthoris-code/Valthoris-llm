-- Safe Rooms — multi-participant secure rooms (location + private chat)
--
-- A Safe Room is a short-lived, link-shared space where every authorised
-- participant publishes their OWN position and sees the position of the other
-- participants of the SAME room, plus a private chat scoped to that room.
--
-- Access model
-- ------------
-- Valthoris authenticates users with Internet Identity, so the browser has no
-- Supabase session and `auth.uid()` is always NULL. These tables are therefore
-- never touched from the browser: the `safe-room` Edge Function is the only
-- writer/reader and it uses the service-role key. Authorisation is enforced by
-- the function:
--   * the room token (bearer secret in the share link) selects the room;
--   * a per-participant secret, hashed with SHA-256 before storage, proves that
--     the caller is that participant;
--   * expired, closed or left participants are excluded from every read.
--
-- RLS stays enabled with no anon/authenticated policy at all, so a leaked anon
-- key cannot read anybody's location.

-- ─── safe_rooms ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.safe_rooms (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque room token embedded in the share link.
  token            TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  -- Safety radius drawn on the map, capped at 1000 m by the platform rules.
  radius_meters    INTEGER     NOT NULL DEFAULT 500
                   CHECK (radius_meters > 0 AND radius_meters <= 1000),
  -- Hard platform limits: 30 participants, 24 hours.
  max_participants INTEGER     NOT NULL DEFAULT 30
                   CHECK (max_participants > 0 AND max_participants <= 30),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  closed_at        TIMESTAMPTZ,
  -- Version of the terms every participant had to accept to enter.
  terms_version    TEXT        NOT NULL DEFAULT 'safe-room-v1',
  CONSTRAINT safe_rooms_max_duration CHECK (expires_at <= created_at + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS safe_rooms_expires_at_idx ON public.safe_rooms (expires_at);

ALTER TABLE public.safe_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safe_rooms_service_role_all" ON public.safe_rooms;
CREATE POLICY "safe_rooms_service_role_all"
  ON public.safe_rooms FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── safe_room_participants ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.safe_room_participants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID        NOT NULL
                      REFERENCES public.safe_rooms (id) ON DELETE CASCADE,
  display_name        TEXT        NOT NULL,
  -- Internet Identity principal when the participant is signed in, else NULL.
  principal           TEXT,
  -- SHA-256 of the participant secret handed to that browser. The secret
  -- itself is never stored.
  secret_hash         TEXT        NOT NULL,
  is_creator          BOOLEAN     NOT NULL DEFAULT false,
  terms_accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the participant leaves; their location stops being returned.
  left_at             TIMESTAMPTZ,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  accuracy_meters     DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS safe_room_participants_room_idx
  ON public.safe_room_participants (room_id, left_at);

ALTER TABLE public.safe_room_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safe_room_participants_service_role_all" ON public.safe_room_participants;
CREATE POLICY "safe_room_participants_service_role_all"
  ON public.safe_room_participants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── safe_room_messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.safe_room_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID        NOT NULL
                 REFERENCES public.safe_rooms (id) ON DELETE CASCADE,
  participant_id UUID        NOT NULL
                 REFERENCES public.safe_room_participants (id) ON DELETE CASCADE,
  -- Author name captured at send time so the history stays readable.
  author_name    TEXT        NOT NULL,
  body           TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safe_room_messages_room_created_idx
  ON public.safe_room_messages (room_id, created_at);

ALTER TABLE public.safe_room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safe_room_messages_service_role_all" ON public.safe_room_messages;
CREATE POLICY "safe_room_messages_service_role_all"
  ON public.safe_room_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);
