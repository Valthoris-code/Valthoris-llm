/**
 * types/database.ts
 *
 * Row interfaces for the Valthoris Supabase tables.
 *
 * Schema is defined by the migrations in supabase/migrations/:
 *   20260801000000_create_fraud_pipeline_tables.sql  — fraud pipeline tables
 *   20260803000000_add_fraud_pipeline_constraints.sql — UNIQUE constraints
 *   20260808000000_create_waiting_list.sql            — waiting_list
 *   20260808000001_create_profiles.sql                — profiles
 *   20260808000002_create_supporting_tables.sql       — audit_logs, notifications, icp_ingest_cursors
 */

// ─── fraud_events ─────────────────────────────────────────────────────────
// The fraud worker reads events from this table (via pgmq or direct query).

export interface FraudEventRow {
  id: string;
  /** User who triggered the event (ICP principal or Supabase user UUID) */
  user_id: string | null;
  /** Type of event: 'sms', 'url', 'email', 'icp_report', 'community_report', etc. */
  event_type: string;
  /** Raw content to analyse (text, URL, serialised payload) */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp */
  created_at: string;
}

// ─── fraud_pipelines ──────────────────────────────────────────────────────

export interface FraudPipelineRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── fraud_workflow_runs ──────────────────────────────────────────────────
// Unique constraint: (event_id, pipeline_id, mode)

export interface FraudWorkflowRunRow {
  id: string;
  event_id: string;
  pipeline_id: string;
  /** 'auto' | 'manual' */
  mode: string;
  /** 'pending' | 'running' | 'completed' | 'failed' */
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type FraudWorkflowRunInsert = Omit<FraudWorkflowRunRow, 'id' | 'created_at' | 'updated_at'>;

// ─── fraud_decisions ──────────────────────────────────────────────────────
// Unique constraint: (event_id, pipeline_id, mode)

export interface FraudDecisionRow {
  id: string;
  event_id: string;
  pipeline_id: string;
  /** 'auto' | 'manual' */
  mode: string;
  /** 'fraud' | 'suspicious' | 'legitimate' | 'unknown' */
  verdict: string;
  /** Confidence score 0–100 */
  confidence_score: number;
  /** Which AI provider was used */
  ai_provider: string | null;
  /** Raw AI model response (truncated) */
  ai_response_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type FraudDecisionInsert = Omit<FraudDecisionRow, 'id' | 'created_at' | 'updated_at'>;

// ─── fraud_decision_justifications ────────────────────────────────────────
// Unique constraint: (decision_id)

export interface FraudDecisionJustificationRow {
  id: string;
  decision_id: string;
  /** Human-readable justification for the verdict */
  justification: string;
  /** Key risk signals extracted from the analysis */
  risk_signals: string[];
  /** Recommended action for the user */
  recommended_action: string | null;
  created_at: string;
}

export type FraudDecisionJustificationInsert = Omit<
  FraudDecisionJustificationRow,
  'id' | 'created_at'
>;

// ─── audit_logs ───────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  /** Service or component that emitted the event */
  actor: string;
  /** Action identifier, e.g. 'fraud.decision.created' */
  action: string;
  /** Target resource identifier (optional) */
  resource_id: string | null;
  /** Arbitrary structured metadata */
  metadata: Record<string, unknown>;
  /** Log level: 'info' | 'warn' | 'error' */
  level: string;
  created_at: string;
}

export type AuditLogInsert = Omit<AuditLogRow, 'id' | 'created_at'>;

// ─── notifications ────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  user_id: string;
  /** 'fraud_alert' | 'scan_complete' | 'system' */
  type: string;
  title: string;
  body: string;
  /** Arbitrary structured payload */
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export type NotificationInsert = Omit<NotificationRow, 'id' | 'created_at' | 'read_at'>;
