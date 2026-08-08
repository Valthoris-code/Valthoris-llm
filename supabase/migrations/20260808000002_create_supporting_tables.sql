-- Supporting tables: audit_logs, notifications, icp_ingest_cursors
--
-- These tables are consumed by:
--   - SupabaseAuditService     → audit_logs
--   - SupabaseNotificationService → notifications
--   - IcpFraudIngestService    → icp_ingest_cursors
--
-- All tables use Row Level Security.  Backend services use the service-role
-- key, which bypasses RLS by design.

-- ─── audit_logs ───────────────────────────────────────────────────────────────
--
-- Write-only for backend services; no client-side read access.
-- This is intentional: audit logs must not be readable by end-users or
-- tampered with from the browser.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Service or component that emitted the event (e.g. 'FraudWorker')
  actor       TEXT        NOT NULL,
  -- Action identifier (e.g. 'fraud.decision.created')
  action      TEXT        NOT NULL,
  -- Optional target resource identifier
  resource_id TEXT,
  -- Arbitrary structured metadata
  metadata    JSONB       NOT NULL DEFAULT '{}',
  -- 'info' | 'warn' | 'error'
  level       TEXT        NOT NULL DEFAULT 'info'
              CHECK (level IN ('info', 'warn', 'error')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_action_idx
  ON public.audit_logs (actor, action);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only the service role may read or write audit logs
CREATE POLICY "audit_logs_service_role_all"
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── notifications ────────────────────────────────────────────────────────────
--
-- Written by backend services; read/marked-as-read by the owning user.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supabase auth user UUID
  user_id    UUID        NOT NULL,
  -- 'fraud_alert' | 'scan_complete' | 'system'
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  -- Arbitrary structured payload (e.g. decisionId, verdict)
  data       JSONB,
  -- NULL until the user marks the notification as read
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_service_role_all"
  ON public.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Authenticated users can mark their own notifications as read.
-- Column-level privilege restricts the UPDATE to read_at only.
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Restrict authenticated UPDATE to read_at; all other columns are immutable for clients.
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT  UPDATE (read_at) ON public.notifications TO authenticated;

-- ─── icp_ingest_cursors ───────────────────────────────────────────────────────
--
-- Tracks the last processed ICP report / threat-intelligence entry per cursor.
-- Written exclusively by IcpFraudIngestService (service role); no end-user access.
--
-- Cursor identifiers used by the service:
--   'community'           — ICP Community canister reports
--   'threat_intelligence' — ICP ThreatIntelligence canister entries

CREATE TABLE IF NOT EXISTS public.icp_ingest_cursors (
  -- Cursor identifier, e.g. 'community' or 'threat_intelligence'
  id                TEXT        PRIMARY KEY,
  -- Last ICP report / entry ID that was successfully enqueued
  last_processed_id TEXT,
  -- Cumulative count of processed items for this cursor
  processed_count   BIGINT      NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.icp_ingest_cursors ENABLE ROW LEVEL SECURITY;

-- Only the service role may read or write cursor state
CREATE POLICY "icp_ingest_cursors_service_role_all"
  ON public.icp_ingest_cursors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the two cursors so the ingest service finds them on first startup
-- (processed_count starts at 0, last_processed_id is NULL)
INSERT INTO public.icp_ingest_cursors (id, processed_count)
VALUES
  ('community',           0),
  ('threat_intelligence', 0)
ON CONFLICT (id) DO NOTHING;
