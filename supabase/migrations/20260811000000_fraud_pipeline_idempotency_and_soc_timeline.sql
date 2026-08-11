-- Reconcile the repository migrations with the production fraud pipeline
-- schema, and support the idempotent analyses written by the `ai-chat`
-- Edge Function.
--
-- Every statement is guarded so that running this migration against the
-- production database — where these objects already exist — is a no-op.
--
-- Nothing here weakens security:
--   • Row Level Security stays enabled on every table.
--   • The SOC timeline view is created with security_invoker = true, so it is
--     evaluated with the privileges (and RLS policies) of the querying role.
--   • No policy is dropped or relaxed; the owner INSERT/UPDATE policies are
--     only *added* when missing.

-- ─── 1. fraud_events — idempotency ───────────────────────────────────────────
--
-- The `ai-chat` function derives `fraud_events.id` deterministically from the
-- submitting principal and the artefact, so the primary key already prevents
-- duplicates. This partial unique index additionally guarantees that one
-- (user, event_type, payload->>'content') pair only ever produces one event,
-- matching the constraint that is already deployed in production.

CREATE UNIQUE INDEX IF NOT EXISTS fraud_events_idempotency_idx
  ON public.fraud_events (user_id, event_type, (payload ->> 'content'))
  WHERE user_id IS NOT NULL AND payload ? 'content';

-- ─── 2. Owner INSERT/UPDATE policies ─────────────────────────────────────────
--
-- Authenticated owners may advance their own workflow runs and record their own
-- decisions. Ownership is always resolved through fraud_events.user_id, which
-- only the service role can set.

DO $$
DECLARE
  owner_check CONSTANT text :=
    'EXISTS (SELECT 1 FROM public.fraud_events e WHERE e.id = event_id AND e.user_id = auth.uid()::text)';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fraud_workflow_runs'
      AND p.polname = 'fraud_workflow_runs_update_own'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "fraud_workflow_runs_update_own" ON public.fraud_workflow_runs
         FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      owner_check, owner_check);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fraud_decisions'
      AND p.polname = 'fraud_decisions_insert_own'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "fraud_decisions_insert_own" ON public.fraud_decisions
         FOR INSERT TO authenticated WITH CHECK (%s)', owner_check);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fraud_decisions'
      AND p.polname = 'fraud_decisions_update_own'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "fraud_decisions_update_own" ON public.fraud_decisions
         FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      owner_check, owner_check);
  END IF;
END $$;

DO $$
DECLARE
  owner_check CONSTANT text :=
    'EXISTS (SELECT 1 FROM public.fraud_decisions d JOIN public.fraud_events e ON e.id = d.event_id
             WHERE d.id = decision_id AND e.user_id = auth.uid()::text)';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fraud_decision_justifications'
      AND p.polname = 'fraud_decision_justifications_insert_own'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "fraud_decision_justifications_insert_own"
         ON public.fraud_decision_justifications
         FOR INSERT TO authenticated WITH CHECK (%s)', owner_check);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fraud_decision_justifications'
      AND p.polname = 'fraud_decision_justifications_update_own'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "fraud_decision_justifications_update_own"
         ON public.fraud_decision_justifications
         FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      owner_check, owner_check);
  END IF;
END $$;

-- ─── 3. v_fraud_soc_timeline ─────────────────────────────────────────────────
--
-- SOC timeline of everything the pipeline actually produced. It is only created
-- when it does not already exist, so the deployed definition is preserved; the
-- security_invoker setting is (re-)asserted either way.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_fraud_soc_timeline'
  ) THEN
    EXECUTE $view$
      CREATE VIEW public.v_fraud_soc_timeline AS
      SELECT
        e.id                    AS event_id,
        e.user_id,
        e.event_type,
        e.payload ->> 'content' AS content,
        e.created_at            AS event_created_at,
        r.id                    AS workflow_run_id,
        r.mode,
        r.status,
        r.started_at,
        r.completed_at,
        r.error_message,
        d.id                    AS decision_id,
        d.verdict,
        d.confidence_score,
        d.ai_provider,
        d.ai_response_summary,
        j.justification,
        j.risk_signals,
        j.recommended_action
      FROM public.fraud_events e
      LEFT JOIN public.fraud_workflow_runs r ON r.event_id = e.id
      LEFT JOIN public.fraud_decisions d
             ON d.event_id = e.id
            AND d.pipeline_id = r.pipeline_id
            AND d.mode = r.mode
      LEFT JOIN public.fraud_decision_justifications j ON j.decision_id = d.id
    $view$;
  END IF;

  EXECUTE 'ALTER VIEW public.v_fraud_soc_timeline SET (security_invoker = true)';
END $$;
